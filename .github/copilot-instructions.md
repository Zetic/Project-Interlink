# Project Interlink — Copilot Agent Instructions

## Project Direction

Project Interlink is a systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term game should emphasize interconnected physical, chemical, industrial, logistical, and control systems rather than conventional character-action gameplay. The eventual interface should feel closer to an interactive engineering workspace, process diagram, network, and simulation dashboard than a traditional rendered world.

The repository is still early. **Do not attempt to build the whole game at once.** Extend the current simulation foundation incrementally and preserve working behavior unless an issue explicitly changes it.

---

# Current Project State

The original `planet-generator/` tech demo has now been promoted into the first real Interlink simulation subsystem.

Current working behavior includes:

1. Deterministic seeded planet generation.
2. Causal planet-generation passes rather than archetype-first generation.
3. Generated planet mass, orbit, composition, volatiles, thermal environment, interior structure, physical dimensions, atmosphere, internal activity, surface state, and derived classification.
4. Region generation from planetary conditions.
5. Background natural resources belonging to regions.
6. Hidden geological/environmental features inside regions.
7. Generated natural-resource occurrences and compositions associated with features.
8. A discovery UI that reveals already-existing features.

The foundational state architecture is now established:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
what has been discovered or estimated
        ↓
APPLICATION / UI STATE
selection, display, filters, temporary controls
```

The current root world state contains version metadata and flat ID-indexed maps for generated entities. Physical discovery state is no longer stored on features. Procedural generation uses deterministic namespaced/sub-seeded RNG streams.

**Do not redo this foundation without a concrete need.** The next development priority is automated simulation regression protection, then deeper causal regional geology and feature/resource formation.

---

# Immediate Development Priority: Simulation Contracts and Tests

Before making large changes to geology, resources, or gameplay, establish executable regression tests for the simulation.

Prefer the built-in Node.js test runner (`node:test`) unless there is a clear need for a third-party test framework. Keep runtime dependencies at zero or near zero.

Tests should protect these contracts:

## Determinism

- same root seed + same generator version produces identical world data
- same seed + same RNG namespace produces the same sequence
- unrelated RNG namespaces are independent
- simulation/generation modules do not use scattered `Math.random()` calls

## World integrity

- all planet → region references resolve
- all region → feature references resolve
- all feature/resource-occurrence references resolve
- parent/back-reference IDs agree
- generated IDs are unique and stable for a generated world
- no physical feature contains player discovery state

## Knowledge integrity

- all knowledge records reference real world entities
- discovering a feature mutates knowledge only
- discovery does not alter feature/resource truth

## Numeric invariants

Where applicable:

- complete compositions sum to approximately 100%
- core + deep interior + envelope fractions sum to approximately 1
- region area percentages sum to approximately 100%
- atmospheric composition sums to approximately 100% when atmosphere exists
- no NaN or Infinity
- physical quantities that cannot be negative are not negative

## Domain compatibility

Obvious impossible combinations should be prevented and tested.

Examples:

- aquifers should be fluid-compatible rather than arbitrary solid/gas/plastic features
- gas reservoirs should be gaseous and contain gas-compatible resources
- magma chambers should be magma/high-temperature compatible
- ice bodies should be solid/frozen volatile-compatible
- biological resources must require appropriate biological conditions

Do not turn this testing phase into a complete geology simulator. Establish only clear contracts that future generation work can safely build on.

## Broad seed testing

Include a deterministic smoke/property-style test over many seeds (hundreds are sufficient initially) that verifies all validators and key invariants pass.

The suite should be fast enough to run on every pull request.

## CI

Once a minimal test command exists, add a small GitHub Actions workflow that runs the tests on pull requests and pushes to the main development branch.

Do not add a heavy build pipeline just for the current static application.

---

# Required Architectural Direction

## 1. Keep Three State Layers Separate

### World State

Contains objective simulated reality:

- planets
- regions
- features
- resource occurrences
- material compositions
- physical quantities
- future facilities/processes/material streams

A feature exists independently of whether it has been discovered.

### Knowledge State

Contains what the player knows about world objects.

Current discovery may remain binary, but the architecture should support future states such as:

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

Discovery must reveal existing world truth rather than generate or modify it.

### UI State

Contains presentation-only state such as:

- selected entity
- expanded panels
- filters
- active view
- graph viewport
- temporary form values

UI state must never become simulation truth.

---

## 2. Root World State

The planet object must not become the permanent root container for the game.

The current direction is conceptually:

```js
world = {
  schemaVersion,
  generatorVersion,
  seed,
  planetId,
  planets: {},
  regions: {},
  features: {},
  resourceOccurrences: {},
};
```

Keep this plain and serializable. Stable ID references are preferred over deeply nested mutable object graphs for permanent world state.

Do not add multi-planet gameplay merely because the container can support it.

---

## 3. Definitions vs Occurrences

Reusable definitions and generated physical occurrences are different concepts.

Example:

```text
ResourceDefinition
Iron Ore
```

versus:

```text
ResourceOccurrence
location: feature-17
resourceId: iron-ore
hematite: 61%
magnetite: 14%
goethite: 7%
gangue: 18%
quantity: ...
```

Likewise, mineral/chemical constituents should eventually be distinct from raw-resource definitions.

Prefer plain data definitions over unnecessary classes.

**Long-term consistency rule:** all extractable natural material instances, including broad regional resources, should eventually have stable occurrence identity rather than mixing embedded anonymous objects with normalized occurrence objects.

---

## 4. Deterministic Namespaced RNG

All simulation randomness should flow through seeded deterministic generators.

Use independent namespaces/substreams such as:

```text
planet:base
planet:bulk
planet:thermal
planet:interior
planet:atmosphere
region:<id>
region:<id>:resources
region:<id>:features
feature:<id>
feature:<id>:resources
```

A useful API already exists conceptually as:

```js
rngFor(seed, namespace)
```

Goals:

- reproducible debugging
- stable shareable seeds
- reduced cross-system reshuffling after unrelated generator changes
- support for deterministic lazy generation later

Do not use `Math.random()` inside simulation/generation modules. UI-only random seed creation is acceptable.

---

## 5. Versioning

Generated worlds carry:

```js
schemaVersion
generatorVersion
```

`schemaVersion` describes serialized data shape.

`generatorVersion` describes procedural rules that determine seeded output.

When a generation change intentionally changes results for the same seed, consider whether `generatorVersion` should be incremented.

Do not build a migration system until persistence requires one.

---

# Dependency Direction

Prefer:

```text
DATA DEFINITIONS
      ↓
