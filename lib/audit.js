'use strict';

const db = require.main.require('./src/database');
const winston = require.main.require('winston');

const settings = require('./settings');

const DECISION_PREFIX = 'plugin:ai-mod:decision:';
const LOG_KEY = 'plugin:ai-mod:log';
const CORRECTIONS_PREFIX = 'plugin:ai-mod:correction:';
const CORRECTIONS_KEY = 'plugin:ai-mod:corrections';
const CATEGORY_TALLY_PREFIX = 'plugin:ai-mod:tally:category:';
const MODEL_TALLY_PREFIX = 'plugin:ai-mod:tally:model:';

function serializable(decision) {
	return {
		pid: decision.pid || null,
		uid: decision.uid || 0,
		cid: decision.cid || 0,
		tid: decision.tid || 0,
		action: decision.action,
		category: decision.category,
		finalConfidence: decision.finalConfidence,
		reason: decision.reason,
		summary: decision.summary,
		triageModel: decision.triage?.model,
		triageCost: decision.triage?.cost,
		triageElapsedMs: decision.triage?.elapsedMs,
		escalationModel: decision.escalation?.model || null,
		escalationCost: decision.escalation?.cost || null,
		escalationElapsedMs: decision.escalation?.elapsedMs || null,
		verdictsJson: JSON.stringify(decision.verdicts || []),
		dryRun: !!decision.dryRun,
		createdAt: decision.createdAt || Date.now(),
	};
}

exports.record = async (decision) => {
	try {
		const id = decision.pid
			? `pid-${decision.pid}-${decision.createdAt}`
			: `tmp-${decision.createdAt}-${Math.random().toString(36).slice(2, 8)}`;
		const row = serializable(decision);

		await db.setObject(DECISION_PREFIX + id, row);
		await db.sortedSetAdd(LOG_KEY, row.createdAt, id);

		if (row.category) {
			await db.incrObjectFieldBy(CATEGORY_TALLY_PREFIX + row.category, row.action, 1);
		}
		if (row.triageModel) {
			await db.incrObjectFieldBy(MODEL_TALLY_PREFIX + row.triageModel, 'triage_calls', 1);
		}
		if (row.escalationModel) {
			await db.incrObjectFieldBy(MODEL_TALLY_PREFIX + row.escalationModel, 'escalation_calls', 1);
		}

		await prune();
	} catch (err) {
		winston.warn('[plugin/ai-moderation] audit record failed: ' + err.message);
	}
};

async function prune() {
	const retentionDays = parseInt(settings.get().auditRetentionDays, 10) || 90;
	const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
	const toDrop = await db.getSortedSetRangeByScore(LOG_KEY, 0, 100, 0, cutoff);
	if (!toDrop || !toDrop.length) return;
	for (const id of toDrop) {
		await db.delete(DECISION_PREFIX + id);
		await db.sortedSetRemove(LOG_KEY, id);
	}
}

exports.list = async ({ start = 0, stop = 49, filter = {} } = {}) => {
	const ids = await db.getSortedSetRevRange(LOG_KEY, start, stop);
	if (!ids || !ids.length) return [];
	const rows = await Promise.all(ids.map(id => db.getObject(DECISION_PREFIX + id).then(r => r ? { id, ...r } : null)));
	return rows.filter(r => {
		if (!r) return false;
		if (filter.action && r.action !== filter.action) return false;
		if (filter.category && r.category !== filter.category) return false;
		if (filter.uid && String(r.uid) !== String(filter.uid)) return false;
		return true;
	});
};

exports.get = async (id) => {
	const r = await db.getObject(DECISION_PREFIX + id);
	return r ? { id, ...r } : null;
};

exports.correct = async ({ id, moderatorUid, verdict, notes = '' }) => {
	const decision = await exports.get(id);
	if (!decision) throw new Error('Decision not found');
	const corr = {
		decisionId: id,
		pid: decision.pid,
		originalAction: decision.action,
		originalCategory: decision.category,
		originalConfidence: decision.finalConfidence,
		moderatorUid,
		correctedVerdict: verdict,
		notes: String(notes || '').slice(0, 1000),
		createdAt: Date.now(),
	};
	const corrId = 'corr-' + id + '-' + corr.createdAt;
	await db.setObject(CORRECTIONS_PREFIX + corrId, corr);
	await db.sortedSetAdd(CORRECTIONS_KEY, corr.createdAt, corrId);
	return corr;
};

exports.categoryStats = async () => {
	const cats = settings.getCategoriesList();
	const out = {};
	for (const c of cats) {
		const obj = await db.getObject(CATEGORY_TALLY_PREFIX + c) || {};
		out[c] = {
			pass: parseInt(obj.pass, 10) || 0,
			flag: parseInt(obj.flag, 10) || 0,
			block: parseInt(obj.block, 10) || 0,
		};
	}
	return out;
};

exports.modelStats = async (modelIds) => {
	const out = {};
	for (const m of modelIds || []) {
		if (!m) continue;
		const obj = await db.getObject(MODEL_TALLY_PREFIX + m) || {};
		out[m] = {
			triage_calls: parseInt(obj.triage_calls, 10) || 0,
			escalation_calls: parseInt(obj.escalation_calls, 10) || 0,
		};
	}
	return out;
};
