// Epic SAIA-LEGACY: the legacy pi plugin entry point (src/saia.ts) keeps its
// categorization / capability / profile logic internally consistent and in sync
// with the primary provider catalog.
//
// User stories covered:
//   US5  As a maintainer I want model categorization (reasoning/agentic/coder/
//        vision/medical/large-context/general) to be deterministic, so the
//        generated config groups models correctly.
//   US6  As a maintainer I want canReason()/supportsAttachment() capability
//        flags to be consistent with categorizeModel(), so the documentation
//        never lies about a model's abilities.
//   US7  As a user I want profile selection (production/dev/budget) to filter
//        models predictably, so `SAIA_PROFILE` switches the available set.
//   US8  As a user I want aliases to resolve to real model ids, so legacy
//        refresh never references a non-existent model.

import assert from "node:assert/strict"
import test from "node:test"
import {
  ALIASES,
  canReason,
  categorizeModel,
  getContextWindow,
  getModelDescription,
  getModelMetadata,
  getOutputWindow,
  getProfileDefaultModel,
  includeInProfile,
  supportsAttachment,
} from "../../src/saia.ts"
import { SAIA_ALIASES } from "../../extensions/index.ts"

const REAL_MODEL_IDS = [
  "apertus-70b-instruct-2509",
  "deepseek-v4-flash-0731",
  "devstral-2-123b-instruct-2512",
  "gemma-4-31b-it",
  "glm-5.3-flash",
  "meta-llama-3.1-8b-instruct",
  "mistral-medium-3.5-128b",
  "openai-gpt-oss-120b",
  "qwen3-30b-a3b-instruct-2507",
  "qwen3-coder-next",
  "qwen3-omni-30b-a3b-instruct",
  "qwen3.5-397b-a17b",
  "qwen3.6-35b-a3b",
  "qwen3.8-27b",
]

const VALID_CATEGORIES = new Set([
  "reasoning",
  "agentic",
  "coder",
  "large-context",
  "medical",
  "vision",
  "general",
])

test("US5: categorizeModel returns a valid category for every known model", () => {
  for (const id of REAL_MODEL_IDS) {
    const category = categorizeModel(id)
    assert.ok(VALID_CATEGORIES.has(category), `${id} categorized as unknown '${category}'`)
  }
  assert.equal(categorizeModel("meta-llama-3.1-8b-instruct"), "general")
  assert.equal(categorizeModel("devstral-2-123b-instruct-2512"), "agentic")
  assert.equal(categorizeModel("qwen3-coder-next"), "coder")
  assert.equal(categorizeModel("qwen3-omni-30b-a3b-instruct"), "vision")
  assert.equal(categorizeModel("qwen3-30b-a3b-instruct-2507"), "general")
})

test("US6: capability flags are consistent with categorization", () => {
  // Reasoning models must be flagged; category is taste (glm-5.3-flash is the
  // agentic flagship, so it categorizes as agentic while still reasoning).
  for (const id of ["qwen3.5-397b-a17b", "qwen3.8-27b"]) {
    assert.equal(canReason(id), true, `${id} should be a reasoning model`)
    assert.equal(categorizeModel(id), "reasoning")
  }
  assert.equal(canReason("glm-5.3-flash"), true)
  assert.equal(categorizeModel("glm-5.3-flash"), "agentic")
  // Non-reasoning models must not be flagged.
  for (const id of ["meta-llama-3.1-8b-instruct", "qwen3-coder-next", "devstral-2-123b-instruct-2512", "gemma-4-31b-it"]) {
    assert.equal(canReason(id), false, `${id} must not be a reasoning model`)
  }
  // Vision/attachment flags for representative models.
  for (const id of [
    "gemma-4-31b-it",
    "glm-5.3-flash",
    "qwen3-omni-30b-a3b-instruct",
    "qwen3.6-35b-a3b",
    "qwen3.5-397b-a17b",
  ]) {
    assert.equal(supportsAttachment(id), true, `${id} should support attachment`)
  }
  for (const id of ["meta-llama-3.1-8b-instruct", "deepseek-v4-flash-0731", "qwen3-coder-next", "openai-gpt-oss-120b"]) {
    assert.equal(supportsAttachment(id), false, `${id} should not support attachment`)
  }
})

