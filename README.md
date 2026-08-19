# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is to turn the matter and energy available in an unfamiliar world into a self-sustaining industrial network built from physical resources, material and energy streams, apparatus, storage, logistics, instrumentation, automation, and recursively nested systems.

> **Yesterday's factory becomes today's machine.**

The canonical long-term game design lives in [`DESIGN.md`](DESIGN.md). This README records the current implementation state, established architectural contracts, and the active near-term correction before player-authored construction.

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

The project now has a coherent vertical architecture from deterministic planet generation to player-visible Sites/Features, continuous extraction/processing, recursive hierarchy boundaries, and a shared graph interface.

Current serialized versions on `main` are:

```text
schemaVersion: 7
generatorVersion: 4
```

## Implemented foundation

### World generation and state

- deterministic seeded causal planet generation
- deterministic namespaced RNG streams
- World / Knowledge / UI state separation
- normalized Region, Site, Feature, and `ResourceOccurrence` entities
- every generated Feature belongs to one enterable Site
- broad regional resource potential becomes physical access Sites/Features rather than Region inventory
- structural Region/Site/Feature visibility is independent from Knowledge State

### Matter and processing

- `MaterialBatch` for meaningful discrete lots/samples
- provenance separated from current material identity
- particle size as a modeled material property
- reusable `ProcessDefinition` metadata
- Crushing and Magnetic Separation
- shared discrete/continuous transformation physics
- `MaterialStream` as constituent mass-flow state, not batches-per-tick
- finite-capacity Hopper storage
- constituent and total-mass conservation
- transactional backpressure / atomic process behavior
- one-to-one material output connections until an explicit splitter exists

### Continuous simulation

- fixed-step world simulation independent from render FPS
- continuous Extractor, Crusher, and Magnetic Separator execution
- global Pause/Resume
- active-machine `enabled` command state
- derived `off / idle / running / blocked` operating state
- persistent Site sessions while navigating elsewhere

### Recursive systems and graph UI

- Planet → Region → Site navigation
- explicit Site and Region Import/Export boundary buffers
- conserved cross-boundary transfer behavior
- no implicit cross-boundary logistics
- one shared `GraphNode` / `GraphPort` / `GraphConnection` projection layer
- shared selection, Inspector, connection preview, and disconnect behavior
- one common workspace shell
- per-workspace pan/zoom
- signed effectively unbounded graph coordinates
- persistent semantic node-category headers

Node categories currently include:

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

The category answers **what kind of thing is this?** The node body identifies the specific instance/subtype and live state.

---

# Canonical Physical Hierarchy

The current hard ownership hierarchy is:

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

## Region

A Region is geographic/logistical context. It groups Sites.

A Region does **not** physically own Features or ResourceOccurrences. Regional climate, geology, moisture, biosphere conditions, surface cover, etc. may influence generation, but they are generation causes rather than resource inventory.

Do not reintroduce canonical fields such as:

```text
region.features
region.backgroundResourceOccurrences
region.resources
```

## Site

A Site is a player-addressable geographic place in a Region.

A Site may contain one or more Features:

```text
Site
├── Feature
├── Feature
├── Site Import
├── Site Export
└── player systems later
```

`site.featureIds` is intentionally plural.

A Site must not duplicate its Features' ResourceOccurrence IDs as a second ownership list.

## Feature

A Feature is one distinct physical system/body/opportunity at a Site that can meaningfully be interacted with or exploited.

Examples include:

```text
Iron Vein
Aquifer
Gas Reservoir
Obsidian Outcrop
Volcanic Vent
Forest
Ice Field
Surface Deposit
Cavern
```

## ResourceOccurrence

A `ResourceOccurrence` is the actual physical source/feedstock body exposed through one Feature.

Every natural occurrence is Feature-owned:

```text
sourceType: "feature"
sourceId: <owning Feature id>
```

Raw-resource `distribution` (`localized`, `regional`, `both`) is only generation metadata. It must never become Region ownership.

---

# Completed Correction — Issue #25 ✓

PR #24 established the ownership hierarchy and physical Feature → Extractor access relationship. Issue #25 corrected the remaining generator-semantic problem: a generated Feature could receive several unrelated ResourceOccurrences as a variety mechanism.

This is now resolved. As of generator v4:

