# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is to turn the matter and energy available in an unfamiliar world into a self-sustaining industrial network built from physical resources, material and energy streams, apparatus, storage, logistics, instrumentation, automation, and recursively nested systems.

> **Yesterday's factory becomes today's machine.**

The canonical long-term game design lives in [`DESIGN.md`](DESIGN.md). This README records the current implementation state and the architectural contracts that already exist in code.

---

# Core Gameplay Direction

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

Automation is a core interaction principle from the beginning. The player should learn one system language:

```text
sources
→ ports
→ streams
→ buffers
→ processes
→ constraints
→ feedback
→ automation
```

World generation exists to create meaningful physical starting conditions for gameplay, not merely procedural metadata.

---

# Current Project State

Interlink now has a coherent vertical architecture from deterministic planet generation to player-visible Features, continuous material extraction/processing, recursive hierarchy boundaries, and a shared graph interface.

The serialized versions are currently:

```text
schemaVersion: 7
generatorVersion: 3
```

## Implemented foundation

### World generation and state

- deterministic seeded causal planet generation
- deterministic namespaced RNG streams
- World / Knowledge / UI state separation
- Regions, Sites, Features, and normalized `ResourceOccurrence` entities
- every generated Feature belongs to one enterable Site
- every generated Feature currently has at least one resource/opportunity association
- broad regional resource potential is materialized as physical access Sites/Features
- structural Region/Site/Feature visibility does not depend on Knowledge State

### Matter and processing

- `MaterialBatch` for meaningful discrete lots/samples
- provenance separated from current material identity
- particle size as a modeled material property
- reusable `ProcessDefinition` metadata with explicit ports/parameters
- Crushing and Magnetic Separation
- shared discrete/continuous transformation physics
- `MaterialStream` as rate + physical state, not batches-per-tick
- finite-capacity Hopper storage
- constituent and total-mass conservation
- transactional backpressure / atomic process behavior
- one-to-one material output connections until an explicit splitter exists

### Continuous simulation

- fixed-step world simulation independent from render FPS
- continuous Extractor, Crusher, and Magnetic Separator execution
- global world Pause/Resume
- active-machine `enabled` command state
- derived `off / idle / running / blocked` operating state
- persistent Site sessions while navigating elsewhere
- automated systems continue running when another workspace is visible

### Recursive systems

- Planet → Region → Site navigation
- explicit Site Import / Site Export boundary buffers
- explicit Region Import / Region Export boundary buffers
- parent-facing ports alias the same physical child boundary state
- conserved cross-boundary `BoundaryTransfer` behavior
- no implicit Site → Region or Region → Planet movement

### Shared graph interface

- one `GraphNode` / `GraphPort` / `GraphConnection` projection layer
- shared node/edge rendering across Planet, Region, and Site
- shared selection, Inspector, connection preview, and disconnect behavior
- one common workspace shell
- per-workspace pan/zoom state
- pointer-centered wheel zoom
- Zoom Out / Zoom In / Fit / Center controls
- signed effectively unbounded logical graph coordinates
- drag tracking independent of transformed DOM-layer bounds

### Node recognition

Every graph node has a persistent semantic category header:

```text
PLANET
REGION
SITE
FACILITY
FEATURE
APPARATUS
CONTAINER
BOUNDARY
PROCESS
SENSOR
CONTROLLER
LOGISTICS
SYSTEM
```

The header answers **what kind of thing is this?** The body identifies the instance/subtype and live state.

A Crusher is an **APPARATUS** executing a crushing process; it is not itself an abstract PROCESS node.

---

# Canonical Natural-Resource Hierarchy

The physical hierarchy is now:

```text
Planet
  ↓
Region
  ↓
Site
  ↓
Feature
  ↓
ResourceOccurrence
```

This is a hard world-model contract.

## Region

A Region is geographic and logistical context. It groups Sites.

A Region does **not** physically own Features or ResourceOccurrences.

Regional climate, geology, surface cover, bulk composition, moisture, biosphere conditions, etc. may influence what resources are broadly available, but that information is a **generation cause**, not a resource inventory.

Canonical Region state therefore contains Site references, not:

```text
region.features
region.backgroundResourceOccurrences
region.resources
```

## Site

A Site is a player-addressable place inside a Region.

A Site owns/references one or more Features:

```text
Site
├── Feature(s)
├── Site Import
├── Site Export
└── player systems later
```

A Site does not duplicate its Features' ResourceOccurrence IDs as a second ownership list.

## Feature

A Feature is a physical source, opportunity, constraint, or environment located at a Site.

