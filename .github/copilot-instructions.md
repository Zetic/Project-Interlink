# Project Interlink — Copilot Agent Instructions

## Project Direction

Project Interlink is a systems-driven simulation and management game being developed as a web application.

The core design principle is:

> Everything is a system, and every system can become a component of a larger system.

The long-term game should emphasize interconnected physical, chemical, industrial, logistical, and control systems rather than conventional character-action gameplay. The eventual interface should feel closer to an interactive engineering workspace, process diagram, network, and simulation dashboard than a traditional rendered game world.

The repository is still at an early foundational stage. **Do not attempt to build the entire game at once.** Build incrementally from the existing planet-generation system.

---

# Current Project State

The existing `planet-generator/` web application is the first working Interlink subsystem and should be promoted into the game's simulation foundation rather than treated as disposable prototype code.

Current working behavior includes:

1. Deterministic seeded planet generation.
2. Causal planet-generation passes rather than archetype-first generation.
3. Planet properties including mass, radius, gravity, density, composition, volatiles, atmosphere, temperature, interior fractions, geologic activity, magnetic state, and surface state.
4. Derived human-readable planet classification after physical generation.
5. Region generation from planet conditions.
6. Background natural resources belonging directly to regions.
7. Hidden geological/environmental features inside regions.
8. Natural resources and compositions associated with features.
9. A simple discovery UI that reveals generated features.

The next architectural phase is to separate permanent simulation state from player knowledge and UI state, establish stable deterministic generation namespaces, and formalize reusable world/resource data concepts before adding more gameplay.

---

# Required Architectural Direction

## 1. Three State Layers

Interlink must distinguish between:

```text
WORLD / SIMULATION STATE
What physically exists

        ↓

PLAYER KNOWLEDGE STATE
What has been discovered, measured, inferred, or estimated

        ↓

APPLICATION / UI STATE
What the player currently has selected, expanded, filtered, or displayed
```

These layers must not be conflated.

### World State

Contains objective simulated reality.

Examples:

- planets
- regions
- features
- resource occurrences
- material compositions
- physical quantities
- future facilities/processes/material streams

A feature's physical existence must not depend on whether the player has discovered it.

### Knowledge State

Contains what the player currently knows about world objects.

Examples:

```js
knowledge.features[featureId] = {
  discoveryState: 'unknown',
  surveyConfidence: 0,
  estimatedComposition: null,
  estimatedQuantity: null,
};
```

Possible future progression:

```text
Unknown
  ↓
Anomaly Detected
  ↓
Identified
  ↓
Composition Estimated
  ↓
Quantity Estimated
  ↓
Characterized
```

The current `Discover Feature` behavior may remain simple, but discovery state should migrate out of the physical feature object and into knowledge state.

### UI State

Contains presentation-only state.

Examples:

- selected planet/region/feature
- expanded panels
- filters
- active tab
- graph viewport
- temporary form values

UI state must not become simulation truth.

---

## 2. Root World State

Do not let the planet object permanently become the root container for the entire future game.

Establish a serializable root structure conceptually similar to:

```js
world = {
  schemaVersion: 1,
  generatorVersion: 1,
  seed,

  planetId,
  planets: {},
  regions: {},
  features: {},
  resourceOccurrences: {},
};
```

The exact shape may evolve, but the root should provide a stable home for world entities and version metadata.

For the current single-planet application, convenience references are fine. Do not overengineer multi-planet gameplay yet.

---

## 3. Definitions vs Occurrences

Keep reusable definitions separate from generated occurrences.

Examples:

```text
Resource Definition
Iron Ore
```

versus:

```text
Resource Occurrence
Feature #17
Iron Ore
Hematite 61%
Magnetite 14%
Goethite 7%
Quartz/gangue 18%
Quantity: ...
```

Likewise distinguish constituent/mineral definitions from raw-resource definitions.

Conceptually:

```text
ConstituentDefinition
ResourceDefinition
ResourceOccurrence
Feature
Region
Planet
```

These do not need to be classes. Prefer plain serializable JavaScript objects unless classes solve a real problem.

A catalog definition should describe what a resource type is. A generated occurrence should describe a particular natural instance of that resource.

---

## 4. Stable Deterministic Generation Namespaces

Do not rely forever on one long shared RNG stream for the entire world.

A single sequential stream means adding one new random roll early in generation can unintentionally change every region, feature, and resource generated afterward for the same seed.

Move toward deterministic namespaced/sub-seeded streams such as:

```text
world seed
│
├── planet:base
├── planet:composition
├── planet:interior
├── planet:atmosphere
│
├── region:0
│   ├── terrain
│   ├── geology
│   ├── resources
│   └── features
│
└── region:1
    └── ...
```

A useful API may look conceptually like:

```js
rngFor(seed, 'planet:composition');
rngFor(seed, `region:${regionId}:geology`);
rngFor(seed, `feature:${featureId}:resources`);
```

Exact implementation is flexible.

Goals:

- same seed + same generator version is reproducible
- unrelated generator changes should not reshuffle unrelated subsystems
- lazy generation can resolve details independently
- debugging a particular region/feature is reproducible

Do not use `Math.random()` inside simulation/generation modules.

---

## 5. Schema and Generator Versioning

Generated worlds should carry at least:

```js
schemaVersion
generatorVersion
```

`schemaVersion` describes the serialized world-data shape.

`generatorVersion` describes the procedural rules used to produce deterministic content.

Do not build a full migration framework yet, but establish these fields early so future saves and seeds can be interpreted intentionally.

---

# Dependency Direction

Prefer this conceptual dependency flow:

```text
DATA DEFINITIONS
      ↓
SIMULATION / GENERATION CORE
      ↓
WORLD STATE
      ↓
PLAYER KNOWLEDGE
      ↓
UI / VISUALIZATION
```

Dependencies should not flow backward without a clear reason.

In particular:

- core generation must not depend on DOM state
- world truth must not depend on discovery state
- player knowledge must not alter physical generation merely by observing something
- UI selection/visibility must not alter simulation truth

---

# Suggested Code Organization

Do not perform a massive rewrite merely to match folders, but move gradually toward an organization similar to:

```text
planet-generator/src/
│
├── core/
│   ├── world/
│   │   ├── worldState.js
│   │   ├── knowledgeState.js
│   │   └── versions.js
│   │
│   ├── generation/
│   │   ├── planet/
│   │   ├── regions/
│   │   ├── features/
│   │   └── resources/
│   │
│   ├── random/
│   │   └── seededRandom.js
│   │
│   └── validation/
│
├── data/
│   ├── resources.js
│   ├── constituents.js
│   └── featureTypes.js
│
└── ui/
    ├── rendering/
    └── app.js
```

This structure is guidance, not a rigid requirement. Preserve working behavior and avoid needless file churn.

---

# Existing Generator Architecture

The current generation modules are already usefully separated from the DOM.

Existing modules include:

- `generatePlanet.js`
- `generateRegions.js`
- `generateFeatures.js`
- `generateResources.js`
- `random.js`

Preserve the principle that generator functions operate on plain data rather than DOM elements.

The current planet generator now follows a causal pipeline broadly equivalent to:

```text
Base state
    ↓
Bulk matter / volatiles
    ↓
Thermal environment
    ↓
Interior structure
    ↓
Physical dimensions
    ↓
Atmosphere
    ↓
Internal activity
    ↓
Exterior state
    ↓
Derived planet classification
    ↓
Regions
```

Continue strengthening causal relationships rather than returning to archetype-first generation.

---

# Core Simulation Philosophy

## Generate Causes, Not Unrelated Random Results

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

