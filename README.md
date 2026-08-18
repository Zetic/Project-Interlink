# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is to turn the matter and energy available in an unfamiliar world into a self-sustaining industrial system. Interlink is intended to become an interactive engineering workspace built from physical resources, material and energy streams, processes, storage volumes, sensors, controllers, dashboards, and reusable nested systems.

The canonical long-term game design is documented in [`DESIGN.md`](DESIGN.md).

## Core Gameplay Direction

The intended long-term gameplay loop is:

```text
Acquire
  ↓
Analyze
  ↓
Experiment
  ↓
Engineer
  ↓
Blueprint
  ↓
Automate
  ↓
Scale
  ↓
Optimize
  ↺
```

Automation is not intended to be a late-game convenience. The player should learn Interlink's system language from the beginning: **sources, ports, streams, buffers, processes, constraints, feedback, and automation**.

A guiding progression principle is:

> **Yesterday's factory becomes today's machine.**

Solved systems should eventually be reusable as components inside larger systems.

---

# Current State

The project has established its first simulation foundation and a two-stage material-processing prototype.

Current implemented behavior includes:

- deterministic seeded planet generation
- causal planet-generation passes rather than archetype-first generation
- regions, hidden features, and normalized `ResourceOccurrence` entities
- World / Knowledge / UI state separation
- deterministic namespaced RNG streams
- physical `MaterialBatch` runtime state
- material provenance separated from current processed-material identity
- particle size as the first physical batch property beyond composition
- reusable `ProcessDefinition` metadata with explicit ports and parameters
- Crushing and Magnetic Separation as distinct process implementations
- explicit input-port bindings suitable for later blueprint connections
- deterministic two-stage process chaining
- constituent-level and total-mass conservation
- atomic process commits
- strict process input/output/parameter contract validation
- automated `node:test` regression coverage and GitHub Actions CI

The current processing proof is:

```text
Generated Iron Ore Occurrence
        ↓
Acquire Sample
        ↓
Analyze
        ↓
Crushing
        ↓
Crushed Material
        ↓
Magnetic Separation
        ↓
Concentrate + Tailings
```

The current serialized world/generator versions on this development branch are:

```text
schemaVersion: 4
generatorVersion: 2
```

Schema v4 adds material provenance, particle-size state, and explicit process input bindings. Generator v2 remains unchanged because these changes do not alter procedural world generation.

The current HTML list/button interface is now considered a **prototype/debug interface**, not the intended player-facing interaction model.

---

# Foundational State Architecture

Interlink separates three kinds of state:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
what the player has discovered or measured
        ↓
APPLICATION / UI STATE
selection, layout, panels, temporary controls
```

Physical truth must not be moved into UI state merely because a feature is easier to render that way.

The world currently contains ID-indexed physical entities including:

```text
World
├── planets
├── regions
├── features
├── resourceOccurrences
├── materialBatches
└── processResults
```

Future apparatus, containers, streams, facilities, and blueprints should extend this model intentionally.

---

# Resource and Matter Philosophy

Natural resources are **physical feedstocks with generated composition**, not arbitrary crafting tokens.

Example:

```text
Iron Ore Deposit
└── Iron Ore occurrence
    ├── Hematite
    ├── Magnetite
    ├── Goethite
    └── Quartz / gangue
```

Processes act on the matter and its physical properties. Percentages shown to the player should be derived from underlying quantities rather than becoming a second mutable source of truth.

Processed matter should preserve useful provenance without pretending that its current identity is permanently equal to one original natural `resourceId` or `sourceOccurrenceId`.

A guiding rule is:

> **Abstract the history. Preserve the resulting matter.**

---

# Batches, Containers, and Streams

The current `MaterialBatch` model proved physical conservation, but the long-term industrial model must distinguish **stored matter** from **moving matter**.

## Material batches / stored contents

A batch or stored material state should exist for a physical reason. Bulk matter should normally be held by something such as:

- a hopper
- bin
- silo
- tank
- pressure vessel
- machine input/output buffer
- stockpile
- cargo container or vehicle
- discrete sample/package when appropriate

Interlink should not grow into a system where arbitrary free-floating batch objects form a magical inventory dimension.

If 500 tonnes of ore exist in player-controlled state, some physical storage system should be holding that matter.

External storage should eventually be placeable as blueprint nodes with explicit input/output ports and physical constraints such as capacity. Machines may also contain smaller built-in input/output buffers where that makes physical and gameplay sense.

## Material streams

A continuous material stream is **not a sequence of tiny batches created every simulation tick**.

A stream represents a rate plus material state, conceptually:

```text
MaterialStream
├── constituent mass-flow rates (kg/s)
├── total mass flow (derived)
├── particle size
└── additional relevant physical properties later
```

For example:

```text
Miner
  │ 5 kg/s run-of-mine ore
  ▼
