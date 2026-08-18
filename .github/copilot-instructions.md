# Project Interlink — Copilot Agent Instructions

## Documentation Roles

Use the repository documents for different purposes:

- `DESIGN.md` — canonical long-term game design and intended gameplay direction
- `README.md` — current project state, roadmap, setup, deployment, and inspiration context
- `.github/copilot-instructions.md` — implementation guardrails and current development priorities for coding agents
- `PATCH_NOTES.md` — historical commit-by-commit development record

When implementing new systems, remain compatible with `DESIGN.md`, but **do not implement every future concept merely because it appears there**. Follow the current issue and near-term development order.

---

# Project Direction

Project Interlink is a systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term game should emphasize interconnected physical, chemical, industrial, logistical, and control systems. The interface should increasingly resemble an engineering workspace made from networks, process diagrams, material/energy streams, instrumentation, controllers, dashboards, and reusable nested systems.

World generation exists to create meaningful physical starting conditions for gameplay. **Do not allow development to become generation-only.**

A guiding progression principle is:

> **Yesterday's factory becomes today's machine.**

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

Keep the project web-based, preserve ES modules and relative imports that work from a GitHub Pages project path, prefer browser-native JavaScript while sufficient, and avoid framework/backend migrations without a concrete requirement.

---

# Current Project State

The project has completed both its initial simulation foundation and its first playable material-processing vertical slice.

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
19. physical `MaterialBatch` runtime state derived from generated occurrences
20. batch analysis stored in Knowledge State rather than physical World State
21. reusable `ProcessDefinition` metadata with explicit inputs, outputs, and parameters
22. one DOM-independent magnetic-separation transformation
23. constituent-level and total-mass conservation checks
24. consumed-input protection against material duplication
25. atomic process commits so failed transitions leave World State unchanged
26. stored `ProcessResult` references to physical input/output batch IDs

Current generated-world versions are:

```text
schemaVersion: 3
generatorVersion: 2
```

Schema v3 adds runtime material batches/process results. Generator v2 remains current because the first processing slice did not change deterministic procedural generation rules.

The foundational state architecture is established:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
what has been discovered or measured
        ↓
APPLICATION / UI STATE
selection, display, filters, temporary controls
```

**Do not redo this foundation without a concrete need.**

---

# Current Immediate Priority: Generalize Material/Process Semantics and Prove a Two-Stage Chain

The first material-processing slice is complete. The next implementation target is:

> **Generalize material/process semantics and prove a Crusher → Magnetic Separator chain.**

The intended prototype chain is:

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

This work exists to prove the process contracts that a future graphical blueprint workspace will visualize.

The next implementation should specifically establish:

- processed-material provenance that is distinct from current material state/classification
- at least one minimal physical material property beyond composition, using particle size as the first example
- a second process with different semantics from magnetic separation
- generic process execution/commit infrastructure that does not grow a chain of `if (processId === ...)` branches
- explicit input-port binding semantics suitable for future node connections
- chaining where one process output becomes another process input
- conservation across the entire chain

Do not turn this issue into a factory, logistics, automation, chemistry, or blueprint-editor implementation.

---

# Material Model Direction for the Current Priority

## Composition Remains Physical Truth

A `MaterialBatch` represents physical matter. Component quantities remain the source of truth for modeled composition.

Percentages shown in the UI must be derived from component quantities rather than becoming a second mutable source of truth.

Continue to reject negative, NaN, Infinity, or effectively zero invalid batches where appropriate.

## Separate Provenance From Current Material State

The first prototype made every batch carry a single `sourceOccurrenceId` and `resourceId`. That was acceptable for proving the first transformation, but it must not become the permanent identity model for processed matter.

Processed matter may eventually be:

- crushed or ground material
- concentrates/tailings
- mixtures from multiple feedstocks
- solutions
- alloys
- synthetic compounds/materials
- recycled matter

The next implementation should therefore move toward a clear distinction:

```text
Where did this matter come from?
        ≠
