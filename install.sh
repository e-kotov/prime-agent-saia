#!/usr/bin/env bash
set -euo pipefail

# prime-agent-saia installer
# Creates a symlink so Prime Agent discovers the SAIA extension.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/src/index.ts"
EXTENSIONS_DIR="${PRIME_AGENT_DIR:-$HOME/.prime/agent/extensions}"
TARGET="$EXTENSIONS_DIR/saia.ts"

mkdir -p "$EXTENSIONS_DIR"

if [ -f "$TARGET" ] || [ -L "$TARGET" ]; then
  echo "  Removing previous saia.ts extension..."
  rm -f "$TARGET"
fi

ln -sf "$SOURCE" "$TARGET"
echo "✓ Symlinked $TARGET -> $SOURCE"
echo ""
echo "  Restart Prime Agent or run /reload to activate."
echo "  The extension activates automatically when using a SAIA model."
