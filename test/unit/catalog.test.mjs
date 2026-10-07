// Epic SAIA-CATALOG: the registered SAIA model catalog is complete, internally
// consistent, and registers correctly with the pi coding agent.
//
// User stories covered:
//   US1  As a pi user I want every SAIA model advertised in the docs to be
//        registered, so that /model saia/<id> works for all documented models.
//   US2  As a pi user I want model aliases (best-for-coding, budget, ...) to
//        resolve to a real model, so shortcuts never point at nothing.
//   US3  As a pi user I want reasoning/vision flags and token limits to match
//        the documentation, so tool-use and multimodal requests behave correctly.
//   US4  As a pi user I want the provider to register under id "saia" with the
//        OpenAI-compatible API, so requests are routed to chat-ai.academiccloud.de.
//
// Ground truth is data/saia-models.json (auto-collected from the live SAIA API,
// the GWDG docs table and scripts/reasoning-models.json — see
// scripts/collect-saia-model-info.mjs). If these tests fail after a sync, the
// collected facts and the generated catalog disagree — never "fix" them by
// editing the fixtures.

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import registerSaiaProvider, { SAIA_MODELS } from "../../extensions/index.ts"

const facts = JSON.parse(readFileSync(new URL("../../data/saia-models.json", import.meta.url), "utf8"))
const factById = new Map(facts.models.map((model) => [model.id, model]))

// pi's ProviderModelConfig only expresses text|image; the generator filters.
const catalogInput = (factModel) => {
  const filtered = factModel.input.filter((modality) => modality === "text" || modality === "image")
  return filtered.length ? filtered : ["text"]
}

const REAL_MODEL_IDS = facts.models.map((model) => model.id)
const realModels = SAIA_MODELS.filter((model) => REAL_MODEL_IDS.includes(model.id))
const aliasModels = SAIA_MODELS.filter((model) => !REAL_MODEL_IDS.includes(model.id))
const realById = new Map(realModels.map((model) => [model.id, model]))
const aliasTarget = (alias) => alias.name.split("→").pop().trim()

test("US1: registers every documented base model (no duplicates)", () => {
  assert.ok(facts.gaps.api_without_docs.length === 0, "collector gaps must be curated first")
  assert.equal(realModels.length, REAL_MODEL_IDS.length, "base model count drifted")
  const ids = SAIA_MODELS.map((model) => model.id)
  assert.equal(new Set(ids).size, ids.length, "duplicate model ids in catalog")
  for (const id of REAL_MODEL_IDS) {
    assert.ok(realById.has(id), `missing base model: ${id}`)
  }
})

test("US1: every base model has the required provider fields", () => {
  for (const model of realModels) {
    assert.equal(typeof model.id, "string")
    assert.equal(typeof model.name, "string")
    assert.equal(typeof model.reasoning, "boolean")
    assert.ok(Array.isArray(model.input) && model.input.includes("text"), `${model.id} must accept text`)
    assert.ok(model.input.length > 0, `${model.id} has no input modalities`)
    assert.ok(typeof model.contextWindow === "number" && model.contextWindow > 0, `${model.id} bad contextWindow`)
    assert.ok(typeof model.maxTokens === "number" && model.maxTokens > 0, `${model.id} bad maxTokens`)
    assert.ok(
      model.maxTokens <= model.contextWindow,
      `${model.id} maxTokens (${model.maxTokens}) exceeds contextWindow (${model.contextWindow})`,
    )
    assert.ok(model.cost && typeof model.cost.input === "number" && typeof model.cost.output === "number")
  }
})

test("US3: reasoning flags match the collected reasoning facts", () => {
  for (const model of realModels) {
    assert.equal(
      model.reasoning,
      factById.get(model.id).reasoning.supported === true,
      `${model.id} reasoning flag does not match data/saia-models.json`,
    )
  }
})

test("US3: vision (image) models match the collected modalities", () => {
  const expectedVision = new Set(
    facts.models.filter((model) => catalogInput(model).includes("image")).map((model) => model.id),
  )
  for (const alias of aliasModels) {
    if (realById.get(aliasTarget(alias))?.input.includes("image")) expectedVision.add(alias.id)
  }
  const actualVision = new Set(SAIA_MODELS.filter((model) => model.input.includes("image")).map((model) => model.id))
  assert.deepEqual([...actualVision].sort(), [...expectedVision].sort(), "vision model set mismatch")
})

test("US3: context windows match the collected facts for every base model", () => {
  for (const model of realModels) {
    const expected = factById.get(model.id).context_window.tokens
    assert.ok(expected, `${model.id} has no collected context window`)
    assert.equal(
      model.contextWindow,
      expected,
      `${model.id} contextWindow ${model.contextWindow} != docs ${expected}`,
    )
  }
})

test("US3: token limits for notable models match the GWDG docs", () => {
  assert.equal(realById.get("glm-5.3-flash").contextWindow, 1_000_000)
  assert.equal(realById.get("deepseek-v4-flash-0731").contextWindow, 1_000_000)
  assert.equal(realById.get("qwen3.6-35b-a3b").contextWindow, 262_000)
  assert.equal(realById.get("meta-llama-3.1-8b-instruct").contextWindow, 128_000)
  assert.equal(realById.get("apertus-70b-instruct-2509").contextWindow, 65_000)
})

test("US2: every alias resolves to a real model and inherits its capabilities", () => {
  assert.ok(aliasModels.length > 0, "expected alias models in catalog")
  for (const alias of aliasModels) {
    const targetId = aliasTarget(alias)
    assert.ok(realById.has(targetId), `alias ${alias.id} points at unknown model ${targetId}`)
    assert.ok(REAL_MODEL_IDS.includes(targetId), `alias ${alias.id} points at retired model ${targetId}`)
    const target = realById.get(targetId)
    assert.equal(alias.reasoning, target.reasoning, `alias ${alias.id} reasoning flag mismatch`)
    assert.deepEqual(alias.input, target.input, `alias ${alias.id} input modalities mismatch`)
    assert.equal(alias.contextWindow, target.contextWindow, `alias ${alias.id} contextWindow mismatch`)
  }
})

test("US4: registers the provider under id 'saia' with the OpenAI-compatible API", () => {
  const captured = {}
  registerSaiaProvider({
    registerProvider(id, config) {
      captured.id = id
      captured.config = config
    },
  })

  assert.equal(captured.id, "saia")
  assert.equal(captured.config.name, "SAIA Academic Cloud")
  assert.equal(captured.config.baseUrl, "https://chat-ai.academiccloud.de/v1")
  assert.equal(captured.config.apiKey, "$SAIA_API_KEY")
  assert.equal(captured.config.api, "openai-completions")
  // The registered models must be the exact catalog object.
  assert.strictEqual(captured.config.models, SAIA_MODELS)
  assert.equal(captured.config.models.length, SAIA_MODELS.length)
})
