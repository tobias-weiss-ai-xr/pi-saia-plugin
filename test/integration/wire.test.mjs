/**
 * Hermetic wire-protocol tests.
 *
 * These spawn a local OpenAI-compatible mock (test/mock-saia-server.mjs) and run
 * the real `pi` binary against it in an isolated agent directory. Nothing here
 * touches the SAIA API, so the suite is deterministic, needs no credentials and
 * no quota, and still asserts the things that only exist on the wire:
 *
 *   - an alias id is rewritten to a real model id before the request leaves pi
 *   - the system prompt is sent as `system`, never `developer` (SAIA 400s)
 *   - `--thinking <level>` becomes a `reasoning_effort` value the model accepts
 *   - $SAIA_BASE_URL is honoured, and the API key reaches the Authorization header
 *
 * The pure invariants behind these (alias table shape, thinking-level maps,
 * base-URL resolution) are in test/unit/provider.test.mjs and run everywhere.
 *
 * Skipped (not failed) when `pi` is not on PATH.
 */

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { SAIA_ALIASES, SAIA_MODELS } from "../../extensions/index.ts"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, "..", "..")
const ENTRY = path.join(REPO_ROOT, "extensions", "index.ts")
const MOCK = path.join(REPO_ROOT, "test", "mock-saia-server.mjs")

const FACTS = JSON.parse(readFileSync(path.join(REPO_ROOT, "data", "saia-models.json"), "utf8"))

/** All `reasoning_effort` values the vendor accepts for a model, per the facts. */
const ACCEPTED_EFFORTS = new Map(
  FACTS.models
    .filter((model) => Array.isArray(model.reasoning?.effort?.values))
    .map((model) => [model.id, new Set(model.reasoning.effort.values)]),
)

const PI_AVAILABLE = spawnSync("pi", ["--version"], { encoding: "utf8" }).status === 0
const skip = PI_AVAILABLE ? false : "the `pi` CLI is not on PATH"

let server
let port
let recordFile
let agentDir

