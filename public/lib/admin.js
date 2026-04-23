'use strict';

/* globals $, socket */

import { save, load } from 'settings';
import * as alerts from 'alerts';

function escapeHtml(s) {
	return String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtCost(c) {
	if (c == null) return '–';
	if (c === 0) return '$0.000000';
	return '$' + Number(c).toFixed(6);
}

function fmtUsd(n) {
	return '$' + (Number(n) || 0).toFixed(4);
}

function fmtTime(ts) {
	if (!ts) return '';
	const d = new Date(parseInt(ts, 10));
	return d.toISOString().replace('T', ' ').slice(0, 19);
}

function badgeFor(conf) {
	if (conf >= 0.9) return 'bg-danger';
	if (conf >= 0.6) return 'bg-warning text-dark';
	if (conf >= 0.4) return 'bg-info text-dark';
	return 'bg-success';
}

function renderPlaygroundResult(result) {
	const rows = (result.verdicts || []).map((v) => {
		const pct = Math.round(v.confidence * 100);
		return `
			<tr>
				<td><code>${escapeHtml(v.category)}</code></td>
				<td><span class="badge ${badgeFor(v.confidence)}">${pct}%</span></td>
				<td class="small">${escapeHtml(v.reason)}</td>
			</tr>`;
	}).join('');

	const usage = result.usage || {};
	const tokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);

	return `
		<div class="card">
			<div class="card-header d-flex justify-content-between align-items-center">
				<span>Verdict</span>
				<small class="text-muted">
					model <code>${escapeHtml(result.model)}</code> ·
					mode <code>${escapeHtml(result.mode || 'n/a')}</code> ·
					${tokens} tokens · ${fmtCost(result.cost)} · ${result.elapsedMs}ms
				</small>
			</div>
			<div class="card-body">
				${result.summary ? `<p class="mb-3"><strong>Summary:</strong> ${escapeHtml(result.summary)}</p>` : ''}
				<table class="table table-sm mb-0">
					<thead><tr><th>Category</th><th>Confidence</th><th>Reason</th></tr></thead>
					<tbody>${rows || '<tr><td colspan="3" class="text-muted">No verdicts returned.</td></tr>'}</tbody>
				</table>
			</div>
		</div>`;
}

function renderPingResult(res) {
	const usage = res.usage || {};
	const tokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
	return `<div class="alert alert-success mb-0">
		<strong>OK</strong> — model <code>${escapeHtml(res.model)}</code>,
		replied <code>${escapeHtml(res.reply)}</code>, ${tokens} tokens.
	</div>`;
}

function renderAuditRow(r) {
	const conf = parseFloat(r.finalConfidence) || 0;
	const actionBadge = r.action === 'block' ? 'bg-danger' : r.action === 'flag' ? 'bg-warning text-dark' : 'bg-success';
	const dry = r.dryRun && String(r.dryRun) !== 'false' && r.dryRun !== 0;
	return `
		<tr>
			<td class="small text-muted">${fmtTime(r.createdAt)}</td>
			<td>${r.pid ? `<a href="/post/${escapeHtml(r.pid)}" target="_blank">${escapeHtml(r.pid)}</a>` : '-'}</td>
			<td>${r.uid || '-'}</td>
			<td>${r.cid || '-'}</td>
			<td><span class="badge ${actionBadge}">${escapeHtml(r.action)}</span>${dry ? ' <span class="badge bg-info">dry</span>' : ''}</td>
			<td><code>${escapeHtml(r.category || '')}</code></td>
			<td><span class="badge ${badgeFor(conf)}">${Math.round(conf * 100)}%</span></td>
			<td class="small">${escapeHtml(r.triageModel || '')}${r.escalationModel && r.escalationModel !== 'null' ? ' → ' + escapeHtml(r.escalationModel) : ''}</td>
			<td class="small">${fmtCost((parseFloat(r.triageCost) || 0) + (parseFloat(r.escalationCost) || 0))}</td>
			<td><button class="btn btn-sm btn-outline-secondary" data-audit-detail="${escapeHtml(r.id)}">…</button></td>
		</tr>`;
}

function renderAuditTable(rows) {
	if (!rows.length) return '<div class="text-muted small">[[ai-moderation:audit.empty]]</div>';
	return `
		<div class="table-responsive">
			<table class="table table-sm">
				<thead><tr>
					<th>time</th><th>pid</th><th>uid</th><th>cid</th>
					<th>action</th><th>cat</th><th>conf</th><th>model(s)</th><th>cost</th><th></th>
				</tr></thead>
				<tbody>${rows.map(renderAuditRow).join('')}</tbody>
			</table>
		</div>`;
}