- Each generated Feature has **exactly one ResourceOccurrence** (one physical source/body).
- Resource variety at a Site manifests as additional Features, not additional occurrences on one Feature.
- Resource–Feature compatibility is enforced by a **scalable occurrence-family taxonomy** rather than per-Feature ID whitelists. A `groundwater` resource has `occurrenceFamily: 'aqueous-fluid'`, so it is never a candidate for an `Outcrop` (which accepts `rock-mass`, `ore-body`, `mineral-body` only) even on a water-rich planet.
- Occurrence families used: `rock-mass`, `ore-body`, `mineral-body`, `sediment`, `evaporite`, `ice-body`, `aqueous-fluid`, `hydrothermal-fluid`, `magma`, `reservoir-gas`, `atmosphere`, `vegetation`, `organic-soil`.

Example output topology:

```text
SITE: Ancientwell Rift
│
├── FEATURE: Ancientwell Aquifer
│   └── ResourceOccurrence: groundwater body  (family: aqueous-fluid)
│
└── FEATURE: Blackglass Outcrop
    └── ResourceOccurrence: obsidian body  (family: rock-mass)
```

Iron ore remains one occurrence containing its full mineral mixture (hematite / magnetite / goethite / quartz-gangue), preserving extraction composition fidelity.

---

# Composition vs Resource Classification

Interlink's long-term physical truth should trend toward chemical/mineral constituents rather than commodity-token identities.

A resource label is useful for generation, UI, classification, and player language, but it should not become a substitute for physical composition when composition matters.

## One source, many constituents

An iron-bearing vein is one physical source:

```text
FEATURE: Iron Vein
└── ResourceOccurrence: iron-bearing ore body
    ├── hematite
    ├── magnetite
    ├── goethite
    └── quartz/gangue
```

Extraction should preserve that mixture.

Likewise, an aquifer should eventually be modeled closer to:

```text
FEATURE: Aquifer
└── ResourceOccurrence: groundwater body
    ├── H2O
    ├── Na+
    ├── Cl-
    ├── Ca2+
    ├── HCO3-
    └── other dissolved species/minerals
```

with classifications such as:

```text
fresh water
saline water
brine
```

derived from or descriptive of the underlying mixture rather than being separate primitive matter types whenever they refer to the same physical body.

The same principle applies to reservoir gases:

```text
CH4
C2H6
CO2
N2
...
```

A complete chemistry/speciation system is **not** the current milestone. Coarse ResourceDefinitions remain acceptable where deeper chemistry is not yet implemented. The architectural direction is simply:

> **Prefer constituent/species truth over proliferating commodity tokens.**

---

# Regional / Broad Resources Become Sites

Broad availability remains represented through Sites and Features rather than Region inventory.

Example:

```text
Kharon Plain
│
├── Great Forest of Kharon
│   └── Kharon Forest Feature
│       └── wood/biomass source body
│
├── Kharon Clay Fields
│   └── Clay Deposit Feature
│       └── clay-bearing material body
│
└── Open Atmosphere of Kharon
    └── Atmospheric Zone Feature
        └── atmospheric mixture
```

The Region itself owns no resource quantity.

For now, broad availability remains qualitative. Do not invent precise reserve tonnage until reserve/depletion mechanics need it.

---

# Feature Access and Extraction

Features participate directly in the graph.

```text
Feature
  RESOURCE ACCESS
        │
        ▼
Extractor / compatible apparatus
        │
        │ material output
        ▼
MaterialStream
        │
        ▼
Container / downstream process
```

## Resource access is not matter flow

`Feature → Extractor` is a typed `resource-access` relationship.

It represents physical access/attachment to the source. It does **not** transfer kilograms, does not create a `MaterialStream`, and does not duplicate matter ownership.

The material stream begins at the apparatus material-output port.

## Extraction preserves source matter

An Extractor may operate only when:

1. it has a valid `resource-access` connection from a Feature;
2. that Feature owns the configured ResourceOccurrence;
3. it has a valid material output;
4. downstream capacity permits transfer.

Extraction does not purify the source.

If the occurrence is:

```text
hematite          62%
magnetite         13%
quartz/gangue     21%
other              4%
```

then the Extractor output preserves that mixture at the actual extraction rate.

Downstream crushing, separation, concentration, smelting, chemistry, etc. produce progressively refined matter.

---

# Feature Inspector Direction

The primary Feature Inspector should emphasize information that creates current decisions:

