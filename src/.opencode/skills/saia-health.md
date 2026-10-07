---
name: saia-health
description: Check SAIA API + plugin health (legacy path — see skills/saia-models.md)
provider: saia
---

> **LEGACY / FROZEN.** This skill targets the retired OpenCode config format and
> is not loaded by pi ≥ 0.84. Its checks used to look for
> `~/.config/pi/plugins/saia/pi-saia.json` and `~/.config/pi/pi.json`, which a
> modern pi never creates. The commands below are the real ones.

Verify each layer, in order:

```bash
# 1. API reachable + key accepted (expect HTTP 200, 14 models)
curl -s -o /dev/null -w "%{http_code}\n" \
  https://chat-ai.academiccloud.de/v1/models \
  -H "Authorization: Bearer $(pi auth print-api-key --provider saia)"

# 2. Package registered with pi
pi list

# 3. Provider + models visible
pi --list-models | grep -c '^saia'        # expect 22 (14 models + 8 aliases)

# 4. Key resolves
pi auth print-api-key --provider saia

# 5. Catalog is not stale
./scripts/sync-saia-models.sh --check
```

## Health report

- **API status**: reachable | unreachable
- **API key**: valid | invalid/expired
- **Package registered**: yes | no
- **Models visible**: N (expect 22)
- **Catalog fresh**: yes | stale

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| HTTP 401 | Rotate the key in `auth.json` too — `pi auth` — a stale entry there beats the env var |
| Model missing | `./scripts/sync-saia-models.sh` then `/reload` |
| Empty output, no error | Check the rate limit: `x-ratelimit-remaining-hour` (30/min · 200/h · 1k/day). pi prints nothing on 429 |
| Request hangs | SAIA capacity/cold start. Raise `retry.provider.timeoutMs` / `maxRetries` in `~/.pi/agent/settings.json` |
