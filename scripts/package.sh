#!/usr/bin/env bash
# Build a distributable zip of the extension (for GitHub releases / Chrome Web Store upload).
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
out="dist/openDXF-belgium-v${version}.zip"
mkdir -p dist && rm -f "$out"
(cd extension && zip -qr "../$out" . -x '*.DS_Store')
echo "$out"
