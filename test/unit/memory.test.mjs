// Epic SAIA-MEMORY: the memory-layer helpers used by the pi plugin behave
// correctly for model recommendation and (opt-in) cache / change detection.
//
// User stories covered:
//   US9  As a user I want the recommended model to default sensibly to glm-4.7
//        when no preference is stored, so first-run experience is predictable.
//   US10 As an operator I want the model cache and new-model detection to reuse
//        the SAIA API correctly (integration, opt-in).

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { getRecommendedModel, fetchWithCache, checkForNewModels } from "../../src/saia-memory.ts"

const RUN_INTEGRATION = process.env.SAIA_RUN_INTEGRATION === "1" && Boolean(process.env.SAIA_API_KEY)
const SAIA_CACHE_FILE = path.join(os.homedir(), ".cache", "saia", "models.json")
const SAIA_MODELS_LIST_FILE = path.join(os.homedir(), ".cache", "saia", "pi-models-list.json")

test("US9: recommends glm-5.3-flash when available and no preference is set", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "saia-rec-"))
  const cwd = process.cwd()
  try {
    process.chdir(dir) // no .pi/saia/context.json -> empty context
    assert.equal(await getRecommendedModel(["glm-5.3-flash", "qwen3-coder-next"]), "glm-5.3-flash")
  } finally {
    process.chdir(cwd)
  }
})

test("US9: falls back to the default model, else the first available", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "saia-rec-"))
  const cwd = process.cwd()
  try {
    process.chdir(dir)
    // The default model wins wherever it appears in the list.
    assert.equal(
      await getRecommendedModel(["gemma-4-31b-it", "deepseek-v4-flash-0731"]),
      "deepseek-v4-flash-0731",
    )
    // Default absent -> first available model wins.
    assert.equal(await getRecommendedModel(["qwen3-coder-next", "gemma-4-31b-it"]), "qwen3-coder-next")
  } finally {
    process.chdir(cwd)
  }
})

test("US9: returns 'unknown' when no models are available", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "saia-rec-"))
  const cwd = process.cwd()
  try {
    process.chdir(dir)
    assert.equal(await getRecommendedModel([]), "unknown")
  } finally {
    process.chdir(cwd)
  }
})

// --- Opt-in integration tests: touch the real SAIA API / local cache ----------
// Enabled with: SAIA_RUN_INTEGRATION=1 SAIA_API_KEY=... npm test
// They self-clean the cache files they create.

test("US10: fetchWithCache invokes the fetcher and returns fresh data", async function () {
  if (!RUN_INTEGRATION) this.skip()
  let calls = 0
  const result = await fetchWithCache(async () => {
    calls += 1
    return { hello: "world" }
  }, true)
  assert.equal(calls, 1)
  assert.equal(result.cached, false)
  assert.deepEqual(result.data, { hello: "world" })
})

test("US10: checkForNewModels talks to the SAIA API without throwing", async function () {
  if (!RUN_INTEGRATION) this.skip()
  const diff = await checkForNewModels()
  assert.ok(Array.isArray(diff.added))
  assert.ok(Array.isArray(diff.removed))
})

test.after(async () => {
  if (!RUN_INTEGRATION) return
  // Clean up cache artifacts written by the integration tests above.
  for (const file of [SAIA_CACHE_FILE, SAIA_MODELS_LIST_FILE]) {
    await rm(file, { force: true }).catch(() => {})
  }
})
