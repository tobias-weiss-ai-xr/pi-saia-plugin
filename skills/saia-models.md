---
description: SAIA (Academic Cloud Hessen) models available via this plugin.
---

# SAIA Academic Cloud Models

This plugin registers the SAIA provider with 16 models hosted on the Academic Cloud Hessen infrastructure.

## Available Models

### Reasoning

| Model ID | Name | Ctx | Out | Vision |
|----------|------|-----|-----|--------|
| `saia/qwen3.5-397b-a17b` | Qwen 3.5 397B | 128K | 32K | 🖼 |
| `saia/qwen3.5-122b-a10b` | Qwen 3.5 122B | 128K | 32K | 🖼 |
| `saia/qwen3-30b-a3b-instruct-2507` | Qwen 3 30B | 128K | 16K | — |

### Agentic

| Model ID | Name | Ctx | Out | Vision |
|----------|------|-----|-----|--------|
| `saia/devstral-2-123b-instruct-2512` | DevStral 2 123B | 128K | 16K | — |
| `saia/mistral-medium-3.5-128b` | Mistral Medium 3.5 128B | 128K | 8K | — |
| `saia/qwen3.6-35b-a3b` | Qwen 3.6 35B | 128K | 16K | 🖼 |

### Coder

| Model ID | Name | Ctx | Out |
|----------|------|-----|-----|
| `saia/qwen3-coder-next` | Qwen 3 Coder Next | 128K | 16K |

### Large Context

| Model ID | Name | Ctx | Out |
|----------|------|-----|-----|
| `saia/openai-gpt-oss-120b` | GPT-OSS 120B | 128K | 8K |

### Medical

| Model ID | Name | Ctx | Out | Vision |
|----------|------|-----|-----|--------|
| `saia/medgemma-27b-it` | MedGemma 27B | 32K | 4K | 🖼 |

### Vision

| Model ID | Name | Ctx | Out | Modalities |
|----------|------|-----|-----|------------|
| `saia/qwen3-omni-30b-a3b-instruct` | Qwen 3 Omni 30B | 32K | 4K | text + 🖼 + 🔊 |

### General

| Model ID | Name | Ctx | Out | Vision |
|----------|------|-----|-----|--------|
| `saia/deepseek-v4-flash-0731` | DeepSeek V4 Flash | 128K | 16K | — |
| `saia/qwen3.6-27b` | Qwen 3.6 27B | 128K | 16K | — |
| `saia/glm-4.7` | GLM 4.7 | 128K | 16K | — |
| `saia/gemma-4-31b-it` | Gemma 4 31B | 128K | 8K | 🖼 |
| `saia/apertus-70b-instruct-2509` | Apertus 70B | 128K | 8K | — |
| `saia/meta-llama-3.1-8b-instruct` | Meta Llama 3.1 8B | 128K | 4K | — |

## Quick Switch

```bash
# Best for agentic coding
/model saia/glm-4.7

# Flagship reasoning
/model saia/qwen3.5-397b-a17b

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
