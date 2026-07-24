#!/bin/bash
set -euo pipefail

ARCH="$(uname -m)"
case "$ARCH" in
  arm64)
    BUILD_ARCH="arm64"
    MAC_LABEL="Apple silicon"
    EXPECTED_SHA="246c4b2a790472717b03d608bb9c43236ed306420b0a8d79e581f7a985025818"
    ;;
  x86_64)
    BUILD_ARCH="x64"
    MAC_LABEL="Intel"
    EXPECTED_SHA="0bf759b275544c4fcde13823b5538e33c3b06ae38c58425e0955c31aee968f1a"
    ;;
  *)
    echo "Dude Companion supports Apple silicon (arm64) and Intel (x86_64) Macs. This Mac reports: $ARCH" >&2
    exit 1
    ;;
esac

WORK_DIR="$(mktemp -d -t dude-companion.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT
DMG="$WORK_DIR/Dude-Companion.dmg"
DOWNLOAD_URL="https://github.com/Sanal-Sivakumar/dude-companion/releases/download/v0.2.0/Dude-Companion-0.2.0-${BUILD_ARCH}.dmg"

echo "Downloading Dude Companion 0.2.0 for $MAC_LABEL…"
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
