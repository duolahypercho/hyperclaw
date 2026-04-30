#!/usr/bin/env bash
# install.sh — wire any agent runtime to the local Hyperclaw connector.
#
# Usage:
#   ./install.sh <runtime> [target]   install runtime adapter
#   ./install.sh add <runtime> [t]    add adapter to an existing workspace
#   ./install.sh remove <runtime> [t] uninstall adapter
#   ./install.sh status [t]           show installed adapters
#   ./install.sh doctor [t]           verify wiring + MCP reachability
#   ./install.sh                      list available runtimes
#
# runtime: claude-code | codex | openclaw | hermes | cursor | windsurf | opencode
# target:  workspace dir (default: $HOME/.hyperclaw/agents/$(basename $PWD))
#
# Every verb reduces to one POST against the connector's bridge endpoint.
# The connector daemon must be running (default: http://127.0.0.1:18790).
# Nothing in this script writes config files itself — the connector owns
# all install/state/uninstall logic so dashboard- and CLI-driven installs
# always agree.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
export HYPERCLAW_INSTALL_ROOT="$HERE"

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required but not found on PATH." >&2
  exit 1
fi

exec python3 -m installer "$@"
