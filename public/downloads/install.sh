#!/usr/bin/env bash
set -euo pipefail

# HyperClaw Connector installer
# Usage: curl -fsSL https://claw.hypercho.com/downloads/install.sh | bash -s -- --token TOKEN --device-id DEVICE_ID

REPO="Hypercho-Inc/hyperclaw-connector"
INSTALL_DIR="$HOME/.hyperclaw"
BIN_NAME="hyperclaw-connector"

# ── Helpers ──────────────────────────────────────────────────────────

info()  { printf "\033[0;34m→\033[0m %s\n" "$*"; }
ok()    { printf "\033[0;32m✓\033[0m %s\n" "$*"; }
err()   { printf "\033[0;31m✗\033[0m %s\n" "$*" >&2; }
fatal() { err "$@"; exit 1; }

# ── Detect platform ─────────────────────────────────────────────────

detect_platform() {
  local os arch

  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux"  ;;
    MINGW*|MSYS*|CYGWIN*) fatal "Windows is not supported by this installer. Download manually from GitHub releases." ;;
    *) fatal "Unsupported OS: $(uname -s)" ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)   arch="amd64"  ;;
    arm64|aarch64)   arch="arm64"  ;;
    armv7l|armhf)    arch="arm"    ;;
    *) fatal "Unsupported architecture: $(uname -m)" ;;
  esac

  echo "${os}_${arch}"
}

# ── Find latest release ─────────────────────────────────────────────

get_latest_version() {
  local url="https://api.github.com/repos/${REPO}/releases/latest"
  local version

  if command -v curl &>/dev/null; then
    version=$(curl -fsSL "$url" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/')
  elif command -v wget &>/dev/null; then
    version=$(wget -qO- "$url" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/')
  else
    fatal "Neither curl nor wget found. Install one and try again."
  fi

  if [ -z "$version" ]; then
    fatal "Could not determine latest version. Check https://github.com/${REPO}/releases"
  fi

  echo "$version"
}

# ── Download and install ─────────────────────────────────────────────

download_binary() {
  local version="$1"
  local platform="$2"
  local filename="${BIN_NAME}-${platform}"
  local url="https://github.com/${REPO}/releases/download/${version}/${filename}"
  local tmp

  tmp=$(mktemp)
  trap "rm -f '$tmp'" EXIT

  info "Downloading ${filename} (${version})..."

  if command -v curl &>/dev/null; then
    if ! curl -fSL --progress-bar "$url" -o "$tmp"; then
      fatal "Download failed. Check if release exists: https://github.com/${REPO}/releases/tag/${version}"
    fi
  elif command -v wget &>/dev/null; then
    if ! wget -q --show-progress "$url" -O "$tmp"; then
      fatal "Download failed. Check if release exists: https://github.com/${REPO}/releases/tag/${version}"
    fi
  fi

  mkdir -p "$INSTALL_DIR"
  mv "$tmp" "${INSTALL_DIR}/${BIN_NAME}"
  chmod +x "${INSTALL_DIR}/${BIN_NAME}"
  trap - EXIT

  ok "Installed to ${INSTALL_DIR}/${BIN_NAME}"
}

# ── Main ─────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║   HyperClaw Connector Installer          ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo ""

  # Check if already installed and running
  if [ -x "${INSTALL_DIR}/${BIN_NAME}" ]; then
    if pgrep -f "${BIN_NAME}" >/dev/null 2>&1; then
      info "Connector is already running. Stopping it first..."
      pkill -f "${BIN_NAME}" 2>/dev/null || true
      sleep 1
    fi
    info "Existing installation found. Updating..."
  fi

  local platform
  platform=$(detect_platform)
  info "Platform: ${platform}"

  local version
  version=$(get_latest_version)
  info "Latest version: ${version}"

  download_binary "$version" "$platform"

  # Pass through all arguments (--token, --device-id, etc.)
  info "Starting connector..."
  echo ""

  exec "${INSTALL_DIR}/${BIN_NAME}" "$@"
}

main "$@"