test("US5/US6: getModelMetadata encodes category, limits and flags", () => {
  const glm = getModelMetadata("glm-5.3-flash")
  assert.equal(glm.category, "agentic")
  assert.equal(glm.limit.context, 1_000_000)
  assert.equal(glm.limit.output, 32768)
  assert.equal(glm.can_reason, true)
  assert.equal(glm.attachment, true)

  const reasoning = getModelMetadata("qwen3.5-397b-a17b")
  assert.equal(reasoning.category, "reasoning")
  assert.equal(reasoning.can_reason, true)
  assert.equal(reasoning.attachment, true)
  assert.equal(typeof getModelDescription("glm-5.3-flash"), "string")
})

test("US7: profile default model and inclusion filter behave predictably", () => {
  assert.equal(getProfileDefaultModel("production"), "deepseek-v4-flash-0731")
  assert.equal(getProfileDefaultModel("development"), "qwen3.6-35b-a3b")
  assert.equal(getProfileDefaultModel("dev"), "qwen3.6-35b-a3b")
  assert.equal(getProfileDefaultModel("budget"), "meta-llama-3.1-8b-instruct")
  assert.equal(getProfileDefaultModel("unknown"), "deepseek-v4-flash-0731")

  // Production includes everything.
  for (const id of REAL_MODEL_IDS) {
    assert.equal(includeInProfile(id, "production"), true, `${id} should be in production`)
  }
  // Budget is a strict subset.
  const budgetIncluded = REAL_MODEL_IDS.filter((id) => includeInProfile(id, "budget"))
  assert.ok(budgetIncluded.length > 0 && budgetIncluded.length < REAL_MODEL_IDS.length)
  assert.ok(budgetIncluded.includes("meta-llama-3.1-8b-instruct"))
  assert.ok(budgetIncluded.includes("deepseek-v4-flash-0731"))
  assert.ok(!budgetIncluded.includes("qwen3.8-2.4t-a95b"))
})

test("US8: the legacy alias map is the one the extension ships", () => {
  const known = new Set(REAL_MODEL_IDS)
  for (const [alias, target] of Object.entries(ALIASES)) {
    assert.ok(typeof alias === "string" && alias.length > 0, "alias key must be non-empty")
    assert.ok(known.has(target), `alias ${alias} -> unknown model ${target}`)
  }
  // Two hand-maintained copies of the alias table drifted apart on three of
  // eight aliases (best-for-agentic, best-for-vision, budget) and the legacy one
  // was missing fastest-reasoning entirely. src/saia.ts re-exports the shipped
  // map now; this is the assertion that keeps it that way.
  assert.deepEqual(ALIASES, SAIA_ALIASES, "legacy ALIASES drifted from extensions/index.ts")
  assert.equal(ALIASES["best-for-coding"], "qwen3-coder-next")
  assert.equal(ALIASES["budget"], "deepseek-v4-flash-0731")
})

test("token limit helpers return documented buckets (per data/saia-models.json)", () => {
  assert.equal(getContextWindow("glm-5.3-flash"), 1_000_000)
  assert.equal(getContextWindow("qwen3.6-35b-a3b"), 262_000)
  assert.equal(getContextWindow("apertus-70b-instruct-2509"), 65_000)
  // unknown models get a conservative 128k, never a guess
  assert.equal(getContextWindow("brand-new-model"), 128_000)
  assert.equal(getOutputWindow("qwen3.5-397b-a17b"), 32768)
  assert.equal(getOutputWindow("qwen3-coder-next"), 16384)
  assert.equal(getOutputWindow("gemma-4-31b-it"), 8192)
})
