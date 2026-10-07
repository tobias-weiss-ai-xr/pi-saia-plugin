// Contract tests for the generated provider (extensions/index.ts).
//
// extensions/index.ts is produced by scripts/sync-saia-models.sh from
// data/saia-models.json. These tests assert the invariants that must hold
// between the two, without a network, a key, or the `pi` binary — so they run
// on every `npm test`, including CI.
//
// User stories covered:
//   US-P1 As a user I want every alias to point at a model the provider serves,
//         so `--model saia/best-for-coding` is not an opaque 404.
//   US-P2 As a user I want a model's thinking-level map to only contain values
//         its vendor API accepts, so `--thinking minimal` is not a 400.
//   US-P3 As a user I want $SAIA_BASE_URL to be honoured (and a blank value to
//         fall back to the canonical endpoint), so I can point the plugin at a
//         gateway, a proxy, or a test double.

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  SAIA_ALIASES,
  SAIA_ALL_MODELS,
  SAIA_BASE_URL,
  SAIA_BASE_URL_ENV,
  SAIA_MODELS,
  applyAliasToPayload,
  resolveBaseUrl,
  rewriteAliasModel,
} from "../../extensions/index.ts"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const FACTS = JSON.parse(readFileSync(path.join(REPO_ROOT, "data", "saia-models.json"), "utf8"))

const MODEL_IDS = new Set(SAIA_MODELS.map((model) => model.id))
const EFFORT_VALUES = new Map(
  FACTS.models
    .filter((model) => Array.isArray(model.reasoning?.effort?.values))
    .map((model) => [model.id, model.reasoning.effort.values]),
)

test("US-P1: every alias targets a real model and never another alias", () => {
  const aliases = Object.keys(SAIA_ALIASES)
  assert.equal(aliases.length, 8, `expected 8 aliases, found ${aliases.length}`)

  for (const [alias, target] of Object.entries(SAIA_ALIASES)) {
    assert.ok(MODEL_IDS.has(target), `alias "${alias}" points at unknown model "${target}"`)
    assert.ok(!SAIA_ALIASES[target], `alias "${alias}" points at another alias "${target}"`)
  }
})

test("US-P1: alias entries inherit their target's capabilities", () => {
  for (const [alias, target] of Object.entries(SAIA_ALIASES)) {
    const entry = SAIA_ALL_MODELS.find((model) => model.id === alias)
    const real = SAIA_MODELS.find((model) => model.id === target)
    assert.ok(entry, `alias "${alias}" is not registered with pi`)

    // An alias that advertised different limits than its target would let users
    // pick it for capabilities it does not have (best-for-vision with no image
    // input, for example).
    assert.equal(entry.contextWindow, real.contextWindow, `${alias} contextWindow`)
    assert.equal(entry.maxTokens, real.maxTokens, `${alias} maxTokens`)
    assert.deepEqual(entry.input, real.input, `${alias} input modalities`)
    assert.equal(entry.reasoning, real.reasoning, `${alias} reasoning flag`)
  }
})

test("US-P1: the alias rewrite is provider-scoped and idempotent", () => {
  const [alias] = Object.keys(SAIA_ALIASES)
  const target = SAIA_ALIASES[alias]

  assert.equal(rewriteAliasModel(alias, "saia"), target)
  assert.equal(rewriteAliasModel(alias), target, "provider may be omitted")
  assert.equal(rewriteAliasModel(alias, "other-provider"), undefined, "must not touch other providers")
  assert.equal(rewriteAliasModel(target, "saia"), undefined, "a real model id is left alone")
  assert.equal(rewriteAliasModel(undefined, "saia"), undefined)
  assert.equal(rewriteAliasModel(42, "saia"), undefined)

  // Rewriting the payload twice must not change it further (the hook may run
  // more than once for a retried request).
  const once = applyAliasToPayload({ model: alias, messages: [] }, "saia")
  const twice = applyAliasToPayload(once, "saia")
  assert.equal(once.model, target)
  assert.deepEqual(twice, once)
})

