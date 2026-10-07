---
description: SAIA (Academic Cloud Hessen) models available via this plugin.
---

# SAIA Academic Cloud Models

This plugin registers the SAIA provider with 14 models hosted on the Academic Cloud Hessen infrastructure.

> **Auto-Sync:** Models are automatically fetched from the SAIA API. Run `./scripts/sync-saia-models.sh` to update.

## Available Models

### Reasoning

| Model ID | Name | Ctx | Out | Vision |
|----------|------|-----|-----|--------|
| `saia/deepseek-v4-flash-0731` | DeepSeek V4 Flash | 1M | 32K | — |
| `saia/glm-5.3-flash` | GLM 5.3 Flash | 1M | 32K | 🖼 | text + 🖼 |
| `saia/openai-gpt-oss-120b` | GPT-OSS 120B | 128K | 8K | — |
| `saia/qwen3.5-397b-a17b` | Qwen3.5 397B | 256K | 32K | 🖼 | text + 🖼 |
| `saia/qwen3.6-35b-a3b` | Qwen3.6 35B | 262K | 16K | 🖼 | text + 🖼 |
| `saia/qwen3.8-27b` | Qwen3.8 27B | 262K | 16K | — |

### Agentic

| Model ID | Name | Ctx | Out | Vision |
|----------|------|-----|-----|--------|
| `saia/devstral-2-123b-instruct-2512` | DevStral 2 123B | 256K | 16K | — |
| `saia/mistral-medium-3.5-128b` | Mistral Medium 3.5 128B | 256K | 8K | — |

### Coder

| Model ID | Name | Ctx | Out | Vision |
|----------|------|-----|-----|--------|
| `saia/qwen3-coder-next` | Qwen3 Coder Next | 256K | 16K | — |

### Vision

| Model ID | Name | Ctx | Out | Vision | Modalities |
|----------|------|-----|-----|--------|------------|
| `saia/gemma-4-31b-it` | Gemma 4 31B | 256K | 8K | 🖼 | text + 🖼 |
| `saia/qwen3-omni-30b-a3b-instruct` | Qwen3 Omni 30B | 256K | 16K | 🖼 | text + 🖼 + 🔊 |

### General

| Model ID | Name | Ctx | Out | Vision |
|----------|------|-----|-----|--------|
| `saia/apertus-70b-instruct-2509` | Apertus 70B | 65K | 16K | — |
| `saia/meta-llama-3.1-8b-instruct` | Meta Llama 3.1 8B | 128K | 8K | — |

## Quick Switch

### Model Aliases (Recommended)

```bash
# Best for coding
/model saia/best-for-coding

# Best quality / reasoning
/model saia/best-quality
/model saia/best-for-reasoning

# Best for vision
/model saia/best-for-vision

# Best for agentic tasks
/model saia/best-for-agentic

# Fastest response
/model saia/fastest

# Fastest reasoning
/model saia/fastest-reasoning

# Budget/cost-effective
/model saia/budget
```

### Specific Models

```bash
# Flagship reasoning
/model saia/deepseek-v4-flash-0731

# Code-specialized
/model saia/qwen3-coder-next

# Fast & lightweight
/model saia/deepseek-v4-flash-0731

# Vision (image input)
/model saia/qwen3.6-35b-a3b

# Budget (cheapest)
/model saia/meta-llama-3.1-8b-instruct
```

## Rate Limits

SAIA enforces: **30 requests/min · 200/hour · 1,000/day · 3,000/month**

Check remaining quota at [SAIA dashboard](https://chat-ai.academiccloud.de).

## API Key

The API key is resolved from `auth.json` (`saia` key), `$SAIA_API_KEY` environment variable, or `/login saia`.

Set it via:
```bash
/login saia
```

Or add to `auth.json`:
```json
{
  "saia": { "type": "api_key", "key": "your-key" }
}
```
