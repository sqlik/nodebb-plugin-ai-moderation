'use strict';

const CATEGORY_DESCRIPTIONS = {
	spam: 'Unsolicited commercial content, repetitive promotional posts, link farms, or automated-looking messages unrelated to the discussion.',
	toxicity: 'Personal attacks, harassment, hate speech, slurs, threats, or deliberately inflammatory content aimed at individuals or groups.',
	nsfw: 'Sexually explicit content, graphic violence, gore, or content inappropriate for a general audience.',
	pii: 'Personally identifiable information exposed without consent — phone numbers, home addresses, government IDs, private emails, financial details.',
	promotion: 'Self-promotion, affiliate links, off-topic product pitches, or covert advertising that violates the forum\'s commercial content rules.',
};

function describeCategories(categoryList) {
	const lines = categoryList.map((cat) => {
		const desc = CATEGORY_DESCRIPTIONS[cat] || 'Custom category defined by the forum administrator.';
		return `- **${cat}**: ${desc}`;
	});
	return lines.join('\n');
}

exports.buildSystem = ({ categories, customRules, language }) => {
	const catList = (categories && categories.length)
		? categories
		: Object.keys(CATEGORY_DESCRIPTIONS);

	const rulesBlock = (customRules && customRules.trim())
		? `\n\n**Forum-specific rules (apply on top of the categories above):**\n${customRules.trim()}`
		: '';

	const langBlock = language
		? `\n\nContent language hint: ${language}. Evaluate the content according to the norms of that language community, but your reasoning must always be written in English.`
		: '';

	return `You are an automated content-moderation classifier for an online discussion forum. You review a single post and decide whether it violates any of the listed categories.

**Categories to evaluate:**
${describeCategories(catList)}${rulesBlock}${langBlock}

**Your task:**
For EACH category listed above, output a verdict object with:
- "category": the category name exactly as written
- "confidence": a number between 0.0 (definitely clean) and 1.0 (definitely violates)
- "reason": a concise one-sentence explanation in English

Be calibrated: a genuine helpful post should score near 0.0 on every category. Only score high when you have clear evidence.

**Output strictly as JSON** in this shape, with no extra commentary:
{
  "verdicts": [
    { "category": "<name>", "confidence": <0.0-1.0>, "reason": "<short>" }
  ],
  "summary": "<one-sentence overall assessment>"
}`;
};

exports.buildUser = ({ content, title }) => {
	const parts = [];
	if (title) parts.push(`Title: ${title}`);
	parts.push(`Content:\n${content || ''}`);
	return parts.join('\n\n');
};

exports.CATEGORY_DESCRIPTIONS = CATEGORY_DESCRIPTIONS;
