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

The project has completed its first simulation-foundation phase and is beginning its first gameplay-facing phase.

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
- run automated deterministic simulation tests through Node
- run the simulation test suite automatically in GitHub Actions for pull requests and `main`

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

The current serialized world shape and generator rules are versioned. After the first regression/normalization pass:

```text
schemaVersion: 2
generatorVersion: 2
```

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

Core simulation/generation logic is intentionally independent from DOM rendering so it can evolve into reusable Interlink game logic.

The foundational state architecture is established:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
what the player has discovered
        ↓
APPLICATION / UI STATE
what the interface is currently displaying
```

The root world state is plain serializable JavaScript and contains version metadata plus ID-indexed maps for generated entities:

```text
World
├── planets
├── regions
├── features
└── resourceOccurrences
```

Planets reference regions by ID, regions reference features by ID, and both regions and features reference generated resource occurrences by stable ID.

Discovery is stored separately in Player Knowledge State. Discovering a feature reveals existing world truth rather than changing the simulated world.

Generation uses deterministic namespaced RNG streams so changes inside one subsystem are less likely to reshuffle unrelated parts of a world seed.

As star/system entities and player-created physical matter are added in the future, this World / Simulation State should evolve intentionally rather than moving physical truth into UI state.

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

The same approach is intended for brines, natural gas, rocks, atmospheric gases, and other heterogeneous natural materials. Processing gameplay should derive outputs from feedstock composition and process capability rather than fixed recipe-token conversions.

The next gameplay work extends this philosophy from generated occurrences into discrete physical material batches and transformation outputs.

The broader matter model and processing philosophy are documented in [`DESIGN.md`](DESIGN.md).

---

# Current Development Priority

The immediate priority is now **the first playable material-processing vertical slice**: [Issue #8 — Prototype first playable material processing loop](https://github.com/Zetic/Project-Interlink/issues/8).

The intended prototype chain is:

```text
Survey / discover an existing resource occurrence
    ↓
Acquire a small material sample
    ↓
Analyze its composition
    ↓
Run one parameter-driven separation / transformation
    ↓
Inspect products + tailings / waste
    ↓
Verify constituent and total matter balance
```

The main architectural bridge is expected to be conceptually:

```text
ResourceOccurrence
        ↓
MaterialBatch
        ↓
ProcessDefinition + parameters
        ↓
ProcessResult
        ↓
Output MaterialBatches
```

This is the first point where generated world data becomes matter the player can actually act on.

## Why transformation comes before the blueprint editor

The long-term blueprint workspace is still a core interaction goal, but the project should establish what a node, port, material input, output, process parameter, and transformation **mean** before spending substantial effort on dragging, wiring, pan/zoom, snapping, and other editor interaction.

For the first gameplay slice, ordinary controls are sufficient:

```text
select occurrence
collect sample
analyze
choose process
adjust parameter
run
inspect outputs
```

The process model should still expose explicit inputs, outputs, and parameters so a later blueprint editor can become a graphical layer over the same simulation semantics rather than requiring a process-system rewrite.

The intended development sequence is:

```text
prove matter
    ↓
prove transformations
    ↓
prove process semantics
    ↓
then build the blueprint interaction layer
```

---

# Simulation Contracts Already Established

The existing automated tests now protect important foundation contracts including:

- same seed + same generator version produces equivalent world data
- RNG namespaces are deterministic and isolated
- world references resolve correctly
- generated IDs remain unique within tested worlds
- physical features do not contain discovery truth
- knowledge discovery does not mutate physical World State
- bulk composition, atmosphere, structural fractions, and region area obey numeric invariants
- generated physical values avoid NaN/Infinity and impossible negatives in tested paths
- broad deterministic multi-seed generation succeeds
- obvious Aquifer / Gas Reservoir / Magma Chamber / Ice Body contradictions are prevented
- biological-resource gating remains tested
- regional background resources and feature resources use stable normalized occurrences

New gameplay systems should extend these executable contracts rather than replacing them with informal assumptions.

---

# Known Simulation Areas Still Using Prototype Logic

The planet-level model remains more causally developed than the region/feature/resource layer.

Examples of remaining simplifications include:

- regional geology is still largely local variation around planet properties
- region age, relief, and elevation are fairly abstract/random
- several feature types still use broad or partially independent physical properties
- resource selection still relies substantially on broad tag matching outside the explicitly constrained feature types
- structured constituent-level composition currently exists only for a subset of generated resource types
- resource occurrence quantity is still mostly qualitative rather than precise physical reserve mass
- no extraction/depletion model exists yet
- no player-created `MaterialBatch` / transformation state exists yet
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

1. **Prototype the first playable survey → sample → analyze → transform material loop.**
2. Stabilize `MaterialBatch`, process input/output, parameter, result, and matter-conservation semantics based on that prototype.
3. Improve causal regional geology and resource/deposit properties in response to what the gameplay actually needs.
4. Expand discovery into richer surveying and knowledge confidence.
5. Generalize the functional apparatus/process model and introduce material-stream semantics.
6. **Build the first interactive blueprint workspace over stable process semantics** — node dragging, ports, connections, pan/zoom, and stream inspection.
7. Introduce star/system generation inputs when they can materially replace current planet-level approximations and create downstream variation.
8. Add continuous processing, automation, and reusable/nested solved systems incrementally.
9. Expand extraction, logistics, processing depth, and larger industrial/network gameplay iteratively.

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