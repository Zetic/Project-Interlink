# Project Interlink — Copilot Agent Instructions

## Documentation Roles

Use repository documents for different purposes:

- `DESIGN.md` — canonical long-term game design and intended gameplay direction
- `README.md` — current project state, roadmap, and near-term architectural decisions
- `.github/copilot-instructions.md` — implementation guardrails and active coding priorities
- `PATCH_NOTES.md` — historical development record

Remain compatible with `DESIGN.md`, but do **not** implement every future concept merely because it appears there. Follow the active issue and current development order.

---

# Project Direction

Project Interlink is a systems-driven simulation and management game.

> **Everything is a system, and every system can become a component of a larger system.**

> **Yesterday's factory becomes today's machine.**

Automation is a core interaction principle from the beginning.

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

World generation exists to create meaningful physical starting conditions for gameplay. Do not allow development to become generation-only.

---

# Repository / Platform Guardrails

The runnable app lives at repository root.

Keep the project web-based and preserve:

- HTML/CSS
- vanilla JavaScript while sufficient
- ES modules
- relative imports compatible with GitHub Pages project paths
- DOM-independent simulation/process logic

Do not introduce a framework, backend, database, ECS, dependency-injection framework, WebAssembly, or large infrastructure layer without a concrete requirement.

Do not recreate the removed `planet-generator/` wrapper directory.

---

# Foundational State Architecture

Preserve the established separation:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
what the player has discovered or measured
        ↓
APPLICATION / UI STATE
selection, visual layout, panels, temporary interaction state
```

Physical state must not live only in DOM objects.

Knowledge actions should reveal/estimate physical truth rather than mutate that truth merely because the player learned it.

UI layout such as node position remains application state unless an explicit gameplay rule makes physical position meaningful.

---

# Current Implemented Foundation

After the first continuous-workspace milestone, `main` includes:

- `schemaVersion: 4`
- `generatorVersion: 2`
- deterministic seeded world generation
- World / Knowledge / UI state separation
- `MaterialBatch` discrete physical lots
- provenance separated from material identity
- particle-size state
- reusable `ProcessDefinition` metadata
- Crushing and Magnetic Separation
- shared discrete/continuous process physics
- strict batch-process input/output/parameter validation
- atomic batch process commits
- `MaterialStream` continuous rate/state objects
- finite-capacity Hopper storage nodes
- automated prototype extraction from `ResourceOccurrence`
- continuous Crusher and Magnetic Separator execution
- transactional backpressure / output-capacity checks
- one-to-one material-port connections pending an explicit splitter
- connection compatibility tied to solver semantics
- first Player View with Planet → Region → Engineering navigation
- per-occurrence engineering runtime sessions
- draggable engineering nodes, connection drawing, and Inspector
- Debug View retained for prototype/debug workflows
- deterministic automated tests / GitHub Actions

Do not regress these contracts while implementing recursive hierarchy and world-level controls.

---

# Matter Rules

## Quantities are physical truth

For stored material, constituent quantities are authoritative.

Displayed percentages are derived values and must not become a second mutable truth.

Reject invalid negative, NaN, Infinity, and physically meaningless values where appropriate.

## Provenance is not material identity

Keep:

```text
Where did this matter come from?
        ≠