test("US-P1: a payload that needs no rewrite is returned untouched", () => {
  const payload = { model: "qwen3-coder-next", messages: [{ role: "user", content: "hi" }] }
  assert.equal(applyAliasToPayload(payload, "saia"), payload, "same object, not a copy")
  assert.equal(applyAliasToPayload(null, "saia"), null)
  assert.equal(applyAliasToPayload("nope", "saia"), "nope")
})

test("US-P2: a thinking-level map only uses values the vendor API accepts", () => {
  let mapped = 0
  for (const model of SAIA_MODELS) {
    const map = model.thinkingLevelMap
    const accepted = EFFORT_VALUES.get(model.id)

    if (!map) {
      continue
    }
    mapped += 1
    assert.ok(
      accepted,
      `${model.id} declares a thinkingLevelMap but data/saia-models.json has no curated effort values for it`,
    )
    for (const [level, value] of Object.entries(map)) {
      if (value === null) continue // "unsupported level" is explicit and fine
      assert.ok(
        accepted.includes(value),
        `${model.id}: --thinking ${level} maps to "${value}", which is not in the vendor's accepted set [${accepted.join(", ")}]`,
      )
    }
  }
  assert.ok(mapped > 0, "at least one model should have a curated thinking-level map")
})

test("US-P2: every pi thinking level is mapped, so no level falls through", () => {
  const LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"]
  for (const model of SAIA_MODELS) {
    if (!model.thinkingLevelMap) continue
    for (const level of LEVELS) {
      assert.ok(
        typeof model.thinkingLevelMap[level] === "string",
        `${model.id}: thinking level "${level}" is unmapped — pi would fall back to a value the vendor may reject`,
      )
    }
  }
})

test("US-P2: a non-reasoning model carries no thinking-level map", () => {
  for (const model of SAIA_MODELS) {
    if (model.reasoning === true) continue
    assert.equal(
      model.thinkingLevelMap,
      undefined,
      `${model.id} is not a reasoning model but declares a thinkingLevelMap`,
    )
  }
})

test("US-P3: $SAIA_BASE_URL overrides the endpoint, blank falls back", () => {
  assert.equal(SAIA_BASE_URL_ENV, "SAIA_BASE_URL")
  assert.equal(SAIA_BASE_URL, "https://chat-ai.academiccloud.de/v1")

  // Override, with trailing slashes trimmed.
  assert.equal(resolveBaseUrl({ SAIA_BASE_URL: "http://127.0.0.1:9/v1" }), "http://127.0.0.1:9/v1")
  assert.equal(resolveBaseUrl({ SAIA_BASE_URL: "http://127.0.0.1:9/v1/" }), "http://127.0.0.1:9/v1")
  assert.equal(resolveBaseUrl({ SAIA_BASE_URL: "  http://host/v1  " }), "http://host/v1")

  // Blank/whitespace must not produce a broken base URL — a stray
  // `export SAIA_BASE_URL=` in a shell profile is easy to end up with.
  for (const blank of ["", "   ", "\t", "/", "///"]) {
    assert.equal(resolveBaseUrl({ SAIA_BASE_URL: blank }), SAIA_BASE_URL, `blank value ${JSON.stringify(blank)}`)
  }
  assert.equal(resolveBaseUrl({}), SAIA_BASE_URL, "unset")
})

test("US-P1: the generated file is in sync with the facts file", () => {
  // A model in the facts but not in the generated provider means someone edited
  // extensions/index.ts by hand or forgot to re-run the sync script.
  for (const model of FACTS.models) {
    assert.ok(MODEL_IDS.has(model.id), `${model.id} is in data/saia-models.json but not registered`)
  }
  assert.equal(SAIA_MODELS.length, FACTS.models.length)
})
