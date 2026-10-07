# pi-saia-plugin Scripts

Two artifacts, one pipeline:

| Artifact | Produced by | Contains |
|----------|-------------|----------|
| `data/saia-models.json` | `collect-saia-model-info.mjs` | **facts** — the live API model list, GWDG docs table and curated reasoning params merged, with gaps reported |
| `extensions/index.ts` | `sync-saia-models.sh` | **the pi provider** — generated from those facts plus the generator's taste tables |

## collect-saia-model-info.mjs

```bash
node scripts/collect-saia-model-info.mjs           # fetch + merge + write
node scripts/collect-saia-model-info.mjs --offline # reuse the previous API facts
node scripts/collect-saia-model-info.mjs --strict  # exit 1 if any fact is a gap
```

Three sources, merged in that order of authority:

1. **Live API** (`GET $SAIA_API_URL/models`) → which models exist, status, input/output modalities
2. **GWDG docs table** → context window, release date, recommended sampling, organisation
3. **`scripts/reasoning-models.json`** (curated, the only hand-maintained layer) → reasoning API params per family prefix, with vendor sources

Anything it cannot establish is reported as a gap (`api_without_docs`,
`docs_without_api`, `reasoning_unknown`) rather than guessed. The output is
designed to be curl-able and reusable by any client.

## sync-saia-models.sh

Regenerates `extensions/index.ts` from `data/saia-models.json`.

### Usage

```bash
# Refresh the facts, then regenerate the provider
./scripts/sync-saia-models.sh

# Verify both artifacts without writing anything (CI gate)
./scripts/sync-saia-models.sh --check

# Print the generated TypeScript instead of writing it
./scripts/sync-saia-models.sh --print-ts

# Write somewhere else
./scripts/sync-saia-models.sh --out /tmp/index.ts

# Hermetic: generate from a fixed facts file (no key, no network)
SAIA_MODELS_DATA=data/saia-models.json ./scripts/sync-saia-models.sh --print-ts
```

### Exit codes (`--check`)

| Code | Meaning |
|------|---------|
| `0` | both artifacts are current |
| `1` | **drift** — an artifact is stale |
| `2` | bad usage |
| `3` | facts could not be determined (no key, API unreachable, collector broken) |

`1` and `3` are deliberately distinct: a transient upstream failure is not drift.
Callers (CI, the smoke suite) must be able to tell them apart instead of
reporting a flaky network as a stale catalog — the smoke suite **fails** on `1`
and **skips** on `3`.

`--check` is strictly read-only: it collects into a temp dir, so it works in a
read-only checkout, in CI and inside the container image.

### What the generator emits

Beyond the model list, every generated file carries the wire fixes — regenerate
and they stay, hand-edit and they are one sync away from vanishing:

- `compat: { supportsDeveloperRole: false }` on every model — SAIA answers
  `400 {"message":"Unexpected message role."}` for the OpenAI `developer` role
- `thinkingLevelMap` per reasoning model, derived from the curated
  `effort.values` — pi's default mapping sends `minimal` (rejected by
  `openai-gpt-oss-120b`) and clamps `xhigh`/`max` down to `high`
- `SAIA_ALIASES` plus a `before_provider_request` hook — SAIA has no aliases, so
  an alias id must be rewritten to its target or it 404s
- `resolveBaseUrl()` honouring `$SAIA_BASE_URL`, blank → canonical URL

### Taste tables

Facts come from the JSON; these three remain opinion and live at the top of the
script:

- `MAX_TOKENS` — output limit per model (the API and docs do not state one)
- `ALIAS_ROWS` — the alias → target table
- `categorize()` — which section a model lands in

`ALIAS_ROWS` is a plain `alias|target` list, **not** `declare -A`: macOS ships
bash 3.2, where associative arrays do not exist (the previous generator died with
`best: unbound variable` on every Mac), and their iteration order is not stable,
which would make the generated file churn on every run.

### Environment

| Variable | Purpose |
|----------|---------|
| `SAIA_API_KEY` | API key (fallback: `pi auth print-api-key --provider saia`) |
| `SAIA_API_URL` | Override the models endpoint |
| `SAIA_MODELS_DATA` | Generate from this facts file instead of refreshing it (hermetic mode) |

### Automation

```bash
# Daily drift check that fails loudly instead of rewriting the repo
0 2 * * * cd /path/to/pi-saia-plugin && ./scripts/sync-saia-models.sh --check
```

### Dependencies

- `jq` — JSON processing (`brew install jq`)
- `node` — the collector (>= 18)
- `bash` 3.2+ — no associative arrays, no `${var,,}`

### Related tests

- `npm test` → `test/unit/provider.test.mjs` (generated provider contract),
  `test/unit/facts-*.test.mjs` (the collector)
- `npm run test:wire` → `test/integration/wire.test.mjs` (real `pi` against a
  local mock; no key, no network)
- `npm run test:smoke` → `test_catalog_generator` (reproducibility, read-only
  `--check`, bash 3.2 run) and `test_catalog_freshness` (live drift gate)

## make-install-video.py

Records the install walkthrough embedded in the README
(`docs/media/install.webm`, 34s, VP9) plus its poster frame.

```bash
SAIA_API_KEY=... ./scripts/make-install-video.py
# custom output / encoder
SAIA_API_KEY=... ./scripts/make-install-video.py --out /tmp/demo.webm --ffmpeg "$(command -v ffmpeg)"
```

What it does:

1. Installs the plugin into a **throwaway `PI_CODING_AGENT_DIR`**, so your own pi
   configuration is never touched, then runs two real prompts and records the
   real commands, real output and (capped) real latency.
2. Renders those steps terminal-replay style — typing, a spinner while a request
   is in flight, real output — at 1280×720 / 20fps.
3. **Audits its own frames**: a line clipped at the right edge or a row colliding
   with the footer fails the run, so a layout regression cannot be published
   silently.
4. Encodes with `libvpx-vp9` and writes the poster frame next to the video.

The API key is read from `$SAIA_API_KEY` and never appears in a frame.

### Dependencies

- `python3` + Pillow (`pip install pillow`)
- `ffmpeg` with `libvpx-vp9` (`brew install ffmpeg`; `imageio-ffmpeg` also works
  and keeps it out of your PATH — pass it via `--ffmpeg`)
- `pi` on `PATH`, `SAIA_API_KEY` in the environment

Not part of `npm test` / CI: it needs ffmpeg and a live key, and a video is a
manual, release-time artifact.
