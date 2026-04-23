'use strict';

const db = require.main.require('./src/database');
const winston = require.main.require('winston');

const settings = require('./settings');

const DAILY_COST_PREFIX = 'plugin:ai-mod:usage:day:';
const MONTHLY_COST_PREFIX = 'plugin:ai-mod:usage:month:';
const USER_DAILY_PREFIX = 'plugin:ai-mod:usage:user:';
const COUNT_FIELD = 'count';
const COST_FIELD = 'cost_scaled';
const SCALE = 1e8;

function today() {
	return new Date().toISOString().slice(0, 10);
}

function thisMonth() {
	return new Date().toISOString().slice(0, 7);
}

async function readScaledCost(key) {
	const obj = await db.getObject(key);
	if (!obj || obj[COST_FIELD] == null) return 0;
	const n = parseInt(obj[COST_FIELD], 10);
	return isNaN(n) ? 0 : n;
}

async function readUserCount(uid) {
	if (!uid) return 0;
	const key = USER_DAILY_PREFIX + uid + ':' + today();
	const obj = await db.getObject(key);
	return obj && obj[COUNT_FIELD] ? parseInt(obj[COUNT_FIELD], 10) || 0 : 0;
}

exports.wouldExceed = async ({ uid }) => {
	const s = settings.get();
	const day = today();
	const month = thisMonth();

	const [dayScaled, monthScaled, userCount] = await Promise.all([
		readScaledCost(DAILY_COST_PREFIX + day),
		readScaledCost(MONTHLY_COST_PREFIX + month),
		readUserCount(uid),
	]);

	const dayUsd = dayScaled / SCALE;
	const monthUsd = monthScaled / SCALE;

	if (s.budgetDailyUsd > 0 && dayUsd >= s.budgetDailyUsd) {
		return { exceeded: true, which: 'daily', dayUsd, limit: s.budgetDailyUsd };
	}
	if (s.budgetMonthlyUsd > 0 && monthUsd >= s.budgetMonthlyUsd) {
		return { exceeded: true, which: 'monthly', monthUsd, limit: s.budgetMonthlyUsd };
	}
	if (s.budgetPerUserDaily > 0 && userCount >= s.budgetPerUserDaily) {
		return { exceeded: true, which: 'user-daily', userCount, limit: s.budgetPerUserDaily };
	}
	return { exceeded: false, dayUsd, monthUsd, userCount };
};

exports.charge = async ({ uid, cost }) => {
	const c = parseFloat(cost) || 0;
	const scaled = Math.round(c * SCALE);
	const day = today();
	const month = thisMonth();
	try {
		await db.incrObjectFieldBy(DAILY_COST_PREFIX + day, COST_FIELD, scaled);
		await db.incrObjectFieldBy(MONTHLY_COST_PREFIX + month, COST_FIELD, scaled);
		await db.incrObjectFieldBy(DAILY_COST_PREFIX + day, COUNT_FIELD, 1);
		await db.incrObjectFieldBy(MONTHLY_COST_PREFIX + month, COUNT_FIELD, 1);
		if (uid) {
			await db.incrObjectFieldBy(USER_DAILY_PREFIX + uid + ':' + day, COUNT_FIELD, 1);
		}
	} catch (err) {
		winston.warn('[plugin/ai-moderation] budget charge failed: ' + err.message);
	}
};

exports.stats = async () => {
	const day = today();
	const month = thisMonth();
	const [dayObj, monthObj] = await Promise.all([
		db.getObject(DAILY_COST_PREFIX + day),
		db.getObject(MONTHLY_COST_PREFIX + month),
	]);
	return {
		day,
		month,
		dayUsd: (parseInt(dayObj?.[COST_FIELD], 10) || 0) / SCALE,
		dayCount: parseInt(dayObj?.[COUNT_FIELD], 10) || 0,
		monthUsd: (parseInt(monthObj?.[COST_FIELD], 10) || 0) / SCALE,
		monthCount: parseInt(monthObj?.[COUNT_FIELD], 10) || 0,
	};
};
