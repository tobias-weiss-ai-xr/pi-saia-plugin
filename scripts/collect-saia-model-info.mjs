#!/usr/bin/env node
// Collects SAIA model facts and writes data/saia-models.json — a clean,
// unopinionated, machine-readable model catalog anyone can curl and reuse:
//
//   1. Live model list   GET {SAIA_API_URL:-https://chat-ai.academiccloud.de}/v1/models
//                        → ids, status, input/output modalities (authoritative for existence)
//   2. GWDG docs table   https://docs.hpc.gwdg.de/.../models/index.html
//                        → context window, release date, advantages/limitations,
//                          recommended sampling parameters, organization
//   3. scripts/reasoning-models.json (committed, curated)
//                        → reasoning API params per model family. This is the
//                          ONLY manual layer; any live model without a matching
//                          entry is reported as a gap so it gets curated.
//
// Usage:
//   node scripts/collect-saia-model-info.mjs [--out FILE] [--offline] [--strict]
//     --offline  skip the live API call, reuse the api facts recorded in the
//                previous run (docs are re-fetched)
//     --strict   exit 1 when any live model lacks docs facts or reasoning info
//
// No dependencies — Node.js >= 18. The pure functions and buildCatalog() are
// exported for the test suite; main() only runs when executed as a CLI.

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import process from "node:process"

const API_BASE = process.env.SAIA_API_URL?.replace(/\/+$/, "") ?? "https://chat-ai.academiccloud.de/v1"
const DOCS_URL = "https://docs.hpc.gwdg.de/services/ai-services/chat-ai/models/index.html"

function warn(message) {
  console.warn(`[WARN] ${message}`)
}

