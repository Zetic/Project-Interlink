# Project Interlink — Current Architecture

This document is the source of truth for current browser code ownership, dependency direction, runtime authority, and extension paths. `DESIGN.md` describes long-term game design. `MATERIAL_REACTION_SYSTEM.md` describes the material/reaction direction. `ARCHITECTURE_PERFORMANCE.md` defines realtime performance constraints. Historical migration details belong in Git history.

## 1. Production runtime authority

Project Interlink has one production physical-simulation authority:

```text
Browser main thread
  TypeScript UI / world authoring / graph authoring
             ↓ setup, commands, queries
Dedicated module Worker
             ↓
WasmPackedWorldRuntime
             ↓
Rust interlink-runtime scheduler
             ↓
Rust domain crates
```

Rust/WASM owns all time-evolving physical state and execution, including fixed-step advancement, retained inventories, material transfer, apparatus execution, routing/backpressure, comminution, separation, thermal state, reaction execution, conservation, and operating state.

The browser owns deterministic authored world data, graph topology, apparatus configuration, runtime setup compilation, Worker lifecycle/protocol/pacing, presentation projection, and DOM interaction. There is no browser-side fallback physics engine.

## 2. Browser source and generated output

Browser/application source is TypeScript. The active composition root is `src/app.ts`; `tsc` emits committed browser modules under `dist/`, and `index.html` loads `dist/app.js`.

```text
docs/             project design and architecture references
styles/           browser stylesheets
src/
├── app.ts
├── apparatus/     typed apparatus catalog and parameters
├── debug/         telemetry, runtime capabilities, debug factory fixture
├── graph/         flat mechanical graph contracts, commands, queries
├── map/           camera, rendering, interaction, live map presentation
├── material/      authored material/species/particulate/reaction contracts
├── runtime/       runtime plan, Worker setup, protocol, controller, Worker
├── state/         application state and domain-selective subscriptions
├── ui/            workspace shell, NAV, NODE, Inspector, DEBUG
├── world/         flat world model, deterministic generation, geometry/scale
└── wasm/          generated wasm-bindgen browser package

dist/             generated JavaScript emitted from TypeScript
tests/            active TypeScript Node regression harness
rust/             authoritative physical runtime and domain crates
```

Handwritten browser JavaScript source is intentionally absent. JavaScript under `dist/` is generated TypeScript output. `src/wasm/interlink_wasm.js` is generated wasm-bindgen glue. Active regression tests are TypeScript. Generated `dist/**` and `src/wasm/**` paths are marked `linguist-generated` so GitHub language statistics reflect authored source rather than committed build products.

Do not add a parallel handwritten JavaScript implementation or compatibility tree. New browser and regression source belongs in TypeScript.

## 3. State domains

The active application separates:

```text
Authored world state
  deterministic Planet / Region / resource FEATURE data

Mechanical graph state
  player-authored apparatus, containers, ports, connections, parameters

Rust runtime state
  authoritative transient physical execution state

Application/presentation state
  selection, camera, interaction, runtime projections, telemetry
```

`AppStore` owns browser application state and supports domain-selective subscriptions so runtime/telemetry updates do not force structural map/UI rebuilds.

Runtime snapshots and rich detail queries are projections of Rust authority. They must not become a second mutable physics state in TypeScript.

## 4. Flat world model

The browser world is deliberately flat at engineering scale:

```text
Planet
└── Regions
    └── resource FEATURE nodes
```

A resource FEATURE is a natural source node with a `resource-access` output. `resource-access` authorizes/selects a source and carries no matter. Physical material flow starts at an Extractor material output.

The current browser architecture does not use nested Site workspaces, child workspaces, boundary-transfer terminals, or recursive system ownership. Do not restore those concepts as compatibility infrastructure unless a future design change explicitly requires them.

World generation is deterministic and seeded. Current generation uses one continuous Earth-scale logical map, irregular Region polygons, and flat resource FEATURE placement. `src/world/` owns the canonical world contracts and generation algorithms.

## 5. Apparatus and graph authoring

`src/apparatus/definitions.ts` is the canonical player-facing machine catalog. Definitions own identity, category, search metadata, physical footprint metadata, typed ports/capabilities, player parameters, and fixed runtime defaults.

Current catalog:

