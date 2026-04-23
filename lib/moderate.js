'use strict';

const winston = require.main.require('winston');

const settings = require('./settings');
const openrouter = require('./openrouter');
const categorize = require('./categorize');
const exempt = require('./exempt');
const budget = require('./budget');

exports.triage = async ({ uid, content, title = '', cid = 0, context = 'post' }) => {
	const s = settings.getEffectiveForCid(cid);

	if (!s.enabled) return { action: 'pass', reason: 'plugin disabled' };
	if (!openrouter.isConfigured()) return { action: 'pass', reason: 'api key missing' };
	if (!content || !String(content).trim()) return { action: 'pass', reason: 'empty content' };

	if (await exempt.isExempt(uid)) {
		return { action: 'pass', reason: 'user exempt', exempt: true };
	}

	const cap = await budget.wouldExceed({ uid });
	if (cap.exceeded) {
		if (s.budgetFallback === 'pass') {
			winston.info(`[plugin/ai-moderation] budget exceeded (${cap.which}), fail-open pass uid=${uid}`);
			return { action: 'pass', reason: 'budget-exceeded', capExceeded: cap };
		}
		winston.info(`[plugin/ai-moderation] budget exceeded (${cap.which}), deferring uid=${uid}`);
		return { action: 'enqueue', reason: 'budget-exceeded-defer', capExceeded: cap };
	}

	const categories = settings.getCategoriesListForCid(cid);

	let result;
	try {
		result = await categorize.classify({
			content,
			title,
			model: s.triageModel,
			categories,
			customRules: s.customRules,
		});
	} catch (err) {
		winston.warn('[plugin/ai-moderation] triage API error (fail-open): ' + err.message);
		return { action: 'pass', reason: 'api error', error: err.message };
	}

	try {
		await budget.charge({ uid, cost: result.cost || 0 });
	} catch (_) { /* ignore */ }

	const top = result.maxVerdict;
	const conf = top.confidence;

	if (conf >= s.blockThreshold) {
		if (s.dryRun) {
			winston.info(
				`[plugin/ai-moderation] DRY-RUN would block ${context} uid=${uid} cid=${cid}` +
				` category=${top.category} confidence=${conf.toFixed(2)} reason="${top.reason}"`
			);
			return { action: 'pass', reason: 'dry-run block', verdict: top, result, wouldBlock: true };
		}
		winston.info(
			`[plugin/ai-moderation] blocked ${context} uid=${uid} cid=${cid}` +
			` category=${top.category} confidence=${conf.toFixed(2)}`
		);
		return { action: 'block', reason: top.reason, verdict: top, result };
	}

	if (conf >= s.escalationLow && conf <= s.escalationHigh) {
		return { action: 'enqueue', reason: 'grey zone for deep review', verdict: top, result };
	}

	if (conf >= s.flagThreshold) {
		return { action: 'flag', reason: top.reason, verdict: top, result };
	}

	return { action: 'pass', reason: 'below thresholds', verdict: top, result };
};
