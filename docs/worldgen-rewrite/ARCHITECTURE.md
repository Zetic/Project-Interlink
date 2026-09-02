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

`interlink-worldgen` owns deterministic generator contracts and dense physical fields/topology. It has no browser or gameplay dependency.

## Browser boundary

```text
src/worldgen/protocol.ts
src/worldgen/worldgenClient.ts
src/worldgen/worldgenWorker.ts
src/worldgen/diagnostics/
```

The Worker lazy-loads the separate generated worldgen WASM package. WG-0 uses a transferable `Uint16Array` to prove dense-field transport without routing generation through the application store. WG-1 extends the same versioned protocol with packed transferable arrays for canonical topology: positions, faces, CSR adjacency, center distances, dual-interface lengths, dual-cell areas, and refinement provenance.

## Generated WASM asset contract

WG-1 promotes the Planet Engine browser package from a transient development artifact to a committed static-hosting asset so `worldgen-lab.html` works from normal GitHub Pages after merge.

`npm run build:worldgen-wasm` writes the browser package to:

```text
src/wasm-worldgen/
```

The committed package is generated code, not hand-edited source. CI rebuilds it with the pinned `wasm-bindgen` version and byte-compares every committed output against the fresh package. TypeScript browser modules under `dist/` are likewise regenerated and checked for a clean diff. This keeps normal static hosting reproducible without moving physical generation authority out of Rust.

The production industrial runtime remains a separate WASM package under `src/wasm/`; the two packages have independent protocols and lifecycle boundaries.

## Topology algorithm boundary

Physical world-generation stages consume the narrow Rust `PlanetTopology` contract rather than icosphere construction details. The contract exposes unit positions, physical control-area weights, neighbors, center-to-center geodesic distances, and shared dual-interface lengths. This supports conservative finite-volume algorithms while allowing storage and refinement strategy to evolve internally.

## Rewrite isolation rule

No source under `src/worldgen/` or `rust/interlink-worldgen*` may depend on:

- legacy `Planet`;
- Region;
- GeographyPatch;
- resource Feature/node placement;
- MapSelection;
- NAV;
- gameplay Inspector;
- SVG geography.

This rule is regression-tested. Legacy Worldgen v7 remains the active gameplay path until a later explicit cutover stage.
