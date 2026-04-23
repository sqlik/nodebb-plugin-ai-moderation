<div class="acp-page-container">
	<div class="row">
		<div class="col-lg-9">
			<div class="acp-page-main-header align-items-center">
				<div>
					<h2 class="mb-0">[[ai-moderation:title]]</h2>
					<small class="text-muted">[[ai-moderation:subtitle]]</small>
				</div>
			</div>

			<ul class="nav nav-tabs mb-3" role="tablist">
				<li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-general">[[ai-moderation:tab.general]]</a></li>
				<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-models">[[ai-moderation:tab.models]]</a></li>
				<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-rules">[[ai-moderation:tab.rules]]</a></li>
				<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-access">[[ai-moderation:tab.access]]</a></li>
				<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-playground">[[ai-moderation:tab.playground]]</a></li>
				<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-audit">[[ai-moderation:tab.audit]]</a></li>
				<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-stats">[[ai-moderation:tab.stats]]</a></li>
			</ul>

			<form role="form" class="ai-moderation-settings">
				<div class="tab-content">

					<div class="tab-pane fade show active" id="tab-general">
						<div class="card mb-3">
							<div class="card-header">[[ai-moderation:section.general]]</div>
							<div class="card-body">
								<div class="alert alert-info">[[ai-moderation:general.notice]]</div>
								<div class="mb-3 form-check form-switch">
									<input type="checkbox" class="form-check-input" id="enabled" name="enabled" />
									<label class="form-check-label" for="enabled">[[ai-moderation:field.enabled]]</label>
									<small class="form-text text-muted d-block">[[ai-moderation:field.enabled.help]]</small>
								</div>
								<div class="mb-3 form-check form-switch">
									<input type="checkbox" class="form-check-input" id="dryRun" name="dryRun" />
									<label class="form-check-label" for="dryRun">[[ai-moderation:field.dryRun]]</label>
									<small class="form-text text-muted d-block">[[ai-moderation:field.dryRun.help]]</small>
								</div>
								<div class="mb-3 form-check form-switch">
									<input type="checkbox" class="form-check-input" id="reanalyzeEdits" name="reanalyzeEdits" />
									<label class="form-check-label" for="reanalyzeEdits">[[ai-moderation:field.reanalyzeEdits]]</label>
									<small class="form-text text-muted d-block">[[ai-moderation:field.reanalyzeEdits.help]]</small>
								</div>
							</div>
						</div>
					</div>

					<div class="tab-pane fade" id="tab-models">
						<div class="card mb-3">
							<div class="card-header">[[ai-moderation:section.apikey]]</div>
							<div class="card-body">
								{{{ if apiKeyConfigured }}}
								<div class="alert alert-success mb-2">[[ai-moderation:apikey.detected, {apiKeySource}]]</div>
								{{{ else }}}
								<div class="alert alert-warning mb-2">[[ai-moderation:apikey.missing]]</div>
								{{{ end }}}

								<p class="small text-muted mb-2">[[ai-moderation:apikey.sources]]</p>
								<ol class="small text-muted mb-3">
									<li><code>OPENROUTER_API_KEY</code> [[ai-moderation:apikey.source.env]]</li>
									<li><code>ai-moderation.openrouter_api_key</code> [[ai-moderation:apikey.source.config]]</li>
									<li>[[ai-moderation:apikey.source.file]]</li>
								</ol>

								<div class="mb-0">
									<label class="form-label" for="apiKeyFile">[[ai-moderation:field.apiKeyFile]]</label>
									<input type="text" class="form-control" id="apiKeyFile" name="apiKeyFile" placeholder="/app/data/openrouter_api_key" />
									<small class="form-text text-muted">[[ai-moderation:field.apiKeyFile.help]]</small>
								</div>
							</div>
						</div>

						<div class="card mb-3">
							<div class="card-header d-flex justify-content-between align-items-center">
								<span>[[ai-moderation:section.models]]</span>
								<button type="button" id="models-refresh" class="btn btn-sm btn-outline-secondary">[[ai-moderation:models.refresh]]</button>
							</div>
							<div class="card-body">
								<div class="alert alert-info">[[ai-moderation:models.notice]]</div>
								<datalist id="ai-mod-models-list"></datalist>
								<div class="mb-3">
									<label class="form-label" for="triageModel">[[ai-moderation:field.triageModel]]</label>
									<div class="input-group">
										<input type="text" class="form-control" id="triageModel" name="triageModel" list="ai-mod-models-list" autocomplete="off" />
										<button type="button" class="btn btn-outline-secondary" data-ping="triage">[[ai-moderation:models.ping]]</button>
									</div>
									<small class="form-text text-muted">[[ai-moderation:field.triageModel.help]] <span class="model-meta" data-for="triage"></span></small>
								</div>
								<div class="mb-3">
									<label class="form-label" for="escalationModel">[[ai-moderation:field.escalationModel]]</label>
									<div class="input-group">
										<input type="text" class="form-control" id="escalationModel" name="escalationModel" list="ai-mod-models-list" autocomplete="off" />
										<button type="button" class="btn btn-outline-secondary" data-ping="escalation">[[ai-moderation:models.ping]]</button>
									</div>
									<small class="form-text text-muted">[[ai-moderation:field.escalationModel.help]] <span class="model-meta" data-for="escalation"></span></small>
								</div>
								<div id="models-status" class="small text-muted"></div>
								<div id="ping-result" class="mt-2"></div>
							</div>
						</div>

						<div class="card mb-3">
							<div class="card-header">[[ai-moderation:section.thresholds]]</div>
							<div class="card-body">
								<div class="row">
									<div class="col-md-6 mb-3">
										<label class="form-label" for="blockThreshold">[[ai-moderation:field.blockThreshold]]</label>
										<input type="number" step="0.05" min="0" max="1" class="form-control" id="blockThreshold" name="blockThreshold" />
										<small class="form-text text-muted">[[ai-moderation:field.blockThreshold.help]]</small>
									</div>
									<div class="col-md-6 mb-3">
										<label class="form-label" for="flagThreshold">[[ai-moderation:field.flagThreshold]]</label>
										<input type="number" step="0.05" min="0" max="1" class="form-control" id="flagThreshold" name="flagThreshold" />
										<small class="form-text text-muted">[[ai-moderation:field.flagThreshold.help]]</small>
									</div>
									<div class="col-md-6 mb-3">
										<label class="form-label" for="escalationLow">[[ai-moderation:field.escalationLow]]</label>
										<input type="number" step="0.05" min="0" max="1" class="form-control" id="escalationLow" name="escalationLow" />
									</div>
									<div class="col-md-6 mb-3">
										<label class="form-label" for="escalationHigh">[[ai-moderation:field.escalationHigh]]</label>
										<input type="number" step="0.05" min="0" max="1" class="form-control" id="escalationHigh" name="escalationHigh" />
									</div>
								</div>
								<small class="form-text text-muted">[[ai-moderation:thresholds.help]]</small>
							</div>
						</div>
					</div>

					<div class="tab-pane fade" id="tab-rules">
						<div class="card mb-3">
							<div class="card-header">[[ai-moderation:section.categories]]</div>
							<div class="card-body">
								<div class="mb-3">
									<label class="form-label" for="categories">[[ai-moderation:field.categories]]</label>
									<input type="text" class="form-control" id="categories" name="categories" />
									<small class="form-text text-muted">[[ai-moderation:field.categories.help]]</small>
								</div>
								<div class="mb-3">
									<label class="form-label" for="customRules">[[ai-moderation:field.customRules]]</label>
									<textarea class="form-control" id="customRules" name="customRules" rows="6" placeholder="e.g. This forum is about Mobile Device Management..."></textarea>
									<small class="form-text text-muted">[[ai-moderation:field.customRules.help]]</small>

									<details class="mt-3 small">
										<summary class="text-primary" style="cursor:pointer">[[ai-moderation:customRules.examples]]</summary>
										<div class="mt-2">
											<p class="mb-1"><strong>Example 1 — Professional / business niche (MDM admin forum)</strong></p>
											<pre class="bg-light p-2 small mb-3" style="white-space:pre-wrap">This is a professional forum for Mobile Device Management (MDM) administrators. Relevant topics: MDM platforms (Intune, Jamf, Workspace ONE, Kandji, etc.), device enrollment, security policies, compliance, BYOD, Apple/Android/Windows device management, MAM, troubleshooting, vendor comparisons. These are ALL welcome and must NOT be flagged as spam or promotion, even when they mention specific products or vendors.