- water-rich planets should more readily produce wet regions, aquifers, ice, oceans, or water-related resources
- high geological activity should increase volcanic, fault, hydrothermal, magma, and mineralization features
- region composition should influence which deposits can occur
- biological resources must depend on a biosphere being present

Randomness should provide variation **inside physical and geological constraints**.

---

## Regions and Features Are Both Physical Resource Sources

A region represents broad background matter and environmental reservoirs.

Examples:

- basaltic crust
- sand
- regolith
- water
- ice
- atmosphere
- biomass

A feature represents a localized geological/environmental structure, concentration, unusual condition, or access path.

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

Features should not be required to represent materials that are naturally widespread throughout a region.

---

## Raw Resources Are Natural Feedstocks

Do not confuse a mineral species with a naturally extracted feedstock.

Prefer:

```text
Feature: Iron Ore Deposit
Raw resource: Iron Ore
Composition:
  Hematite 64%
  Magnetite 14%
  Goethite 5%
  Quartz/gangue 17%
```

rather than treating every hematite occurrence as its own fundamental resource type.

Likewise:

```text
Feature: Aluminum Ore Deposit
Raw resource: Aluminum Ore
Descriptor: boehmite-rich bauxite
Composition:
  Boehmite
  Gibbsite
  Hematite
  Kaolinite
  other minerals
```

The resource identity and generated composition are separate concepts.

A single resource definition can therefore have many generated occurrences.

---

## Preserve Matter Composition

Whenever practical, resources should carry meaningful composition data instead of functioning as arbitrary tokens.

Examples:

- ores contain mineral constituents
- brines contain dissolved salts and trace constituents
- natural gas contains a gas mixture
- atmosphere contains gas fractions
- rocks contain mineral mixtures
- biomass contains organic material classes

Future processing gameplay will consume these material streams. Avoid hard-coded abstractions such as:

```text
1 Iron Ore = 1 Iron
```

Useful products should eventually derive from feedstock composition and processing capability.

---

# Planet / Region / Feature Direction

For current work, the important physical hierarchy is:

```text
Planet
  └─ Region
       ├─ Background natural resources
       └─ Feature
            └─ Natural resource occurrences / compositions
```

Future versions may add geological hierarchy such as provinces, formations, deposits, ore bodies, veins, and pockets, but only add those levels when they produce a concrete simulation or gameplay benefit.

## Planet Properties

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

The target is **physically constrained and causally plausible**, not research-grade planetary science.

## Regions

Regions should carry local conditions derived from the planet and should influence feature/resource generation.

Useful properties include:

- area
- latitude
- elevation
- relief
- local composition
- heat
- moisture / volatile availability
- geologic activity
- surface cover
- age/history where meaningful
- heterogeneity

A region is a bundle of physical/environmental properties, not merely a biome label.

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

---

# Lazy Generation Direction

As worlds become more detailed, do not generate millions of feature objects at startup.

Preferred long-term strategy:

1. Generate world seed and planet state.
2. Generate regional state and broad material/geological potential.
3. Resolve major features when appropriate.
4. Resolve smaller deposits/structures when surveyed or inspected.
5. Persist anything discovered, extracted, modified, or named.
6. Reconstruct untouched details deterministically from namespaced seeds and generator version.

Lazy generation must **resolve pre-existing deterministic reality**, not create resources because the player looked for them.

---

# Interlink Long-Term Gameplay Philosophy

These principles are architectural guidance. Do not implement all of them unless the current issue explicitly requires them.

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

> Yesterday's factory becomes today's machine.

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

Favor clarity, information density, inspectability, and systems reasoning over decorative game UI.

## Progress Through Capability

Long-term progression should emerge primarily from physical and engineering capabilities such as:

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

## Simulate Decisions, Aggregate Busywork

Use detail when it creates meaningful player decisions.

Aggregate detail that mostly creates repetitive setup work.

Do not simulate every bolt, brick, valve, atom, or molecule merely because it is possible.

