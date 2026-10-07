// pi SAIA Plugin (LEGACY / FROZEN — not loaded by pi >= 0.84)
//
// This module targets the retired OpenCode config layout
// (~/.config/pi/pi.json + provider.<id>.npm = @ai-sdk/openai-compatible),
// which a modern pi never reads. The supported provider registration lives in
// ../extensions/index.ts.
//
// It is kept because its helpers are unit-tested, and every capability/limit
// below is derived from the shared catalog (../extensions/index.ts) rather
// than from a second, divergent copy of the model list. See KNOWN_ISSUES.md.

import path from "node:path"
import os from "node:os"
import fs from "node:fs/promises"

import * as memory from "./saia-memory.js"
import { SAIA_ALIASES, SAIA_MODELS } from "../extensions/index.ts"

// Configuration paths
const CONFIG = path.join(os.homedir(), ".config", "pi", "pi.json")
const PLUGIN_DIR = path.join(os.homedir(), ".config", "pi", "plugins", "saia")
const PLUGIN_CONFIG = path.join(PLUGIN_DIR, "pi-saia.json")

// API configuration
const DEFAULT_ENDPOINT = "https://chat-ai.academiccloud.de/v1/models"
const SAIA_API_KEY = process.env.SAIA_API_KEY || process.env.PI_SAIA_API_KEY

// Default permissions for SAIA plugin
export const PERMISSIONS: Record<string, "allow" | "ask" | "deny"> = {
  bash: "allow",
  edit: "allow",
  read: "allow",
  grep: "allow",
  glob: "allow",
  lsp: "allow",
  skill: "allow",
  task: "allow",
  webfetch: "allow",
  websearch: "allow",
  question: "allow",
  external_directory: "ask",
  doom_loop: "ask",
}

// ---------------------------------------------------------------------------
// Model categories
// ---------------------------------------------------------------------------

const CATEGORY_REASONING = "reasoning"
const CATEGORY_AGENTIC = "agentic"
const CATEGORY_CODER = "coder"
const CATEGORY_LARGE_CONTEXT = "large-context"
const CATEGORY_MEDICAL = "medical"
const CATEGORY_VISION = "vision"
const CATEGORY_GENERAL = "general"

// ---------------------------------------------------------------------------
// Category lookup (from live API, synced 2025-08-13)
// ---------------------------------------------------------------------------

export function categorizeModel(modelId: string): string {
  // reasoning set mirrors data/saia-models.json (collector output)
  const REASONING = [
    "deepseek-v4-flash-0731", "openai-gpt-oss-120b",
    "qwen3.5-397b-a17b", "qwen3.6-35b-a3b", "qwen3.8-27b",
  ]
  const AGENTIC = [
    "devstral-2-123b-instruct-2512", "mistral-medium-3.5-128b", "glm-5.3-flash",
  ]
  const CODER = ["qwen3-coder-next"]
  const LARGE_CONTEXT = ["openai-gpt-oss-120b"]
  const VISION = ["gemma-4-31b-it", "qwen3-omni-30b-a3b-instruct"]

  if (REASONING.includes(modelId)) return CATEGORY_REASONING
  if (AGENTIC.includes(modelId)) return CATEGORY_AGENTIC
  if (CODER.includes(modelId)) return CATEGORY_CODER
  if (LARGE_CONTEXT.includes(modelId)) return CATEGORY_LARGE_CONTEXT
  if (VISION.includes(modelId)) return CATEGORY_VISION
  return CATEGORY_GENERAL
}

// ---------------------------------------------------------------------------
// Capabilities (from live API input/output modalities)
// ---------------------------------------------------------------------------

export function canReason(modelId: string): boolean {
  return [
    "deepseek-v4-flash-0731", "glm-5.3-flash", "openai-gpt-oss-120b",
    "qwen3.5-397b-a17b", "qwen3.6-35b-a3b", "qwen3.8-27b",
  ].includes(modelId)
}

export function supportsAttachment(modelId: string): boolean {
  return [
    "gemma-4-31b-it", "glm-5.3-flash", "qwen3.5-397b-a17b",
    "qwen3.6-35b-a3b", "qwen3-omni-30b-a3b-instruct",
  ].includes(modelId)
}

// ---------------------------------------------------------------------------
// Token limits (from live API / documentation)
// ---------------------------------------------------------------------------