SIMULATION / GENERATION
      ↓
WORLD STATE
      ↓
PLAYER KNOWLEDGE
      ↓
UI / VISUALIZATION
```

Dependencies should not flow backward without a clear reason.

In particular:

- generation must not depend on DOM state
- world truth must not depend on discovery
- observing something must not change physical generation
- UI visibility/selection must not affect world truth

---

# Core Simulation Philosophy

## Generate Causes, Not Independent Random Results

Prefer:

```text
Planet conditions
    ↓
Regional conditions / geology
    ↓
Feature formation
    ↓
Natural-resource occurrence
```

Randomness should create variation **inside physical/geological constraints**.

Examples:

- water-rich worlds should more readily produce wet regions, aquifers, ice, or water resources
- geological activity should influence volcanic, fault, hydrothermal, magma, and mineralization features
- local composition/geological environment should influence deposit occurrence
- biological resources require an appropriate biosphere/history

When adding a generated property, ask:

> What downstream result does this influence?

When adding an output, ask:

> What upstream conditions caused this?

Avoid adding simulation values that are only disconnected flavor.

---

## Regions and Features Are Both Resource Sources

A region represents widespread/background reservoirs such as:

- crustal rock
- regolith
- sand
- water
- ice
- atmosphere
- widespread biomass

A feature represents localized structure, concentration, special conditions, or access such as:

- ore deposit
- aquifer
- gas reservoir
- fault
- cave
- crater
- hydrothermal system
- volcanic vent
- magma chamber
- salt basin

Features should not be required to represent material that naturally occurs across a broad region.

---

## Raw Resources Are Natural Feedstocks

Do not confuse mineral species with naturally extracted feedstocks.

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

rather than making each mineralogical variant a different fundamental raw-resource ID.

A resource definition identifies the feedstock class. A generated occurrence carries subtype, composition, concentration, quantity, and location.

---

## Preserve Matter Composition

Whenever practical, natural resources should carry meaningful composition data rather than behaving as arbitrary tokens.

Examples:

- ores contain mineral constituents
- brines contain dissolved species
- natural gas contains a gas mixture
- atmosphere contains gas fractions
- rocks contain mineral mixtures

Future processing should derive outputs from feedstock composition and process capability rather than hard-coded conversions such as `1 Iron Ore = 1 Iron`.

---

# Current Planet / Region / Feature Direction

The current physical hierarchy is:

```text
Planet
  └─ Region
       ├─ Background natural resources
       └─ Feature
            └─ Natural-resource occurrences