What physical/material state is it in now?
```

A conceptual provenance structure may include ideas such as:

```js
provenance: {
  sourceOccurrenceIds: [...],
  sourceBatchIds: [...],
  createdByProcessRunId: '...'
}
```

The exact schema is **not fixed**. Keep it minimal and serializable. Do not design an elaborate genealogy system beyond what the current two-stage chain needs.

Do not require every future processed batch to pretend it belongs to one natural resource definition merely to satisfy the current prototype API.

## Add One Minimal Physical Property: Particle Size

Crushing should prove that processes can alter physical properties without changing constituent composition.

Use one simple particle-size representation, for example a nominal/maximum particle size in millimeters, if that is the cleanest implementation.

Requirements:

- sample/acquired material receives a deterministic coarse initial value or clearly documented prototype default
- Crushing changes the particle-size property
- Crushing does not change component masses
- relevant output properties propagate intentionally to later processes
- do not build a general thermodynamic/material-property engine in this issue

Exact numeric thresholds are prototype approximations and should be documented as such rather than presented as research-grade mineral-processing data.

---

# Process Architecture Direction

## ProcessDefinition Is Reusable Metadata

Process definitions describe process identity, ports, and parameters. They are not runtime material or UI-node instances.

A process definition may conceptually resemble:

```js
{
  id: 'crushing',
  inputs: [{ id: 'feed', kind: 'material' }],
  outputs: [{ id: 'product', kind: 'material' }],
  parameters: [
    { id: 'targetParticleSizeMm', min: ..., max: ..., defaultValue: ... }
  ]
}
```

and magnetic separation already resembles:

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

Definitions should remain plain data where practical.

Do not put node coordinates, wire geometry, selection state, or other editor-only data into `ProcessDefinition`.

## Generic Process Execution / Specific Process Physics

The current executor still contains magnetic-separation-specific branching. The next step should separate:

```text
GENERIC PROCESS LIFECYCLE
validate definition/input bindings
validate parameters
stage outputs
verify physical contracts
commit atomically
store ProcessResult

        from

PROCESS-SPECIFIC PHYSICS
crushing transformation
magnetic separation partitioning
future process behavior
```

A small executor registry or equivalent dispatch mechanism is appropriate if it keeps specific process behavior outside generic commit code.

Avoid both extremes:

- do not keep adding `if/else` branches for every new process
- do not build an elaborate plugin framework, dependency-injection system, or enterprise command bus for two processes

## Explicit Input-Port Bindings

The future blueprint system will connect an output port to an input port. Begin proving that semantic now.

Prefer an execution API where input batches are associated with explicit input-port identities rather than only passing one unnamed `inputBatchId` forever.

The exact API is flexible, but it should make this relationship natural:

```text
Crusher.product
        ↓
