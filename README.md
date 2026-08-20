# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a lightweight web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is to turn the matter and energy available in an unfamiliar world into a self-sustaining industrial network built from physical resources, material and energy streams, apparatus, storage, logistics, instrumentation, automation, and recursively nested systems.

> **Yesterday's factory becomes today's machine.**

The project is deliberately simulation-first: outcomes should emerge from material state, apparatus capability, process physics, operating conditions, connectivity, capacity, and control rather than from arbitrary crafting recipes.

## Documentation

- [`DESIGN.md`](DESIGN.md) — canonical long-term game design and simulation direction
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — current code organization, dependency boundaries, and extension paths
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — coding-agent implementation guardrails
- [`PATCH_NOTES.md`](PATCH_NOTES.md) — historical development record
- `README.md` — current implementation state and near-term direction

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

The player should gradually learn one consistent systems language:

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

World generation exists to create meaningful physical starting conditions for this loop, not merely procedural metadata.

---

# Current Project State

The current build has a coherent vertical slice from deterministic planet generation through natural resource sources, player-authored Site construction, continuous material processing, recursive boundaries, and a shared graph workspace.

Current serialized versions on `main` are:

```text
schemaVersion: 8
generatorVersion: 6
```

`schemaVersion: 8` represents canonical fraction-aware `MaterialBody` serialization. `generatorVersion: 6` represents generated solid resources using concrete registered species compositions rather than coarse placeholder constituents.

## Implemented foundation

### World generation and state

- deterministic seeded planet generation
- namespaced deterministic RNG
- explicit World / Knowledge / UI state separation
- canonical normalized Region, Site, Feature, and `ResourceOccurrence` ownership
- broad regional resource potential materialized as physical access Sites/Features rather than Region inventory
- independent world-validation domains for hierarchy, occurrences, and process history
- deterministic world assembly separated from declarative content definitions

### Player-authored engineering

Entering a Site creates its authoritative natural Feature nodes and Site boundary interfaces. The player places engineering nodes from the NODE catalog rather than receiving a prebuilt process chain.

Current placeable definitions are:

```text
APPARATUS
  Extractor
  Crusher
  Magnetic Separator

CONTAINER
  Hopper
```

Apparatus/catalog metadata is now definition-driven. Runtime behavior is registry-driven. New machines are intended to extend those systems rather than add another independent central registration list.

### Matter and processing

The implemented solid-particulate model stores aggregate fractions as:

```text
speciesId × particleSizeBinId × liberationClassId → quantity
```

This represents populations of material, not individually simulated particles.

Current solid state includes:

- concrete registered material/mineral species
- mass/quantity
- particle-size distribution
- liberation distribution
- magnetic-response property coverage
- `MaterialBody` physical form

Generated solid resources use concrete constituent compositions. Legacy coarse aliases may still be accepted for compatibility, but current generation does not emit pseudo-species such as generic gangue or iron-oxide mixture entries.

Mechanical processing currently includes:

- Crushing
- Magnetic Separation
- shared discrete and continuous physical transformation logic
- replaceable process conservation policy architecture
- transactional backpressure and atomic multi-output commits
- one physical owner/location for stored matter
- no material fan-out until an explicit splitter exists

### Crusher

Current player-configurable canonical target cuts are:

```text
1 mm
5 mm
15 mm
25 mm
60 mm
120 mm
```

A Crusher remains a throughput device. Feed already at or below its configured target passes through rather than causing the machine to infer that no processing is needed.

### Magnetic Separator

The current magnetic-separation model depends on:

```text
species magnetic response
× liberation recovery factor
× particle-size suitability
× field-strength response
+ process entrainment/carryover
```

The current prototype requires all feed to be in particle-size classes at or below 25 mm. Oversized mixed feed blocks the process rather than being silently screened.

### Continuous simulation

- fixed-step simulation independent from render FPS
- continuous Extractor, Crusher, and Magnetic Separator execution
- Hopper buffering and finite capacity
- material streams represented as mass-flow state rather than per-tick batches
- global world Pause/Resume
- machine enabled/disabled command state
- derived `off / idle / running / blocked` operating state
- persistent Site simulation while navigating elsewhere

### Recursive systems and graph workspace

