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

Models are automatically fetched from the SAIA API. To sync the latest models:

```bash
export SAIA_API_KEY=your_key
./scripts/sync-saia-models.sh
```

See [`scripts/README.md`](scripts/README.md) for details on automation.

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

Only output limits, categories and aliases remain opinionated (they live in
`scripts/sync-saia-models.sh`).

## Features

- **Auto-registration** — `pi.registerProvider()` adds all 14 SAIA models on startup
- **Zero config** — API key from `auth.json`, `$SAIA_API_KEY` env var, or `/login saia`
- **Skill included** — `/skill:saia-models` documents available models and usage
- **OpenAI-compatible** — Uses standard `openai-completions` API
- **Rate limit info** — Displays SAIA quota limits (30/min, 200/hr, 1k/day, 3k/mo)

## Installation

```bash
# From git (recommended)
pi install git:github.com/tobias-weiss-ai-xr/pi-saia-plugin

# Or local
pi install /path/to/pi-saia-plugin
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
| `saia/apertus-70b-instruct-2509` | Apertus 70B | 65K | 16K | — | — | general |
| `saia/deepseek-v4-flash-0731` | DeepSeek V4 Flash | 1M | 32K | ✅ | — | reasoning |
| `saia/devstral-2-123b-instruct-2512` | Devstral 2 123B | 256K | 16K | — | — | agentic |
| `saia/gemma-4-31b-it` | Gemma 4 31B | 256K | 8K | — | 🖼 | vision |
| `saia/glm-5.3-flash` | GLM 5.3 Flash | 1M | 32K | ✅ | 🖼 | agentic |
| `saia/meta-llama-3.1-8b-instruct` | Llama 3.1 8B | 128K | 8K | — | — | general |
| `saia/mistral-medium-3.5-128b` | Mistral Medium 3.5 128B | 256K | 8K | — | — | agentic |
| `saia/openai-gpt-oss-120b` | GPT-OSS 120B | 128K | 8K | ✅ | — | reasoning |
| `saia/qwen3-30b-a3b-instruct-2507` | Qwen3 30B A3B | 256K | 16K | — | — | reasoning |
| `saia/qwen3-coder-next` | Qwen3 Coder Next | 256K | 16K | — | — | coder |
| `saia/qwen3-omni-30b-a3b-instruct` | Qwen3 Omni 30B | 256K | 16K | — | 🖼 | vision |
| `saia/qwen3.5-397b-a17b` | Qwen3.5 397B A17B | 256K | 32K | ✅ | 🖼 | reasoning |
| `saia/qwen3.6-35b-a3b` | Qwen3.6 35B A3B | 262K | 16K | ✅ | 🖼 | reasoning |
| `saia/qwen3.8-27b` | Qwen3.8 27B | 262K | 16K | ✅ | — | reasoning |

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

## Rate Limits

SAIA enforces: **30 requests/min · 200/hour · 1,000/day · 3,000/month**

Check remaining quota at [SAIA dashboard](https://chat-ai.academiccloud.de).

## API Key

The API key is resolved from (in order):

1. `auth.json` — `"saia": { "type": "api_key", "key": "..." }`
2. `$SAIA_API_KEY` environment variable
3. `/login saia` interactive prompt

## Package Structure

```
pi-saia-plugin/
├── package.json          # Pi package manifest
├── extensions/
│   └── index.ts          # Provider registration via registerProvider()
├── skills/
│   └── saia-models.md    # Model documentation skill
└── src/
    └── saia.ts           # Legacy plugin (manual config generation)
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