Examples:

```text
Mineral Deposit
Aquifer
Gas Reservoir
Volcanic Vent
Hydrothermal System
Forest
Ice Field
Surface Deposit
Rock Field
```

A Feature should exist because it creates some meaningful physical opportunity or constraint, not as decorative world-generation metadata.

## ResourceOccurrence

A `ResourceOccurrence` is actual natural material/resource state associated with exactly one Feature.

Every current ResourceOccurrence has:

```text
sourceType: "feature"
sourceId: <owning Feature id>
```

The `distribution` property on raw resource definitions is only a generator hint (`localized`, `regional`, or `both`). It must never become physical Region ownership.

---

# Regional / Broad Resources Become Sites

Some resources are not naturally represented as a single small localized deposit. Wood, regolith, surface rock, common water, ice, atmosphere, clay, sand, etc. may be broadly available across suitable Regions.

Interlink represents those conditions as physical access places rather than abstract Region inventory.

Example:

```text
Kharon Plain
│
├── Great Forest of Kharon
│   └── Forest
│       └── Wood occurrence
│
├── Kharon Clay Fields
│   └── Surface Deposit
│       └── Clay occurrence
│
└── Open Atmosphere of Kharon
    └── Atmospheric Zone
        └── Atmospheric Gas occurrence
```

These are `regional-access` Sites generated from regional conditions.

The Region itself still owns no resource quantity.

For now, broad availability remains qualitative. Do not invent precise reserve tonnage until depletion/reserve mechanics exist.

---

# Feature Access and Extraction

Features are now active participants in the graph rather than informational boxes.

The key relationship is:

```text
Feature
  RESOURCE ACCESS
        │
        ▼
Extractor / Miner
        │
        │ material output
        ▼
MaterialStream
        │
        ▼
Container / downstream process
```

## Resource access is not matter flow

`Feature → Extractor` is a typed `resource-access` connection.

It means the apparatus is physically attached to / exploiting that Feature. It does **not** transfer kilograms and it does not create a `MaterialStream`.

The actual material stream begins at the Extractor material-output port.

This distinction prevents the Feature access relationship from duplicating matter ownership.

## Extractors cannot magically bind to occurrences

An Extractor may be configured for a ResourceOccurrence, but it can only operate if:

1. it has a valid `resource-access` connection from a Feature;
2. that Feature owns the configured occurrence;
3. the Extractor has a valid material-output connection;
4. downstream storage/processing has capacity.

Without Feature access, an enabled Extractor does not produce material.

## Extraction preserves actual source matter

Extraction does not output a purified commodity token.

If a natural iron-bearing occurrence is:

```text
hematite          62%
magnetite         13%
quartz/gangue     21%
other              4%
```

then the Extractor's output stream preserves that mixture in the same proportions at the actual extraction rate.

Downstream crushing, separation, concentration, smelting, and chemistry are what transform natural matter into useful products.

For resources that do not yet have a detailed constituent model, the current coarse resource itself may be represented as the stream constituent until deeper composition mechanics are introduced.

---

# Feature Inspector Direction

The primary Feature Inspector should emphasize information that currently creates decisions:

```text
FEATURE
Name
Feature type

RESOURCES
- resource name
- availability / qualitative quantity
- known composition where relevant

ACCESS
- resource-access interface
- connected apparatus
```

Generated detail such as depth, geometry, accessibility, temperature, pressure, or other metadata may remain in World State for future mechanics, but it should not dominate the current player-facing Inspector until it affects gameplay.

> Generated detail may exist before it becomes player-facing. The Inspector should emphasize properties that currently matter.

---

# Temporary Iron Processing Prototype

The current automatic iron chain remains a temporary validation scaffold, not the intended final construction experience.

At a compatible iron Site, the prototype now behaves physically as:

```text
Iron-bearing Feature
        │ resource-access
        ▼
Extractor
        │ actual source mixture
        ▼
Raw Ore Hopper
        ↓
Crusher
        ↓
Crushed Ore Hopper
        ↓
Magnetic Separator
       ├────────→ Concentrate Hopper
       └────────→ Tailings Hopper
```

At non-iron Sites, the iron apparatus chain is not instantiated merely because the Site is enterable.

The next construction milestone should eventually replace automatic apparatus placement with player-authored placement/configuration while preserving this physical Feature-access contract.

---

# Foundational State Architecture

Interlink preserves three distinct kinds of state:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
measurements, analyses, estimates, confidence
        ↓
