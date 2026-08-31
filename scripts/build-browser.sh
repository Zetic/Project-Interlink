#!/usr/bin/env bash
set -euo pipefail
rm -rf dist
npx tsc -p tsconfig.build.json
mkdir -p dist/src/wasm
cp src/wasm/interlink_wasm.js dist/src/wasm/
cp src/wasm/interlink_wasm.d.ts dist/src/wasm/
cp src/wasm/interlink_wasm_bg.wasm dist/src/wasm/
cp src/wasm/interlink_wasm_bg.wasm.d.ts dist/src/wasm/
