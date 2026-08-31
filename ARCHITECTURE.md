# Project Interlink — Current Architecture

This document is the source of truth for **current code ownership, dependency direction, runtime authority, and extension paths**. `DESIGN.md` describes the long-term game design. `README.md` summarizes implemented behavior. `ARCHITECTURE_PERFORMANCE.md` describes runtime/performance constraints. `.github/copilot-instructions.md` contains coding-agent guardrails.

Historical migration details belong in `PATCH_NOTES.md` and Git history, not in active architecture documentation.

---

## 1. Production Runtime Authority

Project Interlink has one production physical-simulation authority:

```text
Browser main thread
  UI / graph authoring / canonical world state
             ↓ coarse setup, commands, queries
Dedicated simulation Worker
             ↓
WasmPackedWorldRuntime
             ↓
Rust interlink-runtime scheduler
             ↓
Rust domain crates
```

Rust/WASM owns:

- fixed-step physical time advancement;
- retained runtime material and thermal state;
- apparatus execution;
- routing and backpressure;
- conservation-sensitive physical transformations;
- Site/world scheduling;
- runtime profiling of physical work.

JavaScript does **not** provide a fallback physics engine and does not advance production physical time. JavaScript owns:

- deterministic world/content authoring;
- readable canonical graph/node state;
- compilation of canonical state into packed Worker setup data;
- Worker lifecycle, protocol, commands, and queries;
- authoritative-state presentation projection;
- workspace/navigation/Inspector DOM behavior.

The browser-to-WASM production surface is the coarse world-runtime interface. Standalone per-apparatus WASM browser runtimes are intentionally absent.

---

## 2. Repository Layers and Dependency Direction

Preferred JavaScript dependency direction:

```text
app → generator + core + workspace
workspace → simulation + content + core
simulation → content + core
generator → content + core
content → core
core → core
```

Rust dependencies are defined by the Cargo workspace and flow from the world runtime into reusable physical-domain crates.

Repository layout:

```text
Project-Interlink/
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/test.yml
├── rust/
├── scripts/
├── src/
│   ├── app.js
│   ├── content/
│   ├── core/
│   ├── generator/
│   ├── simulation/
│   ├── wasm/                  generated wasm-bindgen browser package
│   └── workspace/
├── tests/
├── ARCHITECTURE.md
├── ARCHITECTURE_PERFORMANCE.md
├── DESIGN.md
├── PATCH_NOTES.md
└── README.md
```

Do not recreate removed compatibility namespaces or one-line forwarding modules merely to shorten imports. Internal callers should use canonical module paths directly.

---

## 3. State Domains

Keep three state domains separate:

```text
World / canonical authored state
        objective generated topology and readable player-authored graph

Rust runtime state
        transient authoritative physical execution state

Knowledge / application state
        player knowledge plus selection/layout/presentation state
```

Canonical JavaScript state is used to author, serialize, inspect, and reconfigure the world. After setup, retained physical inventories and time-evolving machine state are authoritative in Rust. Worker snapshots/details project that state back into the browser without creating a second simulation authority.

UI state such as selection, pan, zoom, panel state, and temporary gestures is not physical truth.

---

## 4. `src/content/` — Declarative Game Content

`src/content/` answers **what can exist?**

Important areas:

```text
src/content/
├── apparatus/definitions.js
├── features/
├── reactions/reactionDefinitions.js
└── resources/
```

`content/apparatus/definitions.js` is the canonical browser definition source for engineering node identity, catalog metadata, ports/capabilities, defaults, fixed capabilities, process association, and player-configurable parameters.

Current player-facing engineering definitions include:

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

The generic `Crusher` remains an intentional compatibility apparatus and is not player-placeable.

Do not create a second machine catalog, second port registry, or machine-pair whitelist.

---

## 5. `src/core/` — Canonical Reusable Contracts

### Materials

Canonical material state remains readable/string-keyed JavaScript state used by generation, authoring, validation, setup compilation, and presentation.

Relevant structure:

```text
src/core/materials/
├── gas/
├── properties/
├── solids/
├── species/
├── thermal/
├── materialBatches.js
├── materialBody.js
├── materialForms.js
└── occurrenceMaterialization.js
```

Textured particulate identity is:

```text
speciesId × sizeBinId × liberationClassId × textureProfileId → quantity
```

Legacy/untextured material may omit the texture axis. A fraction represents an aggregate statistical population, not one particle.

`MaterialBody.thermalState.sensibleEnthalpyJ` is the body thermal inventory. Temperature is derived rather than added to the sparse particulate key.

