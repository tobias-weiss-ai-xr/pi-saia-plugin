#!/usr/bin/env bash
# Test suite for pi-saia-plugin

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

skip() {
    echo -e "${YELLOW}⊘${NC} $1"
    SKIP_COUNT=$((SKIP_COUNT + 1))
}

echo_header() {
    echo ""
    echo -e "${YELLOW}=== $1 ===${NC}"
}

# Test 1: File structure
test_file_structure() {
    echo_header "File Structure Tests"
    
    local required_files=(
        "package.json"
        "tsconfig.json"
        "extensions/index.ts"
        "data/saia-models.json"
        "scripts/collect-saia-model-info.mjs"
        "scripts/reasoning-models.json"
        "skills/saia-models.md"
        "scripts/sync-saia-models.sh"
        "test/unit/catalog.test.mjs"
        "test/unit/legacy.test.mjs"
        "test/unit/memory.test.mjs"
        "test/unit/docs.test.mjs"
        "test/integration/wire.test.mjs"
        "test/lib/glob-matcher.mjs"
        "test/mock-saia-server.mjs"
        "test/unit/provider.test.mjs"
        "test/unit/facts-collector.test.mjs"
        "test/unit/facts-invariants.test.mjs"
        "src/saia.ts"
        "src/saia-memory.ts"
        "src/generate-saia-config.sh"
        "src/copy-saia-config.sh"
        "src/validate-config.sh"
        "src/setup-wizard.sh"
        "install.sh"
        "install.ps1"
        "README.md"
        "LICENSE"
        "schema/pi.schema.json"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$PROJECT_DIR/$file" ]; then
            pass "File exists: $file"
        else
            fail "File missing: $file"
        fi
    done
    
    # Check skill files
    local skill_files=(
        "src/.opencode/skills/saia-refresh.md"
        "src/.opencode/skills/saia-health.md"
        "src/.opencode/skills/saia-list-models.md"
        "src/.opencode/skills/saia-switch-profile.md"
        "src/.opencode/skills/saia-optimize.md"
    )
    
    for file in "${skill_files[@]}"; do
        if [ -f "$PROJECT_DIR/$file" ]; then
            pass "Skill file exists: $file"
        else
            fail "Skill file missing: $file"
        fi
    done
    
    # Check new files
    local new_files=(
        "SECURITY.md"
        "ROADMAP.md"
        "CHANGELOG.md"
        "Dockerfile"
        ".dockerignore"
        ".github/workflows/test.yml"
        ".github/workflows/release.yml"
    )
    
    for file in "${new_files[@]}"; do
        if [ -f "$PROJECT_DIR/$file" ]; then
            pass "New file exists: $file"
        else
            skip "New file missing (optional): $file"
        fi
    done
}

# Test 2: TypeScript compilation
test_typescript() {
    echo_header "TypeScript Compilation"

    cd "$PROJECT_DIR"

    # Prefer a *local* TypeScript and never use bare `npx`: with nothing
    # installed npx downloads from the network, and inside a container the
    # mounted node_modules may be for another platform — TypeScript 7 ships a
    # native binary, so a macOS node_modules cannot run under Linux.
    local tsc_bin=""
    if [ -x node_modules/.bin/tsc ]; then
        tsc_bin="node_modules/.bin/tsc"
    elif [ -f node_modules/typescript/bin/tsc ]; then
        tsc_bin="node_modules/typescript/bin/tsc"
    elif command -v tsc >/dev/null 2>&1; then
        tsc_bin="tsc"
    fi

    if [ -z "$tsc_bin" ]; then
        skip "TypeScript check (no local typescript — run 'npm ci')"
        return
    fi

    if ! "$tsc_bin" --version >/dev/null 2>&1; then
        skip "TypeScript check (local toolchain unusable on this platform)"
        return
    fi

    if "$tsc_bin" --noEmit 2>&1; then
        pass "TypeScript compilation successful"
    else
        fail "TypeScript compilation failed"
    fi
}

# Test 3: Shell script syntax
test_shell_syntax() {
    echo_header "Shell Script Syntax"
    
    cd "$PROJECT_DIR"
    local scripts=(
        "src/generate-saia-config.sh"
        "src/copy-saia-config.sh"
        "src/validate-config.sh"
        "src/setup-wizard.sh"
        "scripts/sync-saia-models.sh"
        "install.sh"
        "test/test.sh"
        "test/lib/glob-matcher.mjs"
        "test/mock-saia-server.mjs"
    )
    
    for script in "${scripts[@]}"; do
        if [ -f "$script" ]; then
            # JavaScript entry points get node's parser, everything else bash's.
            local syntax_ok=1
            case "$script" in
                *.mjs|*.js) node --check "$script" >/dev/null 2>&1 || syntax_ok=0 ;;
                *)          bash -n "$script" 2>/dev/null || syntax_ok=0 ;;
            esac
            if [ "$syntax_ok" -eq 1 ]; then
                pass "Syntax OK: $script"
            else
                fail "Syntax error: $script"
            fi
        fi
    done
}

