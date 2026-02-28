#!/usr/bin/env bash
# Clear macOS quarantine so the unzipped Hyperclaw.app can open (unsigned local build).
# Usage: ./open-mac-app.sh [path/to/Hyperclaw.app]

APP_PATH="${1:-Hyperclaw.app}"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Usage: $0 [path/to/Hyperclaw.app]"
  echo "Example: $0 ~/Downloads/Hyperclaw.app"
  exit 1
fi
echo "Clearing quarantine and opening: $APP_PATH"
xattr -cr "$APP_PATH"
open "$APP_PATH"
