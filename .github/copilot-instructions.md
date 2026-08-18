# Project Interlink — Copilot Agent Instructions

## Documentation Roles

Use the repository documents for different purposes:

- `DESIGN.md` — canonical long-term game design and intended gameplay direction
- `README.md` — current project state, roadmap, setup, deployment, and inspiration context
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

# Current Repository Layout

The runnable web application lives directly at repository root:

```text
Project-Interlink/
├── index.html
├── styles.css
├── package.json
├── src/
│   ├── app.js
│   ├── core/
│   ├── data/
│   └── generator/
├── tests/
├── DESIGN.md
├── README.md
├── PATCH_NOTES.md
└── .github/
    ├── copilot-instructions.md
    └── workflows/
        └── test.yml
```

**Do not recreate a `planet-generator/` wrapper directory.** New application source, tests, and project-level tooling should assume the repository root unless a future issue deliberately changes the layout.

The root layout is intentionally compatible with GitHub Pages configured from `main` → `/ (root)`.

---

# Current Project State

The original planet-generation tech demo has been promoted into the first real Interlink simulation foundation.

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
14. regional and feature resources normalized into stable `world.resourceOccurrences`
15. basic physical/resource compatibility guardrails for obvious feature types
16. automated `node:test` regression coverage
17. deterministic broad multi-seed smoke testing
18. GitHub Actions CI for pull requests and `main`

Current generated-world versions are:

```text
schemaVersion: 2
generatorVersion: 2
```

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

# Current Immediate Priority: First Playable Matter-Processing Slice

The current implementation target is:

> **Issue #8 — Prototype first playable material processing loop**

The next playable chain is intentionally narrow:

```text
Survey / discover an existing resource occurrence
    ↓
Acquire a small sample
    ↓
Analyze its composition
    ↓
Run one parameter-driven separation / transformation
    ↓
Inspect output batches and matter balance
```

The architectural bridge should be conceptually:

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

This issue should prove that generated world matter can enter gameplay without prematurely building the complete factory game.

---

# Transformations Come Before the Full Blueprint Interaction Layer

The eventual blueprint/network workspace remains a core interaction goal, but **do not build the draggable blueprint canvas before the underlying process semantics are proven**.

The project first needs stable meanings for:

- physical material batches
- process inputs
- process outputs
- process parameters
- transformation results
- matter conservation
- runtime process applicability/validation

For the current gameplay slice, normal HTML controls are sufficient:

```text
select occurrence
collect sample
analyze
select process
adjust parameter
run
inspect outputs
```

A later blueprint editor should become a graphical way to construct and inspect the same underlying process model.

The development rule is:

```text
prove matter
    ↓
prove transformations
    ↓
prove process semantics
    ↓
then build the blueprint interaction layer
```

Do not create a parallel “editor-only” process representation that later has to be reconciled with simulation state.

---

# Material and Transformation Architecture for the Current Slice

## MaterialBatch Is Physical State

A discrete acquired sample should be represented as plain serializable physical state, conceptually similar to:

```js
{
  id: 'batch-...',
  sourceOccurrenceId: '...',
  status: 'available',
  componentsKg: {
    hematite: 4.8,
    magnetite: 2.1,
    goethite: 0.9,
    quartzAndGangue: 2.2,
  }
}
```

Exact naming is flexible.

Requirements:

- physical batches must **not** live only in UI state
- batch identity should be stable while the batch exists
- component quantities should be the physical source of truth
- percentages shown to the player should be derived from those quantities
- no negative, NaN, or Infinity component quantities
- do not add speculative future properties unless the current process requires them

If material batches are added to serialized World / Simulation State, bump `schemaVersion` deliberately.

## Sampling Is Not Full Extraction Yet

The first acquisition step is a sampling bridge into gameplay.

Do not invent precise reserve tonnage from the current qualitative quantity classes merely to support depletion.

Sampling must:

