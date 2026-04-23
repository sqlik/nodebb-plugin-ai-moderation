'use strict';

const db = require.main.require('./src/database');
const winston = require.main.require('winston');

const QUEUE_KEY = 'plugin:ai-mod:queue';
const TASK_PREFIX = 'plugin:ai-mod:task:';
const PROCESSED_KEY = 'plugin:ai-mod:processed';
const LOCK_KEY = 'plugin:ai-mod:worker-lock';

const LOCK_TTL_MS = 60 * 1000;
const WORKER_TICK_MS = 5 * 1000;
const BATCH_SIZE = 3;

let timer = null;
let running = false;
let processor = null;
const workerId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function makeTaskId() {
	return Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

async function acquireLock() {
	const now = Date.now();
	const current = await db.getObject(LOCK_KEY);
	if (current && current.expiresAt > now && current.holder !== workerId) return false;

	const lock = { holder: workerId, expiresAt: now + LOCK_TTL_MS };
	await db.setObject(LOCK_KEY, lock);
	const verify = await db.getObject(LOCK_KEY);
	return verify && verify.holder === workerId;
}

async function releaseLock() {
	const current = await db.getObject(LOCK_KEY);
	if (current && current.holder === workerId) {
		await db.delete(LOCK_KEY);
	}
}

exports.enqueueDeep = async ({ pid, uid, cid, tid, editedReanalysis = false }) => {
	if (!pid) return false;

	const alreadyProcessed = await db.isSortedSetMember(PROCESSED_KEY, String(pid));
	if (alreadyProcessed && !editedReanalysis) return false;

	const id = 'deep-' + pid + (editedReanalysis ? '-edit-' + Date.now() : '');
	const task = {
		id,
		type: 'deep',
		pid,
		uid: uid || 0,
		cid: cid || 0,
		tid: tid || 0,
		editedReanalysis: !!editedReanalysis,
		createdAt: Date.now(),
	};

	await db.setObject(TASK_PREFIX + id, task);
	await db.sortedSetAdd(QUEUE_KEY, Date.now(), id);
	return true;
};

exports.enqueue = async (payload) => {
	const id = makeTaskId();
	const task = { id, ...payload, createdAt: Date.now() };
	await db.setObject(TASK_PREFIX + id, task);
	await db.sortedSetAdd(QUEUE_KEY, Date.now(), id);
	return id;
};

exports.setProcessor = (fn) => { processor = fn; };

async function popBatch() {
	const ids = await db.getSortedSetRangeByScore(QUEUE_KEY, 0, BATCH_SIZE, '-inf', Date.now());
	if (!ids || !ids.length) return [];
	const tasks = [];
	for (const id of ids) {
		const task = await db.getObject(TASK_PREFIX + id);
		await db.sortedSetRemove(QUEUE_KEY, id);
		await db.delete(TASK_PREFIX + id);
		if (task) tasks.push(task);
	}
	return tasks;
}

async function markProcessed(pid) {
	if (!pid) return;
	await db.sortedSetAdd(PROCESSED_KEY, Date.now(), String(pid));
	const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
	await db.sortedSetsRemoveRangeByScore([PROCESSED_KEY], '-inf', cutoff);
}

async function tick() {
	if (running) return;
	running = true;
	try {
		const haveLock = await acquireLock();
		if (!haveLock) return;

		const batch = await popBatch();
		if (!batch.length) return;

		for (const task of batch) {
			try {
				if (processor) {
					await processor(task);
				}
				if (task.pid) await markProcessed(task.pid);
			} catch (err) {
				winston.warn('[plugin/ai-moderation] task ' + task.id + ' failed: ' + err.message);
			}
		}
	} catch (err) {
		winston.warn('[plugin/ai-moderation] worker tick error: ' + err.message);
	} finally {
		running = false;
	}
}

exports.start = () => {
	if (timer) return;
	timer = setInterval(tick, WORKER_TICK_MS);
	timer.unref && timer.unref();
	winston.verbose('[plugin/ai-moderation] async worker started');
};

exports.stop = async () => {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	await releaseLock();
};

exports.stats = async () => {
	const count = await db.sortedSetCard(QUEUE_KEY);
	const processed = await db.sortedSetCard(PROCESSED_KEY);
	return { pending: count || 0, processedTracked: processed || 0 };
};