MagneticSeparator.feed
```

Do not build the graphical wire yet.

## Process Chaining

The next issue must prove that a physical output from Crushing can be used as the physical input to Magnetic Separation.

The current utilitarian form-based UI is sufficient. A suitable interaction is:

```text
collect → analyze → crush → inspect/analyze output → separate → inspect outputs
```

Keep simulation/process correctness independent of the UI controls used to trigger it.

## Matter Conservation Is Non-Negotiable

For every modeled constituent:

```text
input component mass
≈
sum of that component across outputs
```

And globally:

```text
input total mass
≈
output total mass
```

Crushing should conserve all components through its single output. Magnetic separation should continue conserving all components across concentrate and tailings.

Add a chain-level regression test proving:

```text
original sampled batch matter
≈
final concentrate matter + final tailings matter
```

within tolerance.

Do not hide missing matter as unexplained efficiency loss.

## Process Failure Must Remain Atomic

A failed process must not:

- consume its input
- create only some outputs
- advance persistent ordinals/counters
- store a partial `ProcessResult`

Preserve and extend the existing staged-then-commit behavior.

---

# Magnetic Separation Should Gain One Physical Requirement

To make the two-stage chain physically meaningful, Magnetic Separation should use the newly introduced particle-size state rather than ignoring Crushing.

A small prototype rule is sufficient, such as:

- reject feed that is too coarse for the current separator, or
- reduce/alter recovery for coarse feed in a clearly documented deterministic way

Prefer the simplest rule that creates a clear reason to crush before separation.

Do not introduce full liberation models, mineral-grain simulation, energy consumption, equipment wear, or research-grade beneficiation equations in this issue.

---

# Knowledge State

Physical truth and player knowledge remain separate.

Batch analysis should continue to reveal physical composition without mutating World State.

Do not make process physics depend on whether the UI happens to display or know a batch. Player-facing workflow may require analysis before manual processing, but the simulation layer should not import Knowledge State merely to calculate physical outcomes.

If processed outputs require re-analysis in the current prototype UI, that is acceptable. Do not overbuild automatic inference/knowledge propagation unless the issue specifically requires it.

---

# Blueprint Interaction Is the Follow-On, Not the Current Task

The browser can support smooth dragging, connections, pan/zoom, snapping, and SVG/Canvas rendering. A framework migration is not required merely for those interactions.

However, **do not build the draggable blueprint workspace during the current two-stage-processing issue**.

After the Crusher → Magnetic Separator chain is working and tested, the next major UI issue may build the first interactive workspace over those semantics:

```text
[Crusher] product ○────────○ feed [Magnetic Separator]
```

At that point node ports and connections should map to the same process definitions/input bindings used by the simulation rather than a parallel editor-only process model.

---

# Existing Simulation Contracts Must Remain Protected

The regression-test foundation is complete and should be extended rather than rebuilt.

Existing tests protect contracts including:

## Determinism

- same root seed + same generator version produces equivalent generated world data
- same seed + same RNG namespace produces the same sequence
- unrelated RNG namespaces remain independent
- simulation/generation modules do not use scattered `Math.random()` calls
- fully specified deterministic processes return equivalent results

## World Integrity

- planet → region references resolve
- region → feature references resolve
- feature/region → resource-occurrence references resolve
- parent/back-reference IDs agree
- generated IDs are unique within tested worlds
- physical features do not contain player discovery truth
- material/process-result references resolve

## Knowledge Integrity

- knowledge records reference real world entities
- discovering a feature changes knowledge only
- analyzing a material batch changes knowledge only
- discovery/analysis does not mutate physical World State

## Numeric / Matter Invariants

- complete compositions sum appropriately where applicable
- no NaN or Infinity values
- physical quantities that cannot be negative are not negative
- sample component masses correspond to source composition
- process constituent masses are conserved
- total process mass is conserved
- consumed input cannot be reused through the normal committed-state path
- failed process commits leave World State unchanged

## CI

`npm test` runs from repository root, and `.github/workflows/test.yml` runs the test suite for pull requests and pushes to `main`.

New work must add focused tests for any new simulation contract.

---

# Required Architectural Direction

## Keep Three State Layers Separate

### World / Simulation State

Contains objective simulated reality:

- future stars/systems when implemented
- planets
- regions
- features
- resource occurrences
- material batches and their physical properties/composition
- process results
- future facilities, process instances, streams, and infrastructure

A physical object exists independently of player knowledge or UI visibility.

### Knowledge State

Contains what the player knows or estimates about physical objects.

A longer-term discovery path may include:

```text
Unknown
→ Anomaly Detected
→ Identified
→ Composition Estimated
→ Quantity Estimated
→ Characterized
```

Observation reveals existing physical truth; it does not spawn favorable resources or alter matter.

### UI State

Contains presentation-only state such as selected entity, expanded panels, filters, active views, temporary control values, graph viewport, and future blueprint node positions when those positions are diagram layout rather than physical location.

UI state must not become physical simulation truth.

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

Prefer plain serializable data structures over unnecessary classes.

---

## Deterministic Namespaced RNG

All simulation randomness should flow through seeded deterministic generators when randomness is actually required.

Use independent namespaces/substreams for generation. A physical transformation with fully specified inputs and parameters should generally remain deterministic unless stochastic behavior creates a concrete gameplay need.

UI-only random root-seed creation is acceptable; simulation logic should not use uncontrolled randomness.

---

## Versioning

Generated/runtime worlds carry:

```text
schemaVersion
generatorVersion
```

Increment and document these deliberately when serialized shape or deterministic generation rules materially change.

The next material/provenance/process-result shape changes are likely to require a `schemaVersion` bump. Do **not** bump `generatorVersion` merely because player-created process/runtime state changes.

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

## Preserve Matter Composition

Whenever practical, natural resources and player-created material should carry meaningful composition rather than behave as arbitrary tokens.

Processing should derive outputs from feed composition, physical state, process capability, and operating parameters rather than fixed conversions such as `1 Iron Ore = 1 Iron`.

Preserve matter information at the coarsest level that still creates meaningful decisions.

> **Abstract the history. Preserve the resulting matter.**

---

# Development Must Validate Gameplay Early

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

The process-chain and later blueprint gameplay should be used to discover what future geology/resource/survey properties are actually needed rather than expanding generation detail speculatively.

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

Do **not** implement a full star/system simulator merely because it is a future requirement. Current planet-local assumptions are acceptable scaffolding while downstream gameplay semantics are being established.

Do not entrench Sun-like or independently rolled planet assumptions so deeply that future star/system inputs cannot replace them.

The design target is causally plausible and gameplay-useful, not research-grade astrophysics.

---

# Technology / Scope Guardrails

- keep the project web-based
- keep the runnable application at repository root unless a deliberate deployment/build change requires otherwise
- keep `index.html` suitable as the root static entry point
- prefer browser-native JavaScript while sufficient
- preserve ES modules and GitHub Pages-compatible relative imports
- keep runtime dependencies minimal
- keep simulation/process code DOM-independent
- do not migrate frameworks merely for modernization
- do not introduce a backend/database until persistence or server simulation requires one
- avoid ECS, dependency injection, message buses, or enterprise architecture without a concrete need
- do not implement multiplayer in near-term simulation issues
- do not introduce continuous factories, logistics networks, power networks, full chemistry, or automation unless the current issue specifically requires them

---

# Coding Guidance

When modifying this repository:

1. Inspect the existing implementation first.
2. Read relevant sections of `DESIGN.md` for new gameplay/world systems.
3. Preserve behavior unless the issue explicitly changes it.
4. Keep generation deterministic, small, and composable.
5. Prefer plain serializable data structures.
6. Preserve World / Knowledge / UI separation.
7. Keep definitions, natural occurrences, runtime material batches, provenance, and process executions conceptually distinct.
8. Route simulation randomness through namespaced seeded RNGs when randomness is required.
9. Keep IDs stable where practical.
10. Maintain `schemaVersion` and `generatorVersion` deliberately.
11. Add/update automated tests when changing simulation contracts.
12. Keep rendering/formatting out of simulation and transformation logic.
13. Document non-obvious physical approximations.
14. Prefer small data-driven response/compatibility rules as complexity grows.
15. Avoid speculative systems unrelated to the current issue.
16. Do not entrench planet-local assumptions that block future star/system inputs.
17. When realism conflicts with scope, preserve causal plausibility and meaningful decisions rather than maximal detail.
18. When adding generation complexity, identify the gameplay consequence.
19. When adding gameplay, preserve matter/energy/state relationships needed by the simulation.
20. Keep paths and tooling consistent with the root application layout.
21. Do not put physical material truth into UI-only state.
22. Do not put transformation math inside DOM event handlers.
23. Conserve modeled matter explicitly; do not hide losses by deleting mass.
24. Keep generic process lifecycle code separate from process-specific physics.
25. Use explicit process port identities that can later map to blueprint connections.
26. Do not make one original `resourceId`/`sourceOccurrenceId` the permanent identity of all processed matter.
27. Keep process commits atomic.
28. Do not build the draggable blueprint editor during the current two-stage-processing task.

---

# Near-Term Development Order

Unless an issue explicitly changes priority:

1. **Generalize material/process semantics and prove a Crusher → Magnetic Separator chain.**
2. **Build the first interactive blueprint workspace over the proven process contracts** — node dragging, explicit ports, connections, pan/zoom, compatible-port feedback, and stream/batch inspection.
3. Use the process-chain/blueprint gameplay to identify the concrete geology, resource-property, and surveying data the player actually needs.
4. Improve causal regional geology/resource/deposit properties and richer surveying/knowledge confidence in response to those needs.
5. Generalize the functional apparatus model and material-stream/throughput semantics.
6. Add continuous processing and then automation/control incrementally.
7. Add star/system generation inputs when they can materially replace current planet-level approximations and create downstream variation.
8. Add reusable/nested solved systems so mature factories can become higher-level components.
9. Expand extraction, depletion, logistics, processing depth, and larger industrial/network gameplay iteratively.

Star/system generation remains an important future foundation, but it should be introduced when downstream planet generation and gameplay are ready to consume its outputs—not as an isolated astronomy project.