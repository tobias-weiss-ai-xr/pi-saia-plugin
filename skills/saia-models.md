---
name: saia-models
description: SAIA (Academic Cloud Hessen) models available via the pi-saia-plugin provider — pick the right saia/<model>, understand context limits, thinking levels and rate limits.
---

# SAIA Academic Cloud Models

This plugin registers the `saia` provider with the 14 models the SAIA API
actually serves, plus 8 convenience aliases. The tables below are generated from
[`data/saia-models.json`](../data/saia-models.json) — the collected facts — so
they cannot drift from what the provider ships.

## Models

**Reasoning**

| Model ID | Name | Ctx | Out | Vision | Thinking levels |
|----------|------|-----|-----|--------|-----------------|
| `saia/qwen3.5-397b-a17b` | Qwen3.5 397B | 256K | 32K | 🖼 | on/off |
| `saia/qwen3.6-35b-a3b` | Qwen3.6 35B | 262K | 16K | 🖼 | on/off |
| `saia/qwen3.8-27b` | Qwen3.8 27B | 262K | 32K | — | on/off |

**Coder**

| Model ID | Name | Ctx | Out | Vision | Thinking levels |
|----------|------|-----|-----|--------|-----------------|
| `saia/qwen3-coder-next` | Qwen3 Coder Next | 256K | 16K | — | — |

**Vision**

| Model ID | Name | Ctx | Out | Vision | Thinking levels |
|----------|------|-----|-----|--------|-----------------|
| `saia/qwen3-omni-30b-a3b-instruct` | Qwen3 Omni 30B | 256K | 4K | 🖼🔊 | — |

**Agentic**

| Model ID | Name | Ctx | Out | Vision | Thinking levels |
|----------|------|-----|-----|--------|-----------------|
| `saia/devstral-2-123b-instruct-2512` | DevStral 2 123B | 256K | 16K | — | — |
| `saia/glm-5.3-flash` | GLM 5.3 Flash | 1M | 32K | 🖼 | low, high, max |
| `saia/mistral-medium-3.5-128b` | Mistral Medium 3.5 128B | 256K | 8K | — | — |

**General**

| Model ID | Name | Ctx | Out | Vision | Thinking levels |
|----------|------|-----|-----|--------|-----------------|
| `saia/apertus-70b-instruct-2509` | Apertus 70B | 65K | 8K | — | — |
| `saia/deepseek-v4-flash-0731` | DeepSeek V4 Flash | 1M | 32K | — | low, high, max |
| `saia/gemma-4-31b-it` | Gemma 4 31B | 256K | 8K | 🖼 | — |
| `saia/meta-llama-3.1-8b-instruct` | Meta Llama 3.1 8B | 128K | 4K | — | — |
| `saia/openai-gpt-oss-120b` | GPT-OSS 120B | 128K | 8K | — | low, medium, high |
| `saia/qwen3-30b-a3b-instruct-2507` | Qwen3 30B A3B | 256K | 16K | — | — |

> `Vision` comes from the `input` modalities the live API reports. See
> `KNOWN_ISSUES.md` ("Model modality metadata disagrees across sources") — the API
> under-reports image support for some models, so treat a `—` as "not declared",
> not necessarily "cannot".

## Aliases

Aliases are registered as pi models and rewritten to their target id on the wire,
so they inherit the target's context window, output limit, modalities and
thinking levels.

| Alias | Resolves To | Use for |
|-------|-------------|---------|
| `saia/best-for-coding` | `qwen3-coder-next` | code generation and refactoring |
| `saia/best-for-reasoning` | `qwen3.5-397b-a17b` | complex multi-step reasoning |
| `saia/best-quality` | `qwen3.5-397b-a17b` | the highest-capability general model |
| `saia/best-for-vision` | `qwen3.8-27b` | image understanding |
| `saia/best-for-agentic` | `glm-5.3-flash` | tool use and agentic loops |
| `saia/fastest` | `meta-llama-3.1-8b-instruct` | the lowest latency |
| `saia/fastest-reasoning` | `qwen3.8-27b` | fast reasoning |
| `saia/budget` | `deepseek-v4-flash-0731` | cost-effective 1M-context work |

## Thinking levels

SAIA validates `reasoning_effort` and answers **HTTP 400** for a value a model
does not accept, so the plugin ships a `thinkingLevelMap` for the reasoning
models whose vendor API takes discrete effort values:

- `saia/deepseek-v4-flash-0731` — accepts `low`, `high`, `max`.

- `saia/glm-5.3-flash` — accepts `low`, `high`, `max`.

- `saia/openai-gpt-oss-120b` — accepts `low`, `medium`, `high`.

- `saia/qwen3.5-397b-a17b` — thinking is a toggle (`enable_thinking` on/off), not an effort level, so it gets no `thinkingLevelMap`; pi's default applies.

- `saia/qwen3.6-35b-a3b` — thinking is a toggle (`enable_thinking` on/off), not an effort level, so it gets no `thinkingLevelMap`; pi's default applies.

- `saia/qwen3.8-27b` — thinking is a toggle (`enable_thinking` on/off), not an effort level, so it gets no `thinkingLevelMap`; pi's default applies.

Levels outside a model's set map to the nearest supported value (ties towards
more effort), so `--thinking max` on a model that caps at `high` sends `high`
rather than a rejected value.

## Notes

- Every model sets `compat.supportsDeveloperRole: false` because SAIA's vLLM
  chat templates reject the OpenAI `developer` role; pi sends the system prompt
  as `system`.
- Model ids that do not exist are forwarded verbatim by pi and come back as
  `404 Model Not Found`; text mode prints nothing, so use `--mode json` to see
  the error — or use an alias, which is rewritten to a real id.

## Reliability

SAIA is a shared academic HPC service: individual models intermittently answer
`500`, stall, or queue behind capacity, independent of your quota. Its limits are
30 requests/minute, 200/hour, 1000/day and 3000/month; a 429 shows up as
`429 status code (no body)`. pi's HTTP idle timeout is 5 minutes by default, so a
stalled model looks like a freeze. Add this to `~/.pi/agent/settings.json`:

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "provider": { "maxRetries": 3, "timeoutMs": 120000 }
  }
}
```