# Test 4: JSON validity
test_json_validity() {
    echo_header "JSON Validity"
    
    cd "$PROJECT_DIR"
    local json_files=(
        "package.json"
        "tsconfig.json"
        "schema/pi.schema.json"
        "pi.json.example"
    )
    
    for file in "${json_files[@]}"; do
        if [ -f "$file" ]; then
            if command -v jq &> /dev/null; then
                if jq empty "$file" 2>&1; then
                    pass "JSON valid: $file"
                else
                    fail "JSON invalid: $file"
                fi
            else
                skip "JSON check (jq not available): $file"
            fi
        fi
    done
}

# Test 5: File permissions
test_permissions() {
    echo_header "File Permissions"
    
    cd "$PROJECT_DIR"
    local executable_files=(
        "src/generate-saia-config.sh"
        "src/copy-saia-config.sh"
        "src/validate-config.sh"
        "src/setup-wizard.sh"
        "scripts/sync-saia-models.sh"
        "install.sh"
        "install.ps1"
        "test/test.sh"
        "test/mock-saia-server.mjs"
    )
    
    for file in "${executable_files[@]}"; do
        if [ -f "$file" ]; then
            if [ -x "$file" ]; then
                pass "Executable: $file"
            else
                chmod +x "$file"
                pass "Fixed executable: $file"
            fi
        fi
    done
}

# Test 6: Package.json validity
test_package_json() {
    echo_header "Package.json Tests"
    
    cd "$PROJECT_DIR"
    
    if [ -f "package.json" ]; then
        pass "package.json exists"
        
        if command -v jq &> /dev/null; then
            local name=$(jq -r '.name' package.json)
            local version=$(jq -r '.version' package.json)
            local main=$(jq -r '.main' package.json)
            local type=$(jq -r '.type' package.json)
            
            if [ "$name" = "pi-saia-plugin" ]; then
                pass "package.json name is correct: $name"
            else
                fail "package.json name incorrect: $name"
            fi
            
            if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                pass "package.json version is valid: $version"
            else
                fail "package.json version invalid: $version"
            fi
            
            if [ "$main" = "extensions/index.ts" ]; then
                pass "package.json main is correct: $main"
            else
                fail "package.json main incorrect: $main"
            fi

            local pi_extensions=$(jq -r '.pi.extensions[0] // ""' package.json)
            local pi_skills=$(jq -r '.pi.skills[0] // ""' package.json)
            if [ "$pi_extensions" = "./extensions" ] && [ "$pi_skills" = "./skills" ]; then
                pass "package.json pi manifests point at ./extensions and ./skills"
            else
                fail "package.json pi manifests wrong: extensions=$pi_extensions skills=$pi_skills"
            fi
            
            if [ "$type" = "module" ]; then
                pass "package.json type is correct: $type"
            else
                fail "package.json type incorrect: $type"
            fi
        else
            skip "package.json content check (jq not available)"
        fi
    else
        fail "package.json missing"
    fi
}

# Test 7: Script simulated execution
test_script_simulation() {
    echo_header "Script Simulation Tests"
    
    cd "$PROJECT_DIR"
    
    # Test that generate script has required functions
    if grep -q "categorize()" src/generate-saia-config.sh; then
        pass "generate-saia-config.sh has categorize function"
    else
        fail "generate-saia-config.sh missing categorize function"
    fi
    
    if grep -q "include_in_profile()" src/generate-saia-config.sh; then
        pass "generate-saia-config.sh has include_in_profile function"
    else
        fail "generate-saia-config.sh missing include_in_profile function"
    fi
    
    if grep -q "can_reason()" src/generate-saia-config.sh; then
        pass "generate-saia-config.sh has can_reason function"
    else
        fail "generate-saia-config.sh missing can_reason function"
    fi
    
    # Test validate script
    if grep -q "validate_with_ajv\|validate_with_jq" src/validate-config.sh; then
        pass "validate-config.sh has validation functions"
    else
        fail "validate-config.sh missing validation functions"
    fi
}