- Planet → Region → Site navigation
- explicit Site and Region Import/Export boundary storage
- conserved cross-boundary transfers
- no implicit cross-workspace logistics
- shared graph projection and typed edges
- shared selection, Inspector, placement, connection, and disconnect behavior
- signed effectively unbounded logical graph coordinates
- per-workspace pan/zoom and layout state
- definition-driven NODE catalog
- generic future-apparatus Inspector fallback

Node categories include:

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

A category describes semantic identity, not operating state.

---

# Canonical Natural Hierarchy

The hard natural ownership hierarchy is:

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

A Region is geographic and environmental context. It groups Sites and influences generation through geology, climate, moisture, surface state, biosphere, and similar conditions.

A Region does **not** own Features or natural resource inventory directly.

Do not reintroduce canonical fields such as:

```text
region.features
region.backgroundResourceOccurrences
region.resources
```

When a widespread source needs to become exploitable, it should be exposed through an appropriate Site/Feature access representation rather than becoming Region-owned matter.

## Site

A Site is a player-addressable place inside a Region and can contain multiple distinct Features:

```text
Site
├── Feature
├── Feature
├── Site Import
├── Site Export
└── player-authored systems
```

`site.featureIds` is intentionally plural. A Site does not duplicate ResourceOccurrence ownership.

## Feature

A Feature is one distinct physical body, structure, condition, or access opportunity at a Site.

Examples include:

```text
Mineral Deposit
Aquifer
Gas Reservoir
Outcrop
Volcanic Vent
Ice Body
Forest-like biological source
Cavern
```

## ResourceOccurrence

A `ResourceOccurrence` is the actual natural source/feedstock body exposed through one Feature.

Every natural occurrence is Feature-owned:

```text
sourceType: "feature"
sourceId: <owning Feature id>
```

Generated localized Features currently expose one ResourceOccurrence. If two sources can be independently exploited, they should normally become two Features rather than unrelated occurrences stuffed into one Feature.

A single occurrence may contain many constituent species.

---

# Composition, Liberation, and Separation

Interlink distinguishes three ideas that should not be collapsed into one number or commodity label.

## Composition

Composition answers **what species are present and how much?**

An iron ore source may contain:

```text
hematite
magnetite
goethite
quartz
```

Extraction preserves that source mixture.

## Liberation

Liberation answers **how physically detached are mineral populations from one another?**

Current classes are:

```text
locked
partial
mostly-liberated
liberated
```

A material can be 100% liberated and still be a mixture of many separate mineral grains. Liberation is not purity.

## Separation

Separation uses physical differences such as magnetic response, density, surface behavior, conductivity, or phase behavior to route liberated or partially liberated material into different outputs.

This distinction allows progression such as:

```text
coarse mixed ore
  ↓ crushing / grinding
finer + more liberated mixture
  ↓ separation
concentrate + tailings
  ↓ later thermal / chemical processing
refined material
```

---

# Resource Access Is Not Material Flow

Features participate directly in the graph:

```text
Feature
  ↓ resource-access relationship
Extractor / compatible apparatus
  ↓ material output
MaterialStream
  ↓
Container / process
```

`resource-access` is a typed relationship representing physical access to a source. It carries no kg/s, creates no `MaterialStream`, and does not duplicate matter ownership.

Matter begins flowing at the apparatus material-output port.

An Extractor is placed unbound and becomes associated with a source through the resource-access connection. Extraction materializes only the amount actually extracted at that time; a Hopper does not become a hidden inventory copy of the entire geological occurrence.

---

# Matter Ownership and Conservation

Interlink keeps three kinds of state separate:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
measurements / analyses / estimates / confidence
        ↓
