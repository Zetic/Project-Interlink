# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is to turn the matter and energy available in an unfamiliar world into a self-sustaining industrial system. Rather than centering on conventional character-action gameplay, Interlink is intended to grow toward an interactive engineering workspace built from physical resources, material and energy streams, process diagrams, sensors, controllers, dashboards, and reusable nested systems.

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

World generation exists to create the physical causes, constraints, and opportunities that feed this loop. The project should therefore develop simulation foundations and small playable gameplay slices together rather than waiting for world generation to become “complete.”

A guiding progression principle is:

> **Yesterday's factory becomes today's machine.**

Solved systems should eventually be reusable as components inside larger systems.

---

# Current State

The project has completed its first simulation-foundation phase and its first gameplay-facing material-processing vertical slice.

The original planet generator began as a standalone tech demo, but its useful code has now been promoted into the Interlink simulation foundation and the web application itself lives directly at the repository root.

The current web application can:

- generate deterministic planets from a seed
- generate planet orbit, mass, composition, volatile inventory, interior structure, radius, gravity, density, atmosphere, temperature, geologic activity, magnetic state, and surface state
- derive a human-readable planet classification after physical generation
- generate regions from planetary conditions
- give regions broad background natural resources
- generate hidden geological/environmental features inside regions
- generate feature-level natural-resource occurrences and compositions
- reveal already-generated features through a simple discovery interface
- represent both regional and feature resources as stable `ResourceOccurrence` objects in World State
- enforce basic compatibility rules for obvious feature types such as aquifers, gas reservoirs, magma chambers, and ice bodies
- acquire a physical sample from an already-generated structured resource occurrence
- represent acquired and processed matter as physical `MaterialBatch` objects in World State
- analyze batch composition through Player Knowledge State without mutating physical truth
- execute a parameter-driven magnetic-separation process outside the DOM/UI layer
- conserve modeled constituents and total mass through process outputs
- consume committed input batches and create new physical output batches without duplicating matter
- commit process state atomically so failed runs do not partially mutate the world
- run automated deterministic simulation and material-processing tests through Node
- run the test suite automatically in GitHub Actions for pull requests and `main`

The current planet generator follows a causal pipeline rather than selecting a planet archetype first:

```text
Base State
    ↓
Bulk Matter / Volatiles
    ↓
Thermal Environment
    ↓
Interior Structure
    ↓
Physical Dimensions
    ↓
Atmosphere
    ↓
Internal Activity
    ↓
Exterior State
    ↓
Derived Planet Classification
    ↓
Regions
    ↓
Features
    ↓
Natural Resources
```

This remains a simplified procedural model rather than research-grade planetary science. The goal is **internal consistency, causal relationships, deterministic behavior, and useful simulation data**.

The current serialized world shape and generator rules are versioned:

```text
schemaVersion: 3
generatorVersion: 2
```

Schema v3 introduced physical material batches and stored process results. Generator v2 remains the current procedural-generation version because the material-processing slice did not change deterministic world-generation rules.

---

# Future World-Generation Direction

The current planet generator is the first implemented slice, **not the intended permanent top of Interlink's causal world model**.

The long-term generation chain is expected to grow toward:

```text
Star
    ↓
System / Formation Environment
    ↓
Protoplanetary Material + Orbital Architecture
    ↓
Planet
    ↓
Region
    ↓
Features + Resource Occurrences
    ↓
Survey / Extraction / Processing / Industry
```

Future star and system generation should provide important upstream causes that the planet generator currently approximates internally, such as:

- stellar age, mass, luminosity, temperature, metallicity, and activity
- useful elemental abundance ratios
- broad formation composition and volatile availability
- formation temperature / condensation context
- orbital architecture
- formation-region and migration/history abstractions where they materially affect downstream bodies

The project is **not** trying to build a research-grade astrophysics simulator. Star/system properties should be retained when they materially influence planetary composition, conditions, resources, discovery, access, or gameplay.