```

Do not add geological hierarchy (province → formation → deposit → ore body, etc.) until it gives a concrete simulation or gameplay benefit.

## Planet

The planet generator is already causal enough to serve as the upstream model. Preserve its broad pass order:

```text
Base state
→ bulk matter / volatiles
→ thermal environment
→ interior structure
→ physical dimensions
→ atmosphere
→ internal activity
→ exterior state
→ derived classification
→ regions
```

The target is physically constrained and causally plausible, not research-grade planetary science.

## Regions

Regions should increasingly derive coherent local geology/environment from planet conditions. Current regional random perturbations are acceptable scaffolding, but future work should strengthen causal geology rather than simply adding more random labels.

Useful regional concepts include:

- area
- latitude
- elevation
- relief
- local composition
- heat
- moisture / volatile availability
- geologic activity
- surface cover
- meaningful geological age/history
- heterogeneity

## Features

Feature type, physical state, temperature/pressure, and possible resources must become increasingly compatible with the conditions that form that feature.

Do not allow broad tag matching to become a substitute for geological causality as the system matures.

---

# Lazy Generation Direction

As detail grows, do not generate millions of objects at startup.

Preferred future strategy:

1. Generate world seed and planet state.
2. Generate regional state and broad geological/material potential.
3. Resolve major features when appropriate.
4. Resolve smaller deposits/structures when surveyed or inspected.
5. Persist anything discovered, extracted, modified, or named.
6. Reconstruct untouched detail deterministically from seed, namespace, and generator version.

Lazy generation must resolve pre-existing deterministic reality, not create resources because the player looked for them.

---

# Long-Term Interlink Gameplay Philosophy

These are architectural constraints, not immediate implementation tasks.

## Systems Become Components

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

A working system should eventually be reusable as a component of a larger system.

> **Yesterday's factory becomes today's machine.**

## Blueprint / Network-Oriented Interaction

Long-term interaction should emphasize:

- nodes and ports
- material and energy streams
- process diagrams
- nested reusable systems
- graphs and dashboards
- sensors/controllers
- alerts and composition readouts

Do not assume a conventional 3D or character-controlled game world is required.

## Capability-Based Progression

Progression should emerge from capabilities such as temperature, pressure, purity, vacuum, electrical capability, material compatibility, chemical resistance, throughput, and control precision rather than arbitrary tech-level locks where possible.

## Simulate Decisions, Aggregate Busywork

Simulate detail when changing it creates meaningful player decisions. Aggregate detail that mainly creates repetitive setup work.

---

# Web Application Guidance

For now:

- keep the project web-based
- prefer browser-native JavaScript while it remains sufficient
- preserve ES modules
- keep runtime dependencies minimal
- keep simulation code DOM-independent
- do not migrate to React/Vue/etc. merely for modernization
- do not introduce a backend/database until persistence or server simulation requires one
- avoid ECS, dependency injection, message buses, or enterprise architecture without a concrete need

The current static app should remain easy to run through a local HTTP server.

---

# Coding Guidance

When modifying this repository:

1. Inspect the existing implementation first.
2. Preserve behavior unless the issue explicitly changes it.
3. Keep generation deterministic, small, and composable.
4. Prefer plain serializable data structures.
5. Preserve World / Knowledge / UI separation.
6. Keep definitions separate from occurrences.
7. Route simulation randomness through namespaced seeded RNGs.
8. Keep IDs stable where practical.
9. Maintain `schemaVersion` and `generatorVersion` deliberately.
10. Add or update automated tests when changing simulation contracts.
11. Add validation for important invariants.
12. Avoid circular dependencies.
13. Keep rendering/formatting out of simulation logic.
14. Document non-obvious physical approximations.
15. Prefer data-driven compatibility rules as complexity grows.
16. Do not add speculative systems unrelated to the current issue.
17. When realism conflicts with scope, preserve causal plausibility and meaningful decisions rather than maximal detail.

---

# Near-Term Development Order

Unless an issue explicitly changes priority:

1. **Add automated simulation regression tests and executable invariants.**
2. Normalize any remaining inconsistent occurrence/reference models exposed by those tests.
3. Improve causal regional geology.
4. Improve feature formation and feature/resource compatibility.
5. Improve natural-resource composition and deposit generation.
6. Expand discovery into surveying/knowledge confidence.
7. Add extraction concepts.
8. Add processing/material transformation.
9. Add automation and reusable systems.
10. Add larger industrial/network gameplay.

Do not jump into factories, blueprints, research, or late-game systems while generated-world causality is still being established.