APPLICATION / UI STATE
selection, graph layout, pan/zoom, panels, temporary gestures
```

Physical truth must not migrate into DOM/UI state merely because it is convenient to render there.

Structural world entities are immediately visible. Knowledge State remains for meaningful analysis, measurements, uncertainty, sensor data, and future scientific characterization.

---

# Matter Ownership

> **Abstract the history. Preserve the resulting matter.**

Every modeled unit of matter has exactly one physical owner/location at a time, such as:

- natural ResourceOccurrence
- Hopper/container contents
- machine internal buffer/chamber
- Site/Region boundary buffer
- explicit transport inventory when transit is modeled
- discrete package/sample

A stream describes transfer between owners. It must not duplicate source/destination matter.

## MaterialBatch

Use `MaterialBatch` for meaningful discrete lots such as samples, packages, shipments, or isolated charges.

Never allocate one batch per continuous-simulation tick.

## MaterialStream

A continuous stream carries constituent mass-flow rates and physical state:

```text
MaterialStream
├── constituent mass-flow rates (kg/s)
├── total flow (derived)
├── particle size
└── additional state later when gameplay requires it
```

## Containers

Containers integrate streams over time:

```text
stored += inflow × dt
stored -= outflow × dt
```

If contents physically mix, aggregate the resulting physical state rather than keeping arbitrary historical transfer objects.

---

# Throughput, Backpressure, and Conservation

Feasible process throughput is constrained by:

```text
input available
process capacity × dt
required output free capacity
connectivity / operating constraints
```

Processes and transfers are staged/committed coherently. They must not consume input and later discover an output cannot accept the result.

Until an explicit splitter exists, one material output port cannot fan out to multiple material destinations and duplicate matter.

`resource-access` is different: one physical Feature may eventually support multiple attached apparatus, so its access relationship is not governed by the material-stream fan-out rule.

---

# Recursive Boundary Contract

Every composite system that exchanges matter with its parent uses explicit physical boundary buffers.

```text
Site Import
Site Export
Region Import
Region Export
```

The parent-facing port and child-visible boundary are two views of the same physical owner, not duplicate inventories.

A boundary existing does not imply movement. Matter moves only through explicit connections/transfers.

---

# World Time and Machine Control

Keep these separate:

```text
WORLD TIME
running / paused

MACHINE COMMAND STATE
enabled / disabled

MACHINE OPERATING STATE
off / idle / running / blocked / faulted later
```

World simulation runs by default. Pausing does not change machine commands. Navigating away from a Site does not stop its automated systems.

New active apparatus defaults disabled/off.

---

# Shared Player Interface Contract

Planet, Region, and Site are different graphs inside the same interface.

Common interaction language:

```text
select
→ drag/rearrange
→ inspect
→ connect compatible typed ports
→ enter/drill down if composite
→ observe live state
```

The graph viewport is finite; logical graph space is not. Signed node coordinates are valid and pan/zoom/layout are application state only.

Persistent graph edges must correspond to real underlying relationships. Material edges represent material-flow relationships; `resource-access` edges represent physical source access and are visually distinguishable.

---

# Immediate Development Direction

The Site/Feature resource-access architecture is the final world-to-industry contract needed before player-authored construction.

The next major gameplay milestone is:

```text
Enter Site
    ↓
Inspect Feature/resources
    ↓
Choose apparatus/storage
    ↓
Place nodes
    ↓
Connect Feature access + material ports
    ↓
Configure machinery
    ↓
Enable machinery
    ↓
Observe flow / blocking / constraints
    ↓
Iterate
```

Near-term roadmap:

1. Player-authored Site construction.
2. Remove automatic iron-chain placement from normal gameplay.
3. Deepen reserve/depletion/extraction mechanics when useful.
4. Add additional Feature interaction families incrementally.
5. Add explicit splitter/merger mechanics when branching requires them.
6. Add logistics apparatus/capacity.
7. Add power/energy requirements.
8. Add sensors/controllers and deeper Knowledge mechanics.
9. Allow solved systems to become reusable composite nodes.
10. Expand chemistry, thermodynamics, fluids/gases, pressure, and larger-scale industry iteratively.

---

# Running the Project

Run the web app through a local HTTP server from repository root:

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

The repository layout remains compatible with GitHub Pages from `main` / repository root.

---

# Documentation Roles

- [`DESIGN.md`](DESIGN.md) — canonical long-term game design
- `README.md` — current implementation state and roadmap
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — coding-agent implementation guardrails
- [`PATCH_NOTES.md`](PATCH_NOTES.md) — historical development record

Long-term design, current implementation, implementation rules, and historical notes should remain distinct.