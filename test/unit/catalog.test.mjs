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

import assert from "node:assert/strict"
import test from "node:test"
import registerSaiaProvider, { SAIA_MODELS } from "../../extensions/index.ts"

// The 18 base (non-alias) models that must always be present.
const REAL_MODEL_IDS = [
  "apertus-70b-instruct-2509",
  "deepseek-v4-flash-0731",
  "devstral-2-123b-instruct-2512",
  "gemma-4-31b-it",
  "glm-4.7",
  "medgemma-27b-it",
  "meta-llama-3.1-8b-instruct",
  "mistral-medium-3.5-128b",
  "openai-gpt-oss-120b",
  "qwen3-30b-a3b-instruct-2507",
  "qwen3.5-122b-a10b",
  "qwen3.5-397b-a17b",
  "qwen3.6-27b",
  "qwen3.6-35b-a3b",
  "qwen3-coder-next",
  "qwen3-omni-30b-a3b-instruct",
  "qwen3.8-2.4t-a95b",
  "qwen3.8-27b",
]

const ALLOWED_CONTEXT_WINDOWS = new Set([32768, 131072, 256000])
const EXPECTED_REASONING_IDS = new Set([
  "qwen3-30b-a3b-instruct-2507",
  "qwen3.5-122b-a10b",
  "qwen3.5-397b-a17b",
  "qwen3.8-2.4t-a95b",
  "best-for-reasoning",
  "best-quality",
])

const realModels = SAIA_MODELS.filter((m) => REAL_MODEL_IDS.includes(m.id))
const aliasModels = SAIA_MODELS.filter((m) => !REAL_MODEL_IDS.includes(m.id))
const realById = new Map(realModels.map((m) => [m.id, m]))

test("US1: registers every documented base model (no duplicates)", () => {
  assert.equal(realModels.length, REAL_MODEL_IDS.length, "base model count drifted")
  const ids = SAIA_MODELS.map((m) => m.id)
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
    assert.ok(
      ALLOWED_CONTEXT_WINDOWS.has(model.contextWindow),
      `${model.id} unexpected contextWindow ${model.contextWindow}`,
    )
    assert.ok(model.cost && typeof model.cost.input === "number" && typeof model.cost.output === "number")
  }
})

test("US3: reasoning flags match the documented reasoning models", () => {
  const actualReasoning = new Set(SAIA_MODELS.filter((m) => m.reasoning).map((m) => m.id))
  assert.deepEqual(
    [...actualReasoning].sort(),
    [...EXPECTED_REASONING_IDS].sort(),
    "reasoning flag set does not match documentation",
  )
})

test("US3: vision (image) models are exactly the documented multimodal set", () => {
  const expectedVision = new Set([
    "gemma-4-31b-it",
    "medgemma-27b-it",
    "qwen3.5-122b-a10b",
    "qwen3.5-397b-a17b",
    "qwen3.6-35b-a3b",
    "qwen3-omni-30b-a3b-instruct",
    "qwen3.8-27b",
    "fastest-reasoning",
    "best-for-vision",
  ])
  const actualVision = new Set(SAIA_MODELS.filter((m) => m.input.includes("image")).map((m) => m.id))
  assert.deepEqual([...actualVision].sort(), [...expectedVision].sort(), "vision model set mismatch")
  // Sanity: known non-vision models must not advertise image input.
  for (const id of ["glm-4.7", "meta-llama-3.1-8b-instruct", "deepseek-v4-flash-0731", "qwen3-coder-next"]) {
    assert.ok(!realById.get(id).input.includes("image"), `${id} should not be a vision model`)
  }
})

test("US3: token limits for notable models match the docs", () => {
  assert.equal(realById.get("qwen3.8-2.4t-a95b").contextWindow, 256000)
  assert.equal(realById.get("qwen3.8-2.4t-a95b").maxTokens, 65536)
  assert.equal(realById.get("medgemma-27b-it").contextWindow, 32768)
  assert.equal(realById.get("medgemma-27b-it").maxTokens, 4096)
  assert.equal(realById.get("qwen3-omni-30b-a3b-instruct").contextWindow, 32768)
  assert.equal(realById.get("glm-4.7").contextWindow, 131072)
})

test("US2: every alias resolves to a real model and inherits its capabilities", () => {
  assert.ok(aliasModels.length > 0, "expected alias models in catalog")
  for (const alias of aliasModels) {
    const targetId = alias.name.split("→").pop().trim()
    assert.ok(realById.has(targetId), `alias ${alias.id} points at unknown model ${targetId}`)
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