Flag as off-topic: unrelated politics, personal relationship talk, cryptocurrency pitches, content clearly unrelated to IT device management.

Flag as promotion ONLY: unsolicited recruiter/vendor pitches from users with no history of participation, affiliate links, naked product ads without technical substance.

Polish and English are both first-class languages on this forum — do not penalize either. Be tolerant of minor language errors from non-native speakers.</pre>

											<p class="mb-1"><strong>Example 2 — Gaming community (entertainment / fan forum)</strong></p>
											<pre class="bg-light p-2 small mb-3" style="white-space:pre-wrap">This is a community forum for players of [GAME_NAME]. Relevant: gameplay discussion, strategy guides, patch notes, bug reports, LFG (looking for group), fan art, streaming/content creation about the game, speedruns, mods and modding, lore theories, trading (in-game items only), criticism of game design decisions — all welcome.

Gaming culture tolerance: competitive trash-talk and playful rivalry between factions/classes/teams are normal and should NOT be flagged as toxicity unless they include personal attacks, slurs, doxxing, or threats. Mild profanity and NSFW language in casual discussion is NOT grounds for flagging unless it targets specific users or groups.

Flag as off-topic: discussions of other unrelated games (unless in the designated off-topic category), real-world politics.

Flag as spam/promotion: selling/buying game accounts for real money, real-money trading (RMT), cheat/hack sales, gold-seller posts, Twitch-drops spam from accounts with no participation history.</pre>

											<p class="mb-1"><strong>Example 3 — Photography enthusiasts (creative / hobby forum)</strong></p>
											<pre class="bg-light p-2 small mb-3" style="white-space:pre-wrap">This is a forum for photography enthusiasts and working professionals. Relevant: camera/lens gear discussion, technique (composition, lighting, post-processing), critique of shared photos, workflow and software (Lightroom, Capture One, RAW tools), printing, travel photography, commercial practice, rates, legal/rights questions.