The former broad `<32 µm` particle-size ID remains readable as a compatibility alias. New staged comminution uses the resolved `<4`, `4–8`, `8–16`, and `16–32 µm` bins.

### Process contracts

`src/core/processes/definitions/` contains browser-readable process definitions and parameter contracts. Production continuous process physics and conservation enforcement are **not** implemented in a parallel JavaScript process layer; the authoritative algorithms used each fixed step live in Rust domain/runtime crates.

### Systems

`src/core/systems/` owns neutral node/port/connection concepts used by the graph model. Connection eligibility derives from edge kind and interface/physical capabilities rather than explicit machine-pair tables.

Important capabilities include `resource-source`, `solid-particulate`, `stored-solid-particulate`, and `gas`.

### World model and validation

Canonical natural ownership is:

```text
Planet → Region → Site → Feature → ResourceOccurrence
```

Current serialized versions are defined only by `src/core/world/versions.js`.

At this revision:

```text
SCHEMA_VERSION = 10
GENERATOR_VERSION = 7
```

`src/core/world/model/worldAssembly.js` assembles generated entities into the canonical world object. Validation lives in the concrete modules under `src/core/world/validation/`; there is no compatibility `worldState.js` facade or forwarding validation barrel.

---

## 6. `src/generator/` — Deterministic World Generation

`src/generator/` owns deterministic seeded generation algorithms. Canonical generator entry point:

```text
src/generator/generateWorld.js
```

Generation functions live directly under `src/generator/` rather than mirrored forwarding subfolders.

Generation consumes declarative content and core world/material contracts. Same seed + same generator version must produce the same physical world truth. A change that intentionally changes same-seed generated truth requires the generator-version rule to be considered.

Generated ore occurrences carry deterministic composition, mineral-texture lineage, and comminution engineering properties required by downstream physical processing.

---

## 7. `src/simulation/` — Browser Runtime Boundary and Authoring Support

Despite the historical directory name, `src/simulation/` is **not a second production physics engine**.

Its current responsibilities include:

- browser-side Blueprint/node construction;
- canonical Site/session topology;
- packed numeric-ID setup compilation;
- live reconfiguration compilation;
- Worker host/protocol/pacing;
- Worker snapshot/detail presentation projection;
- browser-side capability/topology validation.

Key files:

```text
simulationEngine.js
    browser Blueprint authoring model; never advances physical time

worldSimulation.js
    browser-side world/session topology compiled into Rust/WASM

packedRuntimeCompiler.js
packedComminutionCompiler.js
packedExtractionCompiler.js
packedSeparationCompiler.js
packedRoastingCompiler.js
packedThermalGasCompiler.js
packedWorldRuntimeCompiler.js
packedWorldWorkerSetup.js
    canonical/string-keyed → packed numeric Rust setup pipeline

packedRuntimeState.js
packedStorageRuntime.js
packedGasRuntime.js
packedThermalRuntime.js
    transient setup representations used while compiling Worker state

rustWasmWorkerHost.js
runtimeProtocol.js
realtimeRuntime.js
    Worker lifecycle, protocol, pacing, command/query coordination

rustWasmWorker.js
    Worker entry point

runtimePresentation.js
    projection of authoritative Worker snapshots/details into browser presentation
```

The `packed*Runtime*` JavaScript classes are setup/compiler representations. They are intentionally retained because they build coarse Rust setup payloads; they are not time-advancing runtime authorities.

### Apparatus JavaScript modules

`src/simulation/apparatus/` and `extractorNode.js` / `hopperNode.js` construct readable canonical engineering nodes and their initial state. `apparatus/registry.js` is a **node factory registry**, not a physics runtime registry.

Machine-specific fixed-step physical behavior belongs in Rust.

---

## 8. Worker / WASM Contract

The browser Worker owns one `WasmPackedWorldRuntime` instance.

Setup path:

```text
canonical world + authored Blueprints
        ↓
packedWorldRuntimeCompiler.js
        ↓
packedWorldWorkerSetup.js
        ↓ structured-clone-safe coarse setup
Worker
        ↓
WasmPackedWorldRuntime
```

Runtime commands and queries cross the Worker boundary through `runtimeProtocol.js`. Full-world structured cloning every fixed step is prohibited. Detailed Inspector state is queried/snapshotted only when needed.

Live topology/parameter changes compile into explicit reconfiguration rather than rebuilding a JavaScript simulation authority.

The authoritative fixed step is `0.1 s` unless intentionally changed as a system-level runtime decision.

---

## 9. Rust Workspace

Current Rust crates are organized by physical responsibility:

