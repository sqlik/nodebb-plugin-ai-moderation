'use strict';

const winston = require.main.require('winston');

const settings = require('./lib/settings');
const openrouter = require('./lib/openrouter');
const admin = require('./lib/admin');
const categorize = require('./lib/categorize');
const hooks = require('./lib/hooks');
const queue = require('./lib/queue');
const deep = require('./lib/deep');
const audit = require('./lib/audit');
const budget = require('./lib/budget');

const plugin = {};

plugin.init = async (params) => {
	const { router, middleware } = params;

	router.get('/admin/plugins/ai-moderation', middleware.admin.buildHeader, admin.renderAdminPage);
	router.get('/api/admin/plugins/ai-moderation', admin.renderAdminPage);

	await settings.load();
	openrouter.invalidate();
	categorize.invalidateModeCache();

	queue.setProcessor(deep.processTask);
	queue.start();

	const sockets = require.main.require('./src/socket.io/plugins');
	sockets['ai-moderation'] = sockets['ai-moderation'] || {};

	sockets['ai-moderation'].reload = async (socket) => {
		await assertAdmin(socket);
		await settings.load();
		openrouter.invalidate();
		categorize.invalidateModeCache();
		return { ok: true };
	};

	sockets['ai-moderation'].pingModel = async (socket, data) => {
		await assertAdmin(socket);
		const model = (data && data.model || '').trim();
		if (!model) throw new Error('Model is required');
		if (!openrouter.isConfigured()) throw new Error('OpenRouter API key not configured');
		try {
			return await openrouter.ping(model);
		} catch (err) {
			winston.warn('[plugin/ai-moderation] ping failed model=' + model + ': ' + err.message);
			throw new Error(err.message || 'Ping failed');
		}
	};

	sockets['ai-moderation'].playground = async (socket, data) => {
		await assertAdmin(socket);
		if (!openrouter.isConfigured()) throw new Error('OpenRouter API key not configured');

		const content = String(data?.content || '').trim();
		const title = String(data?.title || '').trim();
		const model = String(data?.model || '').trim();
		const language = String(data?.language || '').trim();
		const customRules = String(data?.customRules || '').trim();
		const categoriesStr = String(data?.categories || '').trim();

		if (!content) throw new Error('Content is required');
		if (!model) throw new Error('Model is required');

		const categories = categoriesStr
			? categoriesStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
			: settings.getCategoriesList();

		try {
			return await categorize.classify({ content, title, model, categories, customRules, language });
		} catch (err) {
			winston.warn('[plugin/ai-moderation] playground failed: ' + err.message);
			throw new Error(err.message || 'Classification failed');
		}
	};

	sockets['ai-moderation'].listAudit = async (socket, data) => {
		await assertAdmin(socket);
		const start = parseInt(data?.start, 10) || 0;
		const stop = parseInt(data?.stop, 10) || 49;
		const filter = (data && data.filter) || {};
		return audit.list({ start, stop, filter });
	};

	sockets['ai-moderation'].getDecision = async (socket, data) => {
		await assertAdmin(socket);
		if (!data || !data.id) throw new Error('id required');
		return audit.get(String(data.id));
	};

	sockets['ai-moderation'].correctDecision = async (socket, data) => {
		await assertAdmin(socket);
		if (!data || !data.id) throw new Error('id required');
		return audit.correct({
			id: String(data.id),
			moderatorUid: socket.uid,
			verdict: String(data.verdict || ''),
			notes: String(data.notes || ''),
		});
	};

	sockets['ai-moderation'].stats = async (socket) => {
		await assertAdmin(socket);
		const s = settings.get();
		const [budgetStats, queueStats, categoryStats, modelStats] = await Promise.all([
			budget.stats(),
			queue.stats(),
			audit.categoryStats(),
			audit.modelStats([s.triageModel, s.escalationModel].filter(Boolean)),
		]);
		return { budget: budgetStats, queue: queueStats, categories: categoryStats, models: modelStats };
	};

	winston.verbose(
		'[plugin/ai-moderation] initialised (apiKey=' + (openrouter.getApiKeySource() || 'none') +
		', enabled=' + settings.get().enabled +
		', dryRun=' + settings.get().dryRun + ')'
	);
};

plugin.addAdminMenu = async (header) => {
	header.plugins.push({
		route: '/plugins/ai-moderation',
		icon: 'fa-shield-alt',
		name: 'AI Moderation',
	});
	return header;
};

plugin.onPostCreate = hooks.onPostCreate;
plugin.onTopicPost = hooks.onTopicPost;
plugin.onPostSave = hooks.onPostSave;
plugin.onPostEdit = hooks.onPostEdit;

async function assertAdmin(socket) {
	const user = require.main.require('./src/user');
	const isAdmin = await user.isAdministrator(socket.uid);
	if (!isAdmin) throw new Error('[[error:no-privileges]]');
}

module.exports = plugin;
