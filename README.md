# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a lightweight web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is to turn the matter and energy available in an unfamiliar world into a self-sustaining industrial network built from physical resources, material and energy streams, apparatus, storage, logistics, instrumentation, automation, and recursively nested systems.

> **Yesterday's factory becomes today's machine.**

The project is deliberately simulation-first: outcomes should emerge from material state, apparatus capability, process physics, operating conditions, connectivity, capacity, and control rather than arbitrary crafting recipes.

## Documentation

- [`DESIGN.md`](DESIGN.md) — canonical long-term game and simulation design
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

The current build has a coherent vertical slice from deterministic planet generation through natural resource sources, player-authored Site construction, continuous particulate processing and routing, recursive boundaries, and a shared graph workspace.

Current serialized versions are:

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
- canonical Region → Site → Feature → `ResourceOccurrence` ownership beneath Planet
- broad regional resource potential materialized as physical access Sites/Features rather than Region inventory
- independent hierarchy, occurrence, and process-history validation domains
- deterministic generation separated from declarative content definitions

### Player-authored engineering

Entering a Site creates its authoritative natural Feature nodes and Site boundary interfaces. The player places engineering nodes from the NODE catalog rather than receiving a prebuilt process chain.

Current placeable definitions are:

```text
APPARATUS
  Extractor
  Crusher
  Screen
  Splitter
  Material Merger
  Feeder
  Magnetic Separator

CONTAINER
  Hopper
```

Apparatus/catalog metadata is definition-driven and runtime behavior is registry-driven. The NODE catalog, generic Inspector, typed-port compatibility, and removal policy derive from shared definitions rather than independent machine lists.

### Matter and processing

The implemented solid-particulate model stores aggregate fractions as:

```text
speciesId × particleSizeBinId × liberationClassId → quantity
```

A fraction represents a population of material, not an individually simulated particle.

Current solid state includes:

- concrete registered material/mineral species
- mass/quantity
- particle-size distribution
- liberation distribution
- magnetic-response property coverage
- `MaterialBody` physical form

Generated solid resources use concrete constituent compositions. Legacy coarse aliases may still be accepted for compatibility, but current generation does not emit pseudo-species such as generic gangue or iron-oxide mixture entries.

Mechanical process physics currently includes:

- Crushing
- Screening
- Material Splitting
- Material Merging
- Controlled Feeding
- Magnetic Separation
- shared discrete and continuous physical kernels
- replaceable process-conservation policies
- transactional backpressure and atomic multi-output commits
- one physical owner/location for stored matter
- explicit branching and recombination without implicit material duplication

---

# Current Apparatus Contracts

## Extractor

An Extractor is placed unbound. A typed `resource-access` connection from a Feature selects/authorizes the Feature-owned natural occurrence being exploited.

`resource-access` carries no matter and no kg/s. Actual material flow begins at the Extractor material-output port, and extraction preserves the source occurrence's composition.

## Crusher

Current player-configurable canonical **nominal product settings** are:

```text
1 mm
5 mm
15 mm
25 mm
60 mm
120 mm
```

A Crusher setting is not a guaranteed maximum particle size. Coarser feed produces a deterministic prototype particle-size distribution containing some oversize material:

```text
10% → one size bin coarser than the nominal setting
55% → nominal setting bin
25% → one size bin finer
10% → two size bins finer
```

Shares merge naturally where the particulate model reaches its finest available bin. This prototype distribution is intentionally simple; future crusher type, feed properties, loading, wear, and operating conditions can replace the fixed curve when those variables create useful gameplay decisions.

A Crusher remains a throughput device. Feed already at or below its configured nominal setting passes through unchanged rather than causing the machine to infer that no processing is needed. Coarser fractions are redistributed and gain liberation while preserving species mass.

Legacy 10/12 mm settings remain accepted only for persisted/test compatibility and preserve their historical product behavior; they are not player-facing canonical choices.

## Screen

The Screen performs ideal particle-size classification with one stored solid feed and two explicit material outputs:

```text
Hopper
  ↓ feed
Screen
  ├── undersize
  └── oversize
```

The player chooses an aperture from the same canonical cuts used by the current particulate size model:

```text
1 mm
5 mm
15 mm
25 mm
60 mm
120 mm
```

Current screening is an intentionally ideal sharp cut:

```text
fraction size-bin upper bound <= aperture
    → undersize

coarser fraction
    → oversize
```

Screening does **not** change species, particle-size class, liberation class, or quantity. It only routes existing fractions.

Because the Crusher produces a nominal distribution rather than a perfect cutoff, the Screen has an immediate classification role. For coarse feed processed by a Crusher at 25 mm, the prototype curve leaves 10% in the 25–60 mm oversize class; a 25 mm Screen routes that fraction to `oversize` while the remaining 90% can proceed to a process that requires <=25 mm feed.

