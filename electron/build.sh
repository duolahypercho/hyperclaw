#!/bin/bash
# Hyperclaw Build Script
# Usage: ./build.sh [local|remote] [dmg|zip]

set -e

MODE=${1:-local}
TARGET=${2:-dmg}

echo "🚀 Building Hyperclaw (mode: $MODE, target: $TARGET)"

cd "$(dirname "$0")"

# Clean previous build
rm -rf dist-electron

# Build
if [ "$TARGET" = "dmg" ]; then
  npx electron-builder --mac --config.mac.target=dmg
elif [ "$TARGET" = "zip" ]; then
  npx electron-builder --mac --config.mac.target=zip
else
  echo "Unknown target: $TARGET"
  exit 1
fi

# Verify signature
echo ""
echo "✅ Build complete!"
echo "📦 Output: dist-electron/"

# Check signature
APP_PATH="dist-electron/mac-arm64/Hyperclaw.app"
if [ -d "$APP_PATH" ]; then
  echo ""
  echo "🔍 Verifying signature..."
  codesign -dvv "$APP_PATH" 2>&1 | grep -E "Authority=|Timestamp="
fi