```text
Extractor
Jaw Crusher
Cone Crusher
Ball Mill
Screen
Splitter
Material Merger
Feeder
Dry Drum Magnetic Separator
Electric Roasting Furnace
Exhaust Vent
Hopper
```

`src/graph/` owns the flat mechanical graph. Graph commands enforce port direction/kind/medium compatibility, material-output fan-out rules, explicit Splitter/Merger topology, and stored/metered/gas capability contracts before runtime compilation.

Canonical string IDs remain browser-side authored identities. Numeric runtime IDs are transient packed execution identifiers.

## 6. Material and reaction authoring

`src/material/` contains readable TypeScript contracts and tables used by generation, runtime setup, validation, and presentation. Rust owns mutable material bodies after runtime initialization.

The current detailed solid-particulate representation is conceptually:

```text
species × particle-size bin × liberation class × texture lineage → quantity
```

TypeScript includes the material species registry, particle-size/liberation vocabulary, occurrence-specific mineral texture and comminution properties, magnetic/thermal setup properties, and the current goethite dehydroxylation reaction definition with conservation validation.

Cross-form DTO vocabulary includes solid particulate, liquid, gas, bulk solid, and product descriptors, but only forms with a connected runtime path should be treated as implemented gameplay systems.

## 7. Runtime compilation and Worker boundary

The active runtime path is:

```text
AppStore world + graph
  ↓
compileFlatRuntimePlan
  ↓
compileFlatWorkerSetup
  ↓
runtimeController
  ↓
fullRuntimeWorker
  ↓
WasmPackedWorldRuntime
```

The full Worker setup reconnects the complete current apparatus catalog. Structural graph changes rebuild the Worker runtime. Parameter-only changes use Rust live-reconfiguration APIs where supported so retained Hopper/Furnace/Vent state is preserved transactionally.

Routine runtime responses are compact snapshots. Rich Hopper, Furnace, and Exhaust Vent details are queried only for selected entities. The main thread must not receive or clone the full physical world every fixed step.

## 8. UI and presentation

`src/ui/` and `src/map/` own presentation only. Important boundaries:

- structural map rendering subscribes to structural state domains;
- runtime text/fill updates are applied without rebuilding geometry;
- Inspector runtime details come from authoritative snapshots/queries;
- NODE placement and parameter controls mutate graph authoring state through graph commands;
- DEBUG pause/step/profiling controls send commands through `RuntimeController`;
- debug Create Factory builds a normal graph fixture beside an explicitly selected resource FEATURE and then uses the same production runtime path.

The map uses one continuous Earth-scale coordinate space with deep engineering zoom and a floating render origin. Engineering cards use a fixed visual grammar independent of apparatus physical footprint metadata.

## 9. JavaScript and generated-file policy

Tracked JavaScript has two allowed production/build roles:

1. `dist/**/*.js` — generated TypeScript browser output required by the current static-hosting build.
2. `src/wasm/interlink_wasm.js` — generated wasm-bindgen glue required by the Worker.

Active Node regressions are `tests/**/*.test.ts`. Do not add handwritten `.js` implementation or test modules. Do not edit `dist/` manually; `npm run build` removes the previous `dist/` tree before compiling so deleted TypeScript cannot leave orphaned generated modules. Commit the resulting generated output exactly. Do not hand-edit generated wasm-bindgen glue.

`.gitattributes` marks `dist/**` and `src/wasm/**` as `linguist-generated`. This keeps required generated artifacts in Git while excluding them from GitHub repository language statistics and collapsing them by default in diffs.

The raw wasm-bindgen export declaration `interlink_wasm_bg.wasm.d.ts` is not committed because application TypeScript consumes the high-level `interlink_wasm.d.ts` API instead. The build may generate the raw declaration locally, and `.gitignore` excludes it.

## 10. Extension rules

When adding browser behavior:

1. add/extend canonical TypeScript contracts;
2. mutate authored state through graph/world/state APIs rather than DOM state;
3. compile coarse runtime setup or commands;
4. execute physical behavior in Rust/WASM;
5. project authoritative state back through snapshots/details;
6. add focused TypeScript/Rust-facing regression coverage;
7. regenerate and commit `dist/` when TypeScript changes.

When adding a new physical mechanic, do not create TypeScript or JavaScript fallback physics. Extend the Rust runtime/domain crates and the coarse TypeScript setup/protocol surface instead.
