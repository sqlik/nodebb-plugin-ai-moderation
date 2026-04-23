'use strict';

const meta = require.main.require('./src/meta');

const DEFAULTS = {
	enabled: false,
	dryRun: true,

	triageModel: 'google/gemini-2.5-flash-lite',
	escalationModel: 'anthropic/claude-haiku-4-5',

	blockThreshold: 0.9,
	flagThreshold: 0.6,
	escalationLow: 0.4,
	escalationHigh: 0.9,

	categories: 'spam,toxicity,nsfw,pii,promotion',
	customRules: '',
	categoryActions: '{"spam":"hide","toxicity":"flag","nsfw":"hide","pii":"flag","promotion":"flag"}',
	systemReporterUid: 1,
	cidOverrides: '{}',

	exemptRoles: 'administrators,Global Moderators',
	reputationExemptThreshold: 0,

	reanalyzeEdits: false,

	budgetDailyUsd: 5,
	budgetMonthlyUsd: 100,
	budgetPerUserDaily: 20,
	budgetFallback: 'queue',

	auditRetentionDays: 90,
};

const NUM_FIELDS = [
	'blockThreshold', 'flagThreshold', 'escalationLow', 'escalationHigh',
	'reputationExemptThreshold',
	'budgetDailyUsd', 'budgetMonthlyUsd', 'budgetPerUserDaily',
	'auditRetentionDays',
	'systemReporterUid',
];

const VALID_ACTIONS = new Set(['flag', 'hide', 'delete']);

const BOOL_FIELDS = ['enabled', 'dryRun', 'reanalyzeEdits'];

let cache = { ...DEFAULTS };

function parseBool(v) {
	return String(v) === 'true' || v === true || v === 'on' || v === 1 || v === '1';
}

function clamp01(n) {
	if (isNaN(n)) return 0;
	if (n < 0) return 0;
	if (n > 1) return 1;
	return n;
}

exports.load = async () => {
	const stored = await meta.settings.get('ai-moderation') || {};
	cache = { ...DEFAULTS, ...stored };

	for (const f of NUM_FIELDS) {
		cache[f] = parseFloat(cache[f]);
		if (isNaN(cache[f])) cache[f] = DEFAULTS[f];
	}
	for (const f of BOOL_FIELDS) {
		cache[f] = parseBool(cache[f]);
	}

	cache.blockThreshold = clamp01(cache.blockThreshold);
	cache.flagThreshold = clamp01(cache.flagThreshold);
	cache.escalationLow = clamp01(cache.escalationLow);
	cache.escalationHigh = clamp01(cache.escalationHigh);

	if (cache.escalationHigh < cache.escalationLow) {
		cache.escalationHigh = cache.escalationLow;
	}

	if (cache.reputationExemptThreshold < 0) cache.reputationExemptThreshold = 0;
	if (cache.budgetDailyUsd < 0) cache.budgetDailyUsd = 0;
	if (cache.budgetMonthlyUsd < 0) cache.budgetMonthlyUsd = 0;
	if (cache.budgetPerUserDaily < 0) cache.budgetPerUserDaily = 0;
	if (cache.auditRetentionDays < 1) cache.auditRetentionDays = 1;

	if (!['queue', 'pass'].includes(cache.budgetFallback)) {
		cache.budgetFallback = DEFAULTS.budgetFallback;
	}

	return cache;
};

exports.get = () => cache;

exports.getCategoriesList = () => (cache.categories || '')
	.split(',')
	.map(s => s.trim().toLowerCase())
	.filter(Boolean);

exports.getExemptRolesList = () => (cache.exemptRoles || '')
	.split(',')
	.map(s => s.trim())
	.filter(Boolean);

exports.getCategoryActions = () => {
	let parsed = {};
	try {
		parsed = JSON.parse(cache.categoryActions || '{}');
	} catch (_) { parsed = {}; }
	const out = {};
	for (const [k, v] of Object.entries(parsed)) {
		const cat = String(k).trim().toLowerCase();
		const action = String(v).trim().toLowerCase();
		if (cat && VALID_ACTIONS.has(action)) out[cat] = action;
	}
	return out;
};

exports.getActionForCategory = (category) => {
	const actions = exports.getCategoryActions();
	return actions[String(category || '').toLowerCase()] || 'flag';
};

exports.getCidOverrides = () => {
	try {
		const parsed = JSON.parse(cache.cidOverrides || '{}');
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch (_) { return {}; }
};

const OVERRIDABLE = new Set([
	'blockThreshold', 'flagThreshold', 'escalationLow', 'escalationHigh',
	'triageModel', 'escalationModel',
	'categories', 'customRules',
]);

exports.getEffectiveForCid = (cid) => {
	const base = { ...cache };
	if (!cid) return base;
	const all = exports.getCidOverrides();
	const o = all[String(cid)];
	if (!o || typeof o !== 'object') return base;
	for (const [k, v] of Object.entries(o)) {
		if (OVERRIDABLE.has(k) && v != null && v !== '') {
			base[k] = v;
		}
	}
	if (base !== cache) {
		base.blockThreshold = clamp01(parseFloat(base.blockThreshold));
		base.flagThreshold = clamp01(parseFloat(base.flagThreshold));
		base.escalationLow = clamp01(parseFloat(base.escalationLow));
		base.escalationHigh = clamp01(parseFloat(base.escalationHigh));
		if (isNaN(base.blockThreshold)) base.blockThreshold = cache.blockThreshold;
		if (isNaN(base.flagThreshold)) base.flagThreshold = cache.flagThreshold;
		if (isNaN(base.escalationLow)) base.escalationLow = cache.escalationLow;
		if (isNaN(base.escalationHigh)) base.escalationHigh = cache.escalationHigh;
	}
	return base;
};

exports.getCategoriesListForCid = (cid) => {
	const eff = exports.getEffectiveForCid(cid);
	return (eff.categories || '')
		.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
};

exports.DEFAULTS = DEFAULTS;
