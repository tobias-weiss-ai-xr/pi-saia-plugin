// Epics SAIA-DOCS + SAIA-HYGIENE — the documentation and the legacy surface
// can never lag the catalog.
//
// User stories covered:
//   US-O1  As a user I want the README model table to list exactly the live
//          models with their real context windows, so I pick from reality.
//   US-O2  As a user I want the documented default model to be the actual
//          default, so copy-pasted commands work.
//   US-O3  As an API consumer I want the documented raw-catalog URL to be
//          correct (https, real path), so one curl gets the facts.

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { readdir } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { parseContextWindow } from "../../scripts/collect-saia-model-info.mjs"
import { SAIA_ALIASES, SAIA_MODELS } from "../../extensions/index.ts"

const facts = JSON.parse(readFileSync(new URL("../../data/saia-models.json", import.meta.url), "utf8"))
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8")

const modelsSection = readme.match(/## Available Models([\s\S]*?)(?=## Model Aliases)/)?.[1] ?? ""

function readmeRows() {
  const rows = new Map()
  for (const [, id, contextDisplay] of modelsSection.matchAll(/^\| `saia\/([^`]+)` \|[^\n]*?\| (\d+K|1M) \|/gm)) {
    rows.set(id, parseContextWindow(contextDisplay))
  }
  return rows
}

test("US-O1: README model table matches the live catalog exactly", () => {
  const rows = readmeRows()
  assert.ok(rows.size > 0, "no model rows found in README")
  const factIds = facts.models.map((model) => model.id)
  assert.deepEqual(
    [...rows.keys()].sort(),
    [...factIds].sort(),
    "README table ids differ from data/saia-models.json",
  )
  for (const model of facts.models) {
    assert.equal(rows.get(model.id), model.context_window.tokens, `${model.id}: README context drifted`)
  }
})

test("US-O2: documented default model is the shipped default", () => {
  const documented = readme.match(/Default model: `([^`]+)`/)?.[1]
  assert.equal(documented, "saia/deepseek-v4-flash-0731")
})

test("US-O3: the raw-catalog curl URL is correct", () => {
  const url = readme.match(/curl -s (https:\/\/\S+saia-models\.json)/)?.[1]
  assert.ok(url, "README must document the https raw catalog URL")
  assert.ok(url.startsWith("https://"), "URL must be https (codeberg 302s http silently)")
})

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const REGISTERED = new Set([
  ...SAIA_MODELS.map((model) => model.id),
  ...Object.keys(SAIA_ALIASES),
])

/**
 * Files that legitimately mention retired models:
 *  - CHANGELOG.md is a historical record.
 *  - KNOWN_ISSUES.md documents the retired ids on purpose.
 */
const HISTORICAL = new Set(["CHANGELOG.md", "KNOWN_ISSUES.md"])

const SCAN_EXTENSIONS = new Set([".md", ".json", ".sh", ".ps1", ".yml", ".yaml", ".ts", ".mjs"])

const SKIP_DIRS = new Set([".git", "node_modules", "test", ".until-done"])

/** `saia/<id>` where `<id>` is a model-shaped token, not a file/path. */
const NOT_A_MODEL = /\.(json|sh|md|ts|mjs|js|ps1|yml|yaml)$/

/**
 * Tokens that sit in a model-shaped position but are not models at all
 * (branch names in issue templates, for example).
 */
const KNOWN_NON_MODELS = new Set(["new-feature", "main", "master", "HEAD", "schema"])

/**
 * Only model *positions* count, so paths like `saia/pi-saia.json` or branch
 * names like `saia/new-feature` never trip the check.
 */
const MODEL_POSITION_PATTERNS = [
  /(?:--model|\/model)\s+saia\/([A-Za-z0-9][A-Za-z0-9._-]*)/g, // --model saia/x, /model saia/x
  /"model"\s*:\s*"saia\/([A-Za-z0-9][A-Za-z0-9._-]*)"/g, // JSON config
  /`saia\/([A-Za-z0-9][A-Za-z0-9._-]*)`/g, // `saia/x`
  /'saia\/([A-Za-z0-9][A-Za-z0-9._-]*)'/g, // 'saia/x'
  /(?:^|[\s${])MODEL[:=-]{1,2}"?saia\/([A-Za-z0-9][A-Za-z0-9._-]*)/gm, // MODEL=saia/x, ${MODEL:-saia/x}
]

function isModelReference(id) {
  if (NOT_A_MODEL.test(id)) return false
  if (id.startsWith(".")) return false
  if (id.startsWith("pi-")) return false
  if (KNOWN_NON_MODELS.has(id)) return false
  return true
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else {
      yield full
    }
  }
}

function collectReferences(text) {
  const found = new Set()
  for (const pattern of MODEL_POSITION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (isModelReference(match[1])) found.add(match[1])
    }
  }
  return found
}

test("US12: every `saia/<model>` reference in the repo resolves to a registered model", async () => {
  const offenders = []
  let checked = 0

  for await (const file of walk(REPO_ROOT)) {
    const rel = path.relative(REPO_ROOT, file)
    if (HISTORICAL.has(rel)) continue
    if (!SCAN_EXTENSIONS.has(path.extname(file))) continue

    const text = readFileSync(file, "utf8")
    for (const id of collectReferences(text)) {
      checked += 1
      if (!REGISTERED.has(id)) offenders.push(`${rel}: saia/${id}`)
    }
  }

  assert.ok(checked > 20, `expected to scan real references, only found ${checked}`)
  assert.deepEqual(
    offenders,
    [],
    `Unregistered model references found:\n  ${offenders.join("\n  ")}`,
  )
})

