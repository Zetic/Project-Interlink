# Project Interlink — Copilot Agent Instructions

## Documentation Roles

Use repository documents for different purposes:

- `DESIGN.md` — canonical long-term game design and intended gameplay direction
- `README.md` — current project state, roadmap, setup, and near-term design decisions
- `.github/copilot-instructions.md` — implementation guardrails and current priorities for coding agents
- `PATCH_NOTES.md` — historical development record

Remain compatible with `DESIGN.md`, but **do not implement every future concept merely because it appears there**. Follow the active issue and current development order.

---

# Project Direction

Project Interlink is a systems-driven simulation and management game.

> **Everything is a system, and every system can become a component of a larger system.**

A guiding progression principle is:

> **Yesterday's factory becomes today's machine.**

World generation exists to create meaningful physical starting conditions for gameplay. Do not allow development to become generation-only.

Automation is a core interaction principle from the beginning, not only an optimization added late in progression.

Player-facing systems should increasingly teach:

```text
sources
→ ports
→ streams
→ buffers
→ processes
→ constraints
→ feedback
→ automation
```

rather than repetitive action buttons.

---

# Repository / Platform Guardrails

The runnable application lives at repository root.

Keep the project web-based and preserve:

- HTML/CSS
- vanilla JavaScript while sufficient
- ES modules
- relative imports compatible with GitHub Pages project paths
- DOM-independent simulation/process logic

Do not introduce a framework, backend, database, ECS, dependency-injection system, or large infrastructure layer without a concrete requirement.

Do not recreate the removed `planet-generator/` wrapper directory.

---

# Foundational State Architecture

The established architecture is:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
what the player has discovered or measured
        ↓
APPLICATION / UI STATE
selection, layout, panels, temporary controls
```

Do not redo this separation without a concrete need.

Physical state must not live only in DOM elements or UI state.

Knowledge actions should reveal/estimate physical truth rather than mutate that truth merely because the player learned it.

---

# Current Simulation Foundation

The current processing branch establishes:

- `schemaVersion: 4`
- `generatorVersion: 2`
- physical `MaterialBatch` state
- provenance separated from processed-material identity
- particle-size state
- explicit process input bindings
- reusable `ProcessDefinition` metadata
- Crushing
- Magnetic Separation
- process-specific executors behind generic lifecycle/commit infrastructure
- explicit input/output port contracts
- constituent-level and total-mass conservation
- atomic process transitions
- strict parameter/input/output validation
- deterministic two-stage chain tests

Do not regress these contracts while introducing continuous flow or blueprint interaction.

---

# Matter Rules

## Quantities are physical truth

For stored material, constituent quantities are authoritative.

Percentages displayed to the player are derived values and should not become a second mutable source of truth.

Continue rejecting invalid negative, NaN, Infinity, and effectively zero physical quantities where appropriate.

## Provenance is not material identity

Keep a distinction between:

```text
Where did this matter come from?
        ≠
What physical/material state is it in now?
```

Do not force processed matter to retain one natural `resourceId` merely because the raw sample originally came from that resource type.

## Abstract history, preserve matter

Use this rule:

> **Abstract the history. Preserve the resulting matter.**

Do not retain every transfer event or tiny historical sub-batch if physically mixed matter can be represented by an aggregate state without losing gameplay-relevant information.

---

# Batch / Storage / Stream Semantics

This is an important long-term contract.

## MaterialBatch is not a per-tick flow object

Do **not** implement continuous flow by creating many `MaterialBatch` objects every simulation tick.

A batch should represent a meaningful discrete/stored amount of matter when that representation has a physical reason, such as a sample, package, cargo lot, or other discrete quantity.

Bulk industrial matter should normally be associated with a physical holder.

## Physical storage owns bulk matter

Examples include:

- hopper
- bin
- silo
- tank
- pressure vessel
- stockpile
- cargo container/vehicle
- machine input/output buffer

There should not be a magical free-floating bulk inventory dimension.

If a large amount of material exists, some physical world/system entity should hold it.

External storage should be capable of becoming a blueprint node with explicit ports and finite capacity.

Machines may also have small internal input/output buffers when that improves physical coherence without forcing the player to place a separate external container around every apparatus.

## MaterialStream represents rate + state

Continuous streams should be mathematical flow-state objects, not sequences of tiny batches.

Prefer constituent mass-flow rates as the physical source of truth, conceptually:

```js
{
  componentMassFlowKgPerSecond: {
    hematite: ...,
    magnetite: ...,
    gangue: ...
  },
  particleSizeMm: ...
}
```

Total flow may be derived from constituent flow rates.

Additional stream properties such as phase, temperature, pressure, moisture, etc. should only be introduced when an active issue needs them.

Do not prematurely build a universal material-property framework.

## Containers integrate streams over time

A storage entity should accumulate/remove matter through flow over a simulation timestep.

Conceptually:

```text
stored quantity += inflow * dt
stored quantity -= outflow * dt
```

If material is physically mixed in one container, aggregate the resulting physical contents rather than permanently keeping every historical transfer as a separate simulated object.

---

# Throughput / Backpressure Direction

The intended industrial model should allow simple physical constraints to create system behavior naturally.

Example:

```text
Miner capacity:   5 kg/s
Crusher capacity: 4 kg/s
```

With a finite hopper between them, the hopper accumulates 1 kg/s until full.

A full output buffer may block a process. A blocked process may stop consuming its input, which can eventually block upstream equipment.

Prefer these general capacity/availability rules over machine-specific special cases.

For a process timestep, the amount processed should conceptually be limited by things such as:

```text
input available
process throughput capacity × dt
output free capacity
```

Do not overbuild transport physics, conveyor routing, or fluid-network pressure in the first stream milestone unless explicitly required.

---

# Raw Resource Collection Direction

The current `Gather X kg` action is prototype/debug scaffolding.

Do not treat manual gathering as the normal final production loop.

The intended automated production chain begins conceptually as:

```text
ResourceOccurrence
        ↓