- use an already-existing `ResourceOccurrence`
- derive the sample from its generated composition
- never create a favorable occurrence because the player asked for one
- create actual material state that cannot later be duplicated by repeatedly processing the same batch

A future issue can add extraction rate, reserve mass, depletion, replenishment, access cost, and logistics once the world model supports those concepts honestly.

## ProcessDefinition Is a Reusable Definition

Process definitions are not runtime material objects.

A conceptual shape may include:

```js
{
  id: 'magnetic-separation',
  inputs: [{ id: 'feed', kind: 'material' }],
  outputs: [
    { id: 'concentrate', kind: 'material' },
    { id: 'tailings', kind: 'material' }
  ],
  parameters: [
    { id: 'fieldStrength', min: 0, max: 1 }
  ]
}
```

The exact schema is not fixed.

However:

- inputs and outputs should be explicit enough to become future blueprint ports
- parameters should be explicit enough to become future apparatus/controller settings
- definitions belong in data/simulation layers, not DOM code
- do not add arbitrary node-layout or wire-position data to the process definition

## Process Execution Must Be DOM-Independent

Transformation logic must be testable directly from Node.

Prefer a separation such as:

```text
process definition + input batch + parameters
        ↓
pure/controlled transformation logic
        ↓
ProcessResult
```

UI event handlers should call process functions; they should not contain the process math.

## Matter Conservation Is a Required Contract

For every modeled constituent:

```text
input component mass
≈
sum of that component across all outputs
```

And globally:

```text
input total mass
≈
output total mass
```

Use sensible floating-point tolerances.

Do not represent unexplained process inefficiency by deleting matter. A future process that emits gas, residue, sludge, dust, or another waste stream should eventually expose that matter explicitly.

For the first slice, prefer a closed separation with simple explicit outputs.

## Prevent Duplication

A committed process run must not leave the original physical input available as though nothing happened.

A simple status transition such as:

```text
input batch: available → consumed
output batches: created as available
```

or an equivalent immutable state transition is sufficient for the prototype.

This does not require a full inventory/logistics system.

---

# Existing Simulation Contracts Must Remain Protected

The regression-test foundation is complete and should now be extended rather than rebuilt.

Existing tests protect contracts such as:

## Determinism

- same root seed + same generator version produces equivalent world data
- same seed + same RNG namespace produces the same sequence
- unrelated RNG namespaces remain independent
- simulation/generation modules do not use scattered `Math.random()` calls

## World Integrity

- planet → region references resolve
- region → feature references resolve
- feature/region → resource-occurrence references resolve
- parent/back-reference IDs agree
- generated IDs are unique within tested worlds
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

Existing guardrails prevent obvious contradictions for key feature types such as Aquifer, Gas Reservoir, Magma Chamber, and Ice Body, and keep biological resources gated by biological conditions.

## CI

`npm test` runs from repository root, and `.github/workflows/test.yml` runs the test suite for pull requests and pushes to `main`.

New gameplay work must add tests for its own physical contracts, especially:

- sample mass/component consistency
- deterministic process results
- constituent-level conservation
- total-mass conservation
- process applicability and parameter validation
- prevention of consumed-batch reuse through the normal committed-state path

---

# Development Must Validate the Gameplay Loop Early

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

When adding world-generation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

When adding gameplay, ask:

> **What physical world state does this act on?**

The current processing slice should be used to discover what future geology/resource properties are actually needed rather than expanding generation detail speculatively.

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

Do **not** implement a full star/system simulator merely because it is a future requirement. Current planet-local assumptions are acceptable scaffolding while downstream gameplay semantics are being established.

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

### World / Simulation State

Contains objective simulated reality:

- stars/systems/planets when those exist
- regions
- features
- resource occurrences
- material batches
- material compositions
- physical quantities
- future facilities, processes, material streams, and infrastructure

A physical object exists independently of player knowledge or UI visibility.

### Knowledge State

Contains what the player knows or estimates about world objects and future player-created matter.

A future discovery path may include:

