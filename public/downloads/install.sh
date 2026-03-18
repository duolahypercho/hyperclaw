#!/bin/bash
set -e

HUB_URL="${HUB_URL:-https://hub.hypercho.com}"
INSTALL_DIR="$HOME/.hyperclaw"

# --- Parse arguments ---
TOKEN=""
DEVICE_ID=""
EMAIL=""
PASSWORD=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2 ;;
    --device-id) DEVICE_ID="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --hub-url) HUB_URL="$2"; shift 2 ;;
    *) TOKEN="$1"; shift ;;  # bare arg = token
  esac
done

# --- Detect OS and architecture ---
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

case "$OS" in
  darwin|linux) ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

BINARY_NAME="hyperclaw-connector-${OS}-${ARCH}"
DOWNLOAD_URL="${HUB_URL}/downloads/${BINARY_NAME}"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   HyperClaw Connector Installer          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "OS: ${OS}/${ARCH}"
echo "Download: ${DOWNLOAD_URL}"
echo ""

# --- Check if already installed and running ---
if [ -x "${INSTALL_DIR}/hyperclaw-connector" ]; then
  if pgrep -f "hyperclaw-connector" >/dev/null 2>&1; then
    echo "Connector is already running. Stopping it first..."
    pkill -f "hyperclaw-connector" 2>/dev/null || true
    sleep 1
  fi
  echo "Existing installation found. Updating..."
fi

# --- Download binary ---
mkdir -p "$INSTALL_DIR"
echo "Downloading connector..."

if command -v curl &>/dev/null; then
  HTTP_CODE=$(curl -sL -w "%{http_code}" -o "${INSTALL_DIR}/hyperclaw-connector" "$DOWNLOAD_URL")
  if [ "$HTTP_CODE" != "200" ]; then
    echo "Download failed (HTTP $HTTP_CODE). Check your internet connection."
    rm -f "${INSTALL_DIR}/hyperclaw-connector"
    exit 1
  fi
elif command -v wget &>/dev/null; then
  wget -q -O "${INSTALL_DIR}/hyperclaw-connector" "$DOWNLOAD_URL" || {
    echo "Download failed. Check your internet connection."
    rm -f "${INSTALL_DIR}/hyperclaw-connector"
    exit 1
  }
else
  echo "Error: curl or wget is required."
  exit 1
fi

chmod +x "${INSTALL_DIR}/hyperclaw-connector"
echo "Downloaded to ${INSTALL_DIR}/hyperclaw-connector"

# --- Save credentials ---
if [ -n "$TOKEN" ]; then
  echo "$TOKEN" > "${INSTALL_DIR}/device.token"
  echo "Saved device token."
fi

if [ -n "$DEVICE_ID" ]; then
  echo "$DEVICE_ID" > "${INSTALL_DIR}/device.id"
  echo "Saved device ID."
fi

# --- Write .env for connector ---
{
  [ -n "$TOKEN" ] && echo "DEVICE_TOKEN=$TOKEN"
  [ -n "$DEVICE_ID" ] && echo "DEVICE_ID=$DEVICE_ID"
  echo "HUB_URL=${HUB_URL/https/wss}"
} > "${INSTALL_DIR}/.env"

# --- Install as service (also auto-installs OpenClaw plugin) ---
echo ""
echo "Installing as background service..."
"${INSTALL_DIR}/hyperclaw-connector" install

echo ""
echo "Done! HyperClaw Connector is installed and running."
echo ""
echo "What happened:"
echo "  1. Downloaded connector binary"
echo "  2. Installed as background service (auto-starts on login)"
echo "  3. Installed OpenClaw plugin (hyperclaw_* tools now available)"
echo ""
echo "Useful commands:"
echo "  ~/.hyperclaw/hyperclaw-connector status      # Check service status"
echo "  ~/.hyperclaw/hyperclaw-connector version      # Show version"
echo "  ~/.hyperclaw/hyperclaw-connector uninstall    # Remove completely"