What material/physical state is it now?
```

Do not force processed matter to retain one original natural resource identity.

## Abstract history, preserve matter

Use:

> **Abstract the history. Preserve the resulting matter.**

Do not retain every tiny transfer event when physically mixed matter can be represented by aggregate state without losing gameplay-relevant information.

## Physical ownership invariant

Every modeled unit of matter must have one physical owner/location at a time, for example:

- natural resource occurrence/reserve
- storage/container contents
- machine internal buffer/chamber
- transport inventory when transit is explicitly modeled
- discrete physical package/sample

A stream describes transfer between owners. It must not duplicate source/destination matter.

---

# Batch / Storage / Stream Semantics

## MaterialBatch is not flow

Never implement continuous flow by allocating batches per simulation tick.

`MaterialBatch` is for physically meaningful discrete lots such as samples, packages, shipments, isolated charges, or similar cases.

## Bulk matter belongs to storage

Bulk industrial matter should normally be held by a physical entity:

- hopper
- bin
- silo
- tank
- pressure vessel
- stockpile
- machine buffer
- cargo container/vehicle

Do not create a magical free-floating bulk inventory.

## MaterialStream is rate + state

Prefer constituent mass-flow rates as the source of truth:

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

Total flow should be derived.

Only add additional properties (temperature, pressure, phase, moisture, etc.) when an active issue needs them.

## Containers integrate streams

Conceptually:

```text
stored += inflow × dt
stored -= outflow × dt
```

If contents physically mix, aggregate them rather than retaining arbitrary historical sub-batches.

---

# Throughput / Backpressure / Atomicity

For a continuous process timestep, feasible throughput should be limited by:

```text
input available
process throughput × dt
all required output free capacity
connectivity / operating requirements
```

Do not withdraw process input and then discover that an output cannot accept the result.

A process transfer should be planned/staged and committed coherently so that:

- missing outputs block operation
- full outputs block/throttle operation
- partial input only produces proportional output
- constituent mass remains conserved
- failed planning does not mutate physical state

Until an explicit splitter exists, one material output port should not fan out to multiple destinations and duplicate flow.

---

# Recursive System-Node Interface — New Core Contract

The player-facing hierarchy should now be treated as a **uniform system-node model**.

Do not retain the older instruction that Regions must not have ports. That distinction is superseded.

From the player's perspective:

> **Anything treated as a system may be represented as a node with typed external ports.**

The implementation may distinguish primitive and composite node kinds internally.

## Primitive nodes

Examples:

```text
Extractor
Hopper
Crusher
Magnetic Separator
Pump later
```

## Composite nodes

Examples:

```text
Site
Facility
Region
Planet
Player-created production system later
```

A composite node owns/contains a child workspace/subgraph and exposes an external interface to its parent.

## Common interaction language

Prefer consistent player interaction across scales:

```text
select
→ inspect
→ connect ports
→ enter/drill down if composite
→ observe state
```

Do not force every entity to expose identical port types; expose the physical/logistical interfaces that the system actually provides.

## Typed boundary ports

Composite systems need explicit parent-facing boundary ports.

Example child workspace:

```text
Resource → Extractor → Hopper → [SITE ORE OUTPUT]
```

Parent Region workspace:

```text
[Mining Site]──ore out○ → regional logistics
```

The parent may treat the Site as one node without losing access to its internal graph when entered.

## Parent/child boundary mapping

Boundary ports are abstraction boundaries, **not teleportation**.

A child output port should map to physical state/flow at the boundary. Parent-level logistics must then move that matter onward.

Conceptually:

```text
child apparatus
→ child boundary output
→ parent transport/logistics
→ destination boundary input
→ destination child apparatus
```

Matter conservation must hold across every hierarchy boundary.

Do not silently copy stream state from one hierarchy to another as if it were duplicate matter.

## Geography as composite systems

Target hierarchy:

```text
Planet Workspace
├── Region Node
├── Region Node
└── Region Node
      ↓ enter
Region Workspace
├── Site Node
├── Site Node
├── logistics/system nodes
└── Region boundary ports
      ↓ enter site
Site Workspace
├── ResourceOccurrence/source interface
├── Extractor
├── Storage
├── Processing
└── Site boundary ports
```

This is intended to become the foundation for later Site → Region → Planet logistics.

## Player-created composite systems later

The same abstraction should eventually allow a solved internal graph to become a reusable parent-level node.

Do not implement arbitrary nesting/editor tooling unless the active issue asks for it, but avoid architecture that would prevent it.

---

# Simulation Time vs Machine Control — New Core Contract

Do not use one Run/Stop concept for both world time and machinery.

Maintain three concepts:

```text
WORLD TIME
running / paused

