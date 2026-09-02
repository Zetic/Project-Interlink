# Planet Engine Architecture

## Ownership

```text
Legacy game path                         Planet Engine rewrite
────────────────                         ─────────────────────
TypeScript legacy worldgen               TypeScript diagnostic client
        ↓                                         ↓
Regions / Features                       dedicated Worldgen Worker
        ↓                                         ↓
existing game                            separate worldgen WASM package
                                                  ↓
                                         interlink-worldgen (Rust)
```

The realtime industrial runtime remains separate. World generation and realtime process simulation have different load timing, memory profiles, APIs, and lifecycle.

## Rust workspace

WG-0 introduces:

```text
rust/interlink-worldgen/       physical generation core
rust/interlink-worldgen-wasm/  browser/Worker boundary only
rust/interlink-worldgen-cli/   native diagnostics and profiling
```

`interlink-worldgen` owns deterministic generator contracts and dense fields. It has no browser or gameplay dependency.

## Browser boundary

```text
src/worldgen/protocol.ts
src/worldgen/worldgenClient.ts
src/worldgen/worldgenWorker.ts
src/worldgen/diagnostics/
```

The Worker lazy-loads the separate generated worldgen WASM package. WG-0 uses a transferable `Uint16Array` to prove dense-field transport without routing generation through the application store.

## Generated WASM assets during the rewrite

Until Planet Engine cutover, the worldgen WASM package is a development/CI artifact rather than a production game dependency. `npm run build:worldgen-wasm` writes the local browser package to `src/wasm-worldgen/`; that directory is ignored. CI packages the module independently and verifies the expected outputs.

When the game begins consuming Planet Engine output, generated-asset deployment/parity becomes part of the production static-hosting contract.

## WG-0 isolation rule

No source under `src/worldgen/` or `rust/interlink-worldgen*` may depend on:

- legacy `Planet`;
- Region;
- GeographyPatch;
- resource Feature/node placement;
- MapSelection;
- NAV;
- gameplay Inspector;
- SVG geography.

This rule is regression-tested.