# Test 8: Documentation completeness
test_documentation() {
    echo_header "Documentation Tests"
    
    cd "$PROJECT_DIR"
    
    if grep -q "SAIA" README.md; then
        pass "README.md mentions SAIA"
    else
        fail "README.md missing SAIA mention"
    fi
    
    if grep -q "Installation" README.md; then
        pass "README.md has Installation section"
    else
        fail "README.md missing Installation section"
    fi
    
    if grep -q "Usage" README.md; then
        pass "README.md has Usage section"
    else
        fail "README.md missing Usage section"
    fi
    
    if [ -f "FAQ.md" ] && [ $(wc -l < FAQ.md) -gt 50 ]; then
        pass "FAQ.md is comprehensive"
    else
        skip "FAQ.md check"
    fi
    
    if [ -f "ARCHITECTURE.md" ] && [ $(wc -l < ARCHITECTURE.md) -gt 100 ]; then
        pass "ARCHITECTURE.md is comprehensive"
    else
        skip "ARCHITECTURE.md check"
    fi
}

# Test 9: GitHub workflows
test_github_workflows() {
    echo_header "GitHub Workflows Tests"
    
    cd "$PROJECT_DIR"
    
    if [ -f ".github/workflows/test.yml" ]; then
        pass "test.yml workflow exists"
        if grep -q "node-version" .github/workflows/test.yml; then
            pass "test.yml has Node.js matrix"
        else
            fail "test.yml missing Node.js matrix"
        fi
    else
        skip "test.yml workflow"
    fi
    
    if [ -f ".github/workflows/release.yml" ]; then
        pass "release.yml workflow exists"
        if grep -q "action-gh-release" .github/workflows/release.yml; then
            pass "release.yml uses GitHub release action"
        else
            fail "release.yml missing release action"
        fi
    else
        skip "release.yml workflow"
    fi
    
    if [ -f ".github/ISSUE_TEMPLATE/bug_report.md" ]; then
        pass "Bug report template exists"
    else
        skip "Bug report template"
    fi
    
    if [ -f ".github/ISSUE_TEMPLATE/feature_request.md" ]; then
        pass "Feature request template exists"
    else
        skip "Feature request template"
    fi
}

# Test 10: Security checks
test_security() {
    echo_header "Security Tests"
    
    cd "$PROJECT_DIR"
    
    # Check for accidental API key commits: only a real 32-hex key literal
    # counts (docs routinely contain `SAIA_API_KEY=your_key` placeholders).
    if git grep -nqE "SAIA_API_KEY[[:space:]]*[:=][[:space:]]*[\"']?[0-9a-fA-F]{32}" 2>/dev/null; then
        fail "Potential API key found in git history"
    else
        pass "No API keys in git history"
    fi
    
    # Check for .env files
    if [ -f ".env" ]; then
        fail ".env file should not be committed"
    else
        pass "No .env file committed"
    fi
    
    # Check SECURITY.md
    if [ -f "SECURITY.md" ]; then
        pass "SECURITY.md exists"
        if grep -q "Reporting Security Issues" SECURITY.md; then
            pass "SECURITY.md has reporting guidelines"
        else
            fail "SECURITY.md missing reporting guidelines"
        fi
    else
        skip "SECURITY.md"
    fi
}

# Test 11: Skill frontmatter (a missing name falls back to the directory name
# "skills" and silently collides with other packages' skills)
test_skill_frontmatter() {
    echo_header "Skill Frontmatter Tests"

    cd "$PROJECT_DIR"

    local skill="skills/saia-models.md"
    if [ ! -f "$skill" ]; then
        fail "Missing skill file: $skill"
        return
    fi

    if head -1 "$skill" | grep -qx -- "---"; then
        pass "Skill has YAML frontmatter"
    else
        fail "Skill is missing YAML frontmatter"
    fi

    local name
    name="$(awk 'NR==1 && $0=="---"{next} /^---$/{exit} /^name:/{sub(/^name:[[:space:]]*/, ""); print; exit}' "$skill")"
    if [ "$name" = "saia-models" ]; then
        pass "Skill declares an explicit name: $name"
    else
        fail "Skill must declare 'name: saia-models' (found: '${name:-none}')"
    fi

    if awk 'NR==1 && $0=="---"{next} /^---$/{exit} /^description:/{found=1} END{exit !found}' "$skill"; then
        pass "Skill declares a description"
    else
        fail "Skill must declare a description"
    fi
}

