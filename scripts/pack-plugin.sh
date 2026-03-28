#!/usr/bin/env bash
# Pack the HyperClaw OpenClaw plugin for distribution and sync to connector.
#
# Usage:
#   ./scripts/pack-plugin.sh              # pack tarball + sync to connector
#   ./scripts/pack-plugin.sh --tar-only   # pack tarball only (skip connector sync)
#
# What it does:
#   1. Creates public/hyperclaw-plugin.tgz from extensions/hyperclaw/
#   2. Copies source files to ../hyperclaw-connector/internal/plugin/embed/
#      so the connector binary embeds the latest plugin on next build.
#
# After running this:
#   - Deploy Hyperclaw_app so the tarball is live at claw.hypercho.com/hyperclaw-plugin.tgz
#   - Rebuild the connector so fresh installs get the new embedded plugin
#   - To push to existing connectors, send "update-plugin" from the hub

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/extensions/hyperclaw"
TARBALL="$REPO_ROOT/public/hyperclaw-plugin.tgz"
CONNECTOR_EMBED="$REPO_ROOT/../hyperclaw-connector/internal/plugin/embed"

# Verify plugin source exists
if [ ! -f "$PLUGIN_DIR/package.json" ]; then
  echo "Error: extensions/hyperclaw/package.json not found"
  exit 1
fi

# Read version from package.json
VERSION=$(node -e "console.log(require('$PLUGIN_DIR/package.json').version)")
echo "Packing plugin v$VERSION..."

# 1. Build tarball (exclude node_modules, .installed marker)
tar -czf "$TARBALL" \
  -C "$REPO_ROOT/extensions" \
  --exclude='node_modules' \
  --exclude='.installed' \
  --exclude='.DS_Store' \
  hyperclaw/

echo "Tarball: $TARBALL ($(du -h "$TARBALL" | cut -f1))"

# 2. Sync to connector embed (unless --tar-only)
if [ "${1:-}" != "--tar-only" ]; then
  if [ -d "$CONNECTOR_EMBED" ]; then
    cp "$PLUGIN_DIR/index.ts"              "$CONNECTOR_EMBED/index.ts"
    cp "$PLUGIN_DIR/bridge.ts"             "$CONNECTOR_EMBED/bridge.ts"
    cp "$PLUGIN_DIR/package.json"          "$CONNECTOR_EMBED/package.json"
    cp "$PLUGIN_DIR/openclaw.plugin.json"  "$CONNECTOR_EMBED/openclaw.plugin.json"
    echo "Synced to connector embed: $CONNECTOR_EMBED"
  else
    echo "Warning: connector embed dir not found at $CONNECTOR_EMBED (skipping sync)"
  fi
fi

echo "Done. Plugin v$VERSION packed."
