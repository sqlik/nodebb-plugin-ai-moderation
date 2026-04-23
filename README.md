# nodebb-plugin-ai-moderation

Automatic forum moderation for NodeBB, powered by [OpenRouter](https://openrouter.ai/). Uses a two-tier model pipeline (fast triage + smart escalation) with fully configurable thresholds, per-category actions, budget caps, and seamless integration with NodeBB's built-in flag queue.

## Features

- **Model-agnostic via OpenRouter.** Pick any model from OpenRouter's catalog — per-forum, per-category, per-budget. Recommended defaults ship out of the box, nothing is hardcoded.
- **Hybrid pipeline.** Cheap, fast **triage** runs synchronously before publication and can block obvious spam. Uncertain cases (the "grey zone") are enqueued for **async escalation** by a stronger model.
- **Per-category actions.** Each moderation category (spam, toxicity, NSFW, PII, promotion, or custom) maps to an action: `flag` (file to NodeBB flag queue), `hide` (soft-delete), or `delete` (purge).
- **Per-NodeBB-category overrides.** Different rules for different forum categories — thresholds, models, custom rules.
- **Role and reputation exemptions.** Skip moderation for admins, configurable groups, or trusted users above a reputation threshold.
- **Budget-aware.** Daily and monthly USD caps per-forum, plus per-user daily analysis caps. Configurable fail-open or defer when caps hit.
- **Audit log with moderator corrections.** Every decision is stored with model, cost, tokens, verdict. Moderator overrides are recorded for future prompt tuning.
- **Playground.** Test any text against the configured model without touching real posts.
- **Dry-run mode.** Log decisions without enforcement while you calibrate thresholds.
- **Built on NodeBB primitives.** Decisions route into the existing `flags` queue — no parallel moderation UI to learn.

## Requirements

- NodeBB v3.x or v4.x
- Node.js >= 18
- An [OpenRouter](https://openrouter.ai/) API key

## Installation

```bash
cd /path/to/nodebb
npm install nodebb-plugin-ai-moderation
./nodebb activate nodebb-plugin-ai-moderation
./nodebb build
./nodebb restart
```

## Configuration

### 1. Set the OpenRouter API key

The plugin looks for the key in three places, in order. **First non-empty source wins** — nothing is stored in the database.

**Option A — Environment variable (recommended when you control the process):**

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

**Option B — NodeBB `config.json`:**

```json
{
  "ai-moderation": {
    "openrouter_api_key": "sk-or-v1-..."
  }
}
```

**Option C — Plain text file (useful on managed hosts like Cloudron where you cannot set env vars or edit config.json):**

Create a file with the key as its only contents (no quotes, no trailing newline matters):

```bash
echo -n "sk-or-v1-..." > /app/data/openrouter_api_key
chmod 600 /app/data/openrouter_api_key
```

Then in ACP → AI Moderation → Models → "API key file path", enter the absolute path (e.g. `/app/data/openrouter_api_key`) and save.

### 2. Configure via ACP

All other settings live in `/admin/plugins/ai-moderation`. The page is organised into seven tabs:

- **General** — master on/off, dry-run mode, re-analyze edits
- **Models** — API key status, triage and escalation model IDs, confidence thresholds
- **Rules** — categories, custom forum rules, per-category action mapping, per-NodeBB-category overrides
- **Access & Budget** — exempt roles, reputation threshold, USD caps, retention
- **Playground** — test any text through the configured model
- **Audit log** — browse and filter past decisions
- **Stats** — budget usage, queue depth, category/model tallies

### 3. Start in dry-run

Leave **Dry-run mode** enabled until you have calibrated thresholds and reviewed Playground output for typical forum content. In dry-run, the plugin logs what it *would* do without actually blocking or flagging.

## Default configuration

On a fresh install the plugin ships with these defaults. They are tuned for a conservative **"flag first, enforce later"** workflow — nothing is hidden or deleted automatically. Everything problematic lands in NodeBB's flag queue for a human to review.

### Global state

| Setting | Default | Why |
|---|---|---|
| Enable plugin | `false` | Stays dormant after install; you activate when ready |
| Dry-run mode | `true` | Logs decisions without enforcing — run like this for 1–2 weeks to calibrate |
| Re-analyze edited posts | `false` | Each edit costs a second API call; opt in only if you see edit-bypass attempts |

### Models

| Setting | Default | Why |
|---|---|---|
| Triage model | `google/gemini-2.5-flash-lite` | ~$0.08 / $0.30 per 1M tokens, fast, strong multilingual support |
| Escalation model | `anthropic/claude-haiku-4-5` | Stronger reasoning for borderline cases, still cheap |

### Thresholds — the decision curve

The confidence score returned by the model (0.0 clean → 1.0 definitely violates) flows through this ladder:

```
  0.00 ────────── 0.55 ─────────── 0.88 ─ 0.92 ────── 1.00
   │    pass       │    escalate    │ flag │  block    │
                   │  (queue for    │direct│ (reject  │
                   │   deep review  │(no   │  or hide/
                   │   by stronger  │deep  │  delete
                   │   model)       │review)│ per
                                            │ category)
```

| Setting | Default | Why |
|---|---|---|
| `blockThreshold` | `0.92` | Very high bar — block only when the model is nearly certain. A false block is much worse than a false flag |
| `escalationHigh` | `0.88` | Upper bound of the grey zone; above this, confidence is high enough to flag without a second opinion |
| `escalationLow` | `0.55` | Lower bound of the grey zone; below this, don't waste an escalation call |
| `flagThreshold` | `0.55` | Matches `escalationLow`; catches anything that escapes escalation (the narrow 0.88–0.92 band) |

### Category actions

Every category maps to `flag` by default — the plugin files to NodeBB's built-in flag queue; a human moderator makes the final call.

```json
{"spam":"flag","toxicity":"flag","nsfw":"flag","pii":"flag","promotion":"flag"}
```

Once you trust the model, progressively promote actions — typically `spam → hide` first, then `nsfw → hide`. Keep `pii` and `toxicity` on `flag` — those benefit from human judgment.

### Exemptions

| Setting | Default | Why |
|---|---|---|
| Exempt roles | `administrators, Global Moderators` | Minimal safe set |
| Reputation exemption | `0` (off) | Enable once your forum has tenured users — typical value 100–500 |

### Budget

| Setting | Default | Why |
|---|---|---|
| Daily cap | `$5` | ~60k triage analyses/day on the default model. Raise if you hit it |
| Monthly cap | `$100` | Hard ceiling |
| Per-user daily analyses | `20` | Stops a runaway spammer from draining the budget |
| Fallback on cap exhaustion | `queue` | Defer the analysis rather than pass content through unmoderated (fail-safe, not fail-open) |
| Audit retention | `90 days` | Enough for trend analysis without bloating the DB |

### Recommended rollout

1. **Day 0** — install + activate + set API key. Open the Playground, paste 10–15 real posts from your forum (mix of clean + borderline), confirm verdicts make sense. If > 1–2 false positives per 10, refine **Custom rules** first.
2. **Days 1 → 14** — keep **Dry-run** ON. Browse the Audit log daily; treat mis-classifications as calibration signal for either thresholds or custom rules.
3. **Weeks 2 → 4** — turn Dry-run OFF. All actions still `flag`. Let moderators process the flag queue for a few hundred posts.
4. **Month 2+** — upgrade per-category action (`spam → hide`, `nsfw → hide`) once false-positive rate is acceptable. Consider raising `reputationExemptThreshold` so long-standing users bypass moderation.

## Writing your Custom rules

The `Custom rules` field in the Rules tab is where you give the model forum-specific context. This is the single highest-leverage setting in the plugin — a well-written rules paragraph reduces false positives more than any threshold tweak.

A good rules paragraph covers five things:

1. **Topic** — one sentence about what the forum is about
2. **Explicit "do NOT flag" patterns** — things that superficially look like spam/promotion/NSFW/toxicity but are normal for your community
3. **Explicit "DO flag" patterns** — community-specific violations (often more useful than generic definitions)
4. **Language policy** — if multilingual, say so; mention language-error tolerance
5. **Tone norms** — is profanity OK? is blunt critique part of the culture?

### Example 1 — Professional / business niche (MDM admin forum)

```
This is a professional forum for Mobile Device Management (MDM)
administrators. Relevant topics: MDM platforms (Intune, Jamf,
Workspace ONE, Kandji, etc.), device enrollment, security policies,
compliance, BYOD, Apple/Android/Windows device management, MAM,
troubleshooting, vendor comparisons. These are ALL welcome and must
NOT be flagged as spam or promotion, even when they mention specific
products or vendors.

Flag as off-topic: unrelated politics, personal relationship talk,
cryptocurrency pitches, content clearly unrelated to IT device
management.

Flag as promotion ONLY: unsolicited recruiter/vendor pitches from
users with no history of participation, affiliate links, naked
product ads without technical substance.

Polish and English are both first-class languages on this forum —
do not penalize either. Be tolerant of minor language errors from
non-native speakers.
```

### Example 2 — Gaming community (entertainment / fan forum)

```
This is a community forum for players of [GAME_NAME]. Relevant:
gameplay discussion, strategy guides, patch notes, bug reports,
LFG (looking for group), fan art, streaming/content creation about
the game, speedruns, mods and modding, lore theories, trading
(in-game items only), criticism of game design decisions — all
welcome.

Gaming culture tolerance: competitive trash-talk and playful rivalry
between factions/classes/teams are normal and should NOT be flagged
as toxicity unless they include personal attacks, slurs, doxxing,
or threats. Mild profanity and NSFW language in casual discussion
is NOT grounds for flagging unless it targets specific users or
groups.

Flag as off-topic: discussions of other unrelated games (unless in
the designated off-topic category), real-world politics.

Flag as spam/promotion: selling/buying game accounts for real money,
real-money trading (RMT), cheat/hack sales, gold-seller posts,
Twitch-drops spam from accounts with no participation history.
```

### Example 3 — Photography enthusiasts (creative / hobby forum)

```
This is a forum for photography enthusiasts and working
professionals. Relevant: camera/lens gear discussion, technique
(composition, lighting, post-processing), critique of shared photos,
workflow and software (Lightroom, Capture One, RAW tools), printing,
travel photography, commercial practice, rates, legal/rights
questions.

Gear mentions, brand comparisons (Sony vs Canon vs Fuji), and
affiliate-looking links to camera retailers are EXPECTED in a
photography forum. Do NOT flag as promotion unless the poster has
zero engagement history and only posts deals/links.

Critique can be direct and blunt — this is a skill-building
community. Honest technical feedback on framing, exposure, or
processing is NOT toxicity.

NSFW policy: tasteful nude and artistic body studies are allowed
when clearly labeled. Flag explicitly pornographic or exploitative
content. Any image involving minors in states of undress must always
be flagged regardless of context.
```

### Meta-prompt — let AI write your rules for you

If your forum doesn't match any of the patterns above, paste the following into Claude, ChatGPT, Gemini, or any capable chat AI. Replace the `[DESCRIBE YOUR FORUM]` bracket with one or two sentences about your community, then paste the AI's output into the Custom rules field.

```
I'm configuring an AI-based moderation plugin for my NodeBB forum.
I need forum-specific rules that help the classifier avoid false
positives (flagging normal content) and false negatives (missing
problems specific to my community).

My forum is: [DESCRIBE YOUR FORUM — topic, target users, tone,
primary language, any known edge cases]

Please write a "Custom rules" paragraph of 150–300 words that I
can paste directly into the plugin's Rules tab. It must:

1. Open with a single sentence describing the forum's topic so
   the AI knows what's on-topic
2. List categories of content that are RELEVANT and must NOT
   be flagged — even if superficially they look like spam,
   promotion, toxicity, or NSFW
3. List types of content that SHOULD be flagged, including the
   specific signal (e.g. "accounts with zero engagement history
   posting only links")
4. Cover language tolerance if the forum is multilingual
5. Cover tone norms (is profanity OK? is blunt critique part of
   the culture?)

Write it as direct instructions to an automated classifier —
no marketing copy, no hedging, no "please" or "kindly". Output
only the rules paragraph itself, no preamble, no trailing notes.
```

The Playground tab is the cheapest way to validate: after pasting generated rules, try 10–15 real forum posts and see whether verdicts match your intuition. Iterate on the rules until false positives drop below ~1-in-10.

## Recommended models

| Scenario | Triage | Escalation | Notes |
|---|---|---|---|
| **Default (balanced)** | `google/gemini-2.5-flash-lite` | `anthropic/claude-haiku-4-5` | Good multilingual support, low triage cost, strong escalation reasoning |
| **Polish / multilingual** | `google/gemini-2.5-flash-lite` | `anthropic/claude-haiku-4-5` | Both handle Polish nuance well |
| **English-only, low budget** | `google/gemini-2.5-flash-lite` | *(leave same as triage)* | Triage alone sufficient for simple rule-based moderation |
| **High accuracy** | `anthropic/claude-haiku-4-5` | `anthropic/claude-sonnet-4-6` | Expensive but best-in-class reasoning |

See the [OpenRouter model catalog](https://openrouter.ai/models) for the full list. Pricing is pay-as-you-go.

## How it works

```
New post
   │
   ▼
filter:post.create  ──► triage model (sync)
   │                     │
   │                     ├─ confidence ≥ block → REJECT (post never saved)
   │                     ├─ confidence ∈ grey zone → enqueue for async
   │                     └─ confidence ≥ flag → flag / hide / delete (per-category action)
   │
   ▼
action:post.save    ──► enqueue for async deep analysis
   │
   ▼
async worker (setInterval, distributed-lock guarded)
   │
   ▼
escalation model (if in grey zone) → merge verdict → enforce action
```

### Actions

- **`flag`** — files a flag with `reporter = systemReporterUid` and full verdict as the reason. Appears in the NodeBB flag queue for human review.
- **`hide`** — soft-deletes the post (`posts.tools.delete`). Visible to moderators; hidden from other users.
- **`delete`** — purges the post (`posts.tools.purge`). Irreversible.

### Fail-open behaviour

If the OpenRouter API is unreachable, the model returns invalid JSON, or the budget is exceeded with `pass` fallback — posts go through **unmoderated**. This is intentional: availability beats moderation coverage. Check the audit log and Stats tab to spot issues.

## Per-category overrides

JSON stored in the ACP. Override any of these per NodeBB category ID:

- `blockThreshold`, `flagThreshold`, `escalationLow`, `escalationHigh`
- `triageModel`, `escalationModel`
- `categories` (comma-separated)
- `customRules`

Example:

```json
{
  "5": {
    "customRules": "This is the Off-topic category. Off-topic content is expected and should not be flagged.",
    "blockThreshold": 0.97
  },
  "10": {
    "categories": "spam,promotion",
    "triageModel": "google/gemini-2.5-flash-lite"
  }
}
```

## Storage keys

For reference and debugging:

- `plugin:ai-mod:queue` — sorted set of pending async tasks
- `plugin:ai-mod:task:<id>` — task payload
- `plugin:ai-mod:processed` — dedup set of handled PIDs (pruned after 30 days)
- `plugin:ai-mod:worker-lock` — distributed lock for multi-process NodeBB
- `plugin:ai-mod:decision:<id>` — audit record
- `plugin:ai-mod:log` — sorted set of decision IDs (for listing)
- `plugin:ai-mod:correction:<id>` — moderator correction record
- `plugin:ai-mod:usage:day:<YYYY-MM-DD>` — daily cost + count
- `plugin:ai-mod:usage:month:<YYYY-MM>` — monthly cost + count
- `plugin:ai-mod:usage:user:<uid>:<YYYY-MM-DD>` — per-user daily count

## Troubleshooting

**"OpenRouter API key not configured" in Playground**
The key is read at plugin init. After setting the env var or config.json, restart NodeBB (or click Save in ACP, which re-reads the key).

**Playground works but live posts aren't being moderated**
Check: (1) **Enable plugin** is on, (2) **Dry-run** is off, (3) the user is not in an exempt role / above the reputation threshold, (4) the NodeBB category does not have a `cidOverrides` entry that disables moderation effectively.

**High latency on post submission**
The triage model runs synchronously. If it's slow (>3s), consider a faster model. OpenRouter routes regionally; some models are faster from some regions.

**Budget exceeded — nothing is being analyzed**
Check **Stats** tab. If you hit the daily/monthly cap, either raise the cap or switch **Fallback** to `pass` for fail-open behaviour.

## Roadmap (v0.2+)

- Private message (chat) moderation
- Signup registration filter
- Profile field moderation (signature, about-me)
- Trust tiers (multi-threshold exemptions)
- Audit log export to CSV
- Outbound webhooks (Slack, Discord) for moderator notifications
- Model A/B testing in Playground
- Fine-tuning job from moderator corrections

## Support

This plugin is free, MIT-licensed, and maintained in spare time. No ads, no trackers, no "pro tier" paywall. If it solved a real problem for your forum — replaced a paid moderation service, saved your mods hours per week, or stopped a spam wave that was about to drown the place — a coffee is a nice way to say thanks.

[☕ Buy me a coffee](https://buymeacoffee.com/djayt)

Not required, ever. Issues and PRs are always welcome regardless.

## Contributing

Issues and PRs welcome at https://github.com/sqlik/nodebb-plugin-ai-moderation

## License

MIT © Tomasz Sawko
