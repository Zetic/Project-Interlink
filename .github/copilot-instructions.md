# Project Interlink — Copilot Agent Instructions

## Project Direction

Project Interlink is a systems-driven simulation and management game being developed as a web application.

The long-term design principle is:

> Everything is a system, and every system can become a component of a larger system.

The game should emphasize interconnected physical, chemical, industrial, logistical, and control systems rather than conventional character-action gameplay. The eventual interface should feel closer to an interactive engineering workspace, process diagram, network, and simulation dashboard than a traditional rendered game world.

The current repository is still at the earliest stage. **Do not attempt to build the entire game at once.** Build incrementally from the existing planet-generation application.

---

## Current Scope

The existing `planet-generator/` application is the first working subsystem and should be treated as the foundation of the project, not as disposable prototype code.

Current functionality centers on:

1. Generating a deterministic planet from a seed.
2. Generating regions belonging to that planet.
3. Generating natural geological/environmental features inside regions.
4. Generating natural resources associated with regions and features.
5. Keeping features undiscovered until the user reveals them.
6. Displaying generated information through the web interface.

For now, prioritize improving and extending this simulation/data foundation before introducing major new gameplay systems.

---

## Existing Architecture

Preserve the useful separation already present in the codebase.

The generation modules under `planet-generator/src/generator/` should remain independent from the DOM and UI wherever practical.

Important existing modules include:

- `generatePlanet.js`
- `generateRegions.js`
- `generateFeatures.js`
- `generateResources.js`
- `random.js`

The preferred architectural direction is:

```text
Simulation / Generation Logic
        ↓
Plain JavaScript data objects
        ↓
Application state
        ↓
Web UI / visualization
```

Do not put core simulation rules directly into rendering code or DOM event handlers.

This separation is important because simulation logic may later move into a dedicated backend, worker, server, or another game runtime.

---

# Core Simulation Philosophy

## 1. Generate Causes, Not Unrelated Random Results

Procedural generation should be causal whenever reasonable.

Prefer:

```text
Planet properties
    ↓
Regional conditions
    ↓
Feature formation
    ↓
Natural resource occurrence
```

Avoid independently rolling unrelated values that produce contradictory worlds.

Examples:

- A water-rich planet should be more likely to produce wet regions, aquifers, ice, oceans, or water-related resources.
- High geological activity should increase volcanic, fault, hydrothermal, magma, and mineralization features.
- Region composition should influence which mineral deposits can occur.
- Biological resources must depend on a biosphere being present.

Randomness should provide variation **inside physical and geological constraints**.

---

## 2. Separate What Exists From What the Player Knows

The simulation should maintain a distinction between true world state and discovered information.

A feature should exist before it is discovered.

Prefer models such as:

```js
feature = {
  ...trueProperties,
  discovered: false
}
```

Later this concept may expand into survey confidence, estimated composition, estimated quantity, sensor signatures, and progressive characterization.

Do not generate a resource merely because the player discovers it. Generate the world deterministically first, then reveal information about it.

---

## 3. Regions and Features Are Both Physical Resource Sources

A region represents broad background matter and environmental reservoirs.

Examples:

- basaltic crust
- sand
- regolith
- water
- ice
- atmosphere
- biomass

A feature represents a localized geological or environmental structure, concentration, unusual condition, or access path.

Examples:

- ore body
- aquifer
- hydrothermal system
- salt basin
- fault
- cave
- crater
- gas reservoir
- magma chamber

Features should not be required to represent materials that are naturally widespread throughout an entire region.

---

## 4. Raw Resources Are Natural Feedstocks

Do not confuse a mineral species with a naturally extracted feedstock.

For example, prefer:

```text
Feature: Iron Ore Deposit
Raw resource: Iron Ore
Composition:
  Hematite 64%
  Magnetite 14%
  Goethite 5%
  Quartz/gangue 17%
```

rather than treating every occurrence of hematite as its own independent deposit type.

Likewise:

```text
Feature: Aluminum Ore Deposit
Raw resource: Aluminum Ore
Subtype / descriptor: Bauxite, boehmite-rich
Composition:
  Boehmite
  Gibbsite
  Hematite
  Kaolinite
  other minerals
```

The resource identity and the particular generated composition are separate concepts.

A single resource type can therefore have many naturally generated variants.

---

## 5. Preserve Matter Composition

