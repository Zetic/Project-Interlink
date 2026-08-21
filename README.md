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

The current build has a coherent vertical slice from deterministic planet generation through natural resource sources, player-authored Site construction, staged ore comminution, continuous particulate processing/routing, recursive boundaries, and a shared graph workspace.

Current serialized versions are:

```text
schemaVersion: 9
generatorVersion: 7
```

`schemaVersion: 9` adds persistent mineral-texture lineage to ore-body ResourceOccurrences and textured solid populations. `generatorVersion: 7` generates deterministic occurrence-specific mineral texture profiles in addition to concrete registered species compositions.

## Implemented foundation

### World generation and state

- deterministic seeded planet generation
- namespaced deterministic RNG
- explicit World / Knowledge / UI state separation
- canonical Region → Site → Feature → `ResourceOccurrence` ownership beneath Planet
- broad regional resource potential materialized as physical access Sites/Features rather than Region inventory
- ore-body ResourceOccurrences with deterministic species-aware mineral texture profiles
- independent hierarchy, occurrence, and process-history validation domains
- deterministic generation separated from declarative content definitions

### Player-authored engineering

Entering a Site creates its authoritative natural Feature nodes and Site boundary interfaces. The player places engineering nodes from the NODE catalog rather than receiving a prebuilt process chain.

Current placeable definitions are:

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

CONTAINER
  Hopper
```

The old generic `Crusher` node remains compatibility-only and is not player-placeable.

Apparatus/catalog metadata is definition-driven and runtime behavior is registry-driven. The NODE catalog, generic Inspector, typed-port compatibility, and removal policy derive from shared definitions rather than independent machine lists.

### Matter and processing

The implemented solid-particulate model stores aggregate populations as:

```text
speciesId × particleSizeBinId × liberationClassId × textureProfileId → quantity
```

`textureProfileId` is present for textured ore-derived populations. Legacy/untextured material remains valid without that fourth segment. A fraction represents a statistical material population, not an individually simulated particle.

The solid state carries a small `textureProfiles` registry so different ores do not lose physically relevant geological lineage when they are blended in one Hopper. Two otherwise identical hematite populations with different source textures therefore remain distinct internally.

Current solid state includes:

- concrete registered material/mineral species
- mass/quantity
- particle-size distribution from `<4 µm` through run-of-mine rock above 1 m
- liberation distribution
- persistent ore texture lineage
- magnetic-response property coverage
- `MaterialBody` physical form

Generated solid resources use concrete constituent compositions. Legacy coarse aliases may still be accepted for compatibility, but current generation does not emit pseudo-species such as generic gangue or iron-oxide mixture entries.

Mechanical process physics currently includes:

- staged Jaw/Cone crushing
- Ball Mill grinding
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

`resource-access` carries no matter and no kg/s. Actual material flow begins at the Extractor material-output port. Ore-body extraction materializes mostly locked run-of-mine rock and preserves both source composition and mineral-texture lineage.

## Jaw Crusher

The Jaw Crusher represents primary crushing. It accepts run-of-mine feed up to `1000 mm` and performs large coarse size reduction at `8 kg/s` prototype rated throughput.

Its current deterministic nominal-product distribution is:

```text
15% → one size bin coarser than nominal
55% → nominal size bin
20% → one size bin finer
10% → two size bins finer
```

Primary crushing is intentionally modeled as **predominantly size reduction**. Jaw crushing can create a small liberation increase, especially for unusually coarse/easy-boundary ore textures, but it does not grant large universal liberation gains merely because many size bins were crossed.

## Cone Crusher

The Cone Crusher represents secondary/tertiary crushing. It accepts feed up to `250 mm`, is rated at `5 kg/s`, and provides the current `5 / 15 / 25 / 60 mm` nominal product settings.

For the 25 mm setting, coarse feed uses the existing prototype distribution:

```text
10% → 25–60 mm
55% → 15–25 mm
25% → 5–15 mm
10% → 1–5 mm
```

The Cone Crusher still produces oversize, so screening/recycle remains physically meaningful. Like the Jaw Crusher, its direct liberation effect is deliberately limited and depends on the source ore texture rather than a generic crusher bonus.

## Ball Mill

The Ball Mill is the first true fine-grinding apparatus. It accepts feed no coarser than `25 mm`, is rated at `2 kg/s`, and exposes nominal grinding settings in the fine regime:

```text
500 µm
250 µm
125 µm
63 µm
32 µm
```

A 250 µm nominal setting currently produces the prototype PSD:

```text
 5% → 250–500 µm
