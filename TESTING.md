# Testing — pi-saia-plugin

This document describes the **epics** and **user stories** that must be tested for the
SAIA provider plugin for the [pi coding agent](https://pi.dev), and maps each story to a
concrete test in the `test/` suite.

## How to run

```bash
# Behavioral / unit suite (Node's built-in test runner via tsx)
npm test

# Legacy structural smoke tests (file layout, JSON, shell syntax)
npm run test:smoke

# Optional: live SAIA API + local cache integration tests
SAIA_RUN_INTEGRATION=1 SAIA_API_KEY="$SAIA_API_KEY" npm test
```

The unit suite lives in `test/unit/`:

| File | Epic | Stories |
|------|------|---------|
| `test/unit/catalog.test.mjs` | SAIA-CATALOG | US1, US2, US3, US4 |
| `test/unit/legacy.test.mjs` | SAIA-LEGACY | US5, US6, US7, US8 |
| `test/unit/memory.test.mjs` | SAIA-MEMORY | US9, US10 |
| `test/unit/facts-collector.test.mjs` | SAIA-FACTS | US11, US12, US13, US14, US15 |
| `test/unit/facts-invariants.test.mjs` | SAIA-FACTS | US16, US17, US18 |

---

## Epic SAIA-CATALOG — Provider catalog correctness

> As a pi user I want the SAIA provider to expose a complete, internally
> consistent catalog of models (base models + aliases) registered with the
> OpenAI-compatible SAIA API, so that model selection works for every
> documented model.

### US1 — Every documented model is registered
- **Given** the `SAIA_MODELS` catalog in `extensions/index.ts`
- **When** pi loads the plugin
- **Then** all 18 base models are present, ids are unique, and each has the
  required fields (`id`, `name`, `reasoning`, `input` incl. `text`,
  `contextWindow`, `maxTokens`, `cost`).
- **Test:** `catalog.test.mjs` → "registers every documented base model",
  "every base model has the required provider fields".

### US2 — Aliases resolve to real models and inherit capabilities
- **Given** the alias entries (`best-for-coding`, `budget`, …)
- **When** a user selects an alias
- **Then** it maps to an existing base model and inherits that model's
  `reasoning`, `input`, and `contextWindow`.
- **Test:** `catalog.test.mjs` → "every alias resolves to a real model and
  inherits its capabilities".

### US3 — Reasoning / vision flags and token limits match the docs
- **Given** the documented reasoning and multimodal model sets
- **When** the catalog is validated
- **Then** the `reasoning` flag set and the `image`-input set exactly match the
  documentation, and notable token limits (e.g. `qwen3.8-2.4t-a95b` 256K/64K,
  `medgemma-27b-it` 32K/4K) are correct.
- **Test:** `catalog.test.mjs` → "reasoning flags match the documented
  reasoning models", "vision (image) models are exactly the documented
  multimodal set", "token limits for notable models match the docs".

### US4 — Provider registers under id `saia` with the OpenAI-compatible API
- **Given** pi invokes the plugin's default export
- **When** `registerProvider` is called
- **Then** id is `saia`, `baseUrl` is `https://chat-ai.academiccloud.de/v1`,
  `api` is `openai-completions`, `apiKey` is `$SAIA_API_KEY`, and the models
  object is the exact catalog.
- **Test:** `catalog.test.mjs` → "registers the provider under id 'saia'…".

---

## Epic SAIA-LEGACY — Legacy entry-point logic

> As a maintainer I want the legacy plugin entry point (`src/saia.ts`) to keep
> its categorization, capability, and profile logic deterministic and in sync
> with the primary catalog, so generated configs never lie about a model.

### US5 — Deterministic model categorization
- **Given** a model id
- **When** `categorizeModel(id)` is evaluated
- **Then** it returns one of the valid categories
  (reasoning/agentic/coder/large-context/medical/vision/general) and the
  known models land in the documented buckets.
- **Test:** `legacy.test.mjs` → "categorizeModel returns a valid category…".

### US6 — Capability flags are consistent with categorization
- **Given** reasoning / attachment helpers
- **When** evaluated for representative models
- **Then** `canReason`/`supportsAttachment` agree with `categorizeModel`, and
  `getModelMetadata` encodes `category`, `limit`, and flags correctly.
- **Test:** `legacy.test.mjs` → "capability flags are consistent…",
  "getModelMetadata encodes category, limits and flags".

### US7 — Profile selection filters models predictably
- **Given** `SAIA_PROFILE` (production / development / dev / budget)
- **When** `getProfileDefaultModel` and `includeInProfile` are evaluated
- **Then** production includes everything, budget is a strict subset
  (incl. `meta-llama-3.1-8b-instruct`, `deepseek-v4-flash-0731`), and the
  default model per profile is correct.
- **Test:** `legacy.test.mjs` → "profile default model and inclusion filter…".

### US8 — Aliases resolve to real model ids
- **Given** the `ALIASES` map in `src/saia.ts`
- **When** each alias is inspected
- **Then** its target is a real base model id.
- **Test:** `legacy.test.mjs` → "every alias resolves to a real model id".

---

## Epic SAIA-MEMORY — Memory-layer helpers

> As a user I want the recommendation and cache helpers to behave predictably,
> so first-run and repeated usage are stable.

### US9 — Recommended model defaults sensibly
- **Given** no stored preference
- **When** `getRecommendedModel(available)` is called
- **Then** it returns `glm-4.7` when available, otherwise the first available
  model, otherwise `unknown`.
- **Test:** `memory.test.mjs` → "recommends glm-4.7 when available…",
  "falls back to the first available model…", "returns 'unknown' when no
  models are available".

### US10 — Cache and change-detection talk to the SAIA API (integration)
- **Given** `SAIA_RUN_INTEGRATION=1` and a valid `SAIA_API_KEY`
- **When** `fetchWithCache` / `checkForNewModels` run
- **Then** the fetcher is invoked and model diffs are computed without error.
- **Test:** `memory.test.mjs` → "fetchWithCache invokes the fetcher…",
  "checkForNewModels talks to the SAIA API…" (skipped unless integration
  enabled; self-cleans cache artifacts).

---

## Regression notes

- `extensions/index.ts`: `SAIA_MODELS` was not exported, which blocked unit
  testing of the catalog. It is now exported for tests.
- `src/saia.ts`: helper functions/categories were private; they are now
  exported (`categorizeModel`, `canReason`, `supportsAttachment`,
  `getContextWindow`, `getOutputWindow`, `getModelMetadata`,
  `getModelDescription`, `ALIASES`, `getProfileDefaultModel`,
  `includeInProfile`) so they can be asserted directly.

---

## Epic SAIA-FACTS — Auto-collected model facts are correct and complete

> As a repo consumer I want `scripts/collect-saia-model-info.mjs` to turn the
> live API, the GWDG docs table and the curated reasoning map into a clean,
> unopinionated catalog — with every ambiguity reported as a gap instead of
> guessed — so `data/saia-models.json` is trustworthy enough to curl and build
> on.

### US11 — Docs context displays parse to exact token counts
- **Given** docs cells like "65k", "256K", "1M", "1.05M"
- **When** `parseContextWindow` runs
- **Then** they become 65000/256000/1000000/1050000 (decimal k/M), and garbage
  stays `null` — never a guess.
- **Test:** `facts-collector.test.mjs` → "context window display values parse
  to exact token counts".

### US12 — Recommended sampling parses to vendor params
- **Given** "temp=0.8, top_p=0.9" style docs cells
- **Then** `parseRecommended` yields `{temperature, top_p}` and returns
  `undefined` for dashes/prose.
- **Test:** `facts-collector.test.mjs` → "recommended sampling parses temp/top_p
  and tolerates garbage".

### US13 — Docs names match API ids (Instruct drift; external excluded)
- **Given** "Gemma 4 31B Instruct" vs `gemma-4-31b-it`, and closed/external docs
  rows
- **Then** `matchDocsRow` strips the trailing "Instruct" and matches, and
  external models are never matched.
- **Test:** `facts-collector.test.mjs` → "docs names match API ids including
  Instruct-suffix drift".

### US14 — Reasoning entries resolve by longest prefix
- **Given** overlapping prefixes (`qwen3-` false, `qwen3.5-` true)
- **Then** `reasoningFor` picks the longest match; unknown ids report
  `{supported: null}` for gap tracking.
- **Test:** `facts-collector.test.mjs` → "reasoning entries resolve by longest
  prefix, unknown → null".

### US15 — The merge reports every gap honestly
- **Given** a live model with no docs row, a docs row with no API model, and a
  closed + an embeddings row
- **Then** `buildCatalog` fills `api_without_docs`, `docs_without_api` (external
  and embeddings excluded) and `reasoning_unknown`, and leaves missing facts
  null rather than guessing.
- **Test:** `facts-collector.test.mjs` → "buildCatalog merges all three sources
  and reports every gap honestly".

### US16 — The committed facts file satisfies its contract
- **Given** `data/saia-models.json`
- **Then** ids are unique, every model accepts text, has a parsed context
  window and a decided reasoning flag, and `gaps` is empty.
- **Test:** `facts-invariants.test.mjs` → "data/saia-models.json satisfies the
  catalog contract".

### US17 — The curated reasoning map covers every live model
- **Given** `scripts/reasoning-models.json`
- **Then** prefixes are unique, every live model resolves via longest prefix
  exactly as recorded in the data file, and every supported entry cites vendor
  sources.
- **Test:** `facts-invariants.test.mjs` → "the curated reasoning map covers
  every live model exactly".

### US18 — Supported models name their vendor API surface
- **Given** any model with `reasoning.supported === true`
- **Then** it carries a `toggle` or `effort` param so clients know what to send.
- **Test:** `facts-invariants.test.mjs` → "supported models name their vendor
  API surface".
