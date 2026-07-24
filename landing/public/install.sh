#!/bin/bash
set -euo pipefail

ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]]; then
  echo "Dude Companion preview currently supports Apple silicon Macs (arm64)." >&2
  exit 1
fi

WORK_DIR="$(mktemp -d -t dude-companion.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT
DMG="$WORK_DIR/Dude-Companion.dmg"
DOWNLOAD_URL="https://github.com/Sanal-Sivakumar/dude-companion/releases/download/v0.1.0/Dude-Companion-0.1.0-arm64.dmg"
EXPECTED_SHA="fbf735a416dbf064d513315eefef12dbd2066d0eca1e7e054585817a91e64ecb"

echo "Downloading Dude Companion 0.1.0 for Apple silicon…"
curl -fL --retry 3 --progress-bar "$DOWNLOAD_URL" -o "$DMG"

ACTUAL_SHA="$(shasum -a 256 "$DMG" | awk '{print $1}')"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "Download verification failed. Nothing was installed." >&2
  exit 1
fi

MOUNT_DIR="$WORK_DIR/mount"
mkdir -p "$MOUNT_DIR"
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT_DIR"
trap 'hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true; rm -rf "$WORK_DIR"' EXIT

ditto "$MOUNT_DIR/Dude Companion.app" "/Applications/Dude Companion.app"
hdiutil detach "$MOUNT_DIR" -quiet
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Installed Dude Companion in /Applications. Opening it now…"
open -a "Dude Companion"
