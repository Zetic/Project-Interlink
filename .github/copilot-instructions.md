# Project Interlink — Copilot Agent Instructions

## Documentation Roles

Use the repository documents for different purposes:

- `DESIGN.md` — canonical long-term game design and intended gameplay direction
- `README.md` — current project state, roadmap, setup, and inspiration context
- `.github/copilot-instructions.md` — implementation guardrails and development priorities for coding agents
- `PATCH_NOTES.md` — historical commit-by-commit development record

When implementing new systems, remain compatible with `DESIGN.md`, but **do not implement every future concept merely because it appears there**. Follow the current issue and near-term development order.

---

# Project Direction

Project Interlink is a systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term game should emphasize interconnected physical, chemical, industrial, logistical, and control systems. The interface should increasingly resemble an engineering workspace made from networks, process diagrams, material/energy streams, instrumentation, controllers, dashboards, and reusable nested systems.

The repository is still early. Extend the current foundation incrementally and preserve working behavior unless an issue explicitly changes it.

World generation is a means of creating meaningful physical starting conditions for gameplay; **do not allow development to become generation-only**.

---

# Current Project State

The original `planet-generator/` tech demo has been promoted into the first real Interlink simulation subsystem.

Current working behavior includes:

1. deterministic seeded planet generation
2. causal planet-generation passes rather than archetype-first generation
3. generated orbit, mass, composition, volatiles, thermal environment, interior structure, dimensions, atmosphere, internal activity, surface state, and derived classification
4. regions generated from planet conditions
5. regional background natural resources
6. hidden geological/environmental features
7. feature-level resource occurrences and compositions
8. discovery UI that reveals already-existing features
9. serializable World State with stable ID references
10. separate Player Knowledge State
11. separate UI/presentation state
12. namespaced/sub-seeded deterministic RNG streams
13. schema/generator version metadata

The foundational state architecture is established:

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

**Do not redo this foundation without a concrete need.**

---

# Current Immediate Priority: Simulation Contracts and Tests

Before making large changes to geology or gameplay, establish executable regression protection for the current simulation.

Prefer the built-in Node.js test runner (`node:test`) unless a third-party framework is clearly justified. Keep application runtime dependencies at zero or near zero.

Tests should protect:

## Determinism

- same root seed + same generator version produces identical world data
- same seed + same RNG namespace produces the same sequence
- unrelated RNG namespaces remain independent
- simulation/generation modules do not use scattered `Math.random()` calls

## World Integrity

- planet → region references resolve
- region → feature references resolve
- feature → resource-occurrence references resolve
- parent/back-reference IDs agree
- generated IDs are unique within the world
- physical features do not contain player discovery truth

## Knowledge Integrity

- knowledge records reference real world entities
- discovering a feature changes knowledge only
- discovery does not mutate physical world/resource state

## Numeric Invariants

Where applicable:

- complete compositions sum to approximately 100%
- core + deep interior + envelope fractions sum to approximately 1
- region area percentages sum to approximately 100%
- atmospheric composition sums to approximately 100% when atmosphere exists
- no NaN or Infinity values
- physical quantities that cannot be negative are not negative

## Domain Compatibility

Prevent and test obvious contradictions such as:

- aquifers with arbitrary gas/plastic states or incompatible resources
- gas reservoirs without gas-compatible state/resources
- magma chambers without magma/high-temperature compatibility
- ice bodies without solid/frozen volatile compatibility
- biological resources without suitable biological conditions

Do not turn this testing work into the complete geology simulator.

## Broad Seed Testing and CI

Run deterministic multi-seed smoke/property-style tests over hundreds of worlds and add a small GitHub Actions workflow that runs tests for pull requests and `main`.

---

# Development Must Validate the Gameplay Loop Early

After the regression-test foundation is in place, continue improving world generation **and** begin small gameplay vertical slices.

The long-term loop defined in `DESIGN.md` is:

```text
Acquire
→ Analyze
→ Experiment
→ Engineer
→ Blueprint
→ Automate
→ Scale
→ Optimize
```

Do not wait until star, system, planet, region, geology, and resource generation are all “finished” before prototyping gameplay.

Early gameplay work should be intentionally narrow. A suitable first playable chain may be conceptually:

```text
Survey / discover an existing resource occurrence
    ↓
Acquire a small quantity
    ↓
Inspect / analyze composition
    ↓
Apply one simple parameter-driven transformation or separation
    ↓
Produce an output stream and verify matter balance
    ↓
Represent that successful operation as a reusable process/apparatus concept
```

This is not permission to build the entire factory/blueprint/technology game immediately. The purpose is to prove that generated world data creates interesting player decisions and that future processing systems can consume the data model cleanly.

When adding world-generation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

When adding gameplay, ask:

> **What physical world state does this act on?**

---

# World Generation Must Eventually Begin Above the Planet

The current planet generator is the first implemented slice, **not the permanent top of the causal world model**.

The intended long-term chain is:

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

## Current Rule

Do **not** implement a full star/system simulator simply because it is described here. Current planet-local assumptions are acceptable scaffolding while downstream systems are being established.