```text
Unknown
→ Anomaly Detected
→ Identified
→ Composition Estimated
→ Quantity Estimated
→ Characterized
```

Discovery or analysis reveals existing physical truth; it must not create favorable resources because the player searched or measured.

### UI State

Contains presentation-only state such as selected entity, expanded panels, filters, active views, graph viewport, temporary control values, and future blueprint node positions where those positions are merely diagram layout.

UI state must not become physical simulation truth.

---

## Root World State

Keep the world plain and serializable.

Do not let the current single planet become the permanent conceptual root of the game. When star/system entities are added, evolve the root schema intentionally rather than nesting everything into the planet object.

Stable ID references are preferred over deeply nested mutable object graphs for permanent state.

Player-created physical material may eventually require new indexed maps such as `materialBatches`; add them intentionally rather than hiding physical state inside `app.js` locals.

---

## Definitions vs Occurrences vs Runtime Matter

Keep these concepts distinct:

```text
ResourceDefinition
Iron Ore
```

```text
ResourceOccurrence
where naturally occurring Iron Ore exists
```

```text
MaterialBatch
a physical quantity acquired from an occurrence or produced by a process
```

Likewise:

```text
ProcessDefinition
reusable process rules / ports / parameters
```

is different from:

```text
ProcessResult / future ProcessInstance
a particular execution or operating system
```

Prefer plain data definitions over unnecessary classes.

---

## Deterministic Namespaced RNG

All simulation randomness should flow through seeded deterministic generators when randomness is actually required.

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

A physical transformation with fully specified inputs/parameters should generally be deterministic unless stochastic behavior creates a concrete gameplay need.

UI-only random root-seed creation is acceptable; simulation logic should not use uncontrolled randomness.

---

## Versioning

Generated worlds carry:

```text
schemaVersion
generatorVersion
```

Increment and document these deliberately when serialized shape or deterministic generation rules materially change.

Adding a new runtime physical-state collection may require a schema bump; changing only UI layout does not.

Do not build a full migration system before persistence requires one.

---

# Dependency Direction

Prefer:

```text
DATA DEFINITIONS
      ↓
SIMULATION / GENERATION / PROCESS LOGIC
      ↓
WORLD / PHYSICAL STATE
      ↓
PLAYER KNOWLEDGE
      ↓
UI / VISUALIZATION
```

Generation must not depend on DOM state. World truth must not depend on discovery. Process physics must not depend on rendering. Observing something must not change physical generation.

---

# Core Simulation Philosophy

## Generate Causes, Not Independent Random Results

Current downstream generation chain:

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

Both regional and feature resource instances now use stable `ResourceOccurrence` identity in World State.

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

A resource definition identifies the feedstock class. A generated occurrence carries subtype, composition, concentration, quantity information, and location.

A material batch acquired from that occurrence should carry the actual constituent quantities being acted on by gameplay.

---

## Preserve Matter Composition

Whenever practical, natural resources and player-created material should carry meaningful composition rather than behaving as arbitrary tokens.

Processing should derive outputs from feedstock composition and process capability rather than fixed conversions such as `1 Iron Ore = 1 Iron`.

Preserve matter information at the coarsest level that still creates meaningful decisions.

Do not discard composition merely because a UI or blueprint node would be easier to implement with generic item counts.

---

# Planet / Region / Feature Direction

The currently implemented physical hierarchy is:

```text
Planet
  └─ Region
       ├─ Background resource occurrences
       └─ Feature
            └─ Resource occurrences
```

The long-term hierarchy adds star/system causes above Planet and player-created material/process systems downstream.

Do not add deeper geological hierarchy such as province → formation → deposit → ore body until it provides concrete simulation or gameplay benefit.

## Planet

Preserve the current causal pass philosophy. Over time, replace internally invented upstream causes with star/system formation inputs where appropriate.

## Regions

Strengthen coherent local geology/environment from planetary conditions rather than adding more independent labels.

## Features

