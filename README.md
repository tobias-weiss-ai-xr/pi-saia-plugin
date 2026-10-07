# pi-saia-plugin

> ⚠️ **Note:** Active development takes place on [GitHub](https://github.com/tobias-weiss-ai-xr/pi-saia-plugin). Any other hosted copies (Codeberg, GitLab, etc.) are **legacy mirrors** — synced periodically but not actively maintained there.

> SAIA (Academic Cloud Hessen) provider for the [pi coding agent](https://pi.dev)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Pi Package](https://img.shields.io/badge/pi-package-blue)](https://pi.dev/packages)

A [pi package](https://pi.dev/docs/packages) that auto-registers all **16+ SAIA Academic Cloud** models as a provider — no manual configuration needed.

**Other Platforms:**
- [opencode-saia-plugin](https://github.com/tobias-weiss-ai-xr/opencode-saia-plugin) — SAIA provider for OpenCode
- [zot-saia-plugin](https://github.com/tobias-weiss-ai-xr/zot-saia-plugin) — SAIA provider for zot CLI
- [pi-l1-cache](https://github.com/tobias-weiss-ai-xr/pi-l1-cache) — Optional L1 caching extension (recommended with this plugin)

## 🔄 Auto-Sync Feature

`extensions/index.ts` is generated from the collected facts (live SAIA API +
the GWDG docs table + curated reasoning params, all merged into
[`data/saia-models.json`](data/saia-models.json)) plus a
curated metadata table (reasoning support, thinking levels, input modalities,
context windows). To refresh it:

```bash
./scripts/sync-saia-models.sh           # regenerate (key from $SAIA_API_KEY or auth.json)
./scripts/sync-saia-models.sh --check   # fail if the catalog is stale (CI gate)
```

See [`scripts/README.md`](scripts/README.md) for details.

### Machine-Readable Model Catalog (`data/saia-models.json`)

Facts are collected automatically — no manual table maintenance:

```bash
node scripts/collect-saia-model-info.mjs   # merges 3 sources → data/saia-models.json
```

1. **Live API** (`/v1/models`) → ids, status, input/output modalities
2. **GWDG docs table** → context windows, release dates, recommended sampling, org
3. [`scripts/reasoning-models.json`](scripts/reasoning-models.json) → reasoning API params per family (curated, with vendor sources; the collector flags any live model without an entry)

The result is a clean, unopinionated catalog — one curl gets you every SAIA model
with context size, modalities and reasoning controls, reusable by any client:

```bash
curl -s https://raw.githubusercontent.com/tobias-weiss-ai-xr/pi-saia-plugin/main/data/saia-models.json
```

Only output limits, categories, thinking-level maps and aliases remain opinionated
(they live in `scripts/sync-saia-models.sh`). `extensions/index.ts` is generated
from the facts by that script, so the shipped provider cannot drift from them:

```bash
./scripts/sync-saia-models.sh --check   # exit 0 current, 1 drift, 3 API unreachable
```

## Features

- **Auto-registration** — `pi.registerProvider()` adds all 14 SAIA models on startup
- **Zero config** — API key from `auth.json`, `$SAIA_API_KEY` env var, or `/login saia`
- **Skill included** — `/skill:saia-models` documents available models and usage
- **OpenAI-compatible** — Uses standard `openai-completions` API
- **Rate limit info** — Displays SAIA quota limits (30/min, 200/hr, 1k/day, 3k/mo)

## Installation

<video src="docs/media/install.webm" poster="docs/media/install-poster.png" width="720" controls></video>

[▶ install walkthrough](docs/media/install.webm) (34s, VP9) — a real session, captured
by [`scripts/make-install-video.py`](scripts/make-install-video.py)

```bash
# From git (recommended)
pi install git:github.com/tobias-weiss-ai-xr/pi-saia-plugin

# Or local
pi install /path/to/pi-saia-plugin

# Or via the bundled script
./install.sh
```

Either way pi records the package in `~/.pi/agent/settings.json` — nothing is
written to the retired `~/.config/pi` layout. Verify the install with:

```bash
pi --list-models | grep '^saia'   # 22 entries: 14 models + 8 aliases
```

Then reload or restart pi:

```bash
/reload
```

## Available Models

14 SAIA models, synced from the live API with context windows from the
[GWDG docs](https://docs.hpc.gwdg.de/services/ai-services/chat-ai/models/index.html):

| Model ID | Name | Ctx | Out | Reasoning | Vision | Category |
|----------|------|-----|-----|-----------|--------|----------|
| `saia/apertus-70b-instruct-2509` | Apertus 70B | 65K | 8K | — | — | general |
| `saia/deepseek-v4-flash-0731` | DeepSeek V4 Flash | 1M | 32K | ✅ | — | reasoning |
| `saia/devstral-2-123b-instruct-2512` | Devstral 2 123B | 256K | 16K | — | — | agentic |
| `saia/gemma-4-31b-it` | Gemma 4 31B | 256K | 8K | — | 🖼 | vision |
| `saia/glm-5.3-flash` | GLM 5.3 Flash | 1M | 32K | ✅ | 🖼 | agentic |
| `saia/meta-llama-3.1-8b-instruct` | Llama 3.1 8B | 128K | 4K | — | — | general |
| `saia/mistral-medium-3.5-128b` | Mistral Medium 3.5 128B | 256K | 8K | — | — | agentic |
| `saia/openai-gpt-oss-120b` | GPT-OSS 120B | 128K | 8K | ✅ | — | reasoning |
| `saia/qwen3-30b-a3b-instruct-2507` | Qwen3 30B A3B | 256K | 16K | — | — | reasoning |
| `saia/qwen3-coder-next` | Qwen3 Coder Next | 256K | 16K | — | — | coder |
| `saia/qwen3-omni-30b-a3b-instruct` | Qwen3 Omni 30B | 256K | 4K | — | 🖼 | vision |
| `saia/qwen3.5-397b-a17b` | Qwen3.5 397B A17B | 256K | 32K | ✅ | 🖼 | reasoning |
| `saia/qwen3.6-35b-a3b` | Qwen3.6 35B A3B | 262K | 16K | ✅ | 🖼 | reasoning |
| `saia/qwen3.8-27b` | Qwen3.8 27B | 262K | 32K | ✅ | — | reasoning |

Default model: `saia/deepseek-v4-flash-0731` — 1M context, reasoning-capable.

## Model Aliases

| Alias | Points To |
|---|---|
| `saia/best-for-coding` | `qwen3-coder-next` |
| `saia/best-for-reasoning` | `qwen3.5-397b-a17b` |
| `saia/best-quality` | `qwen3.5-397b-a17b` |
| `saia/best-for-vision` | `qwen3.8-27b` |
| `saia/best-for-agentic` | `glm-5.3-flash` |
| `saia/fastest` | `meta-llama-3.1-8b-instruct` |
| `saia/fastest-reasoning` | `qwen3.8-27b` |
| `saia/budget` | `deepseek-v4-flash-0731` |

Usage: `/model saia/best-for-coding` — aliases always point at live models.

## Usage

```bash
# List available models
pi --list-models | grep ^saia

# Switch to a model
/model saia/deepseek-v4-flash-0731

# Use aliases for quick switching
/model saia/best-quality
/model saia/best-for-coding
/model saia/fastest

# With thinking level (reasoning models only)
/model saia/qwen3.5-397b-a17b:high
/model saia/qwen3.5-397b-a17b:medium

# Load the skill for documentation
/skill:saia-models
```

## Thinking levels

SAIA validates `reasoning_effort` and answers **HTTP 400** for values a model
does not accept. Each reasoning model ships a `thinkingLevelMap` so every pi
thinking level is folded into a supported value — `--thinking max` on
`qwen3.8-27b` becomes `xhigh` instead of failing.

## Rate Limits

SAIA enforces: **30 requests/min · 200/hour · 1,000/day · 3,000/month**

Check remaining quota from any response's `x-ratelimit-remaining-*` headers, or
the [SAIA dashboard](https://chat-ai.academiccloud.de).

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `401 Unauthorized` | `auth.json` beats a stale env var — rotate with `pi auth`, or inspect `pi auth print-api-key --provider saia` |
| Empty output, no error | `429` — pi prints nothing on rate limits. Check `x-ratelimit-remaining-hour` |
| A request hangs for minutes | SAIA cold start/capacity; `retry.provider.timeoutMs` defaults to 5 min. See [`skills/saia-models.md`](skills/saia-models.md#reliability) for the recommended `retry` settings |
| `400 "Unexpected message role."` | Gateway rejecting the `developer` role — the catalog sets `compat.supportsDeveloperRole: false` |
| `400 "Unexpected reasoning effort ..."` | The `thinkingLevelMap` folds pi's levels into values the model accepts |
| `404 Model Not Found` | Either a stale catalog (`./scripts/sync-saia-models.sh`, then `/reload`) **or** an id that does not exist. pi does not validate `--model` against the registry, so an id the API no longer serves is forwarded verbatim and SAIA answers `404`. List the real ids with `pi --list-models \| grep '^saia'`. Text mode prints nothing on a provider error — add `--mode json` to see it |

## API Key

The API key is resolved from:

1. `$SAIA_API_KEY` environment variable
2. `auth.json` — `"saia": { "type": "api_key", "key": "..." }` (written by `pi auth`)

Inspect what pi will send:

```bash
pi auth print-api-key --provider saia
```

> Note: rotating the key in your shell is not enough if `auth.json` still holds
the old one — `auth.json` wins when the env var is absent, and a stale
`auth.json` entry is the usual cause of a `401`.

## Base URL override

`SAIA_BASE_URL` points the provider somewhere other than
`https://chat-ai.academiccloud.de/v1` — useful behind an institutional gateway
(LiteLLM, Kong, an SSH tunnel):

```bash
export SAIA_BASE_URL=https://my-gateway.example.org/v1
```

Trailing slashes are trimmed. The same variable is what makes the hermetic
wire-protocol tests possible: they point the provider at a local mock so
aliases, the `developer` role and `reasoning_effort` can be asserted without
network access or credentials (`npm run test:wire`).

## Package Structure

```
pi-saia-plugin/
├── package.json          # Pi package manifest (pi.extensions / pi.skills)
├── extensions/
│   ├── index.ts          # Provider registration + alias rewrite hook
│   └── index.ts          # AUTO-GENERATED provider (models + alias rewrite hook)
├── scripts/
│   └── sync-saia-models.sh      # Regenerate/verify the provider from the facts
│   └── collect-saia-model-info.mjs  # Collect facts into data/saia-models.json
├── skills/
│   └── saia-models.md    # Model documentation skill (name: saia-models)
├── test/
│   ├── unit/             # catalog, legacy helpers, memory, doc-drift
│   ├── integration/      # hermetic wire-protocol tests (mock server, no key)
│   └── mock-saia-server.mjs
└── src/                  # LEGACY OpenCode-format plugin — not loaded by pi
```

## Caching

For optional caching support, install the [`pi-l1-cache`](https://github.com/tobias-weiss-ai-xr/pi-l1-cache) plugin:

```bash
pi install git:github.com/tobias-weiss-ai-xr/pi-l1-cache@main
```

Features:
- ~0.1ms L1 in-memory cache for model responses
- 50MB RAM limit with automatic LRU eviction
- CPU-aware auto-disable when system load > 80%
- Manual management: `/l1-cache`, `/l1-cache stats`, `/l1-cache clear`



Test locally:

```bash
pi install /path/to/pi-saia-plugin
pi --list-models | grep ^saia
```

## License

MIT