MACHINE COMMAND STATE
enabled / disabled

MACHINE OPERATING STATE
off / idle / running / blocked / faulted (as needed)
```

## World time

The world/session simulation should run by default.

Pause is a global/player time-control feature for inspection/planning. Pausing must not change machine `enabled` values.

Simulation ownership should move out of a single visible Engineering workspace. Navigating away from a Site/Region must not inherently stop automated systems.

Do not make simulation progress depend on which workspace is currently rendered.

## Active machinery enabled state

Active apparatus must have an explicit `enabled` command state.

For the next milestone:

- Extractor has `enabled`
- Crusher has `enabled`
- Magnetic Separator has `enabled`
- newly created active apparatus defaults to `enabled: false`
- passive Hopper/storage does not receive a universal machine On/Off toggle

`enabled: true` means operation is permitted, not guaranteed.

An enabled machine may be:

```text
IDLE    — no feed / nothing to do
RUNNING — processing
BLOCKED — output/full/connectivity constraint
FAULTED — invalid/incompatible operating condition if modeled
```

When a blocking condition clears, an enabled machine should resume without another manual start command.

Use the same `enabled` primitive as the future automation-control target rather than inventing a second controller-only switch later.

---

# Live Inspector / Rendering Contract

The Inspector must remain interactive while simulation runs.

Do not rebuild/destroy every engineering node DOM element every animation frame. That can interrupt click/mousedown/mouseup interaction and makes continuous simulation hostile to inspection.

Prefer stable interactive DOM/node objects and update only dynamic presentation fields such as:

- quantity/fill display
- stream rate/width
- operating-state badge
- machine enabled indicator
- Inspector text/value fields

Selection should persist while values update.

The Inspector should progressively be usable for primitive and composite nodes, connections, streams, Sites, and Regions where relevant.

Simulation tick functions must remain DOM-independent.

---

# Current Immediate Priority

The next issue should consolidate the architecture introduced by the first continuous workspace milestone.

Target:

> **Implement recursive system nodes/boundary ports, world-level continuous simulation, per-machine enable/operating state, and stable live Inspector interaction.**

The issue should prove the concepts using existing solid-material machinery rather than adding many new resource/process types.

A representative target is:

```text
PLANET WORKSPACE

[Region A] ─────────────── [Region B]
    ↓ enter

REGION A WORKSPACE

[Mining Site] → [Region Export / logistics placeholder]
     ↓ enter

MINING SITE WORKSPACE

ResourceOccurrence
       ↓
Extractor (disabled by default)
       ↓
Hopper
       ↓
Crusher (disabled by default)
       ↓
