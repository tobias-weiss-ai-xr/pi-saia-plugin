# Changelog

All notable changes to pi-saia-plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Every model alias returned `404 Model Not Found`.** Aliases were registered
  as pi models but nothing rewrote them, and pi forwards an unrecognised model
  id verbatim — so `saia/best-for-coding` reached SAIA as `best-for-coding`.
  All 8 aliases now resolve: the generator emits a `SAIA_ALIASES` table plus a
  `before_provider_request` hook that substitutes the target id. The alias
  entries are *projected* from their targets, so an alias can no longer
  advertise different limits or modalities than the model it points at.
- **`qwen3.5-397b-a17b` and `qwen3.6-35b-a3b` failed with
  `400 {"message":"Unexpected message role."}`.** pi sends the OpenAI `developer`
  role unless a model declares otherwise; SAIA rejects it. Every generated model
  now carries `compat: { supportsDeveloperRole: false }`. Verified live against
  both models, and hermetically against the mock (`system`, never `developer`).
- **`--thinking minimal` on `openai-gpt-oss-120b` returned
  `400 ... reasoning_effort='minimal' is not supported by Harmony. Supported
  values are: high, medium, low.`** while `--thinking max` silently did nothing
  (pi clamps `xhigh`/`max` down to `high`, making maximum effort unreachable on
  every model). Reasoning models now get a `thinkingLevelMap` derived from the
  curated `effort.values` in `scripts/reasoning-models.json` — name match first,
  then nearest value, ties towards more effort. All six levels verified live on
  `glm-5.3-flash`, `deepseek-v4-flash-0731` and `openai-gpt-oss-120b`.
- **The generator could not run on macOS.** `declare -A` is bash 4 syntax; under
  `/bin/bash` 3.2.57 the script died with `best: unbound variable` *after*
  refreshing the facts, leaving the shipped provider silently stale. The alias
  table is a plain `alias|target` list now (which also makes the output
  deterministic — associative-array iteration order is not stable, so `--check`
  would have reported drift on every run).
- **The README advertised five retired models** (`glm-4.7`,
  `qwen3.8-2.4t-a95b`, `qwen3.5-122b-a10b`, `medgemma-27b-it`, `qwen3.6-27b`) and
  never mentioned the newly deployed `glm-5.3-flash`. Both tables are now
  generated from `data/saia-models.json` and the shipped alias map.

### Added
- **`$SAIA_BASE_URL` override** — point the provider at an institutional
  gateway, a proxy or a local test double. A blank/whitespace value falls back to
  the canonical URL instead of producing `https://` garbage. This is also what
  makes the hermetic suite below possible.
- **Hermetic wire-protocol suite** (`test/integration/wire.test.mjs` +
  `test/mock-saia-server.mjs`, `npm run test:wire`): a local OpenAI-compatible
  mock records what pi actually sends. No API key, no network, no quota — so the
  alias rewrite, the `developer` role, the `Authorization` header and the
  thinking-level mapping are asserted deterministically in CI. Skips (never
  fails) when `pi` is not on `PATH`.
- **`test/unit/provider.test.mjs`** — the generated provider's contract, checked
  without `pi` and without a network: aliases point at real models and inherit
  their capabilities, a `thinkingLevelMap` only contains vendor-accepted values
  and covers every pi level, non-reasoning models carry no map, `$SAIA_BASE_URL`
  resolution, and the generated file staying in sync with the facts file.
- **`--check` exit codes** for `sync-saia-models.sh`: `0` current, `1` drift,
  `2` usage, `3` facts unavailable. A transient upstream failure is no longer
  reported as catalog drift (the smoke suite fails on `1`, skips on `3`).
  `--print-ts` and hermetic `SAIA_MODELS_DATA=<file>` generation were added too.

### Changed
- **`extensions/index.ts` is generated from `data/saia-models.json`** — the
  collected facts are the single source of truth, and the generator carries the
  wire fixes above, so a regenerate cannot silently drop them (`--check` fails,
  and `prepare-release.sh` refuses to package a provider missing them).
  `package.json` gains a `files` whitelist so the tarball ships `extensions/`,
  `data/`, `skills/` and the two scripts instead of the dead legacy `src/` tree.