Whenever practical, resources should carry meaningful composition data rather than functioning as arbitrary abstract tokens.

Examples:

- ores contain mineral constituents
- brines contain dissolved salts and trace constituents
- natural gas contains a gas mixture
- atmosphere contains gas fractions
- rocks contain mineral mixtures
- biomass contains organic material classes

Future processing gameplay will consume these material streams, so avoid hard-coding rules such as:

```text
1 Iron Ore = 1 Iron
```

The eventual game should derive useful products from actual feedstock composition and processing capability.

---

# Interlink Long-Term Gameplay Philosophy

These principles are architectural guidance for future work. Do not implement all of them unless the requested task specifically requires them.

## Systems Become Components

The eventual game should support a hierarchy such as:

```text
Primitive function
    ↓
Apparatus
    ↓
Process
    ↓
Production line
    ↓
Facility
    ↓
Industrial network
    ↓
Planetary system
```

A working system should eventually be reusable as a component of a larger system.

The intended progression principle is:

> Yesterday's factory becomes today's machine.

---

## Blueprint / Network-Oriented Interaction

Interlink is intended to be largely UI-driven.

Long term, expect interaction through:

- nodes
- ports
- material streams
- energy streams
- process diagrams
- nested systems
- graphs
- dashboards
- sensors
- controllers
- alerts
- composition readouts

Do not assume the project needs a conventional 3D or character-controlled world.

When adding interfaces, favor clarity, information density, inspectability, and systems reasoning over decorative game UI.

---

## Progress Through Capability

Long-term progression should be based primarily on what operating conditions and processes the player's systems can achieve.

Examples:

- temperature
- pressure
- purity
- vacuum
- electrical capability
- material compatibility
- chemical resistance
- throughput
- control precision

Avoid arbitrary unlocks when a physical capability can naturally serve as the gate.

---

## Simulate Decisions, Aggregate Busywork

Use detail when that detail creates meaningful player decisions.

Aggregate details that only create repetitive setup work.

Do not simulate every bolt, brick, valve, atom, or molecule merely because it is possible.

Prefer functional abstractions that preserve meaningful consequences.

Examples of useful future functional units include:

- reaction volume
- material input
- material output
- heating
- cooling
- atmosphere/gas control
- agitation
- separation
- sensing
- control logic

---

# Planet Generation Direction

For current work, the important hierarchy is:

```text
Planet
  └─ Region
       ├─ Background natural resources
       └─ Feature
            └─ Natural resources / compositions
```

Future versions may add more geological hierarchy, such as:

```text
Planet
  └─ Region
       └─ Geological Province
            └─ Formation
                 └─ Deposit
                      └─ Ore Body / Vein / Pocket
```

Do not introduce these levels until they provide a concrete benefit.

---

## Planet Properties

Planet properties should increasingly form a coherent causal model rather than a set of independent archetype rolls.

Useful planet-level concepts include:

- mass
- radius
- density
- gravity
- escape velocity
- bulk composition
- volatile inventory
- atmosphere
- temperature
- internal heat
- geologic activity
- interior structure
- magnetic state
- surface state
- biosphere presence

Existing simplified models may remain while the application is young. Improve them gradually rather than replacing everything with a research-grade simulation.

The target is **physically constrained and causally plausible**, not perfect astrophysical simulation.

---

## Regions

Regions should be generated from the planet and should carry local conditions that influence feature/resource generation.

Useful region properties include:

- area
- latitude
- elevation
- relief
- local composition
- heat
- moisture / volatile availability
- geologic activity
- surface cover
- age
- heterogeneity

Regions should not simply be arbitrary biome labels. A region is a bundle of physical/environmental properties.

---

## Features

Feature types may include:

- mineral deposit
- geological formation
- aquifer
- gas reservoir
- cave / cavern
- ravine
- fault
- crater
- volcanic vent
- hydrothermal system
- magma chamber
- ice body
- salt basin
- outcrop

Feature probability should depend on regional and planetary conditions.

Features can contain resources, modify accessibility, expose deeper material, or provide unusual temperature/pressure/fluid conditions.

A feature does not always need to be an ore deposit.

---

# Deterministic Generation

Maintain seeded deterministic generation.

Given the same seed and generator version, the same world should be reproducible whenever practical.