Site Output boundary port
```

Where practical, the existing Magnetic Separator chain should remain available inside the Site workspace and continue obeying conservation/backpressure rules.

---

# Requirements for the Next Milestone

## 1. Generic system-node contracts

Introduce the smallest useful model for:

- primitive node
- composite node
- node ID/type
- typed input/output ports
- child workspace reference for composite nodes
- parent-facing boundary-port mapping

Do not build a speculative universal graph framework far beyond current needs.

## 2. Site as composite node

A Site should be a node visible from Region workspace.

Entering it reveals the existing engineering graph.

The Site must be able to expose at least one material output boundary port backed by actual child-workspace flow/state.

Do not key the player's conceptual Site solely to one `ResourceOccurrence`; occurrences are resources inside/associated with the Site.

## 3. Region as composite node

A Region should be a node visible from Planet workspace and should be enterable.

Inside Region workspace, Sites should appear as connectable nodes.

The Region should be able to expose at least one material boundary output that a parent Planet workspace can connect to a minimal logistics/transfer placeholder or another Region interface.

The first milestone does not need realistic rail/truck physics, but hierarchy crossing must be explicit and conserved.

## 4. Boundary flow conservation

Add tests showing that child output quantity/flow is not duplicated or lost when exposed to the parent.

Boundary interfaces must not create a second copy of the same matter.

## 5. World-level simulation clock

Move simulation progression out of the visible Engineering workspace's local Run button/state.

Simulation should start running automatically after a world/session is initialized.

Provide global Pause/Resume UI.

Navigating Planet ↔ Region ↔ Site must not reset or freeze existing simulation sessions.

## 6. Machine enabled/operating state

Add `enabled` to active apparatus, default false for newly created active machinery.

Add a minimal runtime operating state sufficient to distinguish at least:

```text
off
idle
running
blocked
```

Expose enabled control and operating state in the node/Inspector UI.

## 7. Stable Inspector while running

Refactor rendering so the user can select, inspect, drag, connect/disconnect, and use Inspector controls while world simulation continues.

Do not solve this by pausing simulation during interaction.

## 8. Preserve existing physics

Do not fork/duplicate Crusher or Magnetic Separator physics.

Preserve:

- constituent conservation
- particle-size rules
- output-capacity backpressure
- one-to-one material port rule pending explicit splitter
- no per-tick batch allocation
- deterministic fixed-step physical updates

## 9. Tests

Add deterministic tests for:

- active machinery defaults disabled
- disabled machinery consumes/produces nothing
- enabling machinery permits operation when conditions allow
- enabled + missing feed => idle
- enabled + full/missing output => blocked
- blocked machinery resumes when constraint clears
- Pause freezes world physical state without changing enabled flags
- Resume continues from same state
- navigation/UI state changes do not stop physical sessions
- Site boundary port conserves matter across child/parent interface
- Region boundary port conserves matter across child/parent interface
- composite-node external interface resolves to the correct child boundary
- Inspector selection state can persist across simulation/render updates at the application-state level
- existing batch/world/continuous regression tests remain green

Avoid relying only on browser DOM tests for conservation/control semantics.

---

# Debug UI

Preserve the existing Debug View.

Do not remove manual Gather/Discover/batch-process controls merely to make the Player View cleaner. They remain valuable for validating underlying state until equivalent debugging tools exist elsewhere.

Do not build new normal player progression around those buttons.

---

# Discovery / Survey Direction

The current Discover/prototype survey actions are scaffolding.

Future surveying should become an automated system that updates Knowledge State over time.

Do not expand surveying substantially in the recursive-system milestone unless necessary to access a test Site.

---

# Explicit Out of Scope for the Next Milestone

Unless required to prove hierarchy contracts, do not add:

- realistic rail/truck/conveyor routing/pathfinding
- splitter/merger gameplay beyond what current one-to-one ports need
- precise geological depletion/reserves
- full surveying system
- power grids
- thermodynamics
- fluids/gases
- pressure/vacuum
- chemistry/reaction networks
- wear/maintenance
- full particle distributions
- PLC/controller programming UI
- arbitrary player-created nested blueprint editor
- mature factory aggregation solver
- persistence/backend/database
- multiplayer
- framework migration
- star/system generation
- Web Worker/Wasm optimization
- polished final art

Use placeholders only where they prove a hierarchy/boundary contract. Do not mistake placeholders for final logistics physics.

---

# Performance Direction

Favor aggregate state:

```text
streams    = rates/state
containers = quantities
processes  = transformations/capacities
systems    = graphs with explicit external contracts
```

World simulation frequency should remain independent from rendering FPS.

Future optimization may include dirty/dependency recalculation, Web Workers, or aggregated mature composite systems, but do not implement them prematurely.

Recursive system boundaries should be designed so that a detailed child system can eventually expose an aggregate parent-level contract without requiring parent code to inspect every internal node on every update.

---

# Development Philosophy

For simulation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

For gameplay features, ask:

> **What physical world state does this act on?**

Prefer small coherent vertical slices and explicit invariants over broad speculative abstractions.

When a parent/child system design choice is ambiguous, favor the option that preserves:

1. physical conservation
2. explicit interfaces
3. consistent player interaction language
4. automation
5. future composition/nesting

without adding unnecessary machinery to the current issue.