test("US13: README documents every base model", () => {
  const readme = readFileSync(path.join(REPO_ROOT, "README.md"), "utf8")
  const missing = SAIA_MODELS.map((m) => m.id).filter((id) => !readme.includes(id))
  assert.deepEqual(missing, [], `README.md does not document: ${missing.join(", ")}`)
})

test("US13: README and the skill document every alias", () => {
  const readme = readFileSync(path.join(REPO_ROOT, "README.md"), "utf8")
  const skill = readFileSync(path.join(REPO_ROOT, "skills", "saia-models.md"), "utf8")
  for (const alias of Object.keys(SAIA_ALIASES)) {
    assert.ok(readme.includes(alias), `README.md does not document alias ${alias}`)
    assert.ok(skill.includes(alias), `skills/saia-models.md does not document alias ${alias}`)
  }
})

test("US13: the skill documents every base model", () => {
  const skill = readFileSync(path.join(REPO_ROOT, "skills", "saia-models.md"), "utf8")
  const missing = SAIA_MODELS.map((m) => m.id).filter((id) => !skill.includes(id))
  assert.deepEqual(missing, [], `skills/saia-models.md does not document: ${missing.join(", ")}`)
})

test("US12: the generated provider matches the collected facts", () => {
  const facts = JSON.parse(readFileSync(path.join(REPO_ROOT, "data", "saia-models.json"), "utf8"))
  const factIds = facts.models.map((model) => model.id).sort()
  const catalogIds = SAIA_MODELS.map((model) => model.id).sort()
  assert.deepEqual(
    catalogIds,
    factIds,
    "extensions/index.ts drifted from data/saia-models.json — re-run ./scripts/sync-saia-models.sh",
  )
})

/**
 * The legacy OpenCode-format layer is dead code. It is only acceptable while it
 * is clearly marked as such — an unmarked file here is how the README ended up
 * telling users to run `/model saia/glm-4.7` for a retired model.
 */
const LEGACY_FILES = [
  "src/saia.ts",
  "src/saia-memory.ts",
  "src/generate-saia-config.sh",
  "src/setup-wizard.sh",
  "src/copy-saia-config.sh",
  "src/validate-config.sh",
  "src/.opencode/skills/saia-health.md",
  "src/.opencode/skills/saia-list-models.md",
  "src/.opencode/skills/saia-optimize.md",
  "src/.opencode/skills/saia-refresh.md",
  "src/.opencode/skills/saia-switch-profile.md",
  "pi.json.example",
  "schema/pi.schema.json",
]

const LEGACY_MARKERS = [/LEGACY/, /NOT USED BY pi/, /not read by/]

/**
 * Scripts that can silently write the dead config format must refuse to run
 * unless the operator explicitly opts in with SAIA_LEGACY=1.
 */
const LEGACY_GATED = [
  "src/generate-saia-config.sh",
  "src/setup-wizard.sh",
  "src/copy-saia-config.sh",
  "src/validate-config.sh",
]

test("US12: every legacy file is explicitly marked as legacy", () => {
  const unmarked = []
  for (const rel of LEGACY_FILES) {
    let text
    try {
      text = readFileSync(path.join(REPO_ROOT, rel), "utf8")
    } catch {
      unmarked.push(`${rel} (missing)`)
      continue
    }
    const head = text.slice(0, 1200)
    if (!LEGACY_MARKERS.some((marker) => marker.test(head))) unmarked.push(rel)
  }
  assert.deepEqual(unmarked, [], `legacy files without a LEGACY marker:\n  ${unmarked.join("\n  ")}`)
})

test("US12: legacy entry points refuse to run without SAIA_LEGACY=1", () => {
  for (const rel of LEGACY_GATED) {
    const text = readFileSync(path.join(REPO_ROOT, rel), "utf8")
    assert.match(
      text,
      /SAIA_LEGACY:-0/,
      `${rel} must gate on \${SAIA_LEGACY:-0} so it cannot silently write the dead config path`,
    )
  }
})

// The Out column is taste (the API states no output limit), which is exactly why
// it drifted: four rows disagreed with the provider the plugin actually ships.
// The table renders limits in binary K/M (32768 -> "32K"), so compare in that
// form rather than with parseContextWindow, which is decimal.
test("US-O4: README output limits match the shipped provider", () => {
  const provider = new Map(SAIA_MODELS.map((model) => [model.id, model.maxTokens]))
  const display = (tokens) =>
    tokens >= 1024 * 1024 && tokens % (1024 * 1024) === 0
      ? `${tokens / (1024 * 1024)}M`
      : `${tokens / 1024}K`
  const rows = [...modelsSection.matchAll(/^\| `saia\/([^`]+)` \|[^\n]*?\| [\d.]+[KM] \| ([\d.]+[KM]) \|/gm)]
  assert.ok(rows.length > 0, "no model rows found in README")
  for (const [, id, out] of rows) {
    assert.equal(out, display(provider.get(id)), `${id}: README Out (${out}) != provider maxTokens`)
  }
})