# Test 12: Catalog freshness (opt-in — needs a working SAIA API key)
test_catalog_freshness() {
    echo_header "Catalog Freshness Tests"

    cd "$PROJECT_DIR"

    if [ -z "${SAIA_API_KEY:-}" ]; then
        skip "Catalog freshness check (SAIA_API_KEY not set)"
        return
    fi

    local code
    code="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' \
        -H "Authorization: Bearer ${SAIA_API_KEY}" \
        "https://chat-ai.academiccloud.de/v1/models" 2>/dev/null || echo 000)"
    if [ "$code" != "200" ]; then
        skip "Catalog freshness check (SAIA API returned HTTP $code — key missing/expired?)"
        return
    fi

    # The script separates "stale" (1) from "could not determine" (3) so a
    # transient upstream failure never gets reported as catalog drift.
    local log=/tmp/saia-catalog-check.log
    local rc=0
    bash scripts/sync-saia-models.sh --check >"$log" 2>&1 || rc=$?
    case "$rc" in
        0)
            pass "generated catalog matches the live SAIA model list"
            ;;
        1)
            fail "catalog is stale — run ./scripts/sync-saia-models.sh"
            sed -n '1,20p' "$log"
            ;;
        3)
            # Second call in the same run may hit a 5xx the probe did not.
            skip "Catalog freshness check (SAIA API unavailable mid-run)"
            ;;
        *)
            fail "catalog check exited with unexpected code $rc"
            sed -n '1,20p' "$log"
            ;;
    esac
}

# Test 13: The generator must reproduce extensions/index.ts exactly from
# data/saia-models.json. Guards the "the generator silently rewrote the module
# and dropped an export" bug class, and pins bash 3.2 compatibility (macOS's
# /bin/bash is 3.2, which has no `declare -A` — the previous generator used one
# and died with "best: unbound variable" on every Mac).
test_catalog_generator() {
    echo_header "Catalog Generator Tests"

    cd "$PROJECT_DIR"

    local data="data/saia-models.json"
    if [ ! -f "$data" ]; then
        fail "Missing facts file: $data"
        return
    fi

    # No `declare -A`: it is bash 4 only, and this project supports macOS bash.
    if grep -qE '^[[:space:]]*declare[[:space:]]+-A' scripts/sync-saia-models.sh; then
        fail "scripts/sync-saia-models.sh uses declare -A (bash 4 only, breaks macOS)"
    else
        pass "generator avoids bash-4-only associative arrays"
    fi

    local out="${TMPDIR:-/tmp}/saia-index-$$.ts"
    if SAIA_MODELS_DATA="$data" bash scripts/sync-saia-models.sh --print-ts >"$out" 2>/tmp/saia-gen.log; then
        pass "generator runs hermetically from $data (no key, no network)"
    else
        fail "generator failed from $data"
        sed -n '1,10p' /tmp/saia-gen.log
        return
    fi

    # The timestamp line is the only intentionally volatile part.
    if diff -u <(grep -v 'Last sync:' extensions/index.ts) \
                <(grep -v 'Last sync:' "$out") >/tmp/saia-gen.diff 2>&1; then
        pass "generator output reproduces extensions/index.ts exactly"
    else
        fail "extensions/index.ts is not reproducible from the generator"
        head -20 /tmp/saia-gen.diff
    fi

    # Every wire fix must survive regeneration, or it is one sync away from
    # silently disappearing.
    local missing=""
    for needle in "supportsDeveloperRole: false" "SAIA_ALIASES" "before_provider_request" "resolveBaseUrl" "SAIA_BASE_URL_ENV"; do
        grep -q "$needle" "$out" || missing="$missing $needle"
    done
    if [ -z "$missing" ]; then
        pass "generated file keeps every wire fix (compat, aliases, hook, base URL)"
    else
        fail "generated file dropped:$missing"
    fi

    if SAIA_MODELS_DATA="$data" bash scripts/sync-saia-models.sh --check >/dev/null 2>&1; then
        pass "--check passes when the generated file is current"
    else
        fail "--check fails on a current generated file"
    fi

    # --check must be strictly read-only: it used to stage a temp file next to
    # the catalog, which breaks in a read-only checkout (CI, containers).
    local before after
    before="$(git status --porcelain 2>/dev/null; find extensions data -type f 2>/dev/null | sort)"
    SAIA_MODELS_DATA="$data" bash scripts/sync-saia-models.sh --check >/dev/null 2>&1 || true
    after="$(git status --porcelain 2>/dev/null; find extensions data -type f 2>/dev/null | sort)"
    if [ "$before" = "$after" ]; then
        pass "--check leaves the working tree untouched"
    else
        fail "--check modified the working tree"
        diff <(printf '%s\n' "$before") <(printf '%s\n' "$after") | head -10
    fi

    # ...and it must work when the checked directories are not writable at all.
    if [ ! -w "extensions" ] || [ ! -w "data" ]; then
        skip "read-only checkout check (directories are already not writable)"
    else
        local ro="${TMPDIR:-/tmp}/saia-ro-$$"
        rm -rf "$ro"; mkdir -p "$ro/extensions" "$ro/data" "$ro/scripts"
        cp extensions/index.ts "$ro/extensions/"
        cp "$data" "$ro/data/"
        cp scripts/sync-saia-models.sh "$ro/scripts/"
        chmod -w "$ro/extensions" "$ro/data"
        if SAIA_MODELS_DATA="$ro/data/saia-models.json" bash "$ro/scripts/sync-saia-models.sh" \
            --out "$ro/extensions/index.ts" --check >/dev/null 2>&1; then
            pass "--check works in a read-only checkout"
        else
            fail "--check fails when the checked directories are read-only"
        fi
        chmod +w "$ro/extensions" "$ro/data"; rm -rf "$ro"
    fi

    # Divergence must be detected, otherwise the gate is useless. Feed the
    # generator facts that describe fewer models than the committed catalog.
    local stale="${TMPDIR:-/tmp}/saia-stale-$$.json"
    if ! python3 - "$data" "$stale" <<'PYEOF'
import json, sys
data = json.load(open(sys.argv[1]))
data["models"] = data["models"][1:]
json.dump(data, open(sys.argv[2], "w"))
PYEOF
    then
        skip "divergence check (python3 unavailable to build a stale facts file)"
        rm -f "$out"
        return
    fi
    if SAIA_MODELS_DATA="$stale" bash scripts/sync-saia-models.sh --check >/dev/null 2>&1; then
        fail "--check returned success for a catalog missing a model"
    else
        pass "--check detects a stale/divergent catalog"
    fi
    rm -f "$stale"

    rm -f "$out"

    local bash32
    bash32="$(bash_version_at /bin/bash)"
    if [ -n "$bash32" ]; then
        local out32="${TMPDIR:-/tmp}/saia-index-32-$$.ts"
        if SAIA_MODELS_DATA="$data" /bin/bash scripts/sync-saia-models.sh --out "$out32" >/dev/null 2>&1; then
            pass "generator runs under /bin/bash $bash32 (no bash-4 syntax)"
        else
            fail "generator fails under /bin/bash $bash32 — bash-4-only syntax crept back in"
        fi
        rm -f "$out32"
    else
        skip "bash 3.x compatibility run (/bin/bash is not 3.x here)"
    fi
}

