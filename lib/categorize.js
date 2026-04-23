'use strict';

const winston = require.main.require('winston');

const openrouter = require('./openrouter');
const prompt = require('./prompt');

const VERDICT_SCHEMA = {
	name: 'moderation_verdict',
	strict: true,
	schema: {
		type: 'object',
		additionalProperties: false,
		required: ['verdicts', 'summary'],
		properties: {
			verdicts: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['category', 'confidence', 'reason'],
					properties: {
						category: { type: 'string' },
						confidence: { type: 'number' },
						reason: { type: 'string' },
					},
				},
			},
			summary: { type: 'string' },
		},
	},
};

const modeCache = new Map();

function stripCodeFence(text) {
	if (!text) return text;
	let t = text.trim();
	if (t.startsWith('```')) {
		t = t.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
	}
	return t;
}

function coerceVerdicts(parsed, expectedCategories) {
	if (!parsed || typeof parsed !== 'object') return [];
	const arr = Array.isArray(parsed.verdicts) ? parsed.verdicts : [];
	const seen = new Set();
	const out = [];
	for (const v of arr) {
		if (!v || typeof v !== 'object') continue;
		const cat = String(v.category || '').trim().toLowerCase();
		if (!cat || seen.has(cat)) continue;
		seen.add(cat);
		let conf = parseFloat(v.confidence);
		if (isNaN(conf)) conf = 0;
		if (conf < 0) conf = 0;
		if (conf > 1) conf = 1;
		out.push({
			category: cat,
			confidence: conf,
			reason: String(v.reason || '').slice(0, 500),
		});
	}
	if (expectedCategories && expectedCategories.length) {
		const have = new Set(out.map(v => v.category));
		for (const cat of expectedCategories) {
			if (!have.has(cat)) {
				out.push({ category: cat, confidence: 0, reason: 'No verdict returned; defaulted to clean.' });
			}
		}
	}
	return out;
}

async function callModel(client, model, messages, mode) {
	const base = {
		model,
		messages,
		temperature: 0,
		max_tokens: 1024,
	};
	if (mode === 'schema') {
		base.response_format = { type: 'json_schema', json_schema: VERDICT_SCHEMA };
	} else {
		base.response_format = { type: 'json_object' };
	}
	return client.chat.completions.create(base);
}

exports.classify = async ({
	content,
	title = '',
	model,
	categories,
	customRules = '',
	language = '',
}) => {
	if (!content || !String(content).trim()) throw new Error('content required');
	if (!model) throw new Error('model required');

	const client = openrouter.getClient();
	const systemPrompt = prompt.buildSystem({ categories, customRules, language });
	const userPrompt = prompt.buildUser({ content, title });
	const messages = [
		{ role: 'system', content: systemPrompt },
		{ role: 'user', content: userPrompt },
	];

	const started = Date.now();
	let res;
	let modeUsed = modeCache.get(model) || 'schema';

	try {
		res = await callModel(client, model, messages, modeUsed);
	} catch (err) {
		if (modeUsed === 'schema') {
			winston.verbose('[plugin/ai-moderation] schema mode failed for ' + model + ', falling back to json_object: ' + err.message);
			modeCache.set(model, 'json_object');
			modeUsed = 'json_object';
			res = await callModel(client, model, messages, modeUsed);
		} else {
			throw err;
		}
	}

	if (!modeCache.has(model)) modeCache.set(model, modeUsed);
	const elapsedMs = Date.now() - started;

	const raw = res.choices?.[0]?.message?.content || '';
	let parsed = null;
	try {
		parsed = JSON.parse(stripCodeFence(raw));
	} catch (err) {
		winston.warn('[plugin/ai-moderation] JSON parse failed model=' + model + ' mode=' + modeUsed + ' raw=' + raw.slice(0, 200));
	}

	const verdicts = coerceVerdicts(parsed, categories);
	const maxVerdict = verdicts.reduce(
		(acc, v) => (v.confidence > acc.confidence ? v : acc),
		{ category: null, confidence: 0, reason: '' }
	);

	return {
		ok: !!parsed,
		model: res.model || model,
		mode: modeUsed,
		verdicts,
		summary: parsed?.summary || '',
		maxVerdict,
		usage: res.usage || null,
		cost: res.usage?.cost || null,
		elapsedMs,
		raw,
	};
};

exports.invalidateModeCache = () => modeCache.clear();