### Fixed
- **The Makefile was unparseable** — `HELP_TEXT = \` followed by free-standing
  lines is a parse error, so *every* target (`make help`, `make test`,
  `make install`) died with `Makefile:17: *** missing separator. Stop.` The help
  text lives in a `define`/`endef` block now, the commented-out `test` target is
  back, `lint` lints the shipped `extensions/` instead of the legacy `src/`,
  `docker-validate` uses the real `buildx --call=check` flag instead of the
  non-existent `docker build --dry-run`, `docker-run` uses the image's actual
  app directory, and `version` no longer requires `jq`. Guarded by three new
  checks (the file parses, every documented target exists, every documented
  target is callable).
- **`.github/workflows/test.yml` could never trigger**: it filtered on `master`,
  but the repository's only branch is `main`, so pushes and pull requests to
  `main` ran no CI at all. Now `[main, master]`.
- **`.github/workflows/release.yml`'s tag filter matched no tag.** Workflow
  filters are *globs*, not regexes: `v[0-9]+.[0-9]+.[0-9]+` was matched literally
  (so `v1.0.4` did not match), which meant releases never fired even after the
  YAML was fixed. The filter is `v[0-9]*` now and a new step refuses to release
  unless the tag is strict semver. A new check proves the filter matches real
  tags with a self-contained glob matcher (`test/lib/glob-matcher.mjs`).
- **`prepare-release.sh` validated the wrong tree**: it required
  `src/.opencode/skills/*` and `schema/`, and never checked `extensions/` or
  `skills/` — the files that actually ship. It also invoked the legacy generator
  through `$(dirname "$0")` *after* a `pushd`, so the path resolved into the temp
  directory and the check always failed. Rewritten to validate the pi package,
  the skill frontmatter, the `npm pack` contents and catalog freshness, to
  report every problem in one run, and to run clean with no API key (`--no-tests`
  avoids recursing into `npm run verify`, which invokes this script's own suite).
- **`.githooks/pre-push` blocked every push on a machine without `jq`** (absent
  by default on macOS): a missing validator was reported as *invalid JSON*. It
  uses node now. The hook also only recognised the `main` default branch, which
  means it did line up with this repository — unlike CI.
- **The smoke suite tried to run `npx tsc` unconditionally**, which can download
  TypeScript from the network and fails inside a container where the mounted
  `node_modules` is built for another platform (TypeScript 7 ships a native
  binary). It now uses a local `tsc` and skips with a clear message when the
  toolchain is missing or unusable. `make dockertest` consequently passes against
  a read-only mount.
- **`.github/workflows/release.yml` was not valid YAML** — a heredoc body sat at
  column 0 inside a `run: |` block scalar, so GitHub could never parse the
  workflow and releases never ran. Fixed, and the changelog commit now lands on
  the default branch instead of a detached tag (where `git push` fails anyway).
  A new smoke test parses every workflow `run:` block and every workflow YAML.
- **`./scripts/sync-saia-models.sh --check` was not read-only**: it staged its
  generated output as `extensions/catalog.ts.tmp.$$`, so it failed outright in a
  read-only checkout (CI, the container image) and left a temp file behind on
  failure. It now writes to the system temp dir whenever `--check` is used.
  Two smoke tests pin this: "--check leaves the working tree untouched" and
  "--check works in a read-only checkout".
- **The Docker image could not run pi at all**: it copied the dead
  `~/.config/pi/plugins/saia` layout and never installed pi. It now installs
  `@earendil-works/pi-coding-agent` and registers the package with
  `pi install`, so the image exercises the real path. Verified by building and
  running a live inference inside the container.
- **Stale model references outside the code**: `install.ps1`, `schema/pi.schema.json`,
  `pi.json.example`, `docker-compose.yml` (mock API), `sandbox/showcase.sh`,
  `src/setup-wizard.sh` and the legacy `.opencode` skills still named models the
  SAIA API does not serve (`glm-4.7`, `qwen3.5-35b-a3b`, plus invented ids like
  `qwen3-235b-a22b`, `internvl3.5-30b-a3b`, `deepseek-r1-distill-llama-70b`,
  `teuken-7b`). The invented tables were removed, not "updated".
- **`install.ps1` installed to the dead `~/.config/pi` path**; it now runs
  `pi install`, matching `install.sh`.
- **Legacy scripts could silently write the dead config format.**
  `src/generate-saia-config.sh`, `src/setup-wizard.sh`,
  `src/copy-saia-config.sh` and `src/validate-config.sh` now refuse to run
  without `SAIA_LEGACY=1` and print the supported alternative.

### Added
- **Install walkthrough video** (`docs/media/install.webm`, 34s, VP9, 270 KB)
  recorded from a real session: real `pi install`, real `pi --list-models`, real
  completions. Reproducible via `scripts/make-install-video.py`, which installs
  into a throwaway agent dir, renders the session terminal-replay style and
  **audits its own frames** (a clipped line fails the run). The API key never
  appears in a frame.
- **Guard tests for entry points that cannot run**: the Makefile must parse and
  every documented target must be callable; every workflow's branch filter must
  cover the repository's default branch; the release tag filter must match real
  semver tags; `prepare-release.sh` must pass with no API key; hooks and scripts
  must not hard-depend on `jq`. Each was verified by reintroducing the original
  bug and confirming the suite fails.
- **Every alias is verified on the wire**, not just one. pi forwards an
  unknown model id to the provider verbatim, so a typo in the alias table
  surfaces as a bare `404 Model Not Found` rather than a local error; the
  hermetic suite now sweeps all eight aliases (and pins the unknown-id
  behaviour, which this plugin cannot intercept).
- **Hermetic wire-protocol tests** (`test/integration/wire.test.mjs` +
  `test/mock-saia-server.mjs`): a local OpenAI-compatible mock plus the real `pi`
  binary, run against an isolated `PI_CODING_AGENT_DIR`. No API key, no network,
  deterministic — and they assert the failure modes that only exist on the wire:
  an alias is rewritten to a real model id before the request leaves pi, the
  system prompt is sent as `system` and never `developer`, `--thinking <level>`
  becomes a `reasoning_effort` value the model actually accepts, a
  non-reasoning model receives no `reasoning_effort` at all, and `$SAIA_API_KEY`
  reaches the `Authorization` header. These are the checks that previously
  required hammering a shared HPC service that returns intermittent `500`s.
- **`SAIA_BASE_URL`** — overrides the endpoint, for institutional gateways,
  proxies, tunnels or a local mock. Trailing slashes are trimmed.
- `npm run test:wire` runs just the hermetic suite; `npm test` runs unit +
  wire. CI installs the `pi` CLI so the wire tests execute there instead of
  skipping, and the Node matrix now includes `24.x`.
- **Doc-drift guard** (`test/unit/docs.test.mjs`): every `saia/<model>`
  reference in docs, configs and scripts must resolve to a registered model;
  every registered model and alias must be documented; the offline API fixture
  must match the shipped catalog; every legacy file must carry a LEGACY marker;
  every legacy entry point must be gated on `SAIA_LEGACY`. This is the check
  that would have caught the README advertising `/model saia/glm-4.7`.
- **`test/fixtures/saia-models.json`** — an offline capture of `/v1/models`, so
  the generator can be verified without a key or network.
- **Generator reproducibility tests** (smoke): the generator must reproduce
  `extensions/catalog.ts` byte-for-byte (modulo the timestamp) from the fixture,
  must run under `/bin/bash` 3.2 (macOS) — catching any return of `declare -A`
  — and `--check` must fail on a divergent model list.
- **Package manifest tests** (smoke): `files[]` must cover every path in the `pi`
  manifest, and `npm pack` must ship `extensions/index.ts` + `skills/saia-models.md`
  while excluding the legacy `src/` tree.
- **Skill-loader test** (smoke): runs pi's own `loadSkills()` and asserts the
  skill registers as `saia-models`, not the collision-prone directory fallback.
- `package.json`: `files` whitelist (the tarball went from 49 files to 10),
  `engines.node >= 20.6` (required for `--import`), and `npm run verify` /
  `prepublishOnly` running tsc + unit + smoke tests.
- **Reliability guidance**: SAIA returns intermittent `500`s and stalls that are
  unrelated to quota, and pi neither retries provider requests nor prints
  anything on `429`. The skill and README document the `retry.provider`
  settings and the `authoritative error → cause` table learned while testing.
- **Verified capability matrix** in the skill (reasoning and image support per
  model, probed against the live API) and a note that the API's `input` array
  under-reports (it claims text-only for `mistral-medium-3.5-128b` and
  `openai-gpt-oss-120b`).

- Initial repository structure
- TypeScript plugin for pi coding agent
- SAIA API integration
- Profile-based model selection (production, development, budget)
- Memory layer with caching, metrics, and usage tracking
- 5 management skills: refresh, health, list-models, switch-profile, optimize
- Shell scripts for configuration generation
- Interactive setup wizard
- Comprehensive documentation

### Fixed (catalog and provider)
- **src/generate-saia-config.sh**: Heredoc with quoted `'HEADER'` delimiter prevented command substitution — `"model"` field contained literal `$(get_profile_default_model ...)` instead of the resolved model name
- **src/saia.ts / src/saia-memory.ts**: no longer recommend the retired `glm-4.7`; `getRecommendedModel()` now walks a shortlist of live models and all capability/limit helpers are derived from `extensions/catalog.ts` instead of a second, divergent copy of the model list
- **Catalog drift (the big one)**: `extensions/catalog.ts` now contains exactly the
  14 models the live SAIA API serves. Removed 5 phantom models (`glm-4.7`,
  `medgemma-27b-it`, `qwen3.5-122b-a10b` → HTTP 500; `qwen3.6-27b`,
  `qwen3.8-2.4t-a95b` → HTTP 404) and added the missing live `glm-5.3-flash`.
- **All 8 aliases returned `404 Model Not Found`**: aliases were registered as
  literal model ids and sent to SAIA unchanged. They are now rewritten to their
  target id by a `before_provider_request` hook, so `saia/best-for-coding`,
  `saia/budget`, … actually work. Alias entries are projected from their targets
  so capabilities can no longer drift.
- **`400 "Unexpected message role."` on Qwen models**: SAIA's vLLM chat templates
  reject the OpenAI `developer` role, which pi sends for unknown OpenAI-compatible
  endpoints. Every model now sets `compat.supportsDeveloperRole: false` so pi sends
  `system`.
- **`400 "Unexpected reasoning effort …"`**: pi sends `reasoning_effort` for every
  `reasoning: true` model on this endpoint, but e.g. `qwen3.8-27b` only accepts
  `low|medium|xhigh`. Each reasoning model now ships a verified `thinkingLevelMap`
  that folds unsupported pi levels into supported ones.
- **Capability corrections**: `reasoning` and `input` are now empirical — e.g.
  `qwen3.8-27b` is reasoning + vision, `qwen3-30b-a3b-instruct-2507` is not
  reasoning, and `mistral-medium-3.5-128b`/`openai-gpt-oss-120b` are multimodal.
  Context windows now match the SAIA docs (1M/256K/128K/64K instead of a flat 128K).
- **`skills/saia-models.md` had no `name:` frontmatter**, so pi fell back to the
  parent directory and registered it as `"skills"`, colliding with every other
  package using the same layout (one skill was silently dropped). It now declares
  `name: saia-models`.
- **`scripts/sync-saia-models.sh` crashed on macOS**: it used `declare -A`
  (bash ≥ 4) while macOS ships bash 3.2. Rewritten without associative arrays;
  also no longer silently skips models missing from its metadata table, no longer
  force-includes undeployed models, and keeps `export const SAIA_MODELS`.
- **`test/test.sh` aborted after the first assertion**: `set -euo pipefail` plus
  `((PASS_COUNT++))` returns `0` on the first increment. The suite now runs to
  completion (78 pass).
- **`test/test.sh` false results**: `package.json main` assertion expected the
  retired `./src/saia.ts`; the secret scan flagged documentation placeholders
  (`SAIA_API_KEY=your_key`). Both fixed.
- **`install.sh` / `make install` installed nothing pi could read**: they copied
  files to `~/.config/pi/plugins/saia` and wrote `~/.config/pi/pi.json`, paths
  pi ≥ 0.84 never reads. They now use `pi install` / `pi remove`.
- **`src/saia.ts` is now a thin adapter over `extensions/catalog.ts`** instead of
  a second, divergent copy of the model list; equally, it and
  `src/saia-memory.ts` no longer recommend the retired `glm-4.7`.

### Changed
- Legacy boundary made explicit: `src/*.ts`, `src/*.sh`, `src/.opencode/skills/*`,
  `pi.json.example` and `schema/pi.schema.json` are marked LEGACY / FROZEN in
  their headers, and the legacy skills now point at `skills/saia-models.md`
  instead of duplicating a model table that can only drift.
- `docker-compose.yml` mounts `~/.pi/agent` (the layout pi ≥ 0.84 actually
  reads) instead of `~/.config/pi`.
- `sandbox/README.md` and `prepare-release.sh` opt into `SAIA_LEGACY=1` where
  they deliberately exercise the frozen scripts.
- Catalog extraction: `extensions/catalog.ts` is **data only** (generated);
  provider registration, alias projection and the alias rewrite hook live in
  `extensions/index.ts`. Previously the generator rewrote the whole module, which
  silently dropped `export` and broke the unit tests.
- `scripts/sync-saia-models.sh` gained `--check` (CI drift gate) and `--out`,
  and accepts `SAIA_MODELS_JSON` for offline runs.
- `tsconfig.json`: `allowImportingTsExtensions` so `extensions/index.ts` can
  import `./catalog.ts`.
- Docs (`README.md`, `TESTING.md`, `scripts/README.md`, `skills/saia-models.md`)
  rewritten to the verified model set, the working alias table and the real API
  key resolution order.
- **Dockerfile**: Fixed UID 1000 conflict with `node` user; fixed `CMD` format (JSON args); removed `ENV SAIA_API_KEY` (security); fixed `.opencode/skills/` not being copied (dotfile glob issue)
- **sandbox/run.sh**: Fixed invalid bash variable assignment containing Turkish/Azerbaijani characters (`üzrə`)
- **src/saia-memory.ts**: Fixed `MODELS_CACHE_FILE` used before its lexical declaration (TDZ risk)
- **test/test.sh**: Removed YAML files from JSON validation test (always failed)
- **src/setup-wizard.sh**: Fixed glob expansion with `nullglob` to prevent `cp` errors
- **CI workflow**: Tests now build and use local image instead of pulling from GHCR
- **src/saia.ts**: Fixed `registerCommand` call signatures to match pi's `ExtensionAPI`; skills from `.opencode/skills/` are now actually registered
- **TypeScript**: `extensions/index.ts` now included in type-checking; added missing `cost` field and `ProviderModelConfig` annotation
- **GHCR org**: All image references updated from `graphwiz-ai` to `tobias-weiss-ai-xr`
- TypeScript type definitions improved
- Fixed import statements for Node.js modules
- Enhanced error handling in memory layer

---

## [1.0.0] - 2025-07-27

### Added
- **Pi package format**: Now installable via `pi install` (following the pi-memory pattern — see [agent-memory-research](https://github.com/tobias-weiss-ai-xr/agent-memory-research) survey [[arXiv 2512.13564](https://arxiv.org/abs/2512.13564)] for the research foundation behind our memory architecture)
- **Provider auto-registration**: Extension registers SAIA provider with 6 models via `pi.registerProvider()`
- **Usage skill**: `/skill:saia-models` documents available models and usage
- **Clean `package.json` manifest**: `pi` key with `extensions` and `skills` paths

### Changed
- **Architecture**: From shell-script config generator → pi package with TypeScript extension
- **README**: Updated to describe pi package installation, usage, and structure
- API key resolution now uses pi's built-in auth stack (auth.json / env vars / /login) instead of shell scripts

### Removed
- Shell scripts (`src/*.sh`) — superseded by pi package auto-registration
- Docker setup — no longer needed; pi packages are self-contained
- Sandbox, showcase, Makefile — legacy from old approach

---

## [0.1.0] - 2025-07-25

### Added
- **Core Plugin** (`src/saia.ts`): Main plugin entry point for pi
- **Memory Layer** (`src/saia-memory.ts`): Caching, usage tracking, metrics
- **Configuration Generation** (`src/generate-saia-config.sh`): Fetches models from SAIA API
- **Utility Scripts**: copy, validate, setup-wizard
- **Skills**: 5 SAIA management skills in `.opencode/skills/`
- **Documentation**: README, FAQ, ARCHITECTURE, SECURITY, ROADMAP
- **Installation**: Shell and PowerShell installers

### Features
- Automatic model list refresh on pi startup
- 24-hour caching of API responses
- Profile support (production, development, budget)
- Rich model metadata (category, limits, costs, latency)
- Model aliases for easy selection
- JSON schema validation
- LiteLLM proxy support

### Model Categories
- Reasoning (chain-of-thought)
- Coder (code-specialized)
- Vision (multimodal)
- Medical
- Research
- Agentic (tool use)
- Large Context (≥128k tokens)
- General

### Model Aliases
- `saia/best-for-coding` → qwen3-coder-30b
- `saia/best-for-reasoning` → deepseek-r1-distill-llama-70b
- `saia/best-for-vision` → internvl3.5-30b
- `saia/best-for-agentic` → glm-4.7
- `saia/best-quality` → qwen3.5-397b
- `saia/fastest` → llama-3.1-8b
- `saia/budget` → llama-3.1-8b
- `saia/best-german` → llama-3.1-sauerkrautlm-70b

### Profiles
| Profile | Models | Default | Use Case |
|---------|--------|---------|----------|
| production | ~8-9 | glm-4.7 | Critical work, highest quality |
| development | ~7-8 | qwen3.5-35b-a3b | Active development, balanced |
| budget | ~4 | llama-3.1-8b | Cost optimization |

---

## [0.0.1] - 2025-07-24

### Added
- Project conception
- Repository initialization
- Basic structure based on opencode-saia-plugin

[Unreleased]: https://github.com/tobias-weiss-ai-xr/pi-saia-plugin/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tobias-weiss-ai-xr/pi-saia-plugin/releases/tag/v0.1.0
[0.0.1]: https://github.com/tobias-weiss-ai-xr/pi-saia-plugin/releases/tag/v0.0.1