# Reports the version of $1 when it is bash 3.x (bash 3.2 = macOS default).
bash_version_at() {
    [ -x "$1" ] || return 0
    local v
    v="$("$1" --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
    case "$v" in
        3.*) printf '%s' "$v" ;;
    esac
}

# Test 14: What npm/pi would actually ship must contain the pi entry points.
test_package_manifest() {
    echo_header "Package Manifest Tests"

    cd "$PROJECT_DIR"

    local files
    files="$(jq -r '.files[]? // empty' package.json)"
    if printf '%s\n' "$files" | grep -qx 'extensions'; then
        pass "package.json files[] ships the extensions directory"
    else
        fail "package.json files[] must include \"extensions\""
    fi
    if printf '%s\n' "$files" | grep -qx 'skills'; then
        pass "package.json files[] ships the skills directory"
    else
        fail "package.json files[] must include \"skills\""
    fi

    # Every path referenced by the pi manifest must be covered by files[].
    local entry missing=0
    for entry in $(jq -r '.pi.extensions[]?, .pi.skills[]?' package.json | sed 's|^\./||'); do
        if ! printf '%s\n' "$files" | grep -qx "$entry"; then
            fail "pi manifest path '$entry' is not covered by package.json files[]"
            missing=1
        fi
    done
    [ "$missing" -eq 0 ] && pass "every pi manifest path is covered by files[]"

    if command -v npm >/dev/null 2>&1; then
        local packed
        packed="$(npm pack --dry-run --json 2>/dev/null | jq -r '.[0].files[]?.path' || true)"
        if [ -z "$packed" ]; then
            skip "npm pack --dry-run listing (npm unavailable or failed)"
        else
            if printf '%s\n' "$packed" | grep -qx 'extensions/index.ts' \
                && printf '%s\n' "$packed" | grep -qx 'skills/saia-models.md'; then
                pass "npm pack ships extensions/index.ts and skills/saia-models.md"
            else
                fail "npm pack would not ship the pi entry points"
            fi
            if printf '%s\n' "$packed" | grep -q '^src/'; then
                fail "npm pack still ships the dead legacy src/ tree"
            else
                pass "npm pack excludes the legacy src/ tree"
            fi
        fi
    else
        skip "npm pack listing (npm not installed)"
    fi
}