before(async () => {
  if (!PI_AVAILABLE) return

  agentDir = mkdtempSync(path.join(tmpdir(), "saia-agent-"))
  recordFile = path.join(mkdtempSync(path.join(tmpdir(), "saia-wire-")), "requests.jsonl")

  server = spawn(process.execPath, [MOCK, "0", recordFile], { stdio: ["ignore", "pipe", "pipe"] })
  port = await new Promise((resolve, reject) => {
    let buffer = ""
    const timer = setTimeout(() => reject(new Error("mock server did not start")), 10_000)
    server.stdout.on("data", (chunk) => {
      buffer += chunk
      const match = buffer.match(/READY (\d+)/)
      if (match) {
        clearTimeout(timer)
        resolve(Number(match[1]))
      }
    })
    server.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
})

after(() => {
  server?.kill("SIGTERM")
  if (agentDir) rmSync(agentDir, { recursive: true, force: true })
})

/** Run pi against the mock and return every request the mock recorded. */
function runPi(args) {
  // Each test asserts on the requests *it* caused, so start from an empty log.
  writeFileSync(recordFile, "")

  const result = spawnSync("pi", ["-e", ENTRY, ...args], {
    encoding: "utf8",
    timeout: 120_000,
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      // Isolated config dir: no stored credentials, no other installed packages.
      PI_CODING_AGENT_DIR: agentDir,
      PI_OFFLINE: "1",
      SAIA_API_KEY: "hermetic-test-key",
      SAIA_BASE_URL: `http://127.0.0.1:${port}/v1`,
    },
  })

  const requests = existsSync(recordFile)
    ? readFileSync(recordFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []

  return { ...result, requests }
}

function onlyChatRequest(requests) {
  const chat = requests.filter((r) => !r.url.includes("/models"))
  assert.equal(chat.length, 1, `expected exactly one chat request, got ${chat.length}`)
  return chat[0]
}

test("wire: every alias is rewritten to its target model id", { skip }, () => {
  // Every alias, not a sample: pi sends an unrecognised model id straight to the
  // provider, so a typo in the alias table would surface to users as an opaque
  // `404 Model Not Found` rather than a local error.
  for (const [alias, target] of Object.entries(SAIA_ALIASES)) {
    const { requests, stdout } = runPi(["-nt", "--model", `saia/${alias}`, "-p", "hi"])
    const request = onlyChatRequest(requests)

    assert.equal(request.body.model, target, `alias "${alias}" was not rewritten to "${target}"`)
    assert.notEqual(request.body.model, alias, `the alias id "${alias}" must never reach SAIA`)
    assert.match(stdout, /MOCK_OK/, `alias "${alias}" produced no completion`)
  }
})

test("wire: an unknown saia model id reaches the provider unchanged", { skip }, () => {
  // Documents the failure mode this plugin cannot prevent: pi does not validate
  // model ids against the registry, so a retired id is forwarded verbatim and
  // SAIA answers 404 instead of pi reporting "unknown model".
  const { requests } = runPi(["-nt", "--model", "saia/glm-4.7", "-p", "hi"])
  const request = onlyChatRequest(requests)
  assert.equal(request.body.model, "glm-4.7")
})

test("wire: the system prompt is sent as `system`, never `developer`", { skip }, () => {
  // SAIA answers `400 {"message":"Unexpected message role."}` for the OpenAI
  // `developer` role, which pi sends when a model does not declare
  // compat.supportsDeveloperRole=false.
  for (const modelId of ["qwen3-coder-next", "qwen3.5-397b-a17b", "qwen3.6-35b-a3b"]) {
    const { requests } = runPi(["-nt", "--model", `saia/${modelId}`, "-p", "hi"])
    const request = onlyChatRequest(requests)
    const roles = request.body.messages.map((message) => message.role)

    assert.ok(roles.includes("system"), `${modelId}: expected a system message, got roles: ${roles.join(", ")}`)
    assert.ok(
      !roles.includes("developer"),
      `${modelId}: SAIA rejects the OpenAI \`developer\` role with 400 — compat.supportsDeveloperRole must stay false`,
    )
  }
})

test("wire: the API key env reference reaches the Authorization header", { skip }, () => {
  const { requests } = runPi(["-nt", "--model", "saia/qwen3-coder-next", "-p", "hi"])
  const request = onlyChatRequest(requests)
  assert.equal(request.headers.authorization, "Bearer hermetic-test-key")
})

test("wire: --thinking sends a reasoning_effort the vendor accepts", { skip }, () => {
  // The regression this guards: openai-gpt-oss-120b rejects `minimal` with
  // `400 ... reasoning_effort='minimal' is not supported by Harmony`, and pi's
  // default mapping sends exactly that. A curated thinkingLevelMap fixes it, so
  // assert the *sent* value is in the vendor's set for every pi level.
  const modelId = "openai-gpt-oss-120b"
  const accepted = ACCEPTED_EFFORTS.get(modelId)
  assert.ok(accepted, `${modelId} should have curated effort values in data/saia-models.json`)

  for (const level of ["minimal", "low", "medium", "high", "xhigh", "max"]) {
    const { requests } = runPi(["-nt", "--thinking", level, "--model", `saia/${modelId}`, "-p", "hi"])
    const request = onlyChatRequest(requests)

    assert.equal(request.body.model, modelId)
    assert.ok(
      accepted.has(request.body.reasoning_effort),
      `--thinking ${level} sent reasoning_effort=${JSON.stringify(request.body.reasoning_effort)}, ` +
        `which ${modelId} rejects; accepted: ${[...accepted].join(", ")}`,
    )
  }
})

test("wire: --thinking max reaches a model that supports max", { skip }, () => {
  // Without a map, pi clamps xhigh/max down to "high", which makes maximum
  // effort unreachable through the plugin even though the vendor supports it.
  const modelId = "glm-5.3-flash"
  const { requests } = runPi(["-nt", "--thinking", "max", "--model", `saia/${modelId}`, "-p", "hi"])
  const request = onlyChatRequest(requests)

  assert.equal(request.body.reasoning_effort, "max", `${modelId} should be able to run at max effort`)
  assert.ok(ACCEPTED_EFFORTS.get(modelId).has("max"), "the facts should list max as accepted")
})

test("wire: a non-reasoning model never receives reasoning_effort", { skip }, () => {
  const nonReasoning = SAIA_MODELS.find((model) => !model.reasoning && !SAIA_ALIASES[model.id])
  assert.ok(nonReasoning, "expected at least one non-reasoning model")

  const { requests } = runPi(["-nt", "--thinking", "high", "--model", `saia/${nonReasoning.id}`, "-p", "hi"])
  const request = onlyChatRequest(requests)

  assert.equal(request.body.reasoning_effort, undefined)
  assert.equal(request.body.model, nonReasoning.id)
})
