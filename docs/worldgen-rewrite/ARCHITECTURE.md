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

The Worker lazy-loads the separate generated worldgen WASM package and keeps numerical generation off the main thread.

The protocol grows cumulatively by physical stage:

```text
WG-0  synthetic transport proof
WG-1  packed topology arrays
WG-2  packed plate ownership / kinematics / boundaries
WG-3  dense crust fields / geological-history fields / boundary regimes / plate summaries
```

Topology uses packed positions, faces, CSR adjacency, finite-volume geometry, and refinement provenance. WG-2/WG-3 extend that model with sample-aligned typed arrays and boundary/plate-aligned arrays rather than serializing one JavaScript object per cell. WG-3 transfers crust type/province, age, thickness, density, buoyancy, geological-history fields, geological boundary regimes/polarity, and derived plate summaries as transferable buffers.

The diagnostic lab is a consumer of those arrays. It does not own physical generation logic and changing globe/map projection does not change world truth.

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

WG-2 and WG-3 consume only this topology contract plus accepted upstream physical-stage outputs. Crustal state is not embedded in `PlanetTopology`, and geological history does not alter WG-2 plate ownership or motion.

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
