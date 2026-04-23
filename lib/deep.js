'use strict';

const winston = require.main.require('winston');
const posts = require.main.require('./src/posts');
const topics = require.main.require('./src/topics');

const settings = require('./settings');
const openrouter = require('./openrouter');
const categorize = require('./categorize');
const exempt = require('./exempt');

async function loadPostContent(pid) {
	const post = await posts.getPostData(pid);
	if (!post) return null;
	let title = '';
	if (post.tid) {
		try {
			const topic = await topics.getTopicData(post.tid);
			title = (topic && topic.mainPid === parseInt(pid, 10)) ? topic.title : '';
		} catch (_) { /* ignore */ }
	}
	return {
		pid: post.pid,
		uid: post.uid,
		tid: post.tid,
		cid: post.cid,
		content: post.content || '',
		title,
	};
}

exports.processTask = async (task) => {
	const s = settings.get();
	if (!s.enabled) return { skipped: 'disabled' };
	if (!openrouter.isConfigured()) return { skipped: 'api-key-missing' };

	let payload;
	if (task.pid) {
		payload = await loadPostContent(task.pid);
		if (!payload) return { skipped: 'post-not-found' };
	} else {
		payload = {
			pid: null,
			uid: task.uid,
			tid: task.tid,
			cid: task.cid,
			content: task.content,
			title: task.title,
		};
	}

	if (await exempt.isExempt(payload.uid)) {
		return { skipped: 'user-exempt' };
	}

	const categories = settings.getCategoriesListForCid(payload.cid);
	const eff = settings.getEffectiveForCid(payload.cid);

	let triageResult;
	try {
		triageResult = await categorize.classify({
			content: payload.content,
			title: payload.title,
			model: eff.triageModel,
			categories,
			customRules: eff.customRules,
		});
	} catch (err) {
		winston.warn('[plugin/ai-moderation] deep triage failed pid=' + payload.pid + ': ' + err.message);
		return { skipped: 'triage-error', error: err.message };
	}

	const triageTop = triageResult.maxVerdict;
	const conf = triageTop.confidence;
	let finalResult = triageResult;
	let escalated = false;

	const inGreyZone = conf >= eff.escalationLow && conf <= eff.escalationHigh;
	if (inGreyZone && eff.escalationModel && eff.escalationModel !== eff.triageModel) {
		try {
			finalResult = await categorize.classify({
				content: payload.content,
				title: payload.title,
				model: eff.escalationModel,
				categories,
				customRules: eff.customRules,
			});
			escalated = true;
		} catch (err) {
			winston.warn('[plugin/ai-moderation] escalation failed pid=' + payload.pid + ': ' + err.message + ' — falling back to triage verdict');
		}
	}

	const top = finalResult.maxVerdict;
	const finalConf = top.confidence;
	let action = 'pass';
	if (finalConf >= eff.blockThreshold) action = 'block';
	else if (finalConf >= eff.flagThreshold) action = 'flag';

	const decision = {
		pid: payload.pid,
		uid: payload.uid,
		cid: payload.cid,
		tid: payload.tid,
		triage: {
			model: triageResult.model,
			verdict: triageTop,
			cost: triageResult.cost,
			tokens: triageResult.usage,
			elapsedMs: triageResult.elapsedMs,
		},
		escalation: escalated ? {
			model: finalResult.model,
			verdict: top,
			cost: finalResult.cost,
			tokens: finalResult.usage,
			elapsedMs: finalResult.elapsedMs,
		} : null,
		action,
		finalConfidence: finalConf,
		category: top.category,
		reason: top.reason,
		summary: finalResult.summary,
		verdicts: finalResult.verdicts,
		createdAt: Date.now(),
		dryRun: s.dryRun,
	};

	try {
		const enforce = require('./enforce');
		await enforce.apply(decision);
	} catch (err) {
		winston.verbose('[plugin/ai-moderation] enforce not available: ' + err.message);
	}

	try {
		const audit = require('./audit');
		await audit.record(decision);
	} catch (_) { /* audit not wired */ }

	try {
		const budget = require('./budget');
		const totalCost = (triageResult.cost || 0) + (escalated ? (finalResult.cost || 0) : 0);
		await budget.charge({ uid: payload.uid, cost: totalCost });
	} catch (_) { /* budget not wired */ }

	return decision;
};