function renderStats(s) {
	const b = s.budget || {};
	const cats = s.categories || {};
	const models = s.models || {};
	const q = s.queue || {};

	const catRows = Object.entries(cats).map(([cat, v]) => `
		<tr><td><code>${escapeHtml(cat)}</code></td><td>${v.pass}</td><td>${v.flag}</td><td>${v.block}</td></tr>
	`).join('');

	const modelRows = Object.entries(models).map(([m, v]) => `
		<tr><td><code>${escapeHtml(m)}</code></td><td>${v.triage_calls}</td><td>${v.escalation_calls}</td></tr>
	`).join('');

	return `
		<div class="row">
			<div class="col-md-6 mb-3">
				<h6>Budget</h6>
				<table class="table table-sm">
					<tr><td>Today (${escapeHtml(b.day || '')})</td><td><strong>${fmtUsd(b.dayUsd)}</strong> · ${b.dayCount || 0} analyses</td></tr>
					<tr><td>This month (${escapeHtml(b.month || '')})</td><td><strong>${fmtUsd(b.monthUsd)}</strong> · ${b.monthCount || 0} analyses</td></tr>
					<tr><td>Queue</td><td>${q.pending || 0} pending · ${q.processedTracked || 0} tracked</td></tr>
				</table>
			</div>
			<div class="col-md-6 mb-3">
				<h6>Decisions by category</h6>
				<table class="table table-sm">
					<thead><tr><th>category</th><th>pass</th><th>flag</th><th>block</th></tr></thead>
					<tbody>${catRows || '<tr><td colspan="4" class="text-muted">no data yet</td></tr>'}</tbody>
				</table>
			</div>
		</div>
		<h6>Model calls</h6>
		<table class="table table-sm">
			<thead><tr><th>model</th><th>triage calls</th><th>escalation calls</th></tr></thead>
			<tbody>${modelRows || '<tr><td colspan="3" class="text-muted">no data yet</td></tr>'}</tbody>
		</table>`;
}

function refreshAudit() {
	const filter = {
		action: $('#audit-filter-action').val() || undefined,
		category: ($('#audit-filter-category').val() || '').trim().toLowerCase() || undefined,
		uid: ($('#audit-filter-uid').val() || '').trim() || undefined,
	};
	$('#audit-result').html('<div class="text-muted small">Loading…</div>');
	socket.emit('plugins.ai-moderation.listAudit', { start: 0, stop: 49, filter }, (err, rows) => {
		if (err) { alerts.error(err); return; }
		$('#audit-result').html(renderAuditTable(rows || []));
	});
}

function refreshStats() {
	$('#stats-result').html('<div class="text-muted small">Loading…</div>');
	socket.emit('plugins.ai-moderation.stats', {}, (err, s) => {
		if (err) { alerts.error(err); return; }
		$('#stats-result').html(renderStats(s || {}));
	});
}

export function init() {
	const $form = $('.ai-moderation-settings');
	load('ai-moderation', $form);

	$('#save').on('click', () => {
		save('ai-moderation', $form, () => {
			socket.emit('plugins.ai-moderation.reload', {}, (err) => {
				if (err) { alerts.error(err); return; }
				alerts.alert({
					type: 'success',
					title: '[[ai-moderation:saved.title]]',
					message: '[[ai-moderation:saved.message]]',
					timeout: 2500,
				});
			});
		});
	});

	$('[data-ping]').on('click', function () {
		const $btn = $(this);
		const which = $btn.data('ping');
		const model = $(which === 'triage' ? '#triageModel' : '#escalationModel').val().trim();
		if (!model) { alerts.error(new Error('Model name is empty')); return; }
		$btn.prop('disabled', true);
		$('#ping-result').html('<div class="text-muted small">Pinging…</div>');
		socket.emit('plugins.ai-moderation.pingModel', { model }, (err, res) => {
			$btn.prop('disabled', false);
			if (err) { $('#ping-result').html(`<div class="alert alert-danger mb-0">${escapeHtml(err.message || err)}</div>`); return; }
			$('#ping-result').html(renderPingResult(res));
		});
	});

	$('#pg-run').on('click', () => {
		const content = $('#pg-content').val();
		const title = $('#pg-title').val();
		const modelWhich = $('#pg-model').val();
		const language = $('#pg-language').val();
		const model = modelWhich === 'escalation' ? $('#escalationModel').val() : $('#triageModel').val();
		const categories = $('#categories').val();
		const customRules = $('#customRules').val();

		if (!content || !content.trim()) { alerts.error(new Error('Content is empty')); return; }
		if (!model || !model.trim()) { alerts.error(new Error('Model is empty — configure it in Models tab first')); return; }

		const $btn = $('#pg-run');
		$btn.prop('disabled', true);
		$('#pg-result').html('<div class="text-muted">Analyzing…</div>');
		socket.emit('plugins.ai-moderation.playground', {
			content, title, model, language, categories, customRules,
		}, (err, result) => {
			$btn.prop('disabled', false);
			if (err) { $('#pg-result').html(`<div class="alert alert-danger">${escapeHtml(err.message || err)}</div>`); return; }
			$('#pg-result').html(renderPlaygroundResult(result));
		});
	});

	$('#audit-refresh').on('click', refreshAudit);
	$('#audit-filter-action, #audit-filter-category, #audit-filter-uid').on('change', refreshAudit);
	$('a[href="#tab-audit"]').on('shown.bs.tab', refreshAudit);

	$('#stats-refresh').on('click', refreshStats);
	$('a[href="#tab-stats"]').on('shown.bs.tab', refreshStats);
}
