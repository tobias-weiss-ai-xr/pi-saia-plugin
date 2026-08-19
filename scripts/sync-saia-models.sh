#!/usr/bin/env bash
set -euo pipefail

# SAIA Models Sync Script for pi-saia-plugin
# Fetches latest models from SAIA API and updates extensions/index.ts
# Run this periodically to keep the plugin in sync with SAIA

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
EXTENSIONS_FILE="$PLUGIN_DIR/extensions/index.ts"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# API configuration
SAIA_API_KEY="${SAIA_API_KEY:-}"
API_BASE_URL="${SAIA_API_URL:-https://chat-ai.academiccloud.de/v1}"

# Check for API key
if [[ -z "$SAIA_API_KEY" ]]; then
    print_error "SAIA_API_KEY environment variable not set"
    print_info "Set it with: export SAIA_API_KEY=your_key"
    print_info "Or use: /login saia in pi"
    exit 1
fi

print_info "Fetching latest SAIA models from $API_BASE_URL..."

# Fetch models from API
MODELS_JSON=$(curl -s --max-time 30 "$API_BASE_URL/models" \
    -H "Authorization: Bearer $SAIA_API_KEY")

if [[ -z "$MODELS_JSON" ]] || ! echo "$MODELS_JSON" | jq -e '.data' >/dev/null 2>&1; then
    print_error "Failed to fetch models from SAIA API"
    print_info "Response: $MODELS_JSON"
    exit 1
fi

MODEL_COUNT=$(echo "$MODELS_JSON" | jq -r '.data | length')
print_info "Found $MODEL_COUNT models from SAIA API"

# Model metadata (curated knowledge)
# Format: id|reasoning|input_types|context|max_tokens|description
declare -A MODEL_METADATA=(
    # Reasoning models
    ["qwen3.8-2.4t-a95b"]="true|text|256000|65536|Qwen 3.8 2.4T A95B (SAIA)"
    ["qwen3.5-397b-a17b"]="true|text,image|131072|32768|Qwen 3.5 397B (SAIA)"
    ["qwen3.5-122b-a10b"]="true|text,image|131072|32768|Qwen 3.5 122B (SAIA)"
    ["qwen3-30b-a3b-instruct-2507"]="true|text|131072|16384|Qwen 3 30B (SAIA)"
    
    # Agentic models
    ["devstral-2-123b-instruct-2512"]="false|text|131072|16384|DevStral 2 123B (SAIA)"
    ["mistral-medium-3.5-128b"]="false|text|131072|8192|Mistral Medium 3.5 128B (SAIA)"
    ["qwen3.6-35b-a3b"]="false|text,image|131072|16384|Qwen 3.6 35B (SAIA)"
    
    # Coder
    ["qwen3-coder-next"]="false|text|131072|16384|Qwen 3 Coder Next (SAIA)"
    
    # Large Context
    ["openai-gpt-oss-120b"]="false|text|131072|8192|GPT-OSS 120B (SAIA)"
    
    # Medical
    ["medgemma-27b-it"]="false|text,image|32768|4096|MedGemma 27B (SAIA)"
    
    # Vision
    ["qwen3-omni-30b-a3b-instruct"]="false|text,image|32768|4096|Qwen 3 Omni 30B (SAIA)"
    
    # General
    ["qwen3.8-27b"]="false|text,image|131072|32768|Qwen 3.8 27B (SAIA)"
    ["deepseek-v4-flash-0731"]="false|text|131072|16384|DeepSeek V4 Flash (SAIA)"
    ["qwen3.6-27b"]="false|text|131072|16384|Qwen 3.6 27B (SAIA)"
    ["gemma-4-31b-it"]="false|text,image|131072|8192|Gemma 4 31B (SAIA)"
    ["apertus-70b-instruct-2509"]="false|text|131072|8192|Apertus 70B (SAIA)"
    ["meta-llama-3.1-8b-instruct"]="false|text|131072|4096|Meta Llama 3.1 8B (SAIA)"
    ["glm-4.7"]="false|text|131072|16384|GLM 4.7 (SAIA)"
)

