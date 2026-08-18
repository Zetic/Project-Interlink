# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is a game centered on physical, chemical, industrial, logistical, and control systems. Rather than a conventional character-controlled world, Interlink is intended to grow toward an interactive engineering workspace built from networks, process diagrams, material streams, sensors, controllers, dashboards, and reusable nested systems.

## Current State

The project is currently focused on its first simulation subsystem: **procedural planet generation**.

The existing web application can:

- generate deterministic planets from a seed
- generate planet mass, radius, gravity, density, composition, volatile inventory, interior structure, atmosphere, temperature, geologic activity, magnetic state, and surface state
- derive a human-readable planet classification after the physical planet is generated
- generate regions from planetary conditions
- give regions broad background natural resources
- generate hidden geological/environmental features inside regions
- generate natural-resource occurrences and compositions inside features
- reveal generated features one at a time through a simple discovery interface

The generator now follows a causal pipeline rather than selecting a planet archetype first:

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

This is still a simplified procedural model rather than research-grade planetary science. The priority is internal consistency, causal relationships, and useful simulation data.

## Current Architecture

The working implementation is under:

```text
planet-generator/
```

It is currently a lightweight static web application using:

- HTML
- CSS
- vanilla JavaScript
- ES modules

Core generation logic is intentionally kept separate from DOM rendering so it can evolve into reusable Interlink simulation logic.

Current generator modules include:

```text
planet-generator/src/generator/
├── generatePlanet.js
├── generateRegions.js
├── generateFeatures.js
├── generateResources.js
└── random.js
```

The UI is currently a development interface for inspecting generated worlds rather than the final Interlink game interface.

## Foundation Work In Progress

The original planet generator began as a standalone tech demo. Its useful simulation code is now being promoted into the actual Interlink foundation rather than discarded.

The next architecture phase will establish:

```text
World / Simulation State
        ↓
Player Knowledge State
        ↓
Application / UI State
```

This will separate what physically exists from what the player has discovered and from what the interface is currently displaying.

The project will also move toward:

- a serializable root world state
- `schemaVersion` and `generatorVersion`
- deterministic namespaced/sub-seeded random streams
- stable IDs for generated entities
- reusable definitions separated from generated occurrences
- explicit resource definitions, constituent definitions, and resource occurrences
- deterministic lazy generation in later stages

These changes are intended to preserve the current working planet generator while creating safer foundations for future simulation systems.

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

`Hematite` is a mineral constituent of that generated ore occurrence rather than necessarily being a separate fundamental resource type.

The same principle applies to brines, natural gas, rocks, atmospheric gases, and other heterogeneous natural materials. This is intended to support future processing gameplay where outputs depend on actual feedstock composition.

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

Future gameplay may include surveying, extraction, material processing, chemistry, thermodynamics, automation, control systems, reusable blueprints, and large industrial networks. These systems are intentionally out of scope until the world/simulation foundation is stable.

## Near-Term Roadmap

1. Establish separate world, knowledge, and UI state.
2. Add schema/generator versioning and deterministic namespaced RNG streams.
3. Formalize definitions versus generated occurrences.
4. Preserve the current planet-generation vertical slice through that refactor.
5. Improve causal regional geology.
6. Improve geological feature formation and resource occurrence generation.
7. Expand discovery into surveying and knowledge confidence.
8. Add extraction and processing only after the generated-world foundation is mature enough to support them.

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

Those instructions describe the current architecture, simulation philosophy, resource model, deterministic generation requirements, and long-term Interlink design direction.
