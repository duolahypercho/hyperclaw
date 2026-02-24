#!/usr/bin/env bash
# Clear macOS quarantine so the unzipped Copanion.app can open (unsigned local build).
# Usage: ./open-mac-app.sh [path/to/Copanion.app]

APP_PATH="${1:-Copanion.app}"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Usage: $0 [path/to/Copanion.app]"
  echo "Example: $0 ~/Downloads/Copanion.app"
  exit 1
fi
echo "Clearing quarantine and opening: $APP_PATH"
xattr -cr "$APP_PATH"
open "$APP_PATH"