Gear mentions, brand comparisons (Sony vs Canon vs Fuji), and affiliate-looking links to camera retailers are EXPECTED in a photography forum. Do NOT flag as promotion unless the poster has zero engagement history and only posts deals/links.

Critique can be direct and blunt — this is a skill-building community. Honest technical feedback on framing, exposure, or processing is NOT toxicity.

NSFW policy: tasteful nude and artistic body studies are allowed when clearly labeled. Flag explicitly pornographic or exploitative content. Any image involving minors in states of undress must always be flagged regardless of context.</pre>

											<p class="mb-1"><strong>[[ai-moderation:customRules.metaPromptLabel]]</strong></p>
											<p class="text-muted small mb-1">[[ai-moderation:customRules.metaPromptHint]]</p>
											<pre class="bg-light p-2 small mb-0" style="white-space:pre-wrap">I'm configuring an AI-based moderation plugin for my NodeBB forum. I need forum-specific rules that help the classifier avoid false positives (flagging normal content) and false negatives (missing problems specific to my community).

My forum is: [DESCRIBE YOUR FORUM — topic, target users, tone, primary language, any known edge cases]

Please write a "Custom rules" paragraph of 150–300 words that I can paste directly into the plugin's Rules tab. It must:

1. Open with a single sentence describing the forum's topic so the AI knows what's on-topic
2. List categories of content that are RELEVANT and must NOT be flagged — even if superficially they look like spam, promotion, toxicity, or NSFW
3. List types of content that SHOULD be flagged, including the specific signal (e.g. "accounts with zero engagement history posting only links")
4. Cover language tolerance if the forum is multilingual
5. Cover tone norms (is profanity OK? is blunt critique part of the culture?)

