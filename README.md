# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is a game centered on physical, chemical, industrial, logistical, and control systems. Rather than a conventional character-controlled world, Interlink is intended to grow toward an interactive engineering workspace built from networks, process diagrams, material streams, sensors, controllers, dashboards, and reusable nested systems.

## Current State

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
- reveal already-generated features one at a time through a simple discovery interface

The planet generator follows a causal pipeline rather than selecting a planet archetype first:

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

## Current Architecture

The working application is under:

```text
planet-generator/
```

It is currently a lightweight static web application using:

- HTML
- CSS
- vanilla JavaScript
- ES modules

Core simulation/generation logic is kept independent from DOM rendering so it can continue evolving into reusable Interlink game logic.

The foundational state architecture is now established:

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

Discovery no longer lives on the physical feature itself; it is stored separately in player knowledge state. Discovering a feature therefore reveals existing world truth rather than changing the simulated world.

The generator also now uses deterministic namespaced RNG streams so changes inside one subsystem are less likely to reshuffle unrelated parts of a world seed.

Worlds currently carry:

```text
schemaVersion
generatorVersion
```

so future serialized data and procedural rule changes can evolve deliberately.

## Resource Philosophy

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

Minerals such as hematite are constituents of that occurrence rather than automatically becoming separate fundamental resource IDs.

The same approach is intended for brines, natural gas, rocks, atmospheric gases, and other heterogeneous natural materials. Future processing gameplay should derive outputs from feedstock composition and process capability rather than fixed recipe-token conversions.

## Current Development Priority

The architecture foundation is now strong enough that the next priority is **automated simulation regression protection before deeper geology work**.

The project currently has validation logic, but no automated test suite protecting deterministic generation and world-state invariants.

The next phase should establish:

- a minimal Node-based test setup
- deterministic same-seed regression tests
- namespaced RNG tests
- world-reference integrity tests
- knowledge/world separation tests
- composition and structural-fraction invariants
- broad multi-seed smoke tests
- obvious feature/resource compatibility rules
- a small GitHub Actions check so tests run automatically on pull requests

This is intended to make later Copilot-driven changes safer before significantly expanding regional geology, deposit formation, and resource-generation rules.

## Known Simulation Areas Still Using Prototype Logic

The planet-level model is currently more causally developed than the region/feature layer.

Examples of remaining simplifications include:

- regional geology is still largely generated as local variation around planet properties
- region age, relief, and elevation are still fairly abstract/random
- feature physical state is not yet fully constrained by feature type
- feature/resource compatibility still relies heavily on broad tag matching
- broad regional resources and feature resource occurrences are not yet represented completely consistently

These are expected next-stage simulation problems, not reasons to restart the project.

## Long-Term Direction

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

A guiding progression principle is:

> **Yesterday's factory becomes today's machine.**

Future gameplay may include surveying, extraction, material processing, chemistry, thermodynamics, automation, control systems, reusable blueprints, and large industrial networks. These systems remain intentionally out of scope until the generated-world foundation is mature enough to support them.

## Near-Term Roadmap

1. Add automated simulation regression tests and executable invariants.
2. Normalize remaining inconsistent resource-occurrence/reference behavior exposed by testing.
3. Improve causal regional geology.
4. Improve feature formation and feature/resource compatibility.
5. Improve natural-resource composition and deposit generation.
6. Expand discovery into surveying and knowledge confidence.
7. Add extraction concepts.
8. Add material processing and transformation.
9. Add automation and reusable systems.
10. Expand toward larger industrial/network gameplay.

## Running the Current Web App

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

## Development Guidance

Repository-level instructions for GitHub Copilot are stored in:

```text
.github/copilot-instructions.md
```

Those instructions describe the current architecture, simulation contracts, deterministic-generation requirements, resource model, near-term development order, and long-term Interlink philosophy.