## Future Architectural Requirement

Do not entrench Sun-like or independently rolled planet assumptions so deeply that upstream star/system generation cannot later replace them.

Planet generation should gradually be able to consume explicit upstream context such as:

```js
planetFormationContext = {
  star: {
    mass,
    age,
    luminosity,
    effectiveTemperature,
    metallicity,
    abundanceRatios,
    activity,
  },
  system: {
    formationComposition,
    volatileAvailability,
    orbitalArchitecture,
    formationRegion,
    migrationOrHistoryModifiers,
  },
  orbit: {
    semiMajorAxis,
    eccentricity,
  },
};
```

The exact schema is not fixed yet.

Useful future upstream causes include:

- stellar mass, age, luminosity, temperature, metallicity, activity
- composition/element ratios that materially influence formed bodies
- protoplanetary material and volatile distribution
- formation temperature/condensation context
- orbital architecture
- migration/accretion/impact abstractions only where downstream consequences justify them

The design target is **causally plausible and gameplay-useful**, not research-grade astrophysics.

A future star/system generation issue should replace current local assumptions incrementally, with tests showing which planet properties are now sourced upstream.

---

# Required Architectural Direction

## Keep Three State Layers Separate

### World State

Contains objective simulated reality:

- stars/systems/planets when those exist
- regions
- features
- resource occurrences
- material compositions
- physical quantities
- future facilities, processes, material streams, and infrastructure

A physical object exists independently of player knowledge.

### Knowledge State

Contains what the player knows or estimates about world objects.

A future discovery path may include:

```text
Unknown
→ Anomaly Detected
→ Identified
→ Composition Estimated
→ Quantity Estimated
→ Characterized
```

Discovery reveals existing world truth; it must not create favorable resources because the player searched for them.

### UI State

Contains presentation-only state such as selected entity, expanded panels, filters, active views, graph viewport, and temporary control values.

UI state must not become simulation truth.

---

## Root World State

Keep the world plain and serializable. The current shape contains version metadata and ID-indexed maps.

Do not let the current single planet become the permanent conceptual root of the game. When star/system entities are added, evolve the root schema intentionally rather than nesting everything into the planet object.

Stable ID references are preferred over deeply nested mutable object graphs for permanent state.

---

## Definitions vs Occurrences

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
composition: ...
quantity: ...
```

Likewise distinguish future mineral/chemical constituent definitions from raw-feedstock definitions.

Prefer plain data definitions over unnecessary classes.

All extractable natural material instances, including broad regional resources, should eventually have stable occurrence identity rather than mixing anonymous embedded resource objects with normalized occurrences.

---

## Deterministic Namespaced RNG

All simulation randomness should flow through seeded deterministic generators.

Use independent namespaces/substreams. As star/system generation is added, extend the hierarchy rather than returning to one global sequential stream.

Conceptually:

```text
star:...
system:...
planet:...
region:<id>:...
feature:<id>:...
```

Goals:

- reproducible debugging
- stable shareable seeds
- reduced cross-system reshuffling
- deterministic lazy generation later

UI-only random root-seed creation is acceptable; simulation logic should not use uncontrolled randomness.

---

## Versioning

Generated worlds carry:

```text
schemaVersion
generatorVersion
```

Increment and document these deliberately when serialized shape or deterministic generation rules materially change.

Do not build a full migration system before persistence requires one.

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

Generation must not depend on DOM state. World truth must not depend on discovery. Observing something must not change physical generation.

---

# Core Simulation Philosophy

## Generate Causes, Not Independent Random Results

Current downstream chain:

```text
Planet conditions
    ↓
Regional conditions / geology
    ↓
Feature formation
    ↓
Natural-resource occurrence
```

Future upstream chain extends above it through star/system formation.

Randomness should create variation **inside physical/geological constraints**.

When adding a generated property, ask:

> What downstream result does this influence?

When adding an output, ask:

> What upstream conditions caused this?

Avoid disconnected flavor values unless they directly improve player interpretation.

---

## Regions and Features Are Both Resource Sources

Regions represent widespread/background reservoirs such as crustal rock, regolith, atmosphere, water, ice, sand, or biomass.

Features represent localized structure, concentration, unusual conditions, or access such as deposits, aquifers, reservoirs, faults, caves, craters, hydrothermal systems, vents, magma chambers, salt basins, or outcrops.

Features are not required to represent materials that naturally occur throughout a broad region.

---

## Raw Resources Are Natural Feedstocks

Do not confuse a mineral species with a naturally extracted feedstock.

Prefer:

```text
Feature: Iron Ore Deposit
Raw resource: Iron Ore
Composition:
  Hematite
  Magnetite
  Goethite
  Gangue
```

A resource definition identifies the feedstock class. A generated occurrence carries subtype, composition, concentration, quantity, and location.

---

## Preserve Matter Composition

Whenever practical, natural resources should carry meaningful composition rather than behaving as arbitrary tokens.

Future processing should derive outputs from feedstock composition and process capability rather than fixed conversions such as `1 Iron Ore = 1 Iron`.

Preserve matter information at the coarsest level that still creates meaningful decisions.

---

# Planet / Region / Feature Direction

The currently implemented physical hierarchy is:

```text
Planet
  └─ Region
       ├─ Background natural resources
       └─ Feature
            └─ Natural-resource occurrences
