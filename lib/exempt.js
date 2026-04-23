'use strict';

const user = require.main.require('./src/user');
const groups = require.main.require('./src/groups');

const settings = require('./settings');

exports.isExempt = async (uid) => {
	if (!uid) return false;

	const [isAdmin, isGlobalMod] = await Promise.all([
		user.isAdministrator(uid),
		user.isGlobalModerator(uid),
	]);

	const roles = settings.getExemptRolesList().map(r => r.toLowerCase());
	if (isAdmin && roles.includes('administrators')) return true;
	if (isGlobalMod && roles.includes('global moderators')) return true;

	const customGroups = roles.filter(
		r => r !== 'administrators' && r !== 'global moderators'
	);
	if (customGroups.length) {
		const memberships = await Promise.all(
			customGroups.map(g => groups.isMember(uid, g))
		);
		if (memberships.some(Boolean)) return true;
	}

	const threshold = parseFloat(settings.get().reputationExemptThreshold) || 0;
	if (threshold > 0) {
		const rep = parseFloat(await user.getUserField(uid, 'reputation')) || 0;
		if (rep >= threshold) return true;
	}

	return false;
};