45% → 125–250 µm
30% → 63–125 µm
15% → 32–63 µm
 5% → 16–32 µm
```

The fine vocabulary continues below 32 µm as `16–32`, `8–16`, `4–8`, and `<4 µm`. This prevents the finest Ball Mill setting from collapsing its entire fine tail into one broad terminal class. A 32 µm nominal setting therefore resolves as:

```text
 5% → 32–63 µm
45% → 16–32 µm
30% → 8–16 µm
15% → 4–8 µm
 5% → <4 µm
```

Grinding does **not** apply one universal liberation result. Liberation depends on each material population's particle size relative to its occurrence-specific mineral grain-size distribution and association modes. The same Ball Mill and PSD can therefore produce substantially different liberation distributions for coarse-textured and finely disseminated ores.

## Screen

The Screen performs ideal particle-size classification with one stored solid feed and two explicit material outputs:

```text
Hopper
  ↓ feed
Screen
  ├── undersize
  └── oversize
```

Current screening is an intentionally ideal sharp cut:

```text
fraction size-bin upper bound <= aperture
    → undersize

coarser fraction
    → oversize
```

Screening does **not** change species, particle-size class, liberation class, texture lineage, or quantity. It only routes existing fractions. Both outputs are required and output handling is transactional.

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

The player configures `splitFractionToA` from `0` to `1`. Every existing material population is divided by the same ratio. Species, size, liberation, and texture lineage are preserved.

Both outputs are explicit and required. Downstream capacity throttles the whole planned split transactionally. Ordinary material outputs still cannot fan out.

## Material Merger

The Material Merger is the explicit inverse routing primitive:

```text
input A ─┐
         ├── Material Merger → product
input B ─┘
```

It combines two stored particulate populations into one conserved output without changing physical descriptors. It is deliberately **not** called a Mixer: no mixing intensity, homogeneity, residence-time, viscosity, or other physical mixing model is implied.

Critically, merging two ores does not erase their texture identities. If otherwise identical fractions came from different geological texture profiles, both populations remain distinct inside the merged material state so later grinding can affect them differently.

## Feeder

The Feeder separates a requested material-flow setpoint from the rated capacity of downstream machinery. The current prototype is rated at `10 kg/s`; the player-configurable setpoint ranges from `0` to `10 kg/s` and defaults to `4 kg/s`.

The Feeder does not transform material. It preserves composition, particle-size distribution, liberation, and texture lineage while metering feasible flow.

## Dry Drum Magnetic Separator

The current magnetic-separation apparatus represents a coarse dry magnetic preconcentrator/cobber rather than universal final beneficiation.

Its model depends on:

```text
species magnetic response
× liberation recovery factor
× particle-size suitability
× field-strength response
+ process entrainment/carryover
```

It requires all feed to be at or below `25 mm`; oversized mixed feed blocks the process rather than being silently screened. It is therefore a plausible early dry preconcentration step for suitable strongly magnetic ore, not a substitute for future fine/wet beneficiation technology.

---

# Composition, Texture, Liberation, and Separation

Interlink keeps four related concepts separate.

### Composition

Composition answers **which species are present and how much?** An iron ore source can contain hematite, magnetite, goethite, and quartz. Extraction preserves that mixture.

### Mineral texture

Mineral texture answers **how are those minerals originally distributed/intergrown in this particular occurrence?** It belongs to the `ResourceOccurrence`, not to `MaterialSpecies`.

An ore texture profile currently contains occurrence-specific data for each constituent species:

```text
speciesTextures[speciesId]
  grainSizeUm
    d10
    d50
    d90
  occurrenceModes
    free
    boundary
    intergrown
    included
