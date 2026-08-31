#!/usr/bin/env bash
set -euo pipefail

rm -rf dist
npx tsc -p tsconfig.build.json

mkdir -p dist/src/wasm
cp src/wasm/interlink_wasm.js dist/src/wasm/
cp src/wasm/interlink_wasm.d.ts dist/src/wasm/
cp src/wasm/interlink_wasm_bg.wasm dist/src/wasm/
cp src/wasm/interlink_wasm_bg.wasm.d.ts dist/src/wasm/

# Produce a self-contained static site. The repository-root index keeps its
# development path (`dist/src/app.js`); the published copy points at the
# compiled module relative to the Pages artifact root.
cp index.html dist/index.html
cp styles.css dist/styles.css
cp workspace-overrides.css dist/workspace-overrides.css
cp apparatus-controls.css dist/apparatus-controls.css
cp feature-inspector.css dist/feature-inspector.css
cp debug-overlay.css dist/debug-overlay.css
sed -i 's|src="dist/src/app.js"|src="src/app.js"|' dist/index.html

# GitHub Pages should serve the compiled output verbatim rather than run Jekyll.
touch dist/.nojekyll
