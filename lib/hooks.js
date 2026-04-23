'use strict';

const winston = require.main.require('winston');

const moderate = require('./moderate');

function buildBlockError(verdict, reason) {
	const msg = reason || (verdict && verdict.reason) || 'Content flagged by automated moderation';
	const err = new Error(msg);
	err.ai_moderation = true;
	return err;
}

exports.onPostCreate = async (hookData) => {
	const data = hookData && hookData.data ? hookData.data : hookData;
	const post = hookData && hookData.post ? hookData.post : null;
	const uid = (post && post.uid) || (data && data.uid) || 0;
	const content = (data && data.content) || (post && post.content) || '';
	const cid = (data && data.cid) || (post && post.cid) || 0;
	const tid = (data && data.tid) || (post && post.tid) || 0;

	const res = await moderate.triage({ uid, content, cid, context: 'post' });

	if (res.action === 'block') {
		throw buildBlockError(res.verdict, res.reason);
	}

	if (res.action === 'enqueue') {
		try {
			const queue = require('./queue');
			await queue.enqueue({ type: 'post', tid, cid, uid, pendingPid: true, content });
		} catch (_) { /* queue not yet wired */ }
	}

	if (res.action === 'flag') {
		try {
			const enforce = require('./enforce');
			await enforce.applyPending({ type: 'post', uid, cid, tid, content, result: res.result, verdict: res.verdict });
		} catch (_) { /* enforcement not yet wired */ }
	}

	return hookData;
};

exports.onTopicPost = async (hookData) => {
	const data = hookData && hookData.data ? hookData.data : hookData;
	const topic = hookData && hookData.topic ? hookData.topic : null;
	const uid = (data && data.uid) || (topic && topic.uid) || 0;
	const title = (data && data.title) || (topic && topic.title) || '';
	const content = (data && data.content) || '';
	const cid = (data && data.cid) || (topic && topic.cid) || 0;

	const res = await moderate.triage({ uid, content, title, cid, context: 'topic' });

	if (res.action === 'block') {
		throw buildBlockError(res.verdict, res.reason);
	}

	if (res.action === 'enqueue') {
		try {
			const queue = require('./queue');
			await queue.enqueue({ type: 'topic', cid, uid, pendingTid: true, title, content });
		} catch (_) { /* queue not yet wired */ }
	}

	if (res.action === 'flag') {
		try {
			const enforce = require('./enforce');
			await enforce.applyPending({ type: 'topic', uid, cid, title, content, result: res.result, verdict: res.verdict });
		} catch (_) { /* enforcement not yet wired */ }
	}

	return hookData;
};

exports.onPostSave = async (hookData) => {
	try {
		const post = hookData && hookData.post;
		if (!post || !post.pid) return;
		const queue = require('./queue');
		await queue.enqueueDeep({ pid: post.pid, uid: post.uid, cid: post.cid, tid: post.tid });
	} catch (err) {
		winston.verbose('[plugin/ai-moderation] onPostSave enqueue skipped: ' + err.message);
	}
};

exports.onPostEdit = async (hookData) => {
	try {
		const settings = require('./settings');
		if (!settings.get().reanalyzeEdits) return;
		const post = hookData && hookData.post;
		if (!post || !post.pid) return;
		const queue = require('./queue');
		await queue.enqueueDeep({ pid: post.pid, uid: post.uid, cid: post.cid, tid: post.tid, editedReanalysis: true });
	} catch (err) {
		winston.verbose('[plugin/ai-moderation] onPostEdit enqueue skipped: ' + err.message);
	}
};