```

D10/D50/D90 describe the generated mineral grain-size distribution. The occurrence-mode shares describe how that mineral appears structurally in the source rock. The profile is immutable geological lineage: particle size and liberation evolve during comminution, while the source texture remains attached so later processing can resolve the correct physical response.

### Liberation

Liberation answers **how physically detached are constituent mineral populations now?** Current classes are:

```text
locked
partial
mostly-liberated
liberated
```

A fully liberated body may still be a mixed collection of separate mineral grains. Liberation is not purity.

Crushing/grinding changes particle size; the combination of resulting particle size, source mineral texture, and equipment breakage regime determines liberation advancement. Particle size alone no longer determines the result for generated ore.

### Separation

Separation routes material according to physical differences or classifications. The Screen separates by particle size; the Dry Drum Magnetic Separator separates according to magnetic response plus size/liberation/process effects. Splitter and Material Merger are routing operations rather than property-based separation processes.

A current ore-processing path can be built as:

```text
Feature / orebody
      ↓
  Extractor
      ↓
   Hopper
      ↓
 Jaw Crusher
      ↓
   Hopper
      ↓
 Cone Crusher
      ↓
   Hopper
      ↓
   Screen ───── oversize → recycle
      ↓ undersize
   Hopper
      ↓
  Ball Mill
      ↓
   Hopper
      ↓
future fine beneficiation
```

For suitable magnetite-rich ore, coarse dry magnetic preconcentration can instead be inserted before expensive fine grinding.

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
- continuous Extractor, Jaw Crusher, Cone Crusher, Ball Mill, Screen, Splitter, Material Merger, Feeder, and Dry Drum Magnetic Separator execution
- Hopper buffering and finite capacity
- material streams represented as mass-flow state rather than per-tick batches
- persistent mineral-texture lineage through storage, routing, comminution, screening, and magnetic separation
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
occurrence mineral D10/D50/D90 and association modes
Bond crushing / milling work indices and abrasion index
intrinsic solid density
magnetic response
```

Texture is a particulate-population identity dimension because losing it when ores mix would lose physically relevant future behavior. That does **not** imply that temperature, pressure, moisture, or every future property should be appended to the fraction key. Broader body/phase/thermal state should remain around the particulate population where appropriate.

Likely future property domains include hardness beyond the current Bond test properties, moisture/liquid fraction, surface chemistry, temperature/internal energy, phase, pressure/viscosity/EOS data, and chemical equilibrium/reaction data.

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

New process machinery should continue to use this path without adding machine-pair connection whitelists, duplicate NODE catalogs, removable-node type lists, generic-Inspector type lists, or central simulation type dispatch branches.

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

The Feature Inspector presents occurrence data as structured sections rather than flattening engineering and mineralogical values into one descriptor string. Resource identity and geological description remain concise, while Bond indices, mixture density, and per-mineral texture values are grouped separately for narrow-panel readability.

---

# Near-Term Development Direction

Staged coarse crushing and fine grinding now exist, and liberation is occurrence-texture-dependent instead of a universal size-reduction bonus. The next processing additions should build on the physical state already present rather than inventing machinery to compensate for missing comminution physics.

Likely sequence:

1. **Decide the next beneficiation family from the now-meaningful fine product state** — likely density/Gravity Separation or the first fine magnetic/wet route when supporting properties justify it.
2. **Density property + Gravity Separation** — a major new property-driven processing domain beyond magnetic response.
3. **Slurry/liquid handling and Hydrocyclone / Flotation-style processing** when the material model supports them.
4. **Comminution wear/component models and additional breakage routes** when abrasion exposure and equipment choices justify them; HPGR/microfracture can then have a real physical role.
5. **Thermal state and thermal apparatus** once internal-energy/phase modeling has a concrete process need.
6. **Chemical transformation** after elemental/stoichiometric conservation and thermal foundations are ready.
7. **Sensors, controllers, logistics, energy networks, and reusable composite systems** incrementally as real gameplay demands them.

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