Hopper
  │ 4 kg/s
  ▼
Crusher
```

If the miner supplies 5 kg/s while the crusher consumes only 4 kg/s, the hopper accumulates 1 kg/s until it fills. A full buffer can block downstream/upstream operation naturally.

The simulation should preserve matter through stream rates and storage quantities without allocating one object per kilogram or one batch per tick.

## Stream / storage relationship

The basic long-term pattern is:

```text
WORLD SOURCE
     ↓
EXTRACTION PROCESS
     ↓ stream
PHYSICAL BUFFER / CONTAINER
     ↓ stream
TRANSFORMATION PROCESS
     ↓ stream
PHYSICAL BUFFER / CONTAINER
```

This distinction is both more physically meaningful and more scalable for large industrial networks.

---

# Raw Resource Collection Direction

The current `Gather X kg` button is prototype scaffolding. It should remain useful for debugging and possibly explicit laboratory sampling, but it is **not the intended normal production mechanic**.

Automation should begin with raw-resource access.

The intended production model is:

```text
ResourceOccurrence
        ↓
Extraction Interface / Apparatus
        ↓
Material Stream
        ↓
Container / Buffer
        ↓
Processing Network
```

The resource occurrence is physical world matter, not an infinite crafting-token generator. The extraction apparatus determines how matter becomes mobile and at what rate.

Different resource types should eventually imply different extraction interfaces:

```text
Hard-rock deposit → drill/excavator/mining system
Brine aquifer     → well + pump
Gas reservoir     → well + pressure-control system
Atmosphere        → intake + compressor
Ocean/water body  → intake + pump
```

Precise depletion/reserve simulation should be added when resource occurrences have sufficiently physical quantity models. Until then, automated extraction prototypes must be clearly treated as approximations rather than invented geological truth.

---

# Performance Direction

The intended stream/container architecture is compatible with large simulations if continuous matter is represented mathematically rather than as thousands of tiny objects.

Important principles:

- do not create a `MaterialBatch` every simulation tick for flowing matter
- use aggregate constituent flow rates for streams
- use aggregate constituent quantities for stored contents
- run simulation updates independently from rendering FPS
- allow the UI to animate smoothly while simulation runs at an appropriate fixed timestep
- later, recalculate affected/dependent networks rather than unrelated systems when practical
- eventually permit mature/nested systems to use aggregated behavior at higher hierarchy levels

The design principle **“Yesterday's factory becomes today's machine”** can eventually become a performance strategy as well as a gameplay strategy: solved detailed systems may be represented by higher-level aggregate interfaces when appropriate.

---

# Player Interface Direction

The current interface consists primarily of a seed field, generated planet data, lists of regions/features, a manual Discover button, and form controls for material processing. That interface remains valuable for debugging, but it teaches the wrong long-term interaction language for Interlink.

The intended player-facing interface should begin moving toward **hierarchical workspaces**.

Conceptually:

```text
STAR SYSTEM
    ↓
PLANET WORKSPACE
    ↓
REGION WORKSPACE
    ↓
SITE / FACILITY WORKSPACE
    ↓
PROCESS / APPARATUS BLUEPRINT
```

The same broad interaction language can repeat at each scale:

```text
view system
→ select entity
→ inspect
→ enter/drill down
→ work with systems inside it
```

Breadcrumb navigation may look conceptually like:

```text
System > Planet > Region > Facility > Process
```

## World nodes are not process nodes

Regions, planets, resource sites, machines, containers, and processes may share visual workspace interaction primitives such as selection, pan/zoom, inspectors, and drill-down, but they remain different simulation concepts.

A Region should not acquire fake material ports merely because it is displayed as a node-like object.

## Debug interface remains

Do not delete the current prototype interface. Preserve it as a developer/debug view for:

- seed control
- raw world state
- generated planet/region/feature values
- Knowledge State inspection
- material batches
- process results
- validation/debug actions

Player-facing development should move away from manual list/button actions while the debug view remains available to verify the underlying simulation.

---

# Discovery / Survey Direction

The current `Discover Feature` button proves Knowledge State but should not become the final discovery mechanic.

Long-term discovery should itself become a system:

```text
Unknown physical world
        ↓
Survey apparatus / network operates
        ↓
Knowledge improves over time
        ↓
Features/resources become known
        ↓
