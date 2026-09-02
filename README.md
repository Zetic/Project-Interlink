# Project Interlink

Project Interlink is an early-stage systems-driven simulation and management game developed as a lightweight browser application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is to turn matter and energy available in an unfamiliar world into a self-sustaining industrial network built from physical resources, material and energy streams, apparatus, storage, logistics, instrumentation, automation, and increasingly capable engineered systems.

The project is simulation-first: outcomes should emerge from material state, apparatus capability, process physics, operating conditions, connectivity, capacity, and control rather than arbitrary crafting recipes.

## Documentation

- [`docs/DESIGN.md`](docs/DESIGN.md) — long-term game and simulation design
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — current code ownership and extension boundaries
- [`docs/ARCHITECTURE_PERFORMANCE.md`](docs/ARCHITECTURE_PERFORMANCE.md) — realtime runtime/performance contract
- [`docs/MATERIAL_REACTION_SYSTEM.md`](docs/MATERIAL_REACTION_SYSTEM.md) — material/reaction architecture and expansion direction

## Current architecture

The browser application is TypeScript-first. `src/app.ts` is the composition root and TypeScript builds committed static-hosting modules into `dist/`. Rust/WASM is the sole production physics authority.

```text
TypeScript browser application
  deterministic world + graph authoring + UI
              ↓
      dedicated module Worker
              ↓
      WasmPackedWorldRuntime
              ↓
      Rust physical runtime
```

There is no browser-side fallback physics engine. Handwritten legacy JavaScript application/simulation code has been removed. Remaining JavaScript is generated browser output or generated wasm-bindgen glue; active regression source is TypeScript.

## Current world model

The active browser world is a continuous Earth-scale map rather than a recursive workspace hierarchy:

```text
Planet
└── Regions
    └── resource FEATURE nodes
```

World generation is deterministic by seed. The current flat world produces five irregular geographic Regions and resource FEATURE nodes positioned within those polygons. Natural sources currently include:

- Iron Ore
- Copper Ore
- Aluminum Ore
- Limestone
- Silica Sand
- Coal
- Water Ice

A resource FEATURE exposes a `resource-access` relationship. That relationship authorizes/selects a source but carries no matter; physical material flow begins at an Extractor material output.

The older Site/child-workspace hierarchy is not part of the active browser model.

## Current engineering graph

The NODE catalog is definition-driven TypeScript and currently exposes:

```text
APPARATUS
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

CONTAINER
  Exhaust Vent
  Hopper
```

The flat graph enforces typed ports and explicit material routing. Material fan-out requires a Splitter; fan-in requires a Material Merger. Stored particulate, metered particulate, and gas capabilities are represented explicitly so invalid process topology is rejected before runtime setup.

## Current material/process slice

The detailed solid-particulate model represents aggregate statistical populations conceptually as:

```text
species × particle-size bin × liberation class × texture lineage → quantity
```

The current TypeScript material foundation includes:

- registered material/mineral species and intrinsic properties;
- particle-size vocabulary from fine material through run-of-mine rock;
- locked / partial / mostly-liberated / liberated classes;
- occurrence-specific mineral texture;
- Bond crushing/milling and abrasion properties;
- magnetic-response and thermal setup data;
- authored reaction definitions with elemental-conservation validation.

Rust/WASM executes the connected physical processes:

- extraction;
- Jaw/Cone crushing;
- Ball Mill grinding;
- screening;
- splitting and merging;
- controlled feeding;
- magnetic separation;
- retained Hopper storage and backpressure;
- electric roasting with thermal state;
- goethite dehydroxylation to hematite + water vapor;
- gas exhaust accounting.

Multi-output operations remain transactional so downstream capacity cannot silently duplicate or lose matter.

## Runtime and presentation

The production runtime advances in fixed `0.1 s` steps through a dedicated Worker. The browser compiles the authored graph into a packed Worker setup; the Worker populates one `WasmPackedWorldRuntime` and returns compact authoritative snapshots.

Routine presentation includes:

- live machine operating state and flow rates;
- Hopper stored/free capacity and capacity-fill visualization;
- live Furnace temperature/process presentation;
- live Exhaust Vent state;
- Inspector composition, particle-size, liberation, texture, thermal, Furnace, and emissions detail;
- domain-selective UI subscriptions so physics snapshots do not rebuild structural map geometry.

Rich Hopper/Furnace/Vent state is queried on demand for the selected entity rather than attached to every routine snapshot.

## Debug tools

DEBUG retains runtime/performance telemetry, pause/resume, deterministic fixed-step controls, optional deep profiling, runtime capability reporting, and the **Create Factory** fixture.

Create Factory requires a selected resource FEATURE. It places a complete ore-processing line beside that selected source and connects the Extractor to that exact resource before using the normal production runtime.

## Source layout

```text
docs/            design and architecture references
styles/          browser stylesheets
src/             TypeScript browser source
  app.ts
  apparatus/
  debug/
  graph/
  map/
  material/
  runtime/
  state/
  ui/
  world/
  wasm/          generated wasm-bindgen package

dist/            generated TypeScript output
rust/            authoritative physical runtime
tests/           TypeScript Node regression harness
scripts/         build helpers
```

Do not edit generated `dist/` or wasm-bindgen JavaScript as source. Browser feature work belongs in TypeScript; physical execution belongs in Rust.

## Development

Install browser/test dependencies and run the regression suite with:

```bash
npm ci
npm test
```

The CI workflow also runs Rust workspace tests, compiles the browser WASM target, packages it with the pinned `wasm-bindgen` CLI, and verifies committed generated browser/WASM assets.

## Near-term expansion areas

The mature processing vertical slice is reconnected. Remaining expansion is primarily broader world/content parity and new gameplay systems rather than restoring the removed JavaScript runtime. Candidate areas include richer planet/Region properties, additional resource and Feature types, player knowledge/discovery, broader liquid/gas source authoring, and additional industrial processes implemented through the existing TypeScript → Worker → Rust/WASM boundary.
