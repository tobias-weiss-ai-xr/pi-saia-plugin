---
name: saia-refresh
description: Refresh the SAIA model catalog (legacy path — see skills/saia-models.md)
provider: saia
---

> **LEGACY / FROZEN.** This skill targets the retired OpenCode config format and
> is not loaded by pi ≥ 0.84. It used to run
> `~/.config/pi/plugins/saia/generate-saia-config.sh`, which writes a config pi
> never reads. Use the commands below instead — this file names only live
> models and real paths.

The supported way to refresh the model catalog is the generator in this repo:

```bash
# Regenerate extensions/catalog.ts from the live SAIA API
./scripts/sync-saia-models.sh

# CI gate: exit non-zero when the catalog is stale (never writes)
./scripts/sync-saia-models.sh --check
```

Report the outcome:

```
SAIA model catalog refreshed.
- Models: 14 from https://chat-ai.academiccloud.de/v1/models
- Output: extensions/catalog.ts (regenerated) / "catalog is up to date"
- Status: complete
```

To confirm what pi actually sees:

```bash
pi --list-models | grep '^saia'
```

## Requirements

- A working key: `SAIA_API_KEY` or `pi auth print-api-key --provider saia`
- `jq` and `curl` on `PATH`