Both outputs are required. Output handling is transactional: a disconnected required output or insufficient required output capacity prevents feed consumption rather than deleting one side of the split.

Real screening inefficiency, near-cut misplacement, moisture effects, screen area/loading, particle shape, deck angle, and vibration are deferred until they create useful process decisions.

## Splitter

The Splitter is the explicit material-branching primitive:

```text
stored feed
    ↓
 Splitter
 ├── output A
 └── output B
```

The player configures `splitFractionToA` from `0` to `1`. Every species/size/liberation fraction is divided by the same ratio, so the Splitter changes ownership and flow only; it does not alter material state.

Both outputs are explicit and required. Downstream capacity throttles the whole planned split transactionally rather than allowing one branch to consume matter while the other branch is lost or blocked.

Ordinary material outputs still cannot fan out. A Splitter creates two independent physical output ports, each of which remains subject to the normal one-connection rule.

## Material Merger

The Material Merger is the explicit inverse routing primitive:

```text
input A ─┐
         ├── Material Merger → product
input B ─┘
```

It combines two stored particulate populations into one conserved output without changing species, particle size, or liberation. It is deliberately **not** called a Mixer: no mixing intensity, homogeneity, residence-time, viscosity, or other physical mixing model is implied.

Both input ports and the product port must be connected. If one connected input is temporarily empty, material available from the other input can continue through. When combined availability exceeds the rated throughput, both inputs are drawn proportionally from their currently stored masses.

Output capacity backpressures both source withdrawals as one transaction.

## Feeder

The Feeder separates a requested material-flow setpoint from the rated capacity of downstream machinery:

```text
Hopper
  ↓
Feeder @ requested kg/s
  ↓
downstream process
```

The current prototype Feeder is rated at `10 kg/s`. The player-configurable `flowRateKgPerSecond` setpoint ranges from `0` to `10 kg/s` and defaults to `4 kg/s`.

The Feeder does not transform material. It preserves composition, particle-size distribution, and liberation exactly while metering the feasible flow. A zero setpoint leaves the machine idle without consuming feed. Downstream storage capacity applies normal backpressure.

## Magnetic Separator

The current magnetic-separation model depends on:

```text
species magnetic response
× liberation recovery factor
× particle-size suitability
× field-strength response
+ process entrainment/carryover
```

The current prototype requires all feed to be in particle-size classes at or below 25 mm. Oversized mixed feed blocks the process rather than being silently screened.

Screen therefore provides the explicit way to classify a Crusher product before a size-limited downstream process.

---

# Composition, Liberation, and Separation

Interlink keeps three different concepts separate.

### Composition

Composition answers **which species are present and how much?** An iron ore source can contain hematite, magnetite, goethite, and quartz. Extraction preserves that mixture.

### Liberation

Liberation answers **how physically detached are constituent mineral populations?** Current classes are:

```text
locked
partial
mostly-liberated
liberated
```

A fully liberated body may still be a mixed collection of separate mineral grains. Liberation is not purity.

### Separation

Separation routes material according to physical differences or classifications. The current Screen separates by particle size; the Magnetic Separator separates according to magnetic response plus size/liberation/process effects. Splitter and Material Merger are routing operations rather than property-based separation processes.

A developing mineral-processing path can now include explicit recycle and controlled feed:

```text
fresh ore ───────────────┐
                         ↓
                  Material Merger
                         ↓
                      Feeder
                         ↓
                      Crusher
                         ↓
                       Screen
                    ┌────┴────┐
              undersize     oversize
                  ↓             │
             downstream         └── storage / recycle path
```

A complete automatic recycle loop still depends on the chosen graph topology and storage/throughput balance; no implicit routing occurs merely because compatible machines exist.

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

A Region groups Sites and supplies geographic/environmental generation context. It does **not** own Features or natural resource inventory directly.

A Site references Features through `site.featureIds` and does not duplicate occurrence ownership.

A Feature is one distinct physical body, structure, condition, or access opportunity at a Site. Every natural `ResourceOccurrence` is Feature-owned:

```text
sourceType: "feature"
sourceId: <owning Feature id>
```

Generated localized Features currently expose one ResourceOccurrence. Independently exploitable natural sources should normally become separate Features. One occurrence can contain many constituent species.

Do not reintroduce Region-owned resource fields such as:

```text
region.features
region.backgroundResourceOccurrences
region.resources
```

---

# Matter Ownership, Streams, and Backpressure

Interlink keeps three state domains separate:

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

Every modeled unit of matter has one physical owner/location at a time, such as a natural occurrence, Hopper, explicit machine body/buffer, boundary buffer, future transport inventory, or meaningful discrete sample/package.

