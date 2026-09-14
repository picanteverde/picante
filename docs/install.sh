#!/usr/bin/env bash
set -e

REPO="picanteverde/picante"
INSTALL_DIR="/usr/local/bin"
BIN="picante"

# Detect OS
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$OS" in
  linux)  OS="linux" ;;
  darwin) OS="darwin" ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64)   ARCH="x64" ;;
  arm64|aarch64)  ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

# Resolve latest release tag
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

if [ -z "$LATEST" ]; then
  echo "Could not resolve latest release. Check https://github.com/$REPO/releases" >&2
  exit 1
fi

ASSET="${BIN}-${OS}-${ARCH}"
URL="https://github.com/${REPO}/releases/download/${LATEST}/${ASSET}"

echo "Installing picante ${LATEST} (${OS}-${ARCH})..."

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

curl -fsSL --progress-bar "$URL" -o "$TMP"
chmod +x "$TMP"

# Remove previous version
if [ -f "$INSTALL_DIR/$BIN" ]; then
  rm -f "$INSTALL_DIR/$BIN"
fi

# Install — may need sudo
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP" "$INSTALL_DIR/$BIN"
else
  sudo mv "$TMP" "$INSTALL_DIR/$BIN"
fi

echo ""
echo "picante ${LATEST} installed to ${INSTALL_DIR}/${BIN}"
echo "Run: picante --help"
