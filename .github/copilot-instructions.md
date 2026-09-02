# Project Interlink — Coding Agent Guardrails

Read the active request plus `ARCHITECTURE.md` before editing runtime, graph, world, or UI code. Historical migration architecture is not an implementation target.

## Working rules

- Prefer the smallest coherent change that satisfies the active task.
- Preserve deterministic authoring, typed graph contracts, physical ownership, conservation, and runtime-authority boundaries unless the task explicitly changes them.
- Add focused regressions for new invariants and bug fixes.
- Run the complete relevant browser and Rust/WASM validation before declaring work complete.
- Update active documentation when code ownership or current behavior materially changes.
- Do not retain or recreate dead compatibility source.

## Production runtime authority

```text
TypeScript main-thread application
        ↓ coarse setup / commands / queries
module Worker
        ↓
WasmPackedWorldRuntime
        ↓
Rust interlink-runtime + domain crates
```

Rust/WASM owns fixed-step physical time advancement, retained material/thermal state, apparatus execution, routing/backpressure, conservation-sensitive transformations, and process physics.

TypeScript owns deterministic authored world data, readable graph/configuration state, setup compilation, Worker lifecycle/protocol/pacing, authoritative presentation projection, and DOM interaction.

Do not:

- create TypeScript or JavaScript fallback physics;
- advance production physical time on the main thread;
- recreate standalone per-apparatus WASM browser runtimes;
- send full physical-world state across the Worker boundary every fixed step;
- add per-population/per-machine browser↔WASM hot loops.

## Browser source policy

Production browser source is TypeScript.

```text
src/app.ts        composition root
src/apparatus/    apparatus catalog/parameters
src/debug/        telemetry, capabilities, debug fixtures
src/graph/        flat graph contracts/commands/queries
src/map/          map camera/rendering/interactions
src/material/     authored material/reaction contracts
src/runtime/      runtime plan/setup/protocol/controller/Worker
src/state/        AppStore and subscriptions
src/ui/           NAV/NODE/Inspector/DEBUG/shell
src/world/        flat world model/generation/geometry/scale
src/wasm/         generated wasm-bindgen package
```

`dist/**/*.js` is generated from TypeScript and is committed for static hosting. `src/wasm/interlink_wasm.js` is generated wasm-bindgen glue. Do not hand-edit either as source. Both generated trees are marked `linguist-generated` so they do not distort GitHub language statistics.

Do not add handwritten production `.js` modules under `src`. Active Node regressions are TypeScript under `tests/**/*.test.ts`; they may import generated `dist/` modules or inspect TypeScript/Rust source as appropriate.

## Flat browser world

The active browser model is:

```text
Planet → Regions → resource FEATURE nodes
```

Resource FEATURE nodes live directly on the continuous map. The browser does not use nested Site workspaces, child workspaces, boundary-transfer terminals, or recursive system ownership. Do not restore retired hierarchy concepts for compatibility.

A `resource-access` edge authorizes/selects a source and carries no matter. Physical flow begins at an Extractor material output.

## Graph and apparatus

`src/apparatus/definitions.ts` is the canonical player-facing apparatus catalog. Do not create a second machine catalog or machine-pair whitelist.

`src/graph/` owns authoring mutations and compatibility checks. Preserve:

- one input source per input port;
- no implicit material-output fan-out;
- explicit Splitter for fan-out;
- explicit Material Merger for fan-in;
- stored/metered solid capability semantics;
- gas capability semantics;
- canonical string IDs in authored state.

Runtime-local numeric IDs are transient packing details.

## Material and reaction model

TypeScript owns readable definitions and setup metadata. Rust owns mutable inventories and physical transformations.

Detailed particulate identity is conceptually:

```text
species × particle-size bin × liberation class × texture lineage → quantity
```

Preserve occurrence-specific texture, staged size vocabulary, liberation state, magnetic response, thermal state, and reaction conservation when extending existing ore-processing behavior.

Do not simplify an existing physical mechanic merely because browser-side code is being changed.

## Runtime setup and Worker

Active runtime path:

```text
compileFlatRuntimePlan
  → compileFlatWorkerSetup
  → runtimeController
  → fullRuntimeWorker
  → WasmPackedWorldRuntime
```

Structural graph changes may rebuild the runtime. Parameter-only edits should use the existing live-reconfiguration path when supported and preserve retained Rust state transactionally.

Routine responses should stay compact. Rich entity state should remain query-driven rather than bloating every snapshot.

## UI/presentation

UI code may display authoritative runtime state but must not become physical state ownership.

Preserve domain-selective subscriptions: runtime/telemetry updates should not rebuild structural geometry or unrelated panels. Node cards, Inspector, DEBUG, and map runtime presentation should consume snapshot/detail projections.

DEBUG pause/step/profiling controls must call `RuntimeController`; debug fixtures must create ordinary authored graphs that execute through the normal Rust/WASM runtime.

## Testing and generated assets

For TypeScript changes:

1. run the TypeScript build; `npm run build` cleans `dist/` before emitting so deleted source cannot leave orphaned generated modules;
2. commit generated `dist/` output exactly;
3. run the TypeScript Node regressions;
4. run Rust workspace tests;
5. compile/package browser WASM and verify generated assets when runtime/WASM surfaces are involved.

Keep `tests/postMigrationHygiene.test.ts` enforcing the no-handwritten-JavaScript source policy, retired-source absence, TypeScript regression policy, and generated-language metadata.

## Dependency and infrastructure guardrails

Keep the application lightweight: vanilla HTML/CSS, TypeScript ES modules, module Worker, Rust/WASM, and static hosting. Do not introduce a frontend framework, backend, database, ECS, dependency-injection framework, or other large infrastructure layer without a concrete requirement.