Feature type, state, temperature/pressure, and possible resources must become increasingly compatible with formation conditions.

Current obvious compatibility guardrails are only a first pass. Do not allow broad tag matching to become the permanent substitute for geological causality.

## Resource Detail

Structured constituent-level composition currently exists only for some resource types. Expand composition/property detail when gameplay demonstrates a need rather than filling the entire catalog speculatively.

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

The future blueprint editor is primarily an **interaction/visual-composition layer over simulation semantics**. Diagram positions should not be confused with physical positions unless a future subsystem explicitly models physical layout.

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
- keep the runnable application at repository root unless a deliberate future deployment/build change requires otherwise
- keep `index.html` suitable as the root static entry point
- prefer browser-native JavaScript while sufficient
- preserve ES modules and relative imports that work on GitHub Pages project paths
- keep runtime dependencies minimal
- keep simulation/process code DOM-independent
- do not migrate frameworks merely for modernization
- do not introduce a backend/database until persistence or server simulation requires one
- avoid ECS, dependency injection, message buses, or enterprise architecture without a concrete need

The current app should remain easy to run from repository root through a local HTTP server and should remain deployable through GitHub Pages from `main` → `/ (root)`.

A future smooth blueprint editor can be implemented in the browser; framework migration is not required merely to support dragging, connections, pan/zoom, or SVG/Canvas rendering.

---

# Coding Guidance

When modifying this repository:

1. Inspect the existing implementation first.
2. Read relevant sections of `DESIGN.md` for new gameplay/world systems.
3. Preserve behavior unless the issue explicitly changes it.
4. Keep generation deterministic, small, and composable.
5. Prefer plain serializable data structures.
6. Preserve World / Knowledge / UI separation.
7. Keep definitions, natural occurrences, runtime material batches, and process executions conceptually distinct.
8. Route simulation randomness through namespaced seeded RNGs when randomness is required.
9. Keep IDs stable where practical.
10. Maintain `schemaVersion` and `generatorVersion` deliberately.
11. Add/update automated tests when changing simulation contracts.
12. Keep rendering/formatting out of simulation and transformation logic.
13. Document non-obvious physical approximations.
14. Prefer data-driven compatibility/response rules as complexity grows.
15. Avoid speculative systems unrelated to the current issue.
16. Do not entrench planet-local assumptions that block future star/system inputs.
17. When realism conflicts with scope, preserve causal plausibility and meaningful decisions rather than maximal detail.
18. When adding generation complexity, identify the gameplay consequence.
19. When adding gameplay, preserve matter/energy/state relationships needed by the simulation.
20. Keep paths and tooling consistent with the root application layout.
21. Do not put physical material truth into UI-only state.
22. Do not put transformation math inside DOM event handlers.
23. Conserve modeled matter explicitly; do not hide losses by deleting mass.
24. Design current process inputs/outputs/parameters so they can become future blueprint ports/settings without requiring a separate editor-only process model.
25. Do not build the full draggable blueprint editor during Issue #8.

---

# Near-Term Development Order

Unless an issue explicitly changes priority:

1. **Prototype the first playable survey → sample → analyze → transform material loop.**
2. Stabilize `MaterialBatch`, process input/output, parameter, result, and conservation semantics based on that prototype.
3. Improve causal regional geology and resource/deposit properties in response to what the gameplay actually needs.
4. Expand discovery into richer surveying and knowledge confidence.
5. Generalize the functional apparatus/process model and material-stream semantics.
6. **Build the first interactive blueprint workspace over stable process semantics** — node dragging, ports, connections, pan/zoom, and stream inspection.
7. Add star/system generation inputs when they can materially replace current planet-level approximations and create downstream variation.
8. Add continuous processing, automation, and reusable/nested solved systems incrementally.
9. Expand extraction, logistics, processing depth, and larger industrial/network gameplay iteratively.

Star/system generation is an important future foundation, but it should be introduced when downstream planet generation and gameplay are ready to consume its outputs—not as an isolated astronomy project.