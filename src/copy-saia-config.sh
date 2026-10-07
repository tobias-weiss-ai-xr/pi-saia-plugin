#!/usr/bin/env bash
#
# =============================================================================
# LEGACY / FROZEN — NOT USED BY pi >= 0.84
#
# This script targets the retired OpenCode config layout
# (~/.config/pi/pi.json + provider.<id>.npm = @ai-sdk/openai-compatible).
# pi loads packages from ~/.pi/agent/settings.json instead and registers
# providers from extensions, so nothing here is read by a modern pi.
#
# Supported entry point: ./install.sh  (which runs `pi install <path>`)
# See KNOWN_ISSUES.md -> "Legacy src/ surface".
#
# The model tables below are FROZEN and still name models the SAIA API no
# longer serves. Set SAIA_LEGACY=1 to run it anyway.
# =============================================================================

# Refuse to run unless the caller explicitly opts into the legacy path.
if [ "${SAIA_LEGACY:-0}" != "1" ]; then
    cat >&2 <<'LEGACY_EOF'

ERROR: copy-saia-config.sh writes the retired OpenCode config format (~/.config/pi/pi.json),
       which pi >= 0.84 does not read. Installing this way has no effect.

       Use ./install.sh (or: pi install /path/to/pi-saia-plugin) instead.

       To run the frozen legacy script anyway:  SAIA_LEGACY=1 copy-saia-config.sh
LEGACY_EOF
    exit 1
fi
set -euo pipefail

# SAIA Configuration Copier for pi
# Copies the master SAIA configuration to the current directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MASTER_CONFIG="$SCRIPT_DIR/pi-saia.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if master config exists
if [[ ! -f "$MASTER_CONFIG" ]]; then
    print_error "Master configuration not found at: $MASTER_CONFIG"
    print_info "Run generate-saia-config.sh first to create the master configuration"
    exit 1
fi

# Get model count from master config
MODEL_COUNT=$(jq -r '.provider.saia.models | length' "$MASTER_CONFIG" 2>/dev/null || echo "0")
print_info "Master configuration has $MODEL_COUNT SAIA models"

# Copy to current directory as pi.json
cp "$MASTER_CONFIG" ./pi.json
print_info "Copied pi.json to current directory"
print_info "SAIA models are now available in this directory for pi!"