```text
FEATURE
Name
Feature type

SOURCE / RESOURCE BODY
- useful classification/name
- qualitative availability
- known composition where modeled

ACCESS
- resource-access interface
- connected apparatus
```

Generated metadata such as depth, geometry, accessibility, pressure, temperature, etc. may remain in World State, but should not dominate the player-facing Inspector until active mechanics use it.

For Sites with multiple physical sources, show multiple Feature nodes rather than one Feature containing an arbitrary resource list.

---

# Temporary Iron Processing Prototype

The automatic iron chain remains a temporary validation scaffold.

At a compatible iron Site:

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

Non-iron Sites must not receive the iron chain merely because they are enterable.

Issue #25 must preserve the iron case as **one physical ore occurrence containing a mineral mixture**, while splitting unrelated physical sources into separate Features.

---

# Foundational State and Matter Ownership

Interlink keeps three kinds of state separate:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
measurements / analyses / estimates / confidence
        ↓
APPLICATION / UI STATE
selection / graph layout / pan+zoom / panels / temporary gestures
```

Structural world entities are visible immediately. Knowledge State is for meaningful analysis, uncertainty, measurements, and sensor data—not basic structural visibility.

> **Abstract the history. Preserve the resulting matter.**

Every modeled unit of matter has exactly one physical owner/location at a time, such as:

- natural ResourceOccurrence
- Hopper/container contents
- machine internal buffer/chamber
- Site/Region boundary buffer
- explicit transport inventory when transit is modeled
- discrete package/sample

A `MaterialStream` describes transfer between owners and must not duplicate source/destination matter.

`MaterialBatch` is for meaningful discrete lots; never allocate one batch per continuous-simulation tick.

---

# Throughput, Backpressure, and Boundaries

Feasible process throughput is constrained by:

```text
input available
process capacity × dt
required output free capacity
connectivity / operating constraints
```

Processes/transfers must not consume input and later discover that output cannot be accepted.

Until an explicit splitter exists, one material output cannot fan out to multiple material destinations and duplicate matter.

Every composite system exchanging matter with its parent uses explicit physical boundaries:

```text
Site Import
Site Export
Region Import
Region Export
```

Parent-facing ports and child-visible boundaries are views of the same physical ownership state. A boundary existing does not imply movement.

---

# World Time and Machine Control

Keep separate:

```text
WORLD TIME
running / paused

MACHINE COMMAND STATE
enabled / disabled

MACHINE OPERATING STATE
off / idle / running / blocked / faulted later
```

World simulation runs by default. Pausing does not alter machine commands. Navigating away does not stop automated Site systems.

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

The viewport is finite; logical graph space is not. Signed node coordinates are valid.

Persistent graph edges must correspond to real underlying relationships. Material edges represent matter flow; `resource-access` edges represent source access and are visually distinguishable.

---

# Immediate Development Direction

**Issue #25 is resolved.** The active milestone is now player-authored Site construction.

Current order:

1. ~~Issue #25 — split independently exploitable sources into distinct Features and establish composition/classification direction.~~ **Done (generator v4).**
2. **Player-authored Site construction** — active milestone.
3. Remove automatic iron-chain placement from normal gameplay.
4. Deepen extraction/reserve/depletion mechanics when useful.
5. Add additional Feature interaction families incrementally.
6. Add splitter/merger when real branching requires it.
7. Add logistics.
8. Add power/energy.
9. Add sensors/controllers and deeper Knowledge mechanics.
10. Expand reusable composite systems, chemistry, thermodynamics, fluids/gases, and larger-scale industry iteratively.

The construction loop now available:

```text
Enter Site
    ↓
Inspect distinct physical Features
    ↓
Choose compatible apparatus/storage
    ↓
Place nodes
    ↓
Connect Feature access + material ports
    ↓
Configure / enable
    ↓
Observe real source mixture / flow / blocking
    ↓
Iterate
```

---

# Running the Project

From repository root:

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

Run tests with:

```bash
npm test
```

---

# Documentation Roles

- [`DESIGN.md`](DESIGN.md) — canonical long-term game design
- `README.md` — current implementation state and roadmap
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — implementation guardrails and active coding priority
- [`PATCH_NOTES.md`](PATCH_NOTES.md) — historical development record

Long-term design, current implementation, implementation rules, and historical notes should remain distinct.