```

The long-term hierarchy adds star/system causes above Planet. Do not add deeper geological hierarchy such as province → formation → deposit → ore body until it provides concrete simulation or gameplay benefit.

## Planet

Preserve the current causal pass philosophy. Over time, replace internally invented upstream causes with star/system formation inputs where appropriate.

## Regions

Strengthen coherent local geology/environment from planetary conditions rather than adding more independent labels.

## Features

Feature type, state, temperature/pressure, and possible resources must become increasingly compatible with formation conditions.

Do not allow broad tag matching to become the permanent substitute for geological causality.

---

# Lazy Generation Direction

As detail grows:

1. establish deterministic star/system/world seeds and major state
2. establish planetary/regional material budgets and geological potential
3. resolve major structures when appropriate
4. resolve finer details when surveyed or needed
5. persist discovered/extracted/modified/constructed/named state
6. reconstruct untouched detail deterministically from seed, namespace, and generator version

Lazy generation must resolve pre-existing reality rather than creating resources because the player looked for them.

---

# Long-Term Gameplay Constraints

## Systems Become Components

```text
Primitive Function
→ Apparatus
→ Process
→ Production Line
→ Facility
→ Industrial Network
→ Planetary System
```

A solved system should eventually be reusable as a component of a larger system.

> **Yesterday's factory becomes today's machine.**

## Blueprint / Network-Oriented Interaction

Long-term interaction should emphasize nodes, ports, streams, process diagrams, nested reusable systems, instrumentation, graphs, sensors/controllers, alerts, and composition readouts.

Do not assume a conventional 3D or character-controlled world is required.

## Functional Apparatus

As gameplay is prototyped, favor apparatus composed from meaningful functions such as volume, inputs/outputs, heating/cooling, atmosphere/pressure control, agitation, separation, sensing, and control rather than only predefined magical machine blocks.

Do not over-simulate bolts or construction minutiae that do not create useful decisions.

## Capability-Based Progression

Progression should emerge from capabilities such as temperature, pressure, purity, vacuum, material compatibility, chemical resistance, electrical capability, throughput, measurement accuracy, and control precision.

## Simulate Decisions, Aggregate Busywork

Simulate detail when changing it creates meaningful tradeoffs, debugging, or planning. Aggregate detail that mainly creates repetitive setup work.

---

# Web Application Guidance

For now:

- keep the project web-based
- prefer browser-native JavaScript while sufficient
- preserve ES modules
- keep runtime dependencies minimal
- keep simulation code DOM-independent
- do not migrate frameworks merely for modernization
- do not introduce a backend/database until persistence or server simulation requires one
- avoid ECS, dependency injection, message buses, or enterprise architecture without a concrete need

The current app should remain easy to run through a local HTTP server.

---

# Coding Guidance

When modifying this repository:

1. Inspect the existing implementation first.
2. Read relevant sections of `DESIGN.md` for new gameplay/world systems.
3. Preserve behavior unless the issue explicitly changes it.
4. Keep generation deterministic, small, and composable.
5. Prefer plain serializable data structures.
6. Preserve World / Knowledge / UI separation.
7. Keep definitions separate from occurrences.
8. Route simulation randomness through namespaced seeded RNGs.
9. Keep IDs stable where practical.
10. Maintain `schemaVersion` and `generatorVersion` deliberately.
11. Add/update automated tests when changing simulation contracts.
12. Keep rendering/formatting out of simulation logic.
13. Document non-obvious physical approximations.
14. Prefer data-driven compatibility rules as complexity grows.
15. Avoid speculative systems unrelated to the current issue.
16. Do not entrench planet-local assumptions that block future star/system inputs.
17. When realism conflicts with scope, preserve causal plausibility and meaningful decisions rather than maximal detail.
18. When adding generation complexity, identify the future gameplay consequence.
19. When adding gameplay, preserve matter/energy/state relationships needed by the simulation.

---

# Near-Term Development Order

Unless an issue explicitly changes priority:

1. **Add automated simulation regression tests and executable invariants.**
2. Normalize remaining occurrence/reference inconsistencies exposed by tests.
3. Improve obvious region/feature/resource causal compatibility.
4. **Prototype a minimal playable survey → acquire → analyze → transform loop using the existing world model.**
5. Improve causal regional geology and resource/deposit formation in response to what the gameplay prototype needs.
6. Expand discovery into surveying/knowledge confidence.
7. Introduce a small functional apparatus/process model for material transformation.
8. Prototype reusable/automated solved processes.
9. Add star/system generation inputs when they can materially replace current planet-level approximations and create downstream variation.
10. Expand extraction, processing, automation, and larger industrial/network gameplay iteratively.

Star/system generation is an important future foundation, but it should be introduced when downstream planet generation and gameplay are ready to consume its outputs—not as an isolated astronomy project.