# Test 15: pi's own skill loader must see `saia-models` (not the directory
# fallback name "skills", which collides with other packages).
test_skill_discovery() {
    echo_header "Skill Discovery Tests"

    cd "$PROJECT_DIR"

    if ! command -v python3 >/dev/null 2>&1; then
        skip "pi skill-loader check (python3 unavailable to locate pi)"
        return
    fi

    local loader
    loader="$(PROJECT_DIR="$PROJECT_DIR" python3 - <<'PY'
import os, shutil, subprocess

PKG = "@earendil-works/pi-coding-agent"
cands = []

project = os.environ.get("PROJECT_DIR", os.getcwd())

# 1. Walk up from the pi binary, wherever it is installed.
binary = shutil.which("pi")
if binary:
    d = os.path.dirname(os.path.realpath(binary))
    for _ in range(5):
        cands += [
            os.path.join(d, "libexec/lib/node_modules", PKG),
            os.path.join(d, "lib/node_modules", PKG),
            os.path.join(d, "node_modules", PKG),
            d,
        ]
        d = os.path.dirname(d)

# 2. npm's own roots (global installs, and the checkout's node_modules).
for args in (["root", "-g"], ["root"]):
    try:
        root = subprocess.run(["npm"] + args, capture_output=True, text=True,
                              timeout=20).stdout.strip()
    except Exception:
        root = ""
    if root:
        cands.append(os.path.join(root, PKG))

# 3. Explicit locations: the checkout itself, and the image build directory.
cands.append(os.path.join(project, "node_modules", PKG))
cands.append(os.path.join("/app", "node_modules", PKG))

for c in cands:
    f = os.path.join(c, "dist/core/skills.js")
    if os.path.isfile(f):
        print(f)
        break
PY
)"

    if [ -z "$loader" ]; then
        skip "pi skill-loader check (could not locate pi's dist/core/skills.js)"
        return
    fi

    local names
    names="$(node --input-type=module -e "
import { loadSkills } from '$loader';
const r = loadSkills({ cwd: '$PROJECT_DIR', agentDir: '$PROJECT_DIR/.pi-test-agent', skillPaths: ['$PROJECT_DIR/skills'], includeDefaults: false });
console.log(r.skills.map((s) => s.name).join(','));
" 2>/dev/null || true)"

    if [ -z "$names" ]; then
        skip "pi skill-loader check (loader returned nothing)"
    elif printf '%s' "$names" | grep -q 'saia-models'; then
        pass "pi's skill loader registers 'saia-models' (got: $names)"
    else
        fail "pi's skill loader did not register 'saia-models' (got: ${names:-none})"
    fi
}