Extraction Interface / Apparatus
        ↓
Material Stream
        ↓
Container / Buffer
        ↓
Processing Network
```

The resource occurrence is physical world matter, not a generic infinite crafting-token node.

Extraction apparatus should eventually vary by physical source type, e.g. hard-rock mining, wells, pumps, atmospheric intake, etc.

Current resource occurrence quantities are not yet precise reserve masses. Until depletion is deliberately implemented, any automated extraction rate/source behavior must be clearly documented as prototype behavior and must not invent false geological precision.

---

# Discovery / Survey Direction

The current `Discover Feature` button is also prototype/debug scaffolding.

The final player path should move toward discovery as an automated/system process:

```text
Unknown world
    ↓
Survey apparatus/network
    ↓
Knowledge improves
    ↓
Features/resources become known
    ↓
Measurement confidence improves
```

Do not remove the existing discovery/debug controls until a replacement player-facing survey path exists, but do not build new player progression around repeated manual discovery clicks.

---

# Interface Direction

The current seed/planet/region list and button/form interface remains valuable as a developer/debug view.

It is **not** the intended long-term player interface.

The player-facing UI should begin moving toward hierarchical workspaces:

```text
Star/System (later)
    ↓
Planet Workspace
    ↓
Region Workspace
    ↓
Site / Facility Workspace
    ↓
Process / Apparatus Blueprint
```

Common workspace interaction primitives may include:

- selection
- inspection
- pan/zoom
- node-like visual entities
- drill-down / enter
- breadcrumbs

But visual similarity must not collapse distinct simulation concepts.

A Region is not a process node. A planet is not a machine. A container is not merely UI layout.

Use shared visual/workspace infrastructure where useful, while preserving semantic entity types.

## Debug UI must remain available

Do not delete the existing prototype UI during the first real-interface milestone.

Retain it behind a clear developer/debug view or mode for:

- seed generation/control
- raw generated state
- region/feature inspection
- Knowledge State inspection
- batch/process result inspection
- validation/debug actions

This makes it possible to verify player-facing behavior against underlying physical truth.

---

# Simulation Time vs Rendering

Do not couple industrial simulation updates to browser rendering FPS.

The player interface may render/animate at `requestAnimationFrame` speed while physical simulation runs at a fixed or otherwise controlled timestep.

For the first continuous-flow prototype, a simple deterministic fixed timestep is preferred.

Avoid recalculating simulation simply because a blueprint node is being dragged visually.

Do not optimize prematurely with workers/Wasm/complex dirty-graph scheduling, but preserve a clean boundary so those techniques remain possible later.

---

# Current Immediate Priority

After the two-stage material-process PR is complete, the next milestone is:

> **Build the first hierarchical player workspace and automated resource-flow vertical slice while preserving the existing interface as a developer/debug view.**

The intended prototype should demonstrate this player-facing flow:

```text
Planet Workspace
    ↓ enter Region
Region Workspace
    ↓ enter resource/site
Engineering Workspace

Resource Occurrence
        ↓
Extractor
        ↓ material stream
Container
        ↓ material stream
Crusher
        ↓ material stream
Container
        ↓ material stream
Magnetic Separator
       ├────────→ Concentrate Container
       └────────→ Tailings Container
```

This milestone is meant to prove the interaction/simulation language, not finish industrial gameplay.

---

# First Hierarchical Workspace Requirements

For the next interface issue, prefer a deliberately small coherent implementation.

## World navigation

Provide a player-facing workspace shell with:

- a main canvas/workspace area
- an inspector/details area
- breadcrumbs/back navigation
- Planet workspace containing Region entities
- ability to enter a Region workspace
- Region workspace capable of presenting known/unknown features or resource sites from existing World/Knowledge state

Do not invent fake process ports on Regions.

Generated layout may be simple/deterministic. Do not build a map-generation/rendering engine merely for visual polish.

## Engineering workspace

Provide the first real process-node workspace with enough interaction to prove:

- draggable engineering nodes
- explicit ports
- connection creation/removal
- compatibility checks sufficient for implemented material ports
- pan/zoom if practical within scope
- selection + inspector
- simulation connections mapped to actual simulation semantics rather than a parallel editor-only graph

A saved UI position belongs to application/blueprint layout state, not physical simulation state unless an active design explicitly makes physical position meaningful.

## Automated chain

Do not use a player-facing `Gather` button to feed the engineering chain.

Introduce the smallest viable automated source/extractor/stream/container semantics necessary to feed the existing Crusher and Magnetic Separator process physics.

It is acceptable for extractor rate/depletion details to be prototype approximations while exact resource reserves remain unmodeled, provided the limitation is explicit and no arbitrary reserve truth is invented.

## Storage nodes

Implement a minimal finite-capacity solid-material container/hopper node suitable for this chain.

Its stored contents should be aggregate physical matter.

It should have explicit material input/output ports.

Do not implement tanks, pressure vessels, phase behavior, corrosion, thermal ratings, or generalized container classes unless required by the active issue.

## Streams

Implement a minimal solid-material stream representation using continuous rates.

Do not allocate one batch per tick.

Preserve modeled constituents and relevant physical state such as particle size.

## Capacity / blocking

Introduce enough rate/capacity behavior to demonstrate a meaningful buffer/bottleneck.

At minimum, finite storage should prevent unlimited accumulation and should constrain/stop upstream/downstream flow coherently when full/empty.

Do not implement full conveyor/pathfinding/logistics routing.

---

# Existing Process Contracts Must Survive

Continuous processing must continue to respect the existing process definitions and physical rules.

Do not create a separate unrelated set of “blueprint recipes” that duplicates process behavior.

The blueprint workspace should visualize/use the same process identity/port/parameter semantics already proven by the batch prototype.

Where discrete and continuous execution differ, share transformation logic where practical and keep the physical relationship clear.

For example, the same magnetic-separation behavior may apply to:

```text
Discrete: 10 kg feed → output kg quantities
Continuous: 10 kg/s feed → output kg/s rates
```

Do not silently allow continuous execution to violate constituent conservation merely because it uses rates.

---

# Testing Expectations for the Next Milestone

Keep `npm test` fast and deterministic.

At minimum, new continuous-flow/workspace work should test simulation contracts such as:

- stream constituent flow rates are finite/non-negative
- stream total flow derives consistently from constituent rates
- container contents remain finite/non-negative and do not exceed capacity within tolerance
- material entering/leaving storage is conserved
- crusher continuous transformation preserves constituent mass flow
- magnetic separation continuous transformation conserves constituent mass flow across outputs
- particle-size rules remain enforced
- a simple source → extractor → container → crusher → container → separator chain behaves deterministically for fixed inputs/timestep
- a full container blocks or limits further inflow coherently
- an empty input container prevents downstream processing
- simulation tick functions remain DOM-independent
- UI node movement does not mutate physical material state
- existing deterministic world-generation and batch/process tests remain green

Do not make browser/DOM interaction tests the only protection for physical simulation logic.

---

# Out of Scope for the First Workspace / Stream Issue

Unless explicitly required, do not add:

- complete surveying system
- precise geological reserve/depletion simulation
- conveyors/pathfinding
- vehicle logistics
- power networks
- thermodynamics
- fluids/gases
- pressure/vacuum
- chemistry/reaction networks
- wear/maintenance
- full particle-size distributions
- research/progression tree
- sensors/controllers/PLC logic
- arbitrary multi-feed process graphs beyond what the first chain needs
- nested blueprints
- factory aggregation/collapse logic
- multiplayer/backend/database
- framework migration
- star/system generation
- high-performance worker/Wasm infrastructure
- polished final art/visual effects

Keep the issue focused on proving the first authentic Interlink workspace and automated material-flow semantics.

---

# Longer-Term Performance Direction

The architecture should remain compatible with large networks by favoring aggregate state:

```text
streams = rates
containers = quantities
processes = transformations/capacities
```

Future optimization may include:

- simulation frequency independent from rendering
- dependency/dirty-subgraph recalculation
- Web Workers for heavy simulation
- aggregated simulation of mature nested systems
- Wasm only if profiling justifies it

Do not implement these prematurely.

The nested-system design may eventually provide a natural optimization strategy: detailed solved systems can behave as higher-level components when the player is operating at a larger scale.

---

# Development Philosophy

For simulation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

For gameplay features, ask:

> **What physical world state does this act on?**

Prefer small vertical slices that prove real contracts over large speculative frameworks.

Do not add complexity merely because a future design might someday need it.