Prefer all simulation randomness to flow through the project's seeded RNG rather than scattered calls to `Math.random()`.

This will eventually support:

- reproducible debugging
- saved games
- shareable planet seeds
- deterministic lazy generation

---

# Lazy Generation Direction

As worlds become more detailed, do not generate millions of feature objects at startup.

Preferred long-term strategy:

1. Generate planet state and seed.
2. Generate regional state and material budgets.
3. Generate major features when necessary.
4. Resolve smaller deposits and structures when surveyed or inspected.
5. Persist anything discovered, extracted, modified, or named.
6. Reconstruct untouched details deterministically from seed and rules.

Lazy generation must **resolve pre-existing deterministic reality**, not invent resources in response to player actions.

---

# Web Application Guidance

The project will remain a web application for the foreseeable future.

For now:

- Prefer simple browser-native JavaScript unless a framework provides a clear benefit.
- Do not migrate frameworks merely for modernization.
- Keep dependencies minimal.
- Keep the app easy to run locally through a simple HTTP server.
- Preserve modular ES modules.
- Keep simulation code independent from DOM code.
- Avoid unnecessary backend infrastructure until persistent multiplayer/server-side simulation actually requires it.

If the UI becomes complex enough that a framework is clearly beneficial, propose the migration before performing a large rewrite.

---

# Coding Guidance

When modifying this repository:

1. **Inspect the existing implementation first.** Extend working systems instead of replacing them without reason.
2. Keep generation functions small and composable.
3. Prefer plain serializable data structures for simulation state.
4. Keep IDs stable where practical.
5. Route randomness through the seeded RNG.
6. Add validation for important invariants.
7. Avoid circular dependencies between generator modules.
8. Keep UI formatting/display helpers outside the underlying simulation when possible.
9. Document non-obvious physical approximations.
10. Prefer data-driven resource/feature definitions over large repeated switch statements when complexity grows.
11. Do not add speculative systems unrelated to the current task.
12. When physical realism conflicts with playability or implementation cost, preserve causal plausibility and meaningful decisions rather than maximal simulation detail.

---

# Important Data Invariants

Where applicable, maintain these rules:

- percentages representing a complete composition should sum to approximately 100%
- structural mass fractions should sum to approximately 1
- region area percentages should sum to approximately 100%
- quantities and physical values should not be negative unless the property explicitly allows it
- biological resources should not appear without appropriate biological conditions
- feature resources should be compatible with feature type and local geology
- deterministic generation should not depend on DOM state

Validation failures should be visible during development rather than silently ignored.

---

# Naming Guidance

Use names that describe the simulated concept rather than implementation accidents.

Prefer:

- `Iron Ore`
- `Copper Ore`
- `Brine`
- `Natural Gas`
- `Atmospheric Gas`
- `Basalt`

with generated composition/subtype data.

Avoid creating a separate raw-resource identity for every composition variant, such as:

- `Hematite Iron Ore`
- `Magnetite Iron Ore`
- `Boehmite Bauxite`
- `Methane-Rich Natural Gas`

unless the distinction genuinely represents a different natural resource class rather than composition alone.

Human-readable descriptors can still display these distinctions.

---

# Near-Term Priorities

Unless a user request explicitly changes priority, development should generally proceed in this order:

1. Improve causal planet generation.
2. Improve region generation.
3. Improve feature generation.
4. Improve natural-resource generation and compositions.
5. Improve discovery/survey representation.
6. Improve visualization and inspection of generated systems.
7. Add extraction/exploitation concepts.
8. Add processing and material transformation.
9. Add automation and reusable systems.
10. Add larger industrial/network gameplay.

Do not jump directly to late-game industrial simulation while the foundational generated world model is still incomplete.

---

# Current Product Goal

At the current stage, a successful build should primarily make it interesting to repeatedly generate planets and inspect **why they differ**.

The application should make relationships visible:

```text
Planet conditions
    ↓
Region conditions
    ↓
Feature formation
    ↓
Natural resource distribution
```

When adding a generation property, ask:

> What downstream result does this property influence?

If it influences nothing and is only flavor text, reconsider whether it belongs in the simulation yet.

When adding a generated result, ask:

> What upstream conditions caused this result?

If the answer is simply "a random roll," look for a reasonable causal dependency before adding more complexity.

This causal, inspectable systems model is the foundation that future Interlink gameplay should build upon.