Prefer functional abstractions with meaningful consequences.

---

# Web Application Guidance

The project will remain a web application for the foreseeable future.

For now:

- prefer browser-native JavaScript unless a framework provides a clear benefit
- do not migrate frameworks merely for modernization
- keep dependencies minimal
- keep the app easy to run through a simple local HTTP server
- preserve modular ES modules
- keep simulation code independent from DOM code
- avoid unnecessary backend infrastructure until persistence/server simulation actually requires it

If the UI becomes complex enough that a framework is clearly beneficial, propose the migration before performing a large rewrite.

Do not respond to architectural concerns by introducing unnecessary enterprise infrastructure such as dependency-injection frameworks, message buses, databases, ECS architectures, or server stacks without a concrete need.

---

# Coding Guidance

When modifying this repository:

1. Inspect the existing implementation first.
2. Preserve working behavior unless the issue explicitly changes it.
3. Keep generation functions small, deterministic, and composable.
4. Prefer plain serializable data structures.
5. Separate world truth, player knowledge, and UI state.
6. Keep definition data separate from generated occurrences.
7. Route simulation randomness through deterministic namespaced RNGs.
8. Keep IDs stable where practical.
9. Carry `schemaVersion` and `generatorVersion` in generated world state.
10. Add validation for important invariants.
11. Avoid circular dependencies.
12. Keep rendering/formatting outside the simulation core.
13. Document non-obvious physical approximations.
14. Prefer data-driven definitions over growing switch statements when complexity warrants it.
15. Do not add speculative systems unrelated to the current task.
16. When realism conflicts with playability or implementation cost, preserve causal plausibility and meaningful decisions rather than maximal detail.

---

# Important Data Invariants

Where applicable:

- complete percentage compositions should sum to approximately 100%
- structural mass fractions should sum to approximately 1
- region area percentages should sum to approximately 100%
- quantities and physical values should not be negative unless explicitly meaningful
- biological resources should not appear without appropriate biological conditions
- feature resources should be compatible with feature type and local geology
- world generation must not depend on DOM/UI state
- discovery must not create or alter physical resources merely by observing them
- same seed + same generator version should reproduce the same intended world state

Validation failures should be visible during development rather than silently ignored.

---

# Naming Guidance

Use names that describe simulated concepts rather than implementation accidents.

Prefer reusable natural feedstocks such as:

- `Iron Ore`
- `Copper Ore`
- `Brine`
- `Natural Gas`
- `Atmospheric Gas`
- `Basalt`

with occurrence-specific composition and descriptors.

Avoid creating a new resource definition for every composition variant unless it truly represents a distinct natural material class.

Human-readable occurrence descriptors may still say things like `Hematite-rich Iron Ore` or `Boehmite-rich Bauxite`.

---

# Near-Term Priorities

Unless a user request explicitly changes priority, development should generally proceed in this order:

1. Establish World State / Knowledge State / UI State separation.
2. Establish schema/generator versioning and namespaced deterministic RNG streams.
3. Formalize definitions vs generated occurrences.
4. Preserve and validate the existing planet-generation vertical slice through that refactor.
5. Improve causal regional geology.
6. Improve feature formation.
7. Improve natural-resource occurrence generation and compositions.
8. Expand discovery into surveying/knowledge confidence.
9. Improve visualization and inspection.
10. Add extraction/exploitation concepts.
11. Add processing and material transformation.
12. Add automation and reusable systems.
13. Add larger industrial/network gameplay.

Do not jump directly to industrial gameplay while the foundational world model is still being established.

---

# Current Product Goal

At the current stage, a successful build should make it interesting to repeatedly generate planets and inspect **why they differ**, while establishing a data architecture that future Interlink gameplay can safely build upon.

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

If the answer is simply "a random roll," look for a reasonable causal dependency.

This causal, inspectable, deterministic systems model is the foundation future Interlink gameplay should build upon.
