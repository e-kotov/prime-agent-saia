# prime-agent-saia

Prime Agent extensions for SAIA (GWDG Chat AI) models.

## Current extensions

| File | Purpose |
|------|---------|
| `src/index.ts` | **Qwen system-message merger** — merges multiple system message fragments into one for Qwen 3.5/3.6 models on SAIA. Fixes HTTP 400 `"Unexpected message role."` |

## How it works

SAIA's vLLM backend for Qwen 3.5 and Qwen 3.6 models requires exactly one
leading `system` message. Prime Agent's system prompt is built from several
fragments (base prompt, harness memories/skills, tool definitions, etc.) and
fragments can end up as separate messages. This extension intercepts the
provider request payload and merges all `system`-role messages into one.

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
