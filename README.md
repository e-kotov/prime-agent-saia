# prime-agent-saia

Prime Agent extensions for SAIA (GWDG Chat AI) models —
rate-limit display, model compatibility fixes, and more.

## Features

| Feature | Description |
|---------|-------------|
| **Rate limit display** | Shows SAIA API quotas above the editor — compact one-line or detailed view |
| **Color coding** | Green (plenty), yellow (warning), red (critical) — each counter independently |
| **LiteLLM proxy support** | Falls back to `llm_provider-*` headers when behind a proxy |
| **Qwen 3.x fix** | Rewrites OpenAI `developer` role to `system` (required by SAIA's deployments) |

## Quick install

You can install or update the extension with a single command:

```bash
curl -sSL https://raw.githubusercontent.com/e-kotov/prime-agent-saia/main/src/index.ts --create-dirs -o ~/.prime/agent/extensions/saia.ts
```

Restart Prime Agent or run `/reload` to activate.

### Uninstall

```bash
rm -f ~/.prime/agent/extensions/saia.ts
```

## Usage

The extension activates automatically when using a SAIA model.

- **Compact view** (default): `28/m · 146/h · 928/d · 3k/mo` shown above the editor
- **Detailed view**: Run `/saia-limits` to toggle detailed view with labels, limit totals, and reset countdown

Each counter is color-coded by how much quota remains:
- 🟢 Green — plenty
- 🟡 Yellow — less than 20% or fewer than 100 requests
- 🔴 Red — less than 5% or fewer than 10 requests

## How it works

SAIA's Qwen 3.x endpoints reject the OpenAI `developer` message
role. The extension changes that role to `system` for matching SAIA models.

Prime Agent sessions run extensions in a daemon worker. In that mode the
`setFooter()` component API is deliberately a no-op and cannot reach the
terminal client. `setWidget()` with `placement: "aboveEditor"` is forwarded,
so rate-limit headers are displayed compactly above the editor.

Rate limits are read from `x-ratelimit-remaining-*` response headers (with
`llm_provider-*` fallback for LiteLLM proxy setups). Each response updates
the widget above the editor. Limits are persisted to session entries for
survival across reloads.

## Development

```bash
git clone ssh://gwdg/user/egor.kotov/u14190/software/prime-agent-saia
# or
git clone git@github.com:e-kotov/prime-agent-saia.git

cd prime-agent-saia
bash install.sh

# Edit src/index.ts, then /reload in Prime Agent to test
```

To add npm dependencies, run `npm install <pkg>` in the repo root. Prime Agent
resolves `node_modules/` imports automatically when the extension file is
inside a directory with `package.json`.