# Test 16: Workflow/config YAML must parse. release.yml shipped as invalid YAML
# for months (a heredoc body at column 0 inside a block scalar), so the release
# workflow could never even be parsed — let alone run.
test_workflow_yaml() {
    echo_header "Workflow YAML Tests"

    cd "$PROJECT_DIR"

    if ! python3 -c 'import yaml' >/dev/null 2>&1; then
        skip "workflow YAML parse (python3 + PyYAML unavailable)"
        return
    fi

    if python3 - <<'PY'
import glob, sys, yaml
bad = []
for f in sorted(glob.glob(".github/workflows/*.yml")) + ["docker-compose.yml"]:
    try:
        yaml.safe_load(open(f))
    except Exception as exc:
        bad.append("%s: %s" % (f, str(exc).splitlines()[0]))
if bad:
    print("\n".join(bad))
    sys.exit(1)
PY
    then
        pass "all workflow / compose YAML parses"
    else
        fail "invalid YAML in .github/workflows or docker-compose.yml"
    fi

    # The shell inside every workflow step must at least parse.
    if python3 - <<'PY' >/tmp/saia-workflow-scripts.txt 2>/dev/null
import glob, yaml, os
out = "/tmp/saia-workflow-scripts"
os.makedirs(out, exist_ok=True)
n = 0
for f in sorted(glob.glob(".github/workflows/*.yml")):
    doc = yaml.safe_load(open(f))
    for job in (doc.get("jobs") or {}).values():
        for step in job.get("steps") or []:
            if isinstance(step, dict) and isinstance(step.get("run"), str):
                n += 1
                open(os.path.join(out, "step%d.sh" % n), "w").write(step["run"])
print(n)
PY
    then
        local broken=0 total=0
        for script in /tmp/saia-workflow-scripts/*.sh; do
            [ -f "$script" ] || continue
            total=$((total + 1))
            bash -n "$script" || { broken=$((broken + 1)); fail "shell syntax error in $script"; }
        done
        [ "$total" -gt 0 ] || fail "found no workflow shell steps to check"
        [ "$broken" -eq 0 ] && pass "all $total workflow shell steps parse"
        rm -rf /tmp/saia-workflow-scripts
    else
        skip "workflow shell syntax (could not extract run steps)"
    fi
}

# Test: the Makefile must be parseable and every documented target must exist.
# An unparseable Makefile breaks *every* target with "missing separator", and
# the previous one had exactly that bug (a bare multi-line variable assignment).
test_makefile() {
    echo_header "Makefile Tests"

    cd "$PROJECT_DIR"

    if ! command -v make >/dev/null 2>&1; then
        skip "make not installed"
        return
    fi

    if [ ! -f Makefile ]; then
        fail "Makefile missing"
        return
    fi

    if make --dry-run help >/dev/null 2>&1; then
        pass "Makefile parses (make help works)"
    else
        fail "Makefile does not parse: $(make --dry-run help 2>&1 | head -1)"
        return
    fi

    if command -v python3 >/dev/null 2>&1; then
        local report
        report=$(python3 - <<'PYCHECK'
import re, pathlib, sys
text = pathlib.Path("Makefile").read_text()
m = re.search(r"define HELP_TEXT\n(.*?)\nendef", text, re.S)
if not m:
    print("HELP_TEXT is not defined with define/endef")
    sys.exit(1)
help_text = m.group(1)
# Stop at the trailing examples so `make verify` in prose is not read as a target.
help_text = re.split(r"^\s*Examples?:", help_text, maxsplit=1, flags=re.M)[0]
documented = set()
for line in help_text.split("\n"):
    hit = re.match(r"^  ([a-z][a-z0-9-]*)\s+\S", line)
    if hit:
        documented.add(hit.group(1))
rules = set(re.findall(r"^([a-z][a-z0-9-]*):", text, re.M))
missing = sorted(documented - rules)
if missing:
    print("documented but no rule: " + ", ".join(missing))
    sys.exit(1)
if len(documented) < 10:
    print("only %d documented targets found; the help block was probably mangled" % len(documented))
    sys.exit(1)
print(len(documented))
PYCHECK
) || { fail "Makefile help/target mismatch: $(printf '%s' "$report" | head -1)"; return; }
        pass "all $report documented make targets exist"
    fi

    local unresolved=0
    local targets
    targets=$(sed -n '/^[[:space:]]*Examples*:/q;p' Makefile | grep -oE '^  [a-z][a-z0-9-]*' | tr -d ' ')
    for target in $targets; do
        if ! make --dry-run "$target" >/dev/null 2>&1; then
            fail "make $target has no rule"
            unresolved=$((unresolved + 1))
        fi
    done
    [ "$unresolved" -eq 0 ] && pass "every documented make target is callable"
}

# Test: workflow triggers must actually fire. Two real bugs lived here —
# test.yml filtered on "master" while the only branch is "main" (so CI never
# ran), and release.yml used a regex-flavoured tag filter that is a *glob* and
# therefore matched no real tag (so releases never ran).
test_workflow_triggers() {
    echo_header "Workflow Trigger Tests"

    cd "$PROJECT_DIR"

    if ! python3 -c 'import yaml' >/dev/null 2>&1; then
        skip "workflow trigger checks (python3 + PyYAML unavailable)"
        return
    fi

    # Not every checkout is a git repo (tarball, container): never let a failing
    # git call abort the suite under `set -e`.
    local default_branch
    default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || true)
    if [ -z "$default_branch" ]; then
        default_branch=$(git branch --show-current 2>/dev/null || true)
    fi
    if [ -z "$default_branch" ] && [ -f .gitignore ]; then
        default_branch="main"
    fi
    [ -n "$default_branch" ] || default_branch="main"

    local uncovered
    uncovered=$(python3 - "$default_branch" <<'PYCHECK'
import glob, sys, yaml
default = sys.argv[1]
bad = []
for f in sorted(glob.glob(".github/workflows/*.yml")):
    doc = yaml.safe_load(open(f))
    triggers = doc.get("on") or doc.get(True) or {}
    if not isinstance(triggers, dict):
        continue
    for event in ("push", "pull_request"):
        spec = triggers.get(event)
        if not isinstance(spec, dict):
            continue
        branches = spec.get("branches")
        if not branches:
            continue
        if default not in branches and "**" not in branches:
            bad.append("%s: %s filters on %s, not %s" % (f, event, branches, default))
print("\n".join(bad))
PYCHECK
)
    if [ -z "$uncovered" ]; then
        pass "every CI branch filter covers '$default_branch'"
    else
        fail "workflow never triggers on '$default_branch': $(printf '%s' "$uncovered" | head -1)"
    fi

    local tag_pattern
    tag_pattern=$(python3 - <<'PYCHECK'
import yaml
doc = yaml.safe_load(open(".github/workflows/release.yml"))
triggers = doc.get("on") or doc.get(True) or {}
tags = (triggers.get("push") or {}).get("tags") or []
print(tags[0] if tags else "")
PYCHECK
)
    if [ -z "$tag_pattern" ]; then
        fail "release.yml has no push tag filter"
        return
    fi

    # GitHub uses glob filters, not regexes: '+' is literal, so a filter such as
    # v[0-9]+.[0-9]+.[0-9]+ matches no real tag at all. Verified with a small
    # self-contained matcher rather than a glob dependency.
    if ! command -v node >/dev/null 2>&1; then
        skip "release tag filter check (node unavailable)"
    elif node test/lib/glob-matcher.mjs "$tag_pattern" '["v1.0.4","v0.1.0","v10.20.30"]' '[]' 2>/dev/null; then
        pass "release tag filter '$tag_pattern' matches real semver tags"
    else
        fail "release tag filter '$tag_pattern' matches no real tag — filters are globs, not regexes"
    fi
}

# Test: the release helper must run clean without an API key or a pi install.
test_release_script() {
    echo_header "Release Script Tests"

    cd "$PROJECT_DIR"

    if [ ! -f prepare-release.sh ]; then
        fail "prepare-release.sh missing"
        return
    fi

    if bash -n prepare-release.sh 2>/dev/null; then
        pass "prepare-release.sh syntax OK"
    else
        fail "prepare-release.sh has a syntax error"
        return
    fi

    # A container smoke step that greps settings.json for the package name can
    # never pass: `pi install <path>` records a *path*, so the check has to
    # assert the outcome (registered models) instead.
    local fragile
    fragile="$(grep -rn "settings.json" .github/workflows/ 2>/dev/null | grep -v "pi --list-models" || true)"
    if [ -z "$fragile" ]; then
        pass "workflow checks assert registered models, not the settings.json package name"
    else
        fail "workflow greps settings.json for the package name (pi records a path):"
        printf '%s\n' "$fragile" | head -3
    fi

    if grep -q "extensions/index.ts" prepare-release.sh && grep -q "data/saia-models.json" prepare-release.sh \
        && grep -q "skills/saia-models.md" prepare-release.sh; then
        pass "prepare-release.sh validates the shipped pi package"
    else
        fail "prepare-release.sh does not validate extensions/, data/ and skills/"
    fi

    # --no-tests: this suite is itself invoked by `npm run verify`, which
    # prepare-release.sh runs when not skipped.
    local out
    if out=$(env -u SAIA_API_KEY ./prepare-release.sh --no-tests 2>&1); then
        pass "prepare-release.sh passes with no API key"
    else
        fail "prepare-release.sh failed without an API key: $(printf '%s' "$out" | grep '✗' | head -1)"
    fi
}

# Test: hooks and scripts must not hard-depend on jq (absent on stock macOS,
# and a missing validator used to be reported as invalid JSON).
test_portability() {
    echo_header "Portability Tests"

    cd "$PROJECT_DIR"

    local offenders=""
    local file
    for file in .githooks/pre-push test/test.sh install.sh prepare-release.sh; do
        [ -f "$file" ] || continue
        if grep -vE '^[[:space:]]*#' "$file" | grep -qE '(^|[^a-zA-Z_])jq ' \
            && ! grep -vE '^[[:space:]]*#' "$file" | grep -q 'command -v jq'; then
            offenders="$offenders $file"
        fi
    done

    if [ -z "$offenders" ]; then
        pass "no unguarded jq dependency in hooks/scripts"
    else
        fail "unguarded jq dependency in:$offenders"
    fi

    if bash -n .githooks/pre-push 2>/dev/null; then
        pass "pre-push hook syntax OK"
    else
        fail "pre-push hook has a syntax error"
    fi

    if grep -q "main" .githooks/pre-push; then
        pass "pre-push hook recognises the 'main' default branch"
    else
        fail "pre-push hook does not know about 'main'"
    fi
}

# Main test runner
main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║       pi-saia-plugin Test Suite                       ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    
    test_file_structure
    test_typescript
    test_shell_syntax
    test_json_validity
    test_permissions
    test_package_json
    test_script_simulation
    test_documentation
    test_github_workflows
    test_workflow_yaml
    test_workflow_triggers
    test_makefile
    test_release_script
    test_portability
    test_security
    test_skill_frontmatter
    test_catalog_generator
    test_package_manifest
    test_skill_discovery
    test_catalog_freshness
    
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                    Test Results                         ║"
    echo "╠═══════════════════════════════════════════════════════════╣"
    printf "║  Passed: %-3d                                      ║\n" "$PASS_COUNT"
    printf "║  Failed: %-3d                                      ║\n" "$FAIL_COUNT"
    printf "║  Skipped: %-3d                                     ║\n" "$SKIP_COUNT"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    
    if [ "$FAIL_COUNT" -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed.${NC}"
        exit 1
    fi
}

main
