# prime-agent-saia

Prime Agent extensions for SAIA (GWDG Chat AI) models.

## Current extensions

| File | Purpose |
|------|---------|
| `src/index.ts` | Rewrites `developer` to `system` for SAIA Qwen 3.5/3.6 and shows SAIA response rate limits above the editor. |

## How it works

SAIA's Qwen 3.5 and Qwen 3.6 endpoints reject the OpenAI `developer` message
role. The extension changes only that role to `system` for matching SAIA models.

Prime Agent sessions run extensions in a daemon worker. In that mode the
`setFooter()` component API is deliberately a no-op and cannot reach the
terminal client. `setWidget(..., { placement: "aboveEditor" })` is forwarded,
so the latest `x-ratelimit-remaining-minute` and
`x-ratelimit-remaining-hour` headers are displayed immediately above the
editor as, for example, `SAIA quota • 29 requests left this minute • 159
requests left this hour`. Run `/saia-limits` to re-show the latest value.

## Installation

```bash
# Symlink the extension so Prime Agent discovers it
ln -sf "$PWD/src/index.ts" ~/.prime/agent/extensions/saia.ts
```

Restart Prime Agent (or use `/reload`). The extension activates automatically
when a SAIA Qwen 3.5/3.6 model is in use.

## Development

Add new `.ts` files in `src/`. To register multiple entry points, create
separate symlinks in `~/.prime/agent/extensions/`.

For extensions that need npm dependencies, add a `package.json` here and run
`npm install`. Prime Agent resolves `node_modules/` imports automatically when
the extension file is inside a directory with `package.json`.
