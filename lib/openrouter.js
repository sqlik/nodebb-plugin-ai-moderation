'use strict';

const fs = require('fs');
const nconf = require.main.require('nconf');
const winston = require.main.require('winston');

const settings = require('./settings');

let OpenAI;
try {
	OpenAI = require('openai').OpenAI || require('openai').default || require('openai');
} catch (err) {
	winston.error('[plugin/ai-moderation] openai SDK not installed — run `npm install` inside the plugin directory');
}

const BASE_URL = 'https://openrouter.ai/api/v1';

let cachedClient = null;
let cachedKey = null;

function readApiKey() {
	const fromEnv = process.env.OPENROUTER_API_KEY;
	if (fromEnv && fromEnv.trim()) {
		return { key: fromEnv.trim(), source: 'env' };
	}
	const fromConfig = nconf.get('ai-moderation:openrouter_api_key');
	if (fromConfig && String(fromConfig).trim()) {
		return { key: String(fromConfig).trim(), source: 'config' };
	}
	const filePath = (settings.get().apiKeyFile || '').trim();
	if (filePath) {
		try {
			const contents = fs.readFileSync(filePath, 'utf8').trim();
			if (contents) return { key: contents, source: 'file:' + filePath };
		} catch (err) {
			winston.warn('[plugin/ai-moderation] apiKeyFile read failed (' + filePath + '): ' + err.message);
		}
	}
	return { key: null, source: null };
}

function getForumUrl() {
	return nconf.get('url') || 'https://nodebb.local';
}

exports.invalidate = () => {
	cachedClient = null;
	cachedKey = null;
};

exports.getApiKeySource = () => readApiKey().source;

exports.isConfigured = () => !!readApiKey().key;

exports.getClient = () => {
	if (!OpenAI) {
		throw new Error('openai SDK not available');
	}
	const { key } = readApiKey();
	if (!key) {
		throw new Error('OpenRouter API key not configured');
	}
	if (cachedClient && cachedKey === key) {
		return cachedClient;
	}
	cachedClient = new OpenAI({
		apiKey: key,
		baseURL: BASE_URL,
		defaultHeaders: {
			'HTTP-Referer': getForumUrl(),
			'X-Title': 'NodeBB AI Moderation',
		},
	});
	cachedKey = key;
	return cachedClient;
};

exports.ping = async (model) => {
	const client = exports.getClient();
	const res = await client.chat.completions.create({
		model: model || 'google/gemini-2.5-flash-lite',
		messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
		max_tokens: 4,
		temperature: 0,
	});
	return {
		ok: true,
		model: res.model,
		reply: res.choices?.[0]?.message?.content || '',
		usage: res.usage || null,
	};
};

const MODELS_CACHE_TTL_MS = 60 * 60 * 1000;
let modelsCache = null;

exports.listModels = async ({ force = false } = {}) => {
	const now = Date.now();
	if (!force && modelsCache && (now - modelsCache.at) < MODELS_CACHE_TTL_MS) {
		return { ...modelsCache, cached: true };
	}
	const { key } = readApiKey();
	const headers = { 'HTTP-Referer': getForumUrl(), 'X-Title': 'NodeBB AI Moderation' };
	if (key) headers.Authorization = 'Bearer ' + key;

	const res = await fetch(BASE_URL + '/models', { headers });
	if (!res.ok) {
		throw new Error(`OpenRouter /models returned ${res.status}: ${await res.text().catch(() => '')}`);
	}
	const body = await res.json();
	const rows = (body && Array.isArray(body.data) ? body.data : []).map((m) => {
		const pIn = parseFloat(m.pricing?.prompt || 0);
		const pOut = parseFloat(m.pricing?.completion || 0);
		return {
			id: m.id,
			name: m.name || m.id,
			context: m.context_length || null,
			promptUsdPerMtok: pIn * 1e6,
			completionUsdPerMtok: pOut * 1e6,
		};
	}).sort((a, b) => a.id.localeCompare(b.id));

	modelsCache = { models: rows, at: now, count: rows.length };
	return { ...modelsCache, cached: false };
};

exports.invalidateModelsCache = () => { modelsCache = null; };
