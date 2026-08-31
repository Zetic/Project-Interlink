# Project Interlink — Coding Agent Guardrails

Use this file for implementation constraints. Read the active issue/PR request plus `ARCHITECTURE.md` before editing runtime or workspace code.

Document roles:

- `DESIGN.md` — long-term game/simulation design;
- `ARCHITECTURE.md` — current code ownership, dependency direction, and extension paths;
- `ARCHITECTURE_PERFORMANCE.md` — runtime/performance contract;
- `README.md` — current implemented gameplay/state summary;
- `PATCH_NOTES.md` — historical development record;
- this file — coding-agent guardrails.

Historical migration architecture is not a valid implementation target.

---

## Working Rules

- Prefer the smallest coherent change that satisfies the active task.
- Preserve established physical ownership, conservation, deterministic-generation, graph, and runtime-authority contracts unless the task explicitly changes them.
- Add focused regressions for new invariants and bug fixes.
- Run the complete relevant regression suite before declaring work complete.
- Do not claim browser/manual behavior was verified unless it actually was.
- Update active documentation when code ownership or current behavior materially changes.
- Do not keep dead compatibility files merely because old imports once existed.

---

## Production Runtime Authority

Production physical simulation has one authority:

```text
main-thread UI / canonical authoring
        ↓ coarse setup, commands, queries
simulation Worker
        ↓
WasmPackedWorldRuntime
        ↓
Rust interlink-runtime + domain crates
```

Rust/WASM owns:

- fixed-step physical time advancement;
- retained runtime material/thermal state;
- apparatus execution;
- routing/backpressure;
- conservation-sensitive transformations;
- Site/world scheduling.

JavaScript owns:

- generated/canonical world and content authoring;
- readable Blueprint/node state;
- canonical → packed runtime setup compilation;
- Worker lifecycle/protocol/pacing;
- authoritative snapshot/detail presentation;
- workspace and DOM interaction.

Do **not**:

- create a JavaScript fallback physics engine;
- advance production physical time on the main thread;
- recreate standalone per-apparatus WASM browser runtimes;
- send full-world state across the Worker boundary every fixed step;
- add per-fraction/per-machine JS↔WASM hot-path loops.

`src/simulation/packed*` JavaScript types are setup/compiler representations. Do not delete them simply because they contain `Runtime` in the name; delete only code proven unused by the current world-runtime setup path.

---

## Platform Guardrails

Preserve the current lightweight browser architecture unless an active task requires otherwise:

- vanilla HTML/CSS/ES modules;
- relative imports compatible with GitHub Pages project paths;
- dedicated Worker + Rust/WASM physical runtime;
- Node-based JavaScript regression tests;
- Cargo workspace Rust tests.

Do not introduce a frontend framework, backend, database, ECS, dependency-injection framework, or other large infrastructure layer without a concrete requirement.

---

## JavaScript Domain Ownership

```text
src/content/     declarative resources, Features, apparatus, reactions
src/core/        canonical materials, process contracts, system primitives,
                 world assembly/validation/versions
src/generator/   deterministic world generation
src/simulation/  browser authoring/setup compiler + Worker boundary/presentation
src/workspace/   graph/navigation/catalog/Inspector/debug/shell DOM application
src/app.js       browser composition root
src/wasm/        generated wasm-bindgen browser package
```

Preferred dependency direction:

```text
app → generator + core + workspace
workspace → simulation + content + core
simulation → content + core
generator → content + core
content → core
core → core
```

Internal code should import canonical paths directly. Do not recreate `src/data/`, mirrored generator folders, top-level workspace forwarding files, root material forwarding files, or a `core/world/worldState.js` compatibility facade.

---

## State Separation

Keep these concerns distinct:

```text
Canonical world/authored state  → readable generated topology and Blueprint definitions
Rust runtime state              → authoritative time-evolving physical state
Knowledge state                 → player measurements/knowledge
Application/UI state            → selection/layout/viewport/panels/gestures
```

Worker snapshots/details are projections of Rust authority, not a second simulation state.

Physical truth must never exist only in DOM elements.

---

## Natural World Ownership

Preserve:

```text
Planet → Region → Site → Feature → ResourceOccurrence
```

- Regions group Sites; they do not directly own natural resource inventory.
- Sites reference Features.
- Natural `ResourceOccurrence`s are Feature-owned.
- Independently exploitable natural sources should normally be distinct Features.
- Broadly distributed resources still require physical access through Sites/Features rather than Region inventory.

Do not reintroduce parallel ownership fields such as `region.resources`, `region.features`, or `region.backgroundResourceOccurrences`.

Current schema/generator constants live only in `src/core/world/versions.js`. Do not duplicate version numbers in code.

---

## Content and Generation

Canonical content locations:

```text
src/content/resources/
src/content/features/
src/content/apparatus/
src/content/reactions/
```

Canonical generator entry point:

```text
src/generator/generateWorld.js
```

Deterministic generation algorithms live directly under `src/generator/`; forwarding subfolders were intentionally removed.

If a change alters same-seed generated world truth, consider the generator-version rule. Bump schema version only when the serialized world-state contract changes.

---

## Material Model

Canonical solid particulate state is aggregate/statistical. Textured ore populations use:

```text
speciesId × sizeBinId × liberationClassId × textureProfileId → quantity
```

Legacy/untextured populations may omit the texture profile.