Write it as direct instructions to an automated classifier — no marketing copy, no hedging, no "please" or "kindly". Output only the rules paragraph itself, no preamble, no trailing notes.</pre>
										</div>
									</details>
								</div>
							</div>
						</div>

						<div class="card mb-3">
							<div class="card-header">[[ai-moderation:section.categoryActions]]</div>
							<div class="card-body">
								<div class="alert alert-info">[[ai-moderation:categoryActions.notice]]</div>
								<div class="mb-3">
									<label class="form-label" for="categoryActions">[[ai-moderation:field.categoryActions]]</label>
									<textarea class="form-control font-monospace" id="categoryActions" name="categoryActions" rows="5"></textarea>
									<small class="form-text text-muted">[[ai-moderation:field.categoryActions.help]]</small>
								</div>
								<div class="mb-3">
									<label class="form-label" for="systemReporterUid">[[ai-moderation:field.systemReporterUid]]</label>
									<input type="number" min="0" class="form-control" id="systemReporterUid" name="systemReporterUid" />
									<small class="form-text text-muted">[[ai-moderation:field.systemReporterUid.help]]</small>
								</div>
							</div>
						</div>

						<div class="card mb-3">
							<div class="card-header">[[ai-moderation:section.cidOverrides]]</div>
							<div class="card-body">
								<div class="alert alert-info">[[ai-moderation:cidOverrides.notice]]</div>
								<div class="mb-3">
									<label class="form-label" for="cidOverrides">[[ai-moderation:field.cidOverrides]]</label>
									<textarea class="form-control font-monospace" id="cidOverrides" name="cidOverrides" rows="8"></textarea>
									<small class="form-text text-muted">[[ai-moderation:field.cidOverrides.help]]</small>
								</div>
							</div>
						</div>
					</div>

					<div class="tab-pane fade" id="tab-access">
						<div class="card mb-3">
							<div class="card-header">[[ai-moderation:section.exemptions]]</div>
							<div class="card-body">
								<div class="mb-3">
									<label class="form-label" for="exemptRoles">[[ai-moderation:field.exemptRoles]]</label>
									<input type="text" class="form-control" id="exemptRoles" name="exemptRoles" />
									<small class="form-text text-muted">[[ai-moderation:field.exemptRoles.help]]</small>
								</div>
								<div class="mb-3">
									<label class="form-label" for="reputationExemptThreshold">[[ai-moderation:field.reputationExemptThreshold]]</label>
									<input type="number" min="0" class="form-control" id="reputationExemptThreshold" name="reputationExemptThreshold" />
									<small class="form-text text-muted">[[ai-moderation:field.reputationExemptThreshold.help]]</small>
								</div>
							</div>
						</div>

						<div class="card mb-3">
							<div class="card-header">[[ai-moderation:section.budget]]</div>
							<div class="card-body">
								<div class="row">
									<div class="col-md-4 mb-3">
										<label class="form-label" for="budgetDailyUsd">[[ai-moderation:field.budgetDailyUsd]]</label>
										<input type="number" step="0.01" min="0" class="form-control" id="budgetDailyUsd" name="budgetDailyUsd" />
									</div>
									<div class="col-md-4 mb-3">
										<label class="form-label" for="budgetMonthlyUsd">[[ai-moderation:field.budgetMonthlyUsd]]</label>
										<input type="number" step="0.01" min="0" class="form-control" id="budgetMonthlyUsd" name="budgetMonthlyUsd" />
									</div>
									<div class="col-md-4 mb-3">
										<label class="form-label" for="budgetPerUserDaily">[[ai-moderation:field.budgetPerUserDaily]]</label>
										<input type="number" min="0" class="form-control" id="budgetPerUserDaily" name="budgetPerUserDaily" />
									</div>
								</div>
								<div class="mb-3">
									<label class="form-label" for="budgetFallback">[[ai-moderation:field.budgetFallback]]</label>
									<select class="form-select" id="budgetFallback" name="budgetFallback">
										<option value="queue">[[ai-moderation:field.budgetFallback.queue]]</option>
										<option value="pass">[[ai-moderation:field.budgetFallback.pass]]</option>
									</select>
									<small class="form-text text-muted">[[ai-moderation:field.budgetFallback.help]]</small>
								</div>
								<div class="mb-3">
									<label class="form-label" for="auditRetentionDays">[[ai-moderation:field.auditRetentionDays]]</label>
									<input type="number" min="1" class="form-control" id="auditRetentionDays" name="auditRetentionDays" />
									<small class="form-text text-muted">[[ai-moderation:field.auditRetentionDays.help]]</small>
								</div>
							</div>
						</div>
					</div>

					<div class="tab-pane fade" id="tab-playground">
						<div class="card mb-3">
							<div class="card-header">[[ai-moderation:section.playground]]</div>
							<div class="card-body">
								<div class="alert alert-info">[[ai-moderation:playground.notice]]</div>
								<div class="row">
									<div class="col-md-8 mb-3">
										<label class="form-label" for="pg-content">[[ai-moderation:playground.content]]</label>
										<textarea class="form-control" id="pg-content" rows="8" placeholder="Paste post content here..."></textarea>
									</div>
									<div class="col-md-4">
										<div class="mb-3">
											<label class="form-label" for="pg-title">[[ai-moderation:playground.title]]</label>
											<input type="text" class="form-control" id="pg-title" placeholder="(optional)" />
										</div>
										<div class="mb-3">
											<label class="form-label" for="pg-model">[[ai-moderation:playground.model]]</label>
											<select class="form-select" id="pg-model">
												<option value="triage">[[ai-moderation:playground.model.triage]]</option>
												<option value="escalation">[[ai-moderation:playground.model.escalation]]</option>
											</select>
										</div>
										<div class="mb-3">
											<label class="form-label" for="pg-language">[[ai-moderation:playground.language]]</label>
											<input type="text" class="form-control" id="pg-language" placeholder="Polish, English, ..." />
										</div>
										<button type="button" id="pg-run" class="btn btn-primary w-100">[[ai-moderation:playground.run]]</button>
									</div>
								</div>
								<hr />
								<div id="pg-result"></div>
							</div>
						</div>
					</div>

					<div class="tab-pane fade" id="tab-audit">
						<div class="card mb-3">
							<div class="card-header d-flex justify-content-between align-items-center">
								<span>[[ai-moderation:section.audit]]</span>
								<button type="button" id="audit-refresh" class="btn btn-sm btn-outline-secondary">[[ai-moderation:audit.refresh]]</button>
							</div>
							<div class="card-body">
								<div class="row mb-3">
									<div class="col-md-4">
										<label class="form-label small">[[ai-moderation:audit.filter.action]]</label>
										<select class="form-select form-select-sm" id="audit-filter-action">
											<option value="">[[ai-moderation:audit.filter.any]]</option>
											<option value="pass">pass</option>
											<option value="flag">flag</option>
											<option value="block">block</option>
										</select>
									</div>
									<div class="col-md-4">
										<label class="form-label small">[[ai-moderation:audit.filter.category]]</label>
										<input class="form-control form-control-sm" id="audit-filter-category" placeholder="spam, toxicity, ..." />
									</div>
									<div class="col-md-4">
										<label class="form-label small">[[ai-moderation:audit.filter.uid]]</label>
										<input class="form-control form-control-sm" id="audit-filter-uid" />
									</div>
								</div>
								<div id="audit-result"><div class="text-muted small">[[ai-moderation:audit.loading]]</div></div>
							</div>
						</div>
					</div>

					<div class="tab-pane fade" id="tab-stats">
						<div class="card mb-3">
							<div class="card-header d-flex justify-content-between align-items-center">
								<span>[[ai-moderation:section.stats]]</span>
								<button type="button" id="stats-refresh" class="btn btn-sm btn-outline-secondary">[[ai-moderation:stats.refresh]]</button>
							</div>
							<div class="card-body">
								<div id="stats-result"><div class="text-muted small">[[ai-moderation:stats.loading]]</div></div>
							</div>
						</div>
					</div>

				</div>
			</form>
		</div>

		<div class="col-lg-3 acp-sidebar">
			<div class="card">
				<div class="card-body">
					<button id="save" class="btn btn-primary w-100 mb-3">[[ai-moderation:save]]</button>
					<p class="small text-muted mb-2">[[ai-moderation:status.label]]</p>
					<p class="small mb-1">
						{{{ if enabled }}}<span class="badge bg-success">[[ai-moderation:status.enabled]]</span>
						{{{ else }}}<span class="badge bg-secondary">[[ai-moderation:status.disabled]]</span>{{{ end }}}
					</p>
					<p class="small mb-1">
						{{{ if dryRun }}}<span class="badge bg-info">[[ai-moderation:status.dryrun]]</span>
						{{{ else }}}<span class="badge bg-warning">[[ai-moderation:status.enforce]]</span>{{{ end }}}
					</p>
					<p class="small mb-1">
						{{{ if apiKeyConfigured }}}<span class="badge bg-success">[[ai-moderation:status.apikey-ok]]</span>
						{{{ else }}}<span class="badge bg-danger">[[ai-moderation:status.apikey-missing]]</span>{{{ end }}}
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