Star/system generation should be introduced incrementally when the planet model and gameplay can consume its outputs, rather than being developed as an isolated astronomy simulator.

---

# Current Architecture

The runnable web application is at the repository root:

```text
Project-Interlink/
├── index.html
├── styles.css
├── package.json
├── src/
├── tests/
├── DESIGN.md
├── README.md
├── PATCH_NOTES.md
└── .github/
    ├── copilot-instructions.md
    └── workflows/
        └── test.yml
```

The former `planet-generator/` wrapper directory has been removed. The app remains a lightweight static web application using:

- HTML
- CSS
- vanilla JavaScript
- ES modules

Core simulation/generation/process logic is intentionally independent from DOM rendering so it can evolve into reusable Interlink game logic.

The foundational state architecture is established:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
what the player has discovered or measured
        ↓
APPLICATION / UI STATE
what the interface is currently displaying
```

The root world state is plain serializable JavaScript and contains version metadata plus ID-indexed maps for generated and runtime physical entities:

```text
World
├── planets
├── regions
├── features
├── resourceOccurrences
├── materialBatches
└── processResults
```

Planets reference regions by ID, regions reference features by ID, and both regions and features reference generated resource occurrences by stable ID. Runtime batches and process results likewise use stable IDs rather than being stored only in UI state.

Discovery and sample analysis are stored separately in Player Knowledge State. Observing or analyzing something reveals existing world truth rather than changing the simulated matter.

Generation uses deterministic namespaced RNG streams so changes inside one subsystem are less likely to reshuffle unrelated parts of a world seed.

As star/system entities and more advanced player-created physical systems are added in the future, this World / Simulation State should evolve intentionally rather than moving physical truth into UI state.

---

# Resource and Matter Philosophy

Natural resources are modeled as **natural feedstocks with generated composition**, not arbitrary game tokens.

For example:

```text
Iron Ore Deposit
└── Iron Ore occurrence
    ├── Hematite 61%
    ├── Magnetite 14%
    ├── Goethite 7%
    └── Quartz / gangue 18%
```

`Iron Ore` is the raw-resource definition. The particular deposit is a generated occurrence with its own location, quantity class, concentration, descriptor, and composition.

Minerals such as hematite are constituents of that occurrence rather than automatically being separate fundamental resource IDs.

The first gameplay-processing slice now proves that an occurrence can become a physical batch, be analyzed, and be separated into new batches while preserving modeled matter.

The next material-model step is to separate **provenance** from **current material state**. A processed material should be able to remember where its matter came from without pretending that its current identity is permanently the same as one natural `resourceId` or one `sourceOccurrenceId`. This becomes important for crushed material, concentrates, mixtures, solutions, alloys, synthetic products, and eventually recycled matter.

The same approach is intended for brines, natural gas, rocks, atmospheric gases, and other heterogeneous natural materials. Processing gameplay should derive outputs from feedstock composition and process capability rather than fixed recipe-token conversions.

The broader matter model and processing philosophy are documented in [`DESIGN.md`](DESIGN.md).

---

# Current Development Priority

The immediate priority is now to **generalize the material/process contracts and prove the first multi-stage processing chain**.

The target prototype is deliberately small:

```text
Generated Iron Ore Occurrence
        ↓
Acquire Sample
        ↓
Analyze
        ↓
Crushing
        ↓
Crushed Material Batch
        ↓
Magnetic Separation
        ↓
Concentrate + Tailings
```

This next step should prove several things before the graphical blueprint workspace is built:

1. A `MaterialBatch` can carry a minimal physical property in addition to composition, using particle size as the first example.
2. Processed matter can preserve provenance without being permanently identified as one original natural-resource occurrence.
3. Process execution can support more than one process without growing a chain of process-ID special cases inside generic commit/state-transition code.
4. Process inputs and outputs can use explicit port semantics that later map directly to blueprint connections.
5. The output of one process can become the input of another while preserving physical state and conservation contracts.
6. Conservation can be verified across an entire process chain, not only within a single operation.

A suitable first added process is **Crushing**: one material input, one material output, unchanged constituent masses, and a changed particle-size property. Magnetic separation can then require or respond to sufficiently fine feed, making the process order physically meaningful rather than merely cosmetic.

The exact material-property and provenance schemas are not locked yet. They should remain plain, serializable, minimal, and driven by what this two-stage chain actually needs.

## Why the blueprint editor still comes after this step

The browser is fully capable of a smooth node/connection editor, but the editor should visualize simulation semantics that have already been exercised by more than one process.

After the two-stage chain works, the first blueprint workspace can represent real nodes and ports such as:

```text
┌───────────┐
│ Crusher   │
│       out ○──────────────┐
└───────────┘              │
                           ▼
                    ○ feed
              ┌─────────────────┐
              │ Magnetic        │
              │ Separator       │
              │                 │
              │ concentrate ○───┼──►
              │ tailings    ○───┼──►
              └─────────────────┘
```

The intended sequence is now:

```text
✓ prove matter
    ↓
✓ prove one transformation
    ↓
GENERALIZE PROCESS SEMANTICS
+ PROVE MULTI-STAGE CHAIN
    ↓
BUILD FIRST BLUEPRINT WORKSPACE
    ↓
use gameplay needs to drive deeper geology,
surveying, apparatus, streams, and automation
```

---

# Simulation Contracts Already Established

The existing automated tests protect important foundation contracts including:

- same seed + same generator version produces equivalent world data
- RNG namespaces are deterministic and isolated
- world references resolve correctly
- generated IDs remain unique within tested worlds
- physical features do not contain discovery truth
- knowledge discovery does not mutate physical World State
- sample analysis does not mutate physical World State
- bulk composition, atmosphere, structural fractions, and region area obey numeric invariants
- generated physical values avoid NaN/Infinity and impossible negatives in tested paths
- broad deterministic multi-seed generation succeeds
- obvious Aquifer / Gas Reservoir / Magma Chamber / Ice Body contradictions are prevented
- biological-resource gating remains tested
- regional background resources and feature resources use stable normalized occurrences
- sample component masses correspond to generated occurrence composition
- process execution is deterministic for fixed inputs and parameters
- each modeled constituent and total mass are conserved through magnetic separation
- committed input batches cannot be reused to duplicate matter
- failed process commits leave physical World State unchanged

New gameplay systems should extend these executable contracts rather than replacing them with informal assumptions.

---

# Known Simulation Areas Still Using Prototype Logic

The planet-level model remains more causally developed than the region/feature/resource layer, and the new gameplay-processing layer is intentionally narrow.

Examples of remaining simplifications include:

- regional geology is still largely local variation around planet properties
- region age, relief, and elevation are fairly abstract/random
- several feature types still use broad or partially independent physical properties
- resource selection still relies substantially on broad tag matching outside the explicitly constrained feature types
- structured constituent-level composition currently exists only for a subset of generated resource types
- resource occurrence quantity is still mostly qualitative rather than precise physical reserve mass
- no extraction/depletion model exists yet
- `MaterialBatch` still carries prototype assumptions tying processed matter closely to one original resource/occurrence
- material batches do not yet have a general physical-properties model
- only magnetic separation is implemented as a process
- generic process execution still contains magnetic-separation-specific branching/response data
- no multi-stage process chain has yet been established as a tested gameplay contract
- no continuous material-stream or throughput model exists yet
- several planet inputs are still generated locally that should eventually come from star/system formation context

These are expected next-stage simulation problems, not reasons to restart the project.

---

# Long-Term Systems Direction

Interlink is intended to grow through systems that recursively become components of larger systems:

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

Long-term gameplay may include:

- surveying and scientific analysis
- extraction
- material processing
- chemistry
- thermodynamics
- pressure/vacuum systems
- functional apparatus design
- material and energy streams
- automation and control systems
- reusable blueprints
- hierarchical system inspection/debugging
- large industrial networks
- capability-based progression

The full intended design is kept in [`DESIGN.md`](DESIGN.md) so these concepts remain visible without forcing coding agents to implement them before the current project is ready.

---

# Inspirations

The games below are **reference points for particular design qualities**, not templates to copy. Interlink should combine useful principles into its own systems model rather than describing itself as “like” any one game.

### GregTech: New Horizons

Useful inspiration includes:

- long-form progression where new materials enable new process capabilities
- complex processing chains that later become routine infrastructure
- strong incentive to automate previously manual production
- infrastructure requirements that make progression about capability rather than a simple unlock list
- the feeling that earlier large production systems eventually become components of more advanced industry

### Stationeers

Useful inspiration includes:

- engineering-oriented interaction
- atmosphere, pressure, gas, temperature, and power systems that interact
- systems that can be instrumented, controlled, and automated
- meaningful consequences from physical operating conditions

### Oxygen Not Included

Useful inspiration includes:

- interconnected thermodynamics, gases, liquids, heat transfer, and material properties
- simulation where solving one resource or environmental problem can create another
- readable system-level visualization despite substantial underlying complexity

### Noita and falling-sand simulations

Useful inspiration includes:

- materials behaving according to properties rather than only scripted object interactions
- emergent consequences from interacting physical/material systems
- a world that feels materially reactive rather than decorative

### Terraria and Starbound

Useful inspiration includes:

- exploration revealing materially different environments and resources
- a broad sense of progression from what the world contains
- moving from survival-level access to increasingly advanced capabilities
- science-fiction expansion beyond a single local environment as later scope permits

These inspirations belong here as context. The canonical design in `DESIGN.md` should describe Interlink's own rules and goals directly rather than referring to other games as design shorthand.

---

# Near-Term Roadmap

1. **Generalize material/process semantics and prove a Crusher → Magnetic Separator chain.**
2. **Build the first interactive blueprint workspace over those proven semantics** — node dragging, explicit ports, connections, pan/zoom, compatible-port feedback, and stream/batch inspection.
3. Use the first process-chain/blueprint gameplay to identify the specific geology, resource-property, and surveying information the player actually needs.
4. Improve causal regional geology/resource/deposit properties and expand discovery into richer surveying/knowledge confidence in response to those needs.
5. Generalize the functional apparatus model and introduce material-stream/throughput semantics.
6. Add continuous processing, manual operating conditions, and then automation/control incrementally.
7. Introduce star/system generation inputs when they can materially replace current planet-level approximations and create downstream variation.
8. Add reusable/nested solved systems and progressively collapse mature factories into higher-level components.
9. Expand extraction, depletion, logistics, processing depth, and larger industrial/network gameplay iteratively.

Star/system generation remains an important future foundation, but it should be introduced when downstream planet generation and gameplay are ready to consume its outputs rather than as an isolated astronomy project.

---

# Running the Current Web App

Because the project uses JavaScript ES modules, open it through a local HTTP server rather than double-clicking `index.html`.

From the repository root:

```bash
python -m http.server 8000
```

or on Windows if Python is exposed through the launcher:

```bash
py -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

The automated simulation tests can be run from repository root with:

```bash
npm test
```

## GitHub Pages

The repository is laid out so GitHub Pages can serve the application directly when configured with:

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

The published project URL should load the root `index.html` directly.

---

# Project Documentation

- [`DESIGN.md`](DESIGN.md) — canonical long-term Interlink game design
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — implementation guidance for coding agents
- [`PATCH_NOTES.md`](PATCH_NOTES.md) — commit-by-commit project development history

The documents intentionally serve different purposes: design vision, implementation guardrails, current project state, and historical record should remain separate so none of them has to become an unreadable catch-all document.