'use strict';

const winston = require.main.require('winston');

const settings = require('./settings');

function getFlags() {
	try { return require.main.require('./src/flags'); } catch (_) { return null; }
}

function getPosts() {
	try { return require.main.require('./src/posts'); } catch (_) { return null; }
}

function buildFlagReason(decision) {
	const parts = [];
	parts.push(`AI moderation: ${decision.category} (${(decision.finalConfidence * 100).toFixed(0)}% confidence)`);
	if (decision.reason) parts.push(decision.reason);
	if (decision.escalation) {
		parts.push(`Verdict from ${decision.escalation.model} (escalated from ${decision.triage.model}).`);
	} else {
		parts.push(`Verdict from ${decision.triage.model}.`);
	}
	if (decision.summary) parts.push('Summary: ' + decision.summary);
	return parts.join('\n\n').slice(0, 1000);
}

async function fileFlag(decision) {
	const flagsMod = getFlags();
	if (!flagsMod || !flagsMod.create) {
		winston.warn('[plugin/ai-moderation] flags module unavailable');
		return;
	}
	if (!decision.pid) return;
	const reporterUid = parseInt(settings.get().systemReporterUid, 10) || 1;
	try {
		await flagsMod.create('post', decision.pid, reporterUid, buildFlagReason(decision), Date.now(), true);
	} catch (err) {
		winston.warn('[plugin/ai-moderation] flags.create failed pid=' + decision.pid + ': ' + err.message);
	}
}

async function hidePost(decision) {
	const postsMod = getPosts();
	if (!postsMod || !postsMod.tools || !postsMod.tools.delete) return;
	const reporterUid = parseInt(settings.get().systemReporterUid, 10) || 1;
	try {
		await postsMod.tools.delete(reporterUid, decision.pid);
	} catch (err) {
		winston.warn('[plugin/ai-moderation] hide (posts.tools.delete) failed pid=' + decision.pid + ': ' + err.message);
	}
}

async function deletePost(decision) {
	const postsMod = getPosts();
	if (!postsMod || !postsMod.tools || !postsMod.tools.purge) return;
	const reporterUid = parseInt(settings.get().systemReporterUid, 10) || 1;
	try {
		await postsMod.tools.purge(reporterUid, decision.pid);
	} catch (err) {
		winston.warn('[plugin/ai-moderation] purge failed pid=' + decision.pid + ': ' + err.message);
	}
}

exports.apply = async (decision) => {
	if (!decision || decision.action === 'pass') return { acted: false };

	const s = settings.get();
	const category = decision.category;
	const actionMap = s.dryRun
		? null
		: settings.getActionForCategory(category);

	if (s.dryRun) {
		winston.info(
			`[plugin/ai-moderation] DRY-RUN would act (action=${decision.action}` +
			` category=${category} pid=${decision.pid} confidence=${decision.finalConfidence.toFixed(2)})`
		);
		return { acted: false, dryRun: true };
	}

	if (decision.action === 'block') {
		if (actionMap === 'delete') { await deletePost(decision); return { acted: true, via: 'delete' }; }
		if (actionMap === 'hide') { await hidePost(decision); return { acted: true, via: 'hide' }; }
		await fileFlag(decision);
		return { acted: true, via: 'flag-high' };
	}

	if (decision.action === 'flag') {
		if (actionMap === 'delete') { await deletePost(decision); return { acted: true, via: 'delete' }; }
		if (actionMap === 'hide') { await hidePost(decision); return { acted: true, via: 'hide' }; }
		await fileFlag(decision);
		return { acted: true, via: 'flag' };
	}

	return { acted: false };
};

exports.applyPending = async ({ type, uid, cid, tid, title, content, result, verdict }) => {
	winston.info(
		`[plugin/ai-moderation] flag-only decision for pre-save ${type}` +
		` uid=${uid} cid=${cid} category=${verdict.category}` +
		` confidence=${verdict.confidence.toFixed(2)} — not flaggable pre-save, will re-check after save`
	);
};