Higher-quality measurements improve confidence
```

The same automation principle applies to both resource acquisition and discovery: players should increasingly engineer systems that perform work rather than repeatedly press action buttons.

---

# Next Development Priority

The two-stage process semantics are now sufficiently proven to begin the first real player-interface milestone.

The next recommended vertical slice is:

> **Build the first hierarchical workspace and automated resource-flow prototype while retaining the current UI as a debug view.**

The target player-facing flow should begin demonstrating Interlink's actual interaction language:

```text
Planet Workspace
    ↓ enter region
Region Workspace
    ↓ enter resource site
Engineering Workspace

Resource Occurrence
        ↓
Extractor
        ↓ stream
Container
        ↓ stream
Crusher
        ↓ stream
Container
        ↓ stream
Magnetic Separator
       ├────────→ Concentrate Container
       └────────→ Tailings Container
```

This milestone should prove, at prototype scale:

1. hierarchical world/workspace navigation
2. real node/port/connection interaction for engineering systems
3. continuous material streams represented as rates, not per-tick batches
4. physical container/storage nodes with finite capacity
5. automated flow from a resource occurrence through extraction and processing
6. bottleneck/backpressure behavior through finite storage and process capacity
7. simulation timestep separated from UI rendering
8. retention of the existing prototype interface as a developer/debug mode

It should **not** attempt to finish all surveying, extraction geology, logistics, power, thermodynamics, control logic, nested blueprints, or factory-scale simulation at once.

---

# Known Prototype Simplifications

Important remaining simplifications include:

- regional geology is still much simpler than the planet-level model
- resource occurrence quantity remains mostly qualitative rather than a physical reserve mass
- no real depletion model exists yet
- extraction machinery/rates are not yet modeled
- no continuous `MaterialStream` model exists yet
- no physical container/buffer entity model exists yet
- the player-facing workspace hierarchy is not implemented yet
- discovery still uses a manual prototype button
- sample collection still uses a manual prototype action
- only Crushing and Magnetic Separation are implemented as process physics
- energy, power, heat, pressure, fluids, controls, and logistics are future systems
- several planet inputs should eventually come from star/system formation context

These are expected development stages, not reasons to restart the architecture.

---

# Near-Term Roadmap

1. **Complete/merge the two-stage process semantics milestone (Issue #10 / PR #11).**
2. **Build the first hierarchical player workspace and automated resource-flow vertical slice.**
3. Stabilize container, stream, process-capacity, and backpressure semantics from that playable slice.
4. Replace manual discovery in the player path with an initial survey-process model.
5. Use actual player-facing needs to deepen resource occurrence quantity, extraction/depletion, and causal regional geology.
6. Add energy/power and operating constraints to apparatus incrementally.
7. Expand continuous processing, sensors, controllers, and automation/control systems.
8. Add reusable/nested solved systems and progressively collapse mature factories into higher-level components.
9. Introduce star/system generation inputs when downstream systems can materially consume them.
10. Expand logistics, chemistry, thermodynamics, pressure/vacuum, and larger industrial networks iteratively.

---

# Long-Term Systems Direction

Interlink is intended to grow recursively:

```text
Primitive Function
    ↓
Apparatus
    ↓
Process
    ↓
Production Line
    ↓
Facility
    ↓
Industrial Network
    ↓
Planetary System
```

Long-term systems may include surveying, extraction, processing, chemistry, thermodynamics, fluids/gases, pressure/vacuum, material and energy streams, storage, logistics, instrumentation, automation, reusable blueprints, and hierarchical system inspection/debugging.

---

# Inspirations

The project draws design inspiration from systems-heavy games including GregTech: New Horizons, Stationeers, Oxygen Not Included, Noita/falling-sand simulations, Terraria, and Starbound. These are references for useful qualities rather than templates to copy.

The canonical design in `DESIGN.md` should describe Interlink's own rules directly rather than relying on another game's terminology as shorthand.

---

# Running the Current Web App

Because the project uses JavaScript ES modules, run it through a local HTTP server from repository root:

```bash
python -m http.server 8000
```

or on Windows:

```bash
py -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Run automated tests with:

```bash
npm test
```

## GitHub Pages

The repository layout supports GitHub Pages from:

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

---

# Project Documentation

- [`DESIGN.md`](DESIGN.md) — canonical long-term Interlink game design
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — implementation guidance and current agent guardrails
- [`PATCH_NOTES.md`](PATCH_NOTES.md) — historical development record

These documents intentionally serve different purposes: long-term design, current project state, implementation constraints, and historical record should remain separate.