// Context windows mirror data/saia-models.json (GWDG docs values);
// 128k is the conservative default for models not yet synced.
const CONTEXT_WINDOWS: Record<string, number> = {
  "apertus-70b-instruct-2509": 65_000,
  "deepseek-v4-flash-0731": 1_000_000,
  "devstral-2-123b-instruct-2512": 256_000,
  "gemma-4-31b-it": 256_000,
  "glm-5.3-flash": 1_000_000,
  "meta-llama-3.1-8b-instruct": 128_000,
  "mistral-medium-3.5-128b": 256_000,
  "openai-gpt-oss-120b": 128_000,
  "qwen3-30b-a3b-instruct-2507": 256_000,
  "qwen3-coder-next": 256_000,
  "qwen3-omni-30b-a3b-instruct": 256_000,
  "qwen3.5-397b-a17b": 256_000,
  "qwen3.6-35b-a3b": 262_000,
  "qwen3.8-27b": 262_000,
}

export function getContextWindow(modelId: string): number {
  return CONTEXT_WINDOWS[modelId] ?? 128_000
}

export function getOutputWindow(modelId: string): number {
  const LARGE = ["deepseek-v4-flash-0731", "glm-5.3-flash", "qwen3.5-397b-a17b"]
  const MEDIUM = [
    "apertus-70b-instruct-2509", "devstral-2-123b-instruct-2512",
    "qwen3-30b-a3b-instruct-2507", "qwen3.6-35b-a3b", "qwen3.8-27b",
    "qwen3-coder-next", "qwen3-omni-30b-a3b-instruct",
  ]
  if (LARGE.includes(modelId)) return 32_768
  if (MEDIUM.includes(modelId)) return 16_384
  return 8_192
}

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

export function getModelDescription(modelId: string): string {
  const descriptions: Record<string, string> = {
    "qwen3.5-397b-a17b": "Qwen3.5 397B MoE — Flagship reasoning, best quality",

    "qwen3-30b-a3b-instruct-2507": "Qwen3 30B Instruct — General reasoning",
    "devstral-2-123b-instruct-2512": "DevStral 2 123B — Mistral's agentic coder",
    "mistral-medium-3.5-128b": "Mistral Medium 3.5 128B — Strong generalist",
    "qwen3.6-35b-a3b": "Qwen3.6 35B MoE — Agentic coding with vision",
    "qwen3-coder-next": "Qwen3 Coder Next — Code-specialized",
    "openai-gpt-oss-120b": "GPT-OSS 120B — Large context model",

    "qwen3-omni-30b-a3b-instruct": "Qwen3 Omni 30B — Multimodal (text+image+audio)",
    "deepseek-v4-flash-0731": "DeepSeek V4 Flash — Fast, lightweight",
    "gemma-4-31b-it": "Gemma 4 31B — Google latest",
    "apertus-70b-instruct-2509": "Apertus 70B — Open-source instruct",
    "meta-llama-3.1-8b-instruct": "Llama 3.1 8B — Fast, lightweight",
    "glm-5.3-flash": "GLM 5.3 Flash — Fast agentic flagship, vision",
    "qwen3.8-27b": "Qwen3.8 27B — Efficient reasoning",
  }
  return descriptions[modelId] || modelId
}

// ---------------------------------------------------------------------------
// Metadata builder
// ---------------------------------------------------------------------------

export function getModelMetadata(modelId: string): Record<string, any> {
  const metadata: Record<string, any> = {
    name: modelId,
    category: categorizeModel(modelId),
    description: getModelDescription(modelId),
    limit: {
      context: getContextWindow(modelId),
      output: getOutputWindow(modelId),
    },
  }
  if (canReason(modelId)) metadata.can_reason = true
  if (supportsAttachment(modelId)) metadata.attachment = true
  return metadata
}

// ---------------------------------------------------------------------------
// Aliases (updated to use current API models only)
// ---------------------------------------------------------------------------

// Re-exported from the generated provider so the two copies cannot drift. They
// had already diverged on three of eight aliases (best-for-agentic,
// best-for-vision, budget), which meant a user reading the legacy OpenCode
// surface was told a different model than pi actually sends.
export const ALIASES: Record<string, string> = SAIA_ALIASES

// ---------------------------------------------------------------------------
// Profile defaults (updated to use current API models only)
// ---------------------------------------------------------------------------

export function getProfileDefaultModel(profile: string): string {
  switch (profile) {
    case "production":
      return "deepseek-v4-flash-0731"
    case "development":
    case "dev":
      return "qwen3.6-35b-a3b"
    case "budget":
      return "meta-llama-3.1-8b-instruct"
    default:
      return "deepseek-v4-flash-0731"
  }
}

export function includeInProfile(modelId: string, profile: string): boolean {
  switch (profile) {
    case "production":
      // All 16 models
      return true
    case "development":
    case "dev":
      // Smaller/faster subset
      return [
        "qwen3.6-35b-a3b", "qwen3-coder-next", "glm-5.3-flash",
        "deepseek-v4-flash-0731", "qwen3-30b-a3b-instruct-2507",
        "gemma-4-31b-it", "meta-llama-3.1-8b-instruct", "apertus-70b-instruct-2509",
      ].includes(modelId)
    case "budget":
      return [
        "meta-llama-3.1-8b-instruct", "deepseek-v4-flash-0731",
        "gemma-4-31b-it",
      ].includes(modelId)
    default:
      return true
  }
}

// ---------------------------------------------------------------------------
// Main plugin entry point
// ---------------------------------------------------------------------------

export default async (pi: any) => {
  const pluginName = "saia"

  // Ensure plugin directory exists
  const pluginDir = path.join(os.homedir(), ".config", "pi", "plugins", pluginName)
  await fs.mkdir(pluginDir, { recursive: true }).catch(() => {})

  // Refresh SAIA config on startup
  refreshSaiaConfig(pi).catch((err: unknown) => {
    console.error("[SAIA Plugin] Initialization error:", err)
  })

  // Register commands
  if (pi.registerCommand) {
    pi.registerCommand("refresh-saia-models", {
      description: "Manually refresh SAIA model list from API",
      handler: async () => {
        await refreshSaiaConfig(pi, true)
        console.log("SAIA models refreshed successfully")
      },
    })

    pi.registerCommand("list-saia-models", {
      description: "List all available SAIA models",
      handler: async () => {
        console.log(await listModels())
      },
    })

    pi.registerCommand("saia-set-profile", {
      description: "Switch SAIA profile (production, development, budget)",
      handler: async (args: string) => {
        const profile = args.trim()
        if (!["production", "development", "dev", "budget"].includes(profile)) {
          console.log(`Invalid profile: ${profile}. Valid: production, development, dev, budget`)
          return
        }
        process.env.SAIA_PROFILE = profile
        await refreshSaiaConfig(pi, true)
        await memory.setPreferences({ defaultProfile: profile })
        console.log(`Switched to ${profile} profile and refreshed models`)
      },
    })

    pi.registerCommand("saia-usage", {
      description: "Show SAIA usage statistics",
      handler: async () => {
        const stats = await memory.getUsageStats()
        console.log(JSON.stringify(stats, null, 2))
      },
    })
  }

  console.log(`[SAIA Plugin] Loaded successfully`)

  return {
    name: pluginName,
    permissions: PERMISSIONS,
    config: {
      provider: "saia",
      description: "SAIA (Academic Cloud Hessen) integration for pi",
    },
  }
}

// ---------------------------------------------------------------------------
// Model listing
// ---------------------------------------------------------------------------

async function listModels(): Promise<string> {
  try {
    const { data } = await memory.fetchWithCache(fetchModels)
    const modelIds = data.data.map((m: { id: string }) => m.id).sort()

    const filteredModels = modelIds.filter((id: string) =>
      includeInProfile(id, process.env.SAIA_PROFILE || "production")
    )

    if (filteredModels.length === 0) return "No models available"

    let output = `**Available SAIA Models (${filteredModels.length} total):**\n\n`

    // Group by category
    const categories: Record<string, string[]> = {}
    for (const id of filteredModels) {
      const cat = categorizeModel(id)
      if (!categories[cat]) categories[cat] = []
      categories[cat].push(id)
    }

    for (const [category, models] of Object.entries(categories)) {
      output += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n`
      for (const model of models) {
        const reason = canReason(model) ? " [reasoning]" : ""
        const attach = supportsAttachment(model) ? " [vision]" : ""
        output += `- \`${model}\`${reason}${attach}\n`
      }
      output += "\n"
    }

    output += "**Aliases:**\n"
    for (const [alias, target] of Object.entries(ALIASES)) {
      if (filteredModels.includes(target)) {
        output += `- \`${alias}\` → \`${target}\`\n`
      }
    }

    output += "\n**Rate Limits:** 30 req/min · 200/hour · 1,000/day · 3,000/month\n"

    return output
  } catch (err) {
    return `Error listing models: ${err}`
  }
}

