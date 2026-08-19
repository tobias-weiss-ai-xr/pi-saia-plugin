/**
 * pi-saia-plugin: SAIA (Academic Cloud Hessen) provider registration.
 *
 * Registers the SAIA provider with all 16 models from the live SAIA API.
 * API key is read from auth.json (key: "saia"), $SAIA_API_KEY, or /login saia.
 *
 * Install: pi install /path/to/pi-saia-plugin
 * Reload:  /reload
 */

import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Model catalog — synced with live SAIA API on 2025-08-13
// ---------------------------------------------------------------------------

const SAIA_MODELS: ProviderModelConfig[] = [
  // ── Reasoning ────────────────────────────────────────────────────────
  {
    id: "qwen3.8-2.4t-a95b",
    name: "Qwen 3.8 2.4T A95B (SAIA)",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256_000,
    maxTokens: 65_536,
  },
  {
    id: "qwen3.5-397b-a17b",
    name: "Qwen 3.5 397B (SAIA)",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 32_768,
  },
  {
    id: "qwen3.5-122b-a10b",
    name: "Qwen 3.5 122B (SAIA)",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 32_768,
  },
  {
    id: "qwen3-30b-a3b-instruct-2507",
    name: "Qwen 3 30B (SAIA)",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 16_384,
  },

  // ── Agentic ──────────────────────────────────────────────────────────
  {
    id: "devstral-2-123b-instruct-2512",
    name: "DevStral 2 123B (SAIA)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 16_384,
  },
  {
    id: "mistral-medium-3.5-128b",
    name: "Mistral Medium 3.5 128B (SAIA)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 8_192,
  },
  {
    id: "qwen3.6-35b-a3b",
    name: "Qwen 3.6 35B (SAIA)",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 16_384,
  },

  // ── Coder ─────────────────────────────────────────────────────────────
  {
    id: "qwen3-coder-next",
    name: "Qwen 3 Coder Next (SAIA)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 16_384,
  },

  // ── Large Context ─────────────────────────────────────────────────────
  {
    id: "openai-gpt-oss-120b",
    name: "GPT-OSS 120B (SAIA)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 8_192,
  },

  // ── Medical ─────────────────────────────────────────────────────────
  {
    id: "medgemma-27b-it",
    name: "MedGemma 27B (SAIA)",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_768,
    maxTokens: 4_096,
  },

  // ── Vision ───────────────────────────────────────────────────────────
  {
    id: "qwen3-omni-30b-a3b-instruct",
    name: "Qwen 3 Omni 30B (SAIA)",
    reasoning: false,
    input: ["text", "image", "audio"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_768,
    maxTokens: 4_096,
  },

  // ── General ───────────────────────────────────────────────────────────
  {
    id: "qwen3.8-27b",
    name: "Qwen 3.8 27B (SAIA)",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 32_768,
  },
  {
    id: "deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash (SAIA)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 16_384,
  },
  {
    id: "qwen3.6-27b",
    name: "Qwen 3.6 27B (SAIA)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 16_384,
  },
  {
    id: "gemma-4-31b-it",
    name: "Gemma 4 31B (SAIA)",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 8_192,
  },
  {
    id: "apertus-70b-instruct-2509",
    name: "Apertus 70B (SAIA)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 8_192,
  },
  {
    id: "meta-llama-3.1-8b-instruct",
    name: "Meta Llama 3.1 8B (SAIA)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 4_096,
  },
  {
    id: "glm-4.7",
    name: "GLM 4.7 (SAIA)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 16_384,
  },
];

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.registerProvider("saia", {
    name: "SAIA Academic Cloud",
    baseUrl: "https://chat-ai.academiccloud.de/v1",
    apiKey: "$SAIA_API_KEY",
    api: "openai-completions",
    models: SAIA_MODELS,
  });
}