# Models to add even if not in API response (newly released, not yet deployed)
# These will be added automatically if they're in metadata but not in API
declare -a FORCE_INCLUDE_MODELS=(
    "qwen3.8-2.4t-a95b"
    "qwen3.8-27b"
)

# Aliases
declare -A ALIASES=(
    ["best-for-coding"]="qwen3-coder-next"
    ["best-for-reasoning"]="qwen3.8-2.4t-a95b"
    ["best-quality"]="qwen3.8-2.4t-a95b"
    ["best-for-vision"]="qwen3.8-27b"
    ["best-for-agentic"]="glm-4.7"
    ["fastest"]="meta-llama-3.1-8b-instruct"
    ["fastest-reasoning"]="qwen3.8-27b"
    ["budget"]="deepseek-v4-flash-0731"
)

# Categorize model based on ID
categorize() {
    local id="$1"
    case "$id" in
        *thinking*|*r1*|qwen3.8-2.4t-a95b|qwen3.5-397b-a17b|qwen3.5-122b-a10b|qwen3-30b-a3b-instruct-2507)
            echo "reasoning"
            ;;
        *coder*)
            echo "coder"
            ;;
        *omni*|*vl-*|*vision*|internvl*)
            echo "vision"
            ;;
        medgemma*)
            echo "medical"
            ;;
        devstral*|mistral-medium*|glm-4.7)
            echo "agentic"
            ;;
        *120b|*128b|*235b|*675b)
            echo "large-context"
            ;;
        *)
            echo "general"
            ;;
    esac
}

# Generate model config entry
generate_model_config() {
    local id="$1"
    local description="$2"
    local reasoning="$3"
    local input_types="$4"
    local context="$5"
    local max_tokens="$6"
    
    # Format input types as JSON array
    local input_json=$(echo "$input_types" | sed 's/,/", "/g' | sed 's/^/["/' | sed 's/$/"]/')
    
    echo "  {"
    echo "    id: \"$id\","
    echo "    name: \"$description\","
    echo "    reasoning: $reasoning,"
    echo "    input: $input_json,"
    echo "    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },"
    echo "    contextWindow: $context,"
    echo "    maxTokens: $max_tokens,"
    echo "  },"
}

# Generate alias entry
generate_alias_config() {
    local alias="$1"
    local target="$2"
    local target_meta="${MODEL_METADATA[$target]:-}"
    
    if [[ -z "$target_meta" ]]; then
        return 1
    fi
    
    IFS='|' read -r reasoning input_types context max_tokens description <<< "$target_meta"
    
    local input_json=$(echo "$input_types" | sed 's/,/", "/g' | sed 's/^/["/' | sed 's/$/"]/')
    
    echo "  {"
    echo "    id: \"$alias\","
    echo "    name: \"$alias → $target\","
    echo "    reasoning: $reasoning,"
    echo "    input: $input_json,"
    echo "    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },"
    echo "    contextWindow: $context,"
    echo "    maxTokens: $max_tokens,"
    echo "  },"
}

# Get timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Build the new model list
print_info "Generating extensions/index.ts..."

# Write header
cat > "$EXTENSIONS_FILE.tmp" <<EOF
/**
 * pi-saia-plugin: SAIA (Academic Cloud Hessen) provider registration.
 *
 * Registers the SAIA provider with all models from the live SAIA API.
 * API key is read from auth.json (key: "saia"), \$SAIA_API_KEY, or /login saia.
 *
 * Install: pi install /path/to/pi-saia-plugin
 * Reload:  /reload
 *
 * This file is auto-generated by scripts/sync-saia-models.sh
 * Last sync: $TIMESTAMP
 */

import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Model catalog — Auto-synced from SAIA API
// ---------------------------------------------------------------------------