// ---------------------------------------------------------------------------
// Fetch from API
// ---------------------------------------------------------------------------

async function fetchModels(endpoint?: string): Promise<{ data: Array<{ id: string }> }> {
  const apiKey = process.env.SAIA_API_KEY || SAIA_API_KEY
  if (!apiKey) {
    throw new Error("SAIA_API_KEY environment variable not set")
  }

  const url = endpoint || DEFAULT_ENDPOINT

  const startTime = Date.now()
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30000),
  })
  const latencyMs = Date.now() - startTime

  if (!res.ok) {
    await memory.updateMetrics("api", false, latencyMs)
    throw new Error(`SAIA API returned ${res.status}: ${res.statusText}`)
  }

  await memory.updateMetrics("api", true, latencyMs)
  const json = (await res.json()) as unknown as { data: Array<{ id: string }> }
  return json
}

// ---------------------------------------------------------------------------
// Config refresh
// ---------------------------------------------------------------------------

async function refreshSaiaConfig(pi: any, forceRefresh = false) {
  const profile = process.env.SAIA_PROFILE || "production"
  const startTime = Date.now()

  const apiEndpoint = process.env.LITELLM_PROXY_URL || undefined

  let result
  try {
    result = await memory.fetchWithCache(() => fetchModels(apiEndpoint), forceRefresh)
    await memory.updateMetrics("refresh", true, Date.now() - startTime)
  } catch (err) {
    await memory.updateMetrics("refresh", false, Date.now() - startTime)
    console.error("[SAIA] Config refresh failed:", err instanceof Error ? err.message : err)
    return
  }

  if (result.cached) {
    console.log("[SAIA] Using cached model list")
  }

  const { data } = result.data
  const modelIds = data.map((m: { id: string }) => m.id).sort()

  if (modelIds.length === 0) {
    console.warn("[SAIA] No models available from API")
    return
  }

  // Filter models based on profile
  const profileModels = modelIds.filter((id: string) => includeInProfile(id, profile))

  // Generate plugin config
  const pluginConfig: Record<string, any> = {
    $schema: "https://pi.code/config.json",
    permission: { ...PERMISSIONS },
    provider: {
      saia: {
        npm: "@ai-sdk/openai-compatible",
        name: "SAIA (Academic Cloud Hessen)",
        options: {
          baseURL: "https://chat-ai.academiccloud.de/v1",
          apiKey: "{env:SAIA_API_KEY}",
        },
        models: {},
      },
    },
  }

  // Add models to config
  for (const modelId of profileModels) {
    const metadata = getModelMetadata(modelId)
    delete (metadata as Record<string, unknown>).name
    pluginConfig.provider.saia.models[modelId] = metadata
  }

  // Add aliases
  for (const [aliasName, aliasTarget] of Object.entries(ALIASES)) {
    if (profileModels.includes(aliasTarget)) {
      pluginConfig.provider.saia.models[aliasName] = {
        name: `Alias for ${aliasTarget}`,
        alias: true,
        options: {
          "enable-tools": true,
          "enable-auto-tool-choice": true,
          "tool-call-parser": "openai",
        },
      }
    }
  }

  // Set default model
  const defaultModel = getProfileDefaultModel(profile)
  if (profileModels.includes(defaultModel)) {
    pluginConfig.model = `saia/${defaultModel}`
  } else if (profileModels.length > 0) {
    pluginConfig.model = `saia/${profileModels[0]}`
  }

  pluginConfig.last_updated = new Date().toISOString()

  // Write plugin config
  const tmp = PLUGIN_CONFIG + ".tmp"
  await fs.writeFile(tmp, JSON.stringify(pluginConfig, null, 2))
  await fs.rename(tmp, PLUGIN_CONFIG)

  console.log(`[SAIA] Config refreshed: ${profileModels.length} models (${result.cached ? "from cache" : "fresh"})`)
  console.log(`[SAIA] Default model: ${pluginConfig.model}`)

  // Log to pi if available
  if (pi?.log) {
    try {
      await pi.log({
        level: "info",
        message: `SAIA plugin: refreshed ${profileModels.length} models`,
        data: { cached: result.cached, profile, modelCount: profileModels.length },
      })
    } catch {
      // Ignore logging errors
    }
  }
}