async function fetchLiveModels() {
  if (!process.env.SAIA_API_KEY) return undefined
  const response = await fetch(`${API_BASE}/models`, {
    headers: { Authorization: `Bearer ${process.env.SAIA_API_KEY}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`live API returned ${response.status}`)
  const body = await response.json()
  if (!Array.isArray(body?.data)) throw new Error("live API response has no .data array")
  return body.data
}

async function fetchDocs() {
  const response = await fetch(DOCS_URL, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`docs returned ${response.status}`)
  return response.text()
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", ndash: "–", mdash: "—" }

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) return String.fromCodePoint(parseInt(entity.slice(2), 16))
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10))
    return ENTITIES[entity.toLowerCase()] ?? match
  })
}

function cellText(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    // drop flag emoji and other non-BMP symbols used in the org column
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

// "65k" → 65000, "1M" → 1000000, "1.05M" → 1050000, "4096" → 4096.
// Deliberately decimal: the docs table is the source of truth and writes
// "256K"/"1M"; the raw display string is preserved next to the number.
export function parseContextWindow(display) {
  const match = /^([\d.]+)\s*([kKmM])?$/.exec(display.replace(/,/g, ""))
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  const scale = { k: 1e3, K: 1e3, m: 1e6, M: 1e6 }[match[2]] ?? 1
  return Math.round(value * scale)
}

// "temp=0.8, top_p=0.9" → {temperature: 0.8, top_p: 0.9}
export function parseRecommended(text) {
  const recommended = {}
  for (const [, key, value] of text.matchAll(/(temp(?:erature)?|top_p)\s*=\s*([\d.]+)/gi)) {
    const normalized = key.toLowerCase().startsWith("temp") ? "temperature" : "top_p"
    recommended[normalized] = Number(value)
  }
  return Object.keys(recommended).length ? recommended : undefined
}

export function parseDocsTables(html) {
  const rows = []
  for (const table of html.matchAll(/<table>[\s\S]*?<\/table>/g)) {
    for (const row of table[0].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => cellText(cell[1]))
      if (cells.length < 8) continue
      if (/^organization$/i.test(cells[0])) continue // header
      const [org, name, open, released, contextDisplay, advantages, limitations, recommended] = cells
      rows.push({
        org: org || undefined,
        name,
        external: /^no$/i.test(open),
        released: released || undefined,
        context_window: { display: contextDisplay, tokens: parseContextWindow(contextDisplay) },
        advantages: advantages && advantages !== "-" ? advantages : undefined,
        limitations: limitations && limitations !== "-" ? limitations : undefined,
        recommended: parseRecommended(recommended),
        embeddings: /embedding/i.test(advantages) || /embedding/i.test(name),
      })
    }
  }
  return rows
}

export const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "")

// Docs display names sometimes carry an "Instruct" suffix the API id lacks
// ("Gemma 4 31B Instruct" vs "gemma-4-31b-it").
export function nameAliases(name) {
  const norm = normalize(name)
  const stripped = norm.replace(/instruct$/, "")
  return stripped && stripped !== norm && stripped.length >= 6 ? [norm, stripped] : [norm]
}

export function matchDocsRow(id, docsRows) {
  const target = normalize(id)
  const candidates = docsRows.filter((row) => !row.external)
  const exact = candidates.find((row) => nameAliases(row.name).includes(target))
  if (exact) return exact
  // Substring fallback, one direction only: the model id may carry a date/size
  // suffix the docs name lacks ("deepseek-v4-flash-0731" ⊃ "deepseek-v4-flash").
  // The reverse (a short id being a substring of a longer docs name, e.g.
  // "glm-5.3" vs "GLM 5.3 Flash") is a false positive — two different models.
  return candidates.find((row) =>
    nameAliases(row.name).some((alias) => target.includes(alias)),
  )
}

// Longest prefix wins so "qwen3.5-" is not shadowed by a shorter pattern.
export function reasoningFor(id, entries) {
  const entry = [...entries]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((entry) => id === entry.prefix || id.startsWith(entry.prefix))
  if (!entry) return { supported: null }
  const reasoning = { supported: entry.supported }
  for (const key of ["toggle", "effort", "note", "sources"]) {
    if (entry[key] !== undefined) reasoning[key] = entry[key]
  }
  return reasoning
}

// Relaxed 'never guess' rule: if a live model has neither a docs row nor a
// curated context, we assume the maximum context the platform serves rather
// than holding the model back. The docs/curated values win when known.
// shortcut: assumes 1M for unknown models; replace if the platform's ceiling grows.
const ASSUMED_MAX_CONTEXT = { display: "1048576", tokens: 1048576 }

// Curated, vendor-verified context window for a live model the GWDG docs have
// not caught up with (the new B200 platform models). Only display+tokens are
// merged into context_window — sources stay in the curated file and in
// catalog.sources.context, so every model's context_window has the same shape.
export function contextFor(id, contextWindows) {
  const entry = contextWindows?.[id]
  return entry ? { display: entry.display, tokens: entry.tokens } : null
}

// Merge live API models with parsed docs rows and curated reasoning entries.
// Pure: no network, no fs — the test suite drives this directly.
export function buildCatalog({ liveModels, docsHtml = "", reasoningEntries = [], contextWindows = {} }) {
  const gaps = { api_without_docs: [], docs_without_api: [], reasoning_unknown: [] }
  const docsRows = docsHtml ? parseDocsTables(docsHtml) : []

  const models = []
  const usedDocsRows = new Set()
  for (const model of [...liveModels].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const docs = matchDocsRow(model.id, docsRows)
    if (docs) usedDocsRows.add(docs)

    const reasoning = reasoningFor(model.id, reasoningEntries)
    if (reasoning.supported === null) gaps.reasoning_unknown.push(model.id)

    const curatedCtx = docs ? null : contextFor(model.id, contextWindows)
    models.push({
      id: model.id,
      name: docs?.name ?? model.name ?? model.id,
      org: docs?.org,
      status: model.status ?? "ready",
      input: model.input ?? ["text"],
      output: model.output ?? ["text"],
      // docs > curated vendor fact > assume max (relaxed never-guess rule)
      context_window: docs?.context_window ?? curatedCtx ?? ASSUMED_MAX_CONTEXT,
      released: docs?.released,
      reasoning,
      recommended: docs?.recommended,
      notes: docs ? { advantages: docs.advantages, limitations: docs.limitations } : undefined,
    })
  }

  for (const row of docsRows) {
    if (row.external || row.embeddings || usedDocsRows.has(row)) continue
    gaps.docs_without_api.push(row.name)
  }

  return { models, gaps }
}

async function loadReasoningEntries(scriptDir) {
  const raw = JSON.parse(await readFile(resolve(scriptDir, "reasoning-models.json"), "utf8"))
  return raw.entries
}

async function loadContextWindows(scriptDir) {
  const raw = JSON.parse(await readFile(resolve(scriptDir, "context-models.json"), "utf8"))
  return raw.entries
}

async function main() {
  const args = process.argv.slice(2)
  const outIndex = args.indexOf("--out")
  const outPath = resolve(args[outIndex + 1] ?? "data/saia-models.json")
  const offline = args.includes("--offline")
  const strict = args.includes("--strict")
  const scriptDir = dirname(fileURLToPath(import.meta.url))

  let previous
  try {
    previous = JSON.parse(await readFile(outPath, "utf8"))
  } catch {
    previous = undefined
  }

  let liveModels = offline ? undefined : await fetchLiveModels().catch((error) => {
    warn(`live API unreachable (${error.message}) — falling back to the previous run`)
    return undefined
  })
  if (!liveModels) {
    liveModels = previous?.live?.models
    if (!liveModels) throw new Error("no live model facts available (set SAIA_API_KEY or run online first)")
  }

  let docsHtml = ""
  try {
    docsHtml = await fetchDocs()
  } catch (error) {
    warn(`could not fetch GWDG docs (${error.message}) — context windows will be missing`)
  }

  const reasoningEntries = await loadReasoningEntries(scriptDir)
  const contextWindows = await loadContextWindows(scriptDir)
  const { models, gaps } = buildCatalog({ liveModels, docsHtml, reasoningEntries, contextWindows })

  const catalog = {
    generated_at: new Date().toISOString(),
    sources: {
      live_api: `${API_BASE}/models`,
      docs: DOCS_URL,
      reasoning: "scripts/reasoning-models.json (curated; see entry sources)",
      context: "scripts/context-models.json (curated, vendor-verified — more accurate context for new B200-platform models); unknown models assume the platform max (1M)",
      notes:
        "context_window.tokens is derived from the docs display value (k=1e3, M=1e6); the display string preserves the source. External (closed) models are excluded — the SAIA API does not serve them. Live models without a docs row or curated context assume the platform-max context (1048576) instead of being held back.",
    },
    live: { models: liveModels },
    models,
    gaps,
  }

  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`)

  console.log(`[INFO] wrote ${outPath} (${models.length} models)`)
  for (const [key, value] of Object.entries(gaps)) {
    if (value.length) warn(`${key}: ${value.join(", ")}`)
  }
  if (strict && Object.values(gaps).some((value) => value.length)) {
    process.exitCode = 1
  }
}

const invokedAsCli = process.argv[1] && process.argv[1].endsWith("collect-saia-model-info.mjs")
if (invokedAsCli) {
  main().catch((error) => {
    console.error(`[ERROR] ${error.message}`)
    process.exit(1)
  })
}
