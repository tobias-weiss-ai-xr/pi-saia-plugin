# Known Issues and Edge Cases

This document tracks known issues, edge cases, and potential bugs in pi, pi plugins, and related dependencies that may affect SAIA plugin users.

## Table of Contents

- [Pi Bash Tool Hanging Issues](#pi-bash-tool-hanging-issues)
- [Known Fixed Issues](#known-fixed-issues)
- [Recommendations for Users](#recommendations-for-users)
- [Debugging Tips](#debugging-tips)
- [References](#references)

---

## Pi Bash Tool Hanging Issues

### Issue: Potential Hanging with head/tail and Similar Commands

**Status**: 🔍 Under Investigation  
**Severity**: Medium  
**Affected Components**: `bash` tool, `waitForChildProcess` function  
**Last Updated**: 2025-01-15

#### Description

Pi's bash tool may occasionally hang when executing certain commands, particularly `head`, `tail`, and other commands that process piped data. This is related to the sophisticated child process waiting mechanism introduced to fix previous hanging issues.

#### Root Cause Analysis

##### 1. Issue #5303 Fix (Original Problem)
- **Location**: `@earendil-works/pi-coding-agent/dist/utils/child-process.js`
- **Purpose**: Fix hanging when "a short-lived child can exit while a detached descendant keeps its stdout/stderr pipe open"
- **Implementation**: Uses a rearming timer (100ms) that waits for pipes to fall idle

##### 2. Related Fix #2389
- **Description**: "Fixed Windows bash execution hanging for commands that spawn detached descendants inheriting stdout/stderr handles"
- **Impact**: Commands like `agent-browser` would spin forever
- **Location**: CHANGELOG.md

#### The Race Condition

The `waitForChildProcess` function has a potential race condition:

```
Scenario for 'echo test':
1. Process exits
2. onExit() fires, sets exited=true
3. onExit() calls maybeFinalizeAfterExit()
4. maybeFinalizeAfterExit() finds: stdoutEnded=false, stderrEnded=true
5. onExit() calls armIdleTimer() (100ms)
6. stdout 'end' event fires, sets stdoutEnded=true
7. onStdoutEnd() calls maybeFinalizeAfterExit()
8. Now both streams are ended → finalize immediately
```

**Problem**: The timer was armed unnecessarily but didn't cause a hang because stdout ended quickly.

#### Dual Listener Problem

Both `createLocalBashOperations.exec()` and `waitForChildProcess()` attach 'data' event listeners to the same `child.stdout` and `child.stderr` streams:

```javascript
// In bash.js (line ~78-79):
child.stdout?.on("data", handleData);
child.stderr?.on("data", handleData);

// In child-process.js (line ~95-96):
child.stdout?.on("data", onData);
child.stderr?.on("data", onData);
```

**Impact**:
- ⚠️ Memory overhead from duplicate listeners
- ⚠️ Potential for listener cleanup issues
- ⚠️ Unclear ownership of stream lifecycle
- ⚠️ Possible race conditions between the two systems

#### Timer Loop Edge Case

```javascript
// In child-process.js:
const onData = () => {
    if (exited && !settled) armIdleTimer();
};
```

**Potential issue**: If data keeps arriving after exit, the timer keeps getting rearmed and never fires, causing an indefinite wait.

**Note**: In practice, this shouldn't happen because the child process has exited, so no more data should arrive. However:
- Detached processes might have different behavior
- There could be OS-level buffering
- There might be race conditions in stream cleanup

### Detected Edge Cases

#### 1. Exit Before Stream End
- **Severity**: Low (doesn't hang, but arms unnecessary timer)
- **Observation**: For very fast commands, exit event fires before stdout/stderr 'end' events
- **Impact**: Unnecessary timer arming, but streams still end quickly

#### 2. Empty Stream Handling
- **Severity**: Low (works correctly)
- **Observation**: Commands with no output (like `true`) produce no data events
- **Impact**: Streams still end properly, no hanging detected

#### 3. Platform-Specific Detached Process Behavior
- **Severity**: Medium
- **Observation**: On Linux, processes are spawned with `detached: true`
- **Impact**: Known issue on Windows (#2389), potential edge cases on Linux

### Potential Hang Scenarios

#### Scenario 1: Stream Never Ends
- **Trigger**: stdout or stderr never emits 'end' event
- **Cause**: Stream kept open by detached descendant, Node.js bug, or shell command bug
- **Result**: `maybeFinalizeAfterExit()` never succeeds; if data arrives, timer keeps resetting

#### Scenario 2: Timer Race Condition
- **Trigger**: Data arrives exactly when timer is about to fire
- **Cause**: Timer fires, but new data arrives simultaneously
- **Result**: New data re-arms timer, could theoretically create a loop

#### Scenario 3: Cleanup Failure
- **Trigger**: Listeners not properly removed
- **Cause**: Error during cleanup, early return in handlers, or memory pressure
- **Result**: Memory leak, potential hanging

---

## Known Fixed Issues

### ✅ Issue #2389: Windows Bash Execution Hanging
- **Description**: Commands that spawn detached descendants inheriting stdout/stderr handles would spin forever
- **Affected**: `agent-browser` and similar commands
- **Status**: Fixed
- **Reference**: CHANGELOG.md

### ✅ Issue #5303: Output Truncation
- **Description**: Output was being truncated due to premature stream destruction
- **Fix**: Introduced `waitForChildProcess` with rearming timer
- **Status**: Fixed
- **Reference**: Comment in `dist/utils/child-process.js`

### ✅ PR #4013: PowerShell Shell Command Output
- **Description**: Fixed PowerShell shell command output on Windows
- **Fix**: Only spawn detached processes on Unix platforms
- **Status**: Fixed
- **Reference**: Comment in `dist/core/tools/bash.js` line 56

---

## Recommendations for Users

### If You Experience Hanging

1. **Check Command Type**: Note which commands are hanging (head, tail, grep, etc.)
2. **Test with Timeout**: Add an explicit timeout to your bash command:
   ```json
   {"type": "bash", "command": "head -n 1 file.txt", "timeout": 10}
   ```
3. **Update Pi**: Ensure you're using the latest version of pi:
   ```bash
   pi update
   ```
4. **Environment**: Note your platform (Windows/Linux/macOS) and Node.js version

### Workarounds

#### Add Explicit Timeout
Always include a timeout for bash commands that might hang:
```bash
# Instead of:
pi -e '{"type":"bash","command":"head -n 1 largefile.log"}'

# Use:
pi -e '{"type":"bash","command":"head -n 1 largefile.log","timeout":30}'
```

#### Use Alternative Commands
If `head` or `tail` hangs, try alternative approaches:
```bash
# Instead of head:
sed -n '1,10p' file.txt

# Instead of tail:
sed -n '${10,$}p' file.txt
```

#### Restart Pi Session
Sometimes a fresh session can resolve transient issues:
```bash
# Save current session context if needed
# Then start a new session
pi
```

---

## Debugging Tips

### Enable Debug Logging

Add debug logging to `waitForChildProcess` to track event sequences:

```javascript
// In your pi configuration or extension:
const originalWaitForChildProcess = require('pi-coding-agent/dist/utils/child-process.js').waitForChildProcess;

function debugWaitForChildProcess(child) {
    return new Promise((resolve, reject) => {
        console.log('[DEBUG] waitForChildProcess: Starting for pid', child.pid);
        
        let settled = false;
        let exited = false;
        let exitCode = null;
        let postExitTimer;
        let stdoutEnded = child.stdout === null;
        let stderrEnded = child.stderr === null;

        const finalize = (code) => {
            console.log('[DEBUG] waitForChildProcess: finalize called with code', code);
            if (settled) return;
            settled = true;
            cleanup();
            child.stdout?.destroy();
            child.stderr?.destroy();
            resolve(code);
        };

        const maybeFinalizeAfterExit = () => {
            console.log('[DEBUG] waitForChildProcess: maybeFinalizeAfterExit - exited=%s, stdoutEnded=%s, stderrEnded=%s', 
                        exited, stdoutEnded, stderrEnded);
            if (!exited || settled) return;
            if (stdoutEnded && stderrEnded) {
                finalize(exitCode);
            }
        };

        const armIdleTimer = () => {
            console.log('[DEBUG] waitForChildProcess: armIdleTimer');
            if (postExitTimer) clearTimeout(postExitTimer);
            postExitTimer = setTimeout(() => {
                console.log('[DEBUG] waitForChildProcess: idle timer fired');
                finalize(exitCode);
            }, 100);
        };

        // ... rest of the implementation with debug logging
        
        console.log('[DEBUG] waitForChildProcess: Attaching listeners');
        child.stdout?.once("end", onStdoutEnd);
        child.stderr?.once("end", onStderrEnd);
        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);
        child.once("error", onError);
        child.once("exit", onExit);
        child.once("close", onClose);
    });
}
```

### Test with Different Commands

Try these diagnostic commands to identify patterns:

```bash
# Test basic functionality
echo "test"

# Test with output
echo "line1" && echo "line2" && echo "line3"

# Test with pipes
yes | head -n 1
yes | head -n 100

# Test with redirection
echo "test" > /dev/null
echo "test" 2> /dev/null

# Test with no output
true

# Test with delayed output
sleep 0.1 && echo "delayed"
```

### Check Node.js Version

Some hanging issues may be Node.js version specific:

```bash
node --version
```

**Recommended**: Node.js 20.x or later

---

## Recommendations for Plugin Developers

### 1. Add Timeout Fallback

Consider adding a configurable ultimate timeout to `waitForChildProcess`:

```javascript
// In waitForChildProcess:
const ULTIMATE_TIMEOUT_MS = 30000; // 30 seconds

const ultimateTimeout = setTimeout(() => {
    if (!settled) {
        console.warn('waitForChildProcess: Ultimate timeout reached');
        finalize(exitCode);
    }
}, ULTIMATE_TIMEOUT_MS);

// Clean up in finalize:
const cleanup = () => {
    if (postExitTimer) clearTimeout(postExitTimer);
    if (ultimateTimeout) clearTimeout(ultimateTimeout);
    // ... rest of cleanup
};
```

### 2. Unify Stream Handling

Refactor to eliminate dual listener pattern:

```javascript
// Option A: Let waitForChildProcess handle everything
// - Pass data callback to waitForChildProcess
// - Let it manage listeners and cleanup

// Option B: Separate concerns
// - waitForChildProcess only waits for process exit
// - Bash tool handles all stream management
// - Don't attach 'data' listeners in waitForChildProcess
```

### 3. Improve Error Handling

Enhance cleanup to handle errors more gracefully:

```javascript
const finalize = (code) => {
    if (settled) return;
    settled = true;
    try {
        cleanup();
        child.stdout?.destroy();
        child.stderr?.destroy();
        resolve(code);
    } catch (err) {
        // Ensure we always resolve/reject
        reject(err);
    }
};
```

---

## References

### Source Code Locations

- `dist/utils/child-process.js`: `waitForChildProcess` function
- `dist/core/tools/bash.js`: Bash tool implementation
- `CHANGELOG.md`: Issue #2389 fix

### Key Files

- **Pi Repository**: https://github.com/earendil-works/pi
- **Main Issue Tracker**: https://github.com/earendil-works/pi/issues
- **Issue #5303**: Mentioned in code comments (earendil-works/pi#5303)
- **PR #2389**: https://github.com/badlogic/pi-mono/pull/2389
- **PR #4013**: https://github.com/badlogic/pi-mono/pull/4013

### Related Discussions

- Discord: https://discord.com/invite/3cU7Bz4UPx
- Pi Documentation: https://pi.dev

---

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2025-01-15 | Initial analysis of bash tool hanging issues | Pi Coding Agent |
| 2025-01-15 | Documented race conditions and edge cases | Pi Coding Assistant |
| 2025-01-15 | Added recommendations and debugging tips | Pi Coding Assistant |
