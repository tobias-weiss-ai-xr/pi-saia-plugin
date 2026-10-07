#!/usr/bin/env bash
#
# pi-saia-plugin installer.
#
# Registers this repository as a pi package (pi >= 0.84 reads
# ~/.pi/agent/settings.json), which makes the `saia` provider, its 14 models
# and the `saia-models` skill available in every session.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v pi >/dev/null 2>&1; then
    echo "Error: the 'pi' CLI was not found in PATH." >&2
    echo "Install pi first, then re-run this script." >&2
    exit 1
fi

echo "Installing pi-saia-plugin from $REPO_DIR ..."
pi install "$REPO_DIR"

echo ""
echo "✓ Plugin installed."
echo ""
echo "Next steps:"
if [ -n "${SAIA_API_KEY:-}" ]; then
    echo "  • SAIA_API_KEY is already set in this shell — pi will use it."
else
    echo "  • Provide your SAIA key (https://chat-ai.academiccloud.de/):"
    echo "      export SAIA_API_KEY=your_key"
    echo "    or store it once with:  pi auth"
fi
echo "  • Verify:  pi --list-models | grep '^saia'"
echo "  • Use:     pi --model saia/best-for-coding \"...\""
echo "  • Default: pi --model saia/deepseek-v4-flash-0731"