A fraction is a population, not an individually simulated particle.

Keep composition, particle size, liberation, texture lineage, separation, and routing conceptually distinct.

`MaterialBody.thermalState.sensibleEnthalpyJ` owns body thermal energy. Do not add temperature to the particulate identity key.

Do not reintroduce placeholder generated pseudo-species such as generic gangue/iron-oxide mixtures when concrete registered species are available.

Compatibility note: older particle-size IDs may remain readable; new processing should emit current canonical bins.

---

## Process and Apparatus Architecture

Browser process contracts live in:

```text
src/core/processes/definitions/
```

Production fixed-step process physics and conservation enforcement belong in Rust domain/runtime crates. Do not create parallel JavaScript transformation or conservation kernels as a production fallback.

Canonical apparatus metadata lives in:

```text
src/content/apparatus/definitions.js
```

Browser node constructors live in `src/simulation/apparatus/` plus specialized node-construction modules such as `extractorNode.js` and `hopperNode.js`. `src/simulation/apparatus/registry.js` is a node-factory registry, not a physics runtime registry.

The generic `Crusher` remains compatibility-only and is not player-placeable. Do not remove compatibility behavior without an explicit migration/save-state decision.

### Adding an apparatus

Normally update:

1. apparatus definition metadata/ports/defaults;
2. browser-readable process contract if a new process family is needed;
3. canonical browser node construction/registry;
4. appropriate Rust physical-domain implementation;
5. `interlink-runtime` scheduler/state integration;
6. coarse WASM/world setup fields and JS compiler only as needed;
7. generic workspace controls/Inspector presentation;
8. JS, Rust, Worker, and WASM regressions.

Avoid machine-pair whitelists, duplicate catalogs, standalone WASM machine objects, and central JavaScript physics switches.

---

## Typed Ports and Routing

Connection eligibility derives from edge kind plus interface/physical capabilities, not explicit machine pairs.

Important capabilities include:

```text
resource-source
solid-particulate
stored-solid-particulate
gas
```

Rules:

- `resource-access` authorizes/selects a source; it carries no matter/kg/s;
- ordinary material outputs are single-consumer; use Splitter for explicit fan-out;
- ordinary material inputs are single-source; use Material Merger for explicit fan-in;
- required outputs must not silently delete matter;
- multi-output and multi-input process commits remain transactional;
- recursive boundary movement must be explicit and conserved.

---

## Worker and Packed Runtime Setup

Canonical setup path:

```text
canonical world / Blueprints
  → packedWorldRuntimeCompiler.js
  → packedWorldWorkerSetup.js
  → Worker structured-clone-safe setup
  → WasmPackedWorldRuntime
```

Runtime-local numeric IDs are transient execution details. Do not serialize them as canonical world identity.

`runtimeProtocol.js`, `rustWasmWorkerHost.js`, and `realtimeRuntime.js` coordinate the Worker boundary. `runtimePresentation.js` projects authoritative snapshots/details for the browser.

Live topology/parameter changes should use explicit reconfiguration rather than silently rebuilding a second runtime on the main thread.

The current fixed step is `0.1 s`.

---

## Rust Workspace Rules

Current physical/runtime crates include:

```text
interlink-core
interlink-processes
interlink-extraction
interlink-comminution
interlink-separation
interlink-routing
interlink-thermal
interlink-thermochemistry
interlink-roasting
interlink-runtime
interlink-wasm
```

`interlink-runtime` owns packed world scheduling and retained execution state. `interlink-wasm` exposes the coarse world browser interface.

Preserve deterministic ordering and conservation semantics when extending scheduler phases.

Deep profiling must remain optional and should not add timing calls to the disabled path.

---

## Workspace Rules

Canonical workspace domains:

```text
src/workspace/catalog/
src/workspace/debug/
src/workspace/graph/
src/workspace/inspector/
src/workspace/navigation/
src/workspace/shell/
```

`workspaceController.js` is currently the large DOM/application orchestrator. Refactoring it should split responsibilities without moving physical execution/state ownership out of the Worker.

Prefer definition-driven generic controls/Inspector rendering over machine-specific controller branches.

Do not recreate removed top-level forwarding aliases.

---

## Compatibility and Hygiene

Migration-era forwarding modules and per-apparatus WASM browser adapters are intentionally removed.

Compatibility should remain only where an actual serialized/gameplay contract requires it, such as the generic legacy Crusher or readable legacy particle-size IDs.

`tests/postMigrationHygiene.test.js` guards removed compatibility paths, relative-module integrity, absence of forwarding-only source modules, absence of old standalone WASM adapters, and current runtime-authority documentation.

If a compatibility surface is no longer consumed, remove the file, callers, tests, docs, and empty directory together.

---

## Completion Checklist

Before finishing a PR:

1. confirm one Rust/WASM production physical authority is preserved;
2. confirm no missing/duplicate matter ownership or conservation regression;
3. confirm deterministic generation semantics/version rules;
4. confirm canonical module paths and no new forwarding compatibility shim;
5. confirm Worker setup/protocol does not introduce per-step full-world or per-fraction bridge traffic;
6. add/update focused regressions;
7. run `npm run check:runtime`;
8. allow the PR workflow to rebuild and verify the wasm-bindgen browser package;
9. perform browser smoke testing for interaction/layout changes, or state clearly when not manually verified;
10. update active docs when current architecture or behavior changes.
