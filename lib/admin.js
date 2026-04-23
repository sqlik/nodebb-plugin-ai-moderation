'use strict';

const settings = require('./settings');
const openrouter = require('./openrouter');

exports.renderAdminPage = (req, res) => {
	const s = settings.get();
	const apiKeySource = openrouter.getApiKeySource();
	res.render('admin/plugins/ai-moderation', {
		title: 'AI Moderation',

		enabled: s.enabled,
		dryRun: s.dryRun,

		apiKeyFile: s.apiKeyFile,

		triageModel: s.triageModel,
		escalationModel: s.escalationModel,

		blockThreshold: s.blockThreshold,
		flagThreshold: s.flagThreshold,
		escalationLow: s.escalationLow,
		escalationHigh: s.escalationHigh,

		categories: s.categories,
		customRules: s.customRules,
		categoryActions: s.categoryActions,
		systemReporterUid: s.systemReporterUid,
		cidOverrides: s.cidOverrides,

		exemptRoles: s.exemptRoles,
		reputationExemptThreshold: s.reputationExemptThreshold,

		reanalyzeEdits: s.reanalyzeEdits,

		budgetDailyUsd: s.budgetDailyUsd,
		budgetMonthlyUsd: s.budgetMonthlyUsd,
		budgetPerUserDaily: s.budgetPerUserDaily,
		budgetFallback: s.budgetFallback,

		auditRetentionDays: s.auditRetentionDays,

		apiKeyConfigured: !!apiKeySource,
		apiKeySource: apiKeySource || 'none',
	});
};