A `MaterialStream` represents transfer rates between owners; it is not inventory. `MaterialBatch` is for meaningful discrete lots/experiments and is not allocated every simulation tick.

Feasible throughput is constrained by:

```text
input available
process capacity × dt
required output capacity
connectivity
process applicability / operating constraints
```

A process must not consume input and later discover that a required output cannot accept the result. Multi-output machinery commits planned movement atomically.

Ordinary material outputs cannot fan out to multiple consumers. Explicit branching occurs through Splitter output ports. Multiple streams cannot silently combine into one ordinary input; explicit fan-in occurs through the Material Merger's distinct input ports.

---

# Continuous Simulation

The current runtime provides:

- fixed-step simulation independent from render FPS
- continuous Extractor, Crusher, Screen, Splitter, Material Merger, Feeder, and Magnetic Separator execution
- Hopper buffering and finite capacity
- material streams represented as mass-flow state rather than per-tick batches
- explicit player-configurable branching and feed-rate control
- transactional multi-input/multi-output routing
- global world Pause/Resume
- machine enabled/disabled command state
- derived `off / idle / running / blocked` operating state
- persistent Site simulation while navigating elsewhere
- explicit Site/Region boundary storage and conserved transfers
- no implicit cross-workspace logistics

World pause state, machine command state, and derived operating state are intentionally separate concepts.

---

# Properties Enter Through Physics

A property should enter the simulation when at least one process needs it to determine a physical result.

Current modeled/used state and properties include:

```text
species identity
mass / quantity
particle size
liberation
magnetic response
```

Likely future property domains include density, hardness/grindability, moisture/liquid fraction, surface chemistry, temperature/internal energy, phase, pressure/viscosity/EOS data, and chemical equilibrium/reaction data.

Do not turn all of these into universal fraction-key dimensions. Intrinsic species data, material structure, body state, process conditions, and derived properties should remain distinct where physically useful.

> **A material property enters the simulation when an apparatus or process needs it to determine a physical outcome.**

---

# Current Code Architecture

The codebase separates declarative content, reusable physical contracts, deterministic generation, running simulation, and workspace/UI concerns:

```text
src/
├── app.js
├── content/      what resources, Features, apparatus, etc. exist
├── core/         materials, properties, processes, systems, world model/validation
├── data/         legacy compatibility forwarding modules
├── generator/    deterministic world-generation algorithms
├── simulation/   continuous runtime, streams, storage, apparatus execution
└── workspace/    graph, catalog, placement, navigation, Inspector, DOM orchestration
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the complete current file tree, canonical responsibility boundaries, compatibility entry points, and extension paths.

A process apparatus generally follows:

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

Screen, Splitter, Material Merger, and Feeder have all been added through this path without adding machine-pair connection whitelists, a second NODE catalog, removable-node type lists, generic-Inspector type lists, or central simulation dispatch branches.

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

Persistent graph edges correspond to real relationships. Material edges represent matter transfer; `resource-access` represents source access; future energy/signal/etc. relationships should remain semantically typed.

The viewport is finite. Logical graph space is effectively unbounded and supports signed coordinates.

---

# Near-Term Development Direction

The routing/flow-control layer now provides explicit branching, recombination, and feed-rate control. The next major processing addition should create a complete new physical regime rather than adding an isolated machine with no useful downstream consumer.

Likely sequence:

1. **Fine-processing package: Mill / Grinder + finer particle-size bins + fine classification + a separation method that benefits from fine liberated material** — avoids making milling an isolated step that only worsens the current coarse Magnetic Separator.
2. **Density property + Gravity Separation** — first major new process-driven property domain beyond magnetic response.
3. **Slurry/liquid handling and Hydrocyclone / Flotation-style processing** when the material model supports them.
4. **Thermal state and thermal apparatus** once internal-energy/phase modeling has a concrete process need.
5. **Chemical transformation** after elemental/stoichiometric conservation and thermal foundations are ready.
6. **Sensors, controllers, logistics, energy networks, and reusable composite systems** incrementally as real gameplay demands them.

This is direction, not a commitment to implement every system immediately. Each addition should justify the physical state and complexity it introduces.

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

Run the complete regression suite with:

```bash
npm test
```

---

# Documentation Maintenance

- change `DESIGN.md` when the long-term design contract changes;
- change `ARCHITECTURE.md` when code ownership, dependency direction, compatibility surfaces, or extension paths change;
- change `README.md` when the current implementation state, versions, or near-term direction change;
- change `.github/copilot-instructions.md` when implementation guardrails or canonical extension rules change;
- keep `PATCH_NOTES.md` as historical context rather than current authority.

When implementation and documentation disagree, resolve the discrepancy rather than allowing multiple architectural stories to accumulate.
