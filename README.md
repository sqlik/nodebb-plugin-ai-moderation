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

Set it via **environment variable** or **config.json** — never in the database.

**Environment variable (recommended):**

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

**Or in `config.json`:**

```json
{
  "ai-moderation": {
    "openrouter_api_key": "sk-or-v1-..."
  }
}
```

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

## Contributing

Issues and PRs welcome at https://github.com/sqlik/nodebb-plugin-ai-moderation

## License

MIT © Tomasz Sawko
