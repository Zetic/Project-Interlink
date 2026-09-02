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
├── Continents
├── Oceans
└── semantic land and ocean Regions
    └── natural resource FEATURE nodes
```

World generation is deterministic by generator version plus seed. Generator v7 keeps the semantic-geography foundation while adding a lightweight geological-history layer beneath it. The 12–24 deterministic tectonic plates now carry continental/oceanic crust-age and crust-thickness baselines. Plate relationships generate reusable point-sampled fields for crustal thickening/thinning, uplift, subsidence, orogenic influence, continental rifting, ocean-ridge influence, trench influence, and basin formation. These fields shape the canonical elevation and relief surface rather than treating a plate boundary as a single generic height offset. Oceanic crust becomes youngest near active spreading ridges; convergent continental settings thicken and uplift crust; continental rifts thin/subside crust; trenches and basin-prone settings contribute subsidence.

The profiled 176 × 88 canonical scalar surface remains the global generation field, with interpolated sea-level clipping and shared Continent/Ocean geography. Semantic Regions are not seeded by a regular geometric Region lattice. Generation analyzes the canonical geological and environmental fields and classifies coherent geography such as mountain ranges, volcanic arcs, rifts, plateaus, sedimentary basins, coastal plains/highlands, continental shelves/slopes, mid-ocean ridges, trenches, abyssal plains, and ocean basins. Connected significant structures become geographic province seeds; only very large generic interiors are subdivided for usable scale. A deterministic multi-source geographic-affinity flood then assigns the complete canonical surface while strongly resisting transitions across unlike significant structures.

The technical surface patches still provide deterministic sampling, adjacency, and exact canonical coverage, but they are implementation details rather than the reason a Region exists. Region identity, naming, traits, and ownership are driven by generated geography. Canonical Continent/Ocean coastline vertices remain shared with coastal Regions, while shared interior boundary geometry is transformed consistently so neighboring Regions remain topologically aligned. Region counts emerge from geographic complexity rather than a fixed target.

Resource FEATURE candidates remain point-sampled from canonical world truth. Candidate density scales with Region area so larger semantic Regions do not reduce natural Feature density. Resource-specific province fields continue to influence occurrence, while iron/copper suitability now responds more directly to orogenic history and limestone/silica/coal suitability responds to basin history. Natural sources currently include:

- Iron Ore
- Copper Ore
- Aluminum Ore
- Limestone
- Silica Sand
- Coal
- Water Ice

A resource FEATURE exposes a `resource-access` relationship. That relationship authorizes/selects a source but carries no matter; physical material flow begins at an Extractor material output.

The map remains one continuous SVG coordinate space from whole-planet geography through engineering zoom. A shared technical chunk index supplies candidate-only visible/nearby Region and Feature queries, so world record count is independent from SVG/DOM count. Whole-planet zoom renders clickable Continents and Oceans; regional zoom renders only viewport Regions. While the pointer is over the map, existing Region labels are prioritized and faded around it without spatial requery or DOM reconstruction; camera center is the fallback outside the map. Screen-sized Feature markers bridge geography to deep engineering cards without expanding in world space while zooming.

A presentation-only raster overlay system sits beneath the authoritative SVG and can visualize the world truth used by generation without changing simulation or player state. Current analysis layers include elevation/bathymetry, relief, climate tendencies, plate/crust identity, plate boundaries, tectonic and volcanic activity, sedimentary tendency, semantic geography, resource potential, and generator-v7 geological-history fields such as crust age, crust thickness, uplift/subsidence, orogenic influence, and rifting. Overlay rasters are cached per Planet and automatically leave the map before engineering-scale zoom.

NAV is camera-aware, contextual, and searchable rather than a complete Planet → every Continent/Ocean → every Region → every Feature tree. Its normal view follows camera location while the Inspector keeps deliberate selection and camera Location in separate tabs. Region Inspector/Location presentation exposes the generated geographic type and traits alongside elevation, relief, tectonic setting, and environment. Global search supports all geographic and engineering entity types while remaining bounded to 60 rendered results.

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
npm install
npm test
```

The CI workflow also runs Rust workspace tests, compiles the browser WASM target, packages it with the pinned `wasm-bindgen` CLI, and verifies committed generated browser/WASM assets.

## Near-term expansion areas

The mature processing vertical slice is reconnected and Earth-scale semantic geography now has a geological-history foundation beneath it. The next terrain-generation expansion can add hydrology and generation-time erosion—flow direction, drainage accumulation, watersheds, river systems, lakes, deltas, and terrain modification—before lithology/sediment transport deepen geological resources. Generic Feature/player-knowledge/surveying systems can then build on increasingly causal geography. Fluids, power, logistics, automation, and recursive blueprints remain later systems implemented through the existing TypeScript → Worker → Rust/WASM boundary.