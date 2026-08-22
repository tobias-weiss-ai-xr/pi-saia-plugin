# pi-saia-plugin

> ⚠️ **Note:** Active development takes place on [GitHub](https://github.com/tobias-weiss-ai-xr/pi-saia-plugin). Any other hosted copies (Codeberg, GitLab, etc.) are **legacy mirrors** — synced periodically but not actively maintained there.

> SAIA (Academic Cloud Hessen) provider for the [pi coding agent](https://pi.dev)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Pi Package](https://img.shields.io/badge/pi-package-blue)](https://pi.dev/packages)

A [pi package](https://pi.dev/docs/packages) that auto-registers all **16+ SAIA Academic Cloud** models as a provider — no manual configuration needed.

## 🔄 Auto-Sync Feature

Models are automatically fetched from the SAIA API. To sync the latest models:

```bash
export SAIA_API_KEY=your_key
./scripts/sync-saia-models.sh
```

See [`scripts/README.md`](scripts/README.md) for details on automation and force-include options.

## Features

- **Auto-registration** — `pi.registerProvider()` adds all 16 SAIA models on startup
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

### 🆕 Latest: Qwen3.8 (August 2026)

| Model ID | Name | Ctx | Out | Reasoning | Vision | Category |
|----------|------|-----|-----|-----------|--------|----------|
| `saia/qwen3.8-2.4t-a95b` | Qwen 3.8 2.4T A95B | 256K | 64K | ✅ | — | reasoning |
| `saia/qwen3.8-27b` | Qwen 3.8 27B | 128K | 32K | — | 🖼 | general |

### Reasoning Models

| Model ID | Name | Ctx | Out | Reasoning | Vision | Category |
|----------|------|-----|-----|-----------|--------|----------|
| `saia/qwen3.5-397b-a17b` | Qwen 3.5 397B | 128K | 32K | ✅ | 🖼 | reasoning |
| `saia/qwen3.5-122b-a10b` | Qwen 3.5 122B | 128K | 32K | ✅ | 🖼 | reasoning |
| `saia/qwen3-30b-a3b-instruct-2507` | Qwen 3 30B | 128K | 16K | ✅ | — | reasoning |

### Agentic Models

| Model ID | Name | Ctx | Out | Reasoning | Vision | Category |
|----------|------|-----|-----|-----------|--------|----------|
| `saia/devstral-2-123b-instruct-2512` | DevStral 2 123B | 128K | 16K | — | — | agentic |
| `saia/mistral-medium-3.5-128b` | Mistral Medium 3.5 128B | 128K | 8K | — | — | agentic |
| `saia/qwen3.6-35b-a3b` | Qwen 3.6 35B | 128K | 16K | — | 🖼 | agentic |

### Coder

| Model ID | Name | Ctx | Out | Reasoning | Vision | Category |
|----------|------|-----|-----|-----------|--------|----------|
| `saia/qwen3-coder-next` | Qwen 3 Coder Next | 128K | 16K | — | — | coder |

### Large Context

| Model ID | Name | Ctx | Out | Reasoning | Vision | Category |
|----------|------|-----|-----|-----------|--------|----------|
| `saia/openai-gpt-oss-120b` | GPT-OSS 120B | 128K | 8K | — | — | large-context |

### Medical

| Model ID | Name | Ctx | Out | Reasoning | Vision | Category |
|----------|------|-----|-----|-----------|--------|----------|
| `saia/medgemma-27b-it` | MedGemma 27B | 32K | 4K | — | 🖼 | medical |

### Vision

| Model ID | Name | Ctx | Out | Reasoning | Vision | Modalities |
|----------|------|-----|-----|-----------|--------|------------|
| `saia/qwen3-omni-30b-a3b-instruct` | Qwen 3 Omni 30B | 32K | 4K | — | 🖼 | text+🖼+🔊 |

### General

| Model ID | Name | Ctx | Out | Reasoning | Vision | Category |
|----------|------|-----|-----|-----------|--------|----------|
| `saia/deepseek-v4-flash-0731` | DeepSeek V4 Flash | 128K | 16K | — | — | general |
| `saia/qwen3.6-27b` | Qwen 3.6 27B | 128K | 16K | — | — | general |
| `saia/glm-4.7` | GLM 4.7 | 128K | 16K | — | — | general |
| `saia/gemma-4-31b-it` | Gemma 4 31B | 128K | 8K | — | 🖼 | general |
| `saia/apertus-70b-instruct-2509` | Apertus 70B | 128K | 8K | — | — | general |
| `saia/meta-llama-3.1-8b-instruct` | Llama 3.1 8B | 128K | 4K | — | — | general |

## Model Aliases

Quick shortcuts for common use cases:

| Alias | Resolves To | Use Case |
|-------|-------------|----------|
| `saia/best-for-coding` | qwen3-coder-next | Code generation and refactoring |
| `saia/best-for-reasoning` | qwen3.8-2.4t-a95b | Complex reasoning tasks |
| `saia/best-quality` | qwen3.8-2.4t-a95b | Highest quality responses |
| `saia/best-for-vision` | qwen3.8-27b | Image understanding |
| `saia/best-for-agentic` | glm-4.7 | Tool use and agentic tasks |
| `saia/fastest` | meta-llama-3.1-8b-instruct | Quick responses |
| `saia/fastest-reasoning` | qwen3.8-27b | Fast reasoning with vision |
| `saia/budget` | deepseek-v4-flash-0731 | Cost-effective tasks |

## Usage

```bash
# List available models
pi --list-models | grep ^saia

# Switch to a model
/model saia/glm-4.7

# Use aliases for quick switching
/model saia/best-quality
/model saia/best-for-coding
/model saia/fastest

# With thinking level (reasoning models only)
/model saia/qwen3.5-397b-a17b:high
/model saia/qwen3.8-2.4t-a95b:medium

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