const SAIA_MODELS: ProviderModelConfig[] = [
EOF

# Track which models we've seen and last category
declare -A SEEN_MODELS
LAST_CATEGORY=""

# Process API models
echo "$MODELS_JSON" | jq -r '.data[].id' | sort | while read -r model_id; do
    [[ -z "$model_id" ]] && continue
    
    # Check if we have metadata for this model
    if [[ -n "${MODEL_METADATA[$model_id]:-}" ]]; then
        IFS='|' read -r reasoning input_types context max_tokens description <<< "${MODEL_METADATA[$model_id]}"
        category=$(categorize "$model_id")
        
        # Add category comment if it's a new category
        if [[ "$category" != "$LAST_CATEGORY" ]]; then
            echo "" >> "$EXTENSIONS_FILE.tmp"
            category_title=$(echo "$category" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1' | sed 's/ / /g')
            echo "  // ── ${category_title} ────────────────────────────────────────────────────" >> "$EXTENSIONS_FILE.tmp"
            LAST_CATEGORY="$category"
        fi
        
        generate_model_config "$model_id" "$description" "$reasoning" "$input_types" "$context" "$max_tokens" >> "$EXTENSIONS_FILE.tmp"
        SEEN_MODELS[$model_id]=1
    else
        print_warn "No metadata for model: $model_id (skipping)"
    fi
done

# Add models that should be included even if not in API response yet
# (e.g., newly released models not yet deployed to SAIA)
print_info "Checking for models to force-include..."
for model_id in "${FORCE_INCLUDE_MODELS[@]}"; do
    if [[ -z "${SEEN_MODELS[$model_id]:-}" ]]; then
        if [[ -n "${MODEL_METADATA[$model_id]:-}" ]]; then
            print_info "  Adding (not in API): $model_id"
            IFS='|' read -r reasoning input_types context max_tokens description <<< "${MODEL_METADATA[$model_id]}"
            category=$(categorize "$model_id")
            
            # Add category comment if it's a new category
            if [[ "$category" != "$LAST_CATEGORY" ]]; then
                echo "" >> "$EXTENSIONS_FILE.tmp"
                category_title=$(echo "$category" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1' | sed 's/ / /g')
                echo "  // ── ${category_title} ────────────────────────────────────────────────────" >> "$EXTENSIONS_FILE.tmp"
                LAST_CATEGORY="$category"
            fi
            
            generate_model_config "$model_id" "$description" "$reasoning" "$input_types" "$context" "$max_tokens" >> "$EXTENSIONS_FILE.tmp"
            SEEN_MODELS[$model_id]=1
        fi
    fi
done

# Add aliases section
echo "" >> "$EXTENSIONS_FILE.tmp"
echo "  // ── Aliases (convenience shortcuts) ──────────────────────────────────" >> "$EXTENSIONS_FILE.tmp"

for alias in "${!ALIASES[@]}"; do
    target="${ALIASES[$alias]}"
    
    # Only include alias if target model exists and was seen
    if [[ -n "${SEEN_MODELS[$target]:-}" ]]; then
        generate_alias_config "$alias" "$target" >> "$EXTENSIONS_FILE.tmp"
    fi
done

# Close the array and add provider registration
cat >> "$EXTENSIONS_FILE.tmp" <<'EOF'
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
EOF

# Replace original file
mv "$EXTENSIONS_FILE.tmp" "$EXTENSIONS_FILE"

print_info "✓ Successfully updated $EXTENSIONS_FILE"
print_info "  Models synced: $MODEL_COUNT"
print_info "  Timestamp: $TIMESTAMP"

# Show summary
print_info "Model summary:"
echo "$MODELS_JSON" | jq -r '.data[].id' | sort | while read -r id; do
    if [[ -n "${MODEL_METADATA[$id]:-}" ]]; then
        echo "  ✓ $id"
    else
        echo "  ⚠ $id (no metadata)"
    fi
done