```text
rust/interlink-core
rust/interlink-processes
rust/interlink-extraction
rust/interlink-comminution
rust/interlink-separation
rust/interlink-routing
rust/interlink-thermal
rust/interlink-thermochemistry
rust/interlink-roasting
rust/interlink-runtime
rust/interlink-wasm
```

`interlink-runtime` owns the packed world scheduler and retained execution state. Domain crates implement reusable physical operations. `interlink-wasm` exposes the coarse browser boundary centered on `WasmPackedWorldRuntime`.

Do not reintroduce per-apparatus browser bridge classes when the same operation can be configured/executed through the world runtime.

See `rust/README.md` and `rust/interlink-runtime/README.md` for Rust-specific details.

---

## 10. `src/workspace/` — Player-Facing Application

`workspace` owns graph projection, layout, navigation, placement/removal gestures, catalog UI, Inspector presentation, debug presentation, and DOM orchestration.

Canonical domains:

```text
src/workspace/
├── catalog/
├── debug/
├── graph/
├── inspector/
├── navigation/
├── shell/
├── sitePrototype.js
├── siteSession.js
├── workspaceController.js
└── workspaceState.js
```

Top-level forwarding aliases have been removed. New workspace code should import the canonical submodule directly.

`workspaceController.js` remains the large application/DOM orchestrator. Its later decomposition should separate Worker/runtime coordination, detail-query handling, rendering/input orchestration, and other concerns **without moving physical truth back into the main thread**.

---

## 11. Compatibility Policy

Migration compatibility should be represented as an explicit data/behavior decision, not as duplicate module trees.

Intentionally retained compatibility includes:

- legacy generic `Crusher` behavior required by older authored/session state;
- legacy particle-size IDs that must remain readable while canonical generation/processing emits newer resolved IDs.

Intentionally removed compatibility includes:

- `src/data/` forwarding namespace;
- root material/process forwarding files;
- mirrored generator forwarding folders;
- top-level workspace forwarding files;
- compatibility `core/world/worldState.js` factory;
- standalone per-apparatus WASM browser adapters.

The hygiene regression suite prevents these migration surfaces from silently returning.

---

## 12. Adding or Changing an Apparatus

A new physical apparatus normally requires work in this order:

```text
1. src/content/apparatus/definitions.js
   identity, catalog metadata, ports, defaults, configurable parameters

2. src/core/processes/definitions/
   browser-readable process/parameter contract when a new process family is needed

3. canonical browser node construction
   src/simulation/apparatus/* or the appropriate node-construction module

4. Rust domain implementation
   physical transformation/routing behavior

5. rust/interlink-runtime
   scheduler integration, state ownership, execution phase/order

6. rust/interlink-wasm + JS packed setup compiler as needed
   coarse setup/reconfiguration fields only

7. workspace generic presentation/control support
   preferably definition-driven rather than machine-specific controller branches

8. JS + Rust + Worker/WASM integration regressions
```

Do not solve a new machine by adding:

- a JavaScript fallback simulation path;
- a second apparatus catalog;
- a machine-pair connection whitelist;
- standalone per-machine WASM runtime objects;
- full-world per-step serialization;
- duplicate physics in JavaScript and Rust.

---

## 13. Performance and Validation Invariants

Production runtime invariants:

- one Worker-owned Rust/WASM physical authority;
- deterministic fixed-step semantics;
- no full-world structured clone every step;
- no per-fraction or per-machine JS↔WASM loop in the hot path;
- runtime-local numeric IDs are transient execution details, not serialized identity;
- authoritative retained matter/energy state does not live in DOM objects;
- deep profiling is opt-in and should not add timing overhead when disabled.

Before merging runtime/architecture work run:

```text
npm run check:runtime
```

The repository PR workflow additionally rebuilds the wasm-bindgen package and verifies generated Worker assets match the committed browser package.

Relevant regression guards include:

- Rust-only runtime authority;
- Worker cutover/protocol behavior;
- runtime presentation stability;
- live reconfiguration;
- post-migration hygiene and module-resolution checks;
- Rust scheduler/domain tests;
- generated WASM package verification.

---

## 14. Architecture Rules for Future Cleanup

Cleanup is complete only when deleted compatibility surfaces have no remaining import, documentation, test, or generated-interface dependency.

Prefer:

- canonical direct imports;
- one ownership location per responsibility;
- small explicit boundary modules;
- tests that guard architecture rather than migration comments that can become stale.

Avoid preserving dead files merely because they once represented an intermediate migration stage. Preserve compatibility only when an actual serialized/gameplay contract still requires it.