APPLICATION / UI STATE
selection / layout / viewport / panels / temporary gestures
```

> **Abstract the history. Preserve the resulting matter.**

Every modeled unit of matter has exactly one physical owner/location at a time, such as:

- natural `ResourceOccurrence`
- Hopper/container contents
- machine internal body/buffer where explicitly modeled
- Site/Region boundary buffer
- explicit transport inventory when transit is later modeled
- discrete sample/package

A `MaterialStream` describes transfer between owners and must not duplicate source/destination inventory.

`MaterialBatch` is reserved for meaningful discrete lots and experiments; it is not allocated every simulation tick.

---

# Throughput, Backpressure, and Atomic Outputs

Feasible process throughput is constrained by:

```text
input available
process capacity × dt
required output capacity
connectivity
process applicability / operating constraints
```

A process must not consume input and later discover that its required output cannot be accepted.

Multi-output apparatus such as the Magnetic Separator commit their material movement transactionally. If a required output is disconnected or full, feed is not consumed.

Until an explicit Splitter exists, one material output cannot fan out to multiple consumers.

---

# Properties Enter Through Physics

A property should enter the simulation when at least one process needs it to determine a physical result.

Current modeled/used properties include:

```text
species identity
mass / quantity
particle size
liberation
magnetic response
```

Likely future property domains include:

```text
density
hardness / grindability
moisture / liquid fraction
surface chemistry / hydrophobicity
temperature / internal energy
phase
pressure / viscosity / fluid equation-of-state data
chemical equilibrium / reaction properties
```

Do not turn all of these into universal fraction-key dimensions. Intrinsic species data, structural material state, body state, process conditions, and derived properties should remain distinct where physically useful.

The intended rule is:

> **A material property enters the simulation when an apparatus or process needs it to determine a physical outcome.**

---

# Current Code Architecture

The post-restructure codebase separates declarative content, core physics/contracts, deterministic generation, running simulation, and workspace/UI concerns.

```text
src/
├── app.js
├── content/      what resources, Features, apparatus, etc. exist
├── core/         material/system/process/world contracts and pure physics
├── data/         legacy compatibility forwarding modules
├── generator/    deterministic world-generation algorithms
├── simulation/   continuous runtime, streams, storage, apparatus execution
└── workspace/    graph projection, placement, navigation, Inspector, DOM orchestration
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the complete current file tree, canonical ownership boundaries, compatibility entry points, and extension paths.

A new apparatus should generally follow:

```text
apparatus definition
    ↓
process definition
    ↓
pure physics
    ↓
batch executor if needed
    ↓
continuous apparatus runtime
    ↓
runtime registration
    ↓
tests
```

The NODE catalog, generic Inspector eligibility, typed connections, and removal policy should derive from canonical definitions rather than require another machine-type switch.

---

# Shared Player Interface Contract

Planet, Region, Site, and future recursive systems are different graphs inside one interaction language:

```text
select
→ drag / rearrange
→ inspect
→ connect compatible typed ports
→ enter / drill down if composite
→ observe live state
→ configure / automate
```

Persistent graph edges must correspond to real underlying relationships. Material edges represent matter transfer; `resource-access` represents source access; future energy/signal/etc. edges should remain semantically typed.

The viewport is finite. Logical graph space is effectively unbounded and supports signed coordinates.

---

# Near-Term Development Direction

The architecture milestone needed before adding many more machines is complete. Near-term processing expansion can now test the new extension paths rather than growing central machine-specific logic.

Likely sequence:

1. **Screen / Sieve** — two-output particle-size routing with explicit undersize/oversize outputs and strict conservation.
2. **Splitter / Mixer-Merger** — explicit material branching and recombination instead of implicit fan-out.
3. **Mill / Grinder** — finer particle-size regimes and more realistic liberation progression below the current Crusher scale.
4. **Density property + Gravity Separation** — first major new property domain beyond magnetic response.
5. **Slurry/liquid handling and Hydrocyclone / Flotation-style processing** as the material model supports them.
6. **Thermal state and thermal apparatus** once internal-energy/phase modeling has a concrete process need.
7. **Chemical transformation** after elemental/stoichiometric conservation and thermal foundations are ready.
8. **Sensors, controllers, logistics, energy networks, and reusable composite systems** incrementally as real gameplay demands them.

This is direction, not a commitment to implement all systems immediately. Each new system should justify the physical state and complexity it introduces.

---

# Running the Project

From the repository root:

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

Run the complete regression suite with:

```bash
npm test
```

---

# Documentation Maintenance

The documentation has deliberately separate responsibilities:

- change `DESIGN.md` when the long-term design contract changes;
- change `ARCHITECTURE.md` when code ownership, dependency direction, compatibility surfaces, or extension paths change;
- change `README.md` when the current implementation state, versions, or near-term development direction change;
- change `.github/copilot-instructions.md` when coding-agent guardrails or canonical implementation paths change;
- keep `PATCH_NOTES.md` as historical context rather than current authority.

When the implementation and documentation disagree, treat the discrepancy as something to resolve rather than allowing multiple architectural stories to accumulate.
