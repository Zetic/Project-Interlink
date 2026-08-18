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

The project is currently focused on its first real simulation subsystem: **procedural planetary world generation**.

The original planet generator began as a standalone tech demo, but its useful code has now been promoted into the Interlink simulation foundation rather than discarded.

The current web application can:

- generate deterministic planets from a seed
- generate planet orbit, mass, composition, volatile inventory, interior structure, radius, gravity, density, atmosphere, temperature, geologic activity, magnetic state, and surface state
- derive a human-readable planet classification after physical generation
- generate regions from planetary conditions
- give regions broad background natural resources
- generate hidden geological/environmental features inside regions
- generate feature-level natural-resource occurrences and compositions
- reveal already-generated features through a simple discovery interface

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

The working application is under:

```text
planet-generator/
```

It is currently a lightweight static web application using:

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

Planets reference regions by ID, regions reference features by ID, and features reference generated resource occurrences by ID.

Discovery is stored separately in Player Knowledge State. Discovering a feature reveals existing world truth rather than changing the simulated world.

Generation uses deterministic namespaced RNG streams so changes inside one subsystem are less likely to reshuffle unrelated parts of a world seed.

Worlds currently carry:

```text
schemaVersion
generatorVersion
```

so serialized data and procedural rules can evolve deliberately.

As star/system entities are added in the future, this world state should evolve to represent them explicitly rather than treating the current single planet as the permanent root of the game.

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

`Iron Ore` is the raw-resource definition. The particular deposit is a generated occurrence with its own location, quantity, concentration, descriptor, and composition.

Minerals such as hematite are constituents of that occurrence rather than automatically being separate fundamental resource IDs.

The same approach is intended for brines, natural gas, rocks, atmospheric gases, and other heterogeneous natural materials. Future processing gameplay should derive outputs from feedstock composition and process capability rather than fixed recipe-token conversions.

The broader matter model and processing philosophy are documented in [`DESIGN.md`](DESIGN.md).

---

# Current Development Priority

The architecture foundation is now strong enough that the immediate priority is **automated simulation regression protection before larger simulation changes**.

The next issue is intended to establish:

- a minimal Node-based test setup
- deterministic same-seed regression tests
- namespaced RNG tests
- world-reference integrity tests
- knowledge/world separation tests
- composition and structural-fraction invariants
- deterministic multi-seed smoke tests
- obvious feature/resource compatibility rules
- a small GitHub Actions check for pull requests and `main`

After that foundation is protected, development should no longer be purely generation-focused.

An early playable vertical slice should exercise a narrow chain such as:

```text
Survey / discover a resource
    ↓
Acquire a small quantity
    ↓
Analyze its composition
    ↓
Apply one simple parameter-driven transformation or separation
    ↓
Inspect products / waste / matter balance
    ↓
Represent the successful operation as a reusable process concept
```

This is intended to validate the main game loop early without prematurely implementing the complete factory, blueprint, automation, or progression game.

---

# Known Simulation Areas Still Using Prototype Logic

The planet-level model is currently more causally developed than the region/feature layer.

Examples of remaining simplifications include:

- regional geology is still largely local variation around planet properties
- region age, relief, and elevation are fairly abstract/random
- feature physical state is not yet fully constrained by feature type
- feature/resource compatibility still relies heavily on broad tag matching
- broad regional resources and feature resource occurrences are not yet represented completely consistently
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

1. Add automated simulation regression tests and executable invariants.
2. Normalize remaining occurrence/reference inconsistencies exposed by testing.
3. Improve obvious region/feature/resource causal compatibility.
4. **Prototype a minimal survey → acquire → analyze → transform gameplay loop.**
5. Improve causal regional geology and resource/deposit formation in response to gameplay needs.
6. Expand discovery into surveying and knowledge confidence.
7. Introduce a small functional apparatus/process model for transformation.
8. Prototype reusable and automated solved processes.
9. Introduce star/system generation inputs when they can replace current planet-level approximations and materially affect downstream worlds.
10. Expand extraction, processing, automation, and larger industrial/network gameplay iteratively.

---

# Running the Current Web App

Because the project uses JavaScript ES modules, open it through a local HTTP server rather than double-clicking `index.html`.

From the repository's `planet-generator` directory:

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

---

# Project Documentation

- [`DESIGN.md`](DESIGN.md) — canonical long-term Interlink game design
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — implementation guidance for coding agents
- [`PATCH_NOTES.md`](PATCH_NOTES.md) — commit-by-commit project development history

The documents intentionally serve different purposes: design vision, implementation guardrails, current project state, and historical record should remain separate so none of them has to become an unreadable catch-all document.
