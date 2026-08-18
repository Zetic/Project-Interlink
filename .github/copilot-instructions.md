# Project Interlink — Copilot Agent Instructions

## Documentation Roles

Use repository documents for different purposes:

- `DESIGN.md` — canonical long-term game design and intended gameplay direction
- `README.md` — current implementation state, roadmap, and near-term architectural decisions
- `.github/copilot-instructions.md` — implementation guardrails and active coding priorities
- `PATCH_NOTES.md` — historical development record

Remain compatible with `DESIGN.md`, but do **not** implement every future concept merely because it appears there. Follow the active issue and current development order.

---

# Project Direction

Project Interlink is a systems-driven simulation and management game.

> **Everything is a system, and every system can become a component of a larger system.**

> **Yesterday's factory becomes today's machine.**

Automation is a core interaction principle from the beginning.

The player-facing system language should remain consistent across scale:

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

# Current Implemented Foundation

`main` currently includes:

- `schemaVersion: 5`
- `generatorVersion: 2`
- deterministic seeded world generation
- World / Knowledge / UI state separation
- `MaterialBatch` for meaningful discrete lots
- provenance separated from material identity
- particle-size state
- reusable `ProcessDefinition` metadata
- Crushing and Magnetic Separation
- shared discrete/continuous transformation physics
- `MaterialStream` constituent mass-flow state
- finite-capacity Hopper storage
- continuous Extractor / Crusher / Magnetic Separator execution
- constituent and total-mass conservation
- transactional output-capacity/backpressure behavior
- one-to-one material-port connections pending an explicit splitter
- connection compatibility tied to solver semantics
- world-owned fixed-step simulation
- global Pause/Resume
- active-machine `enabled` command state
- derived `off / idle / running / blocked` operating state
- persistent Site engineering sessions while navigating
- recursive Site/Region system metadata and typed boundary ports
- explicit Site Import / Site Export and Region Import / Region Export physical boundary buffers
- nested boundary resolution and conserved transfer primitives
- draggable Site, Region, and Planet node workspaces
- detailed Hopper/stream/machine/boundary/transfer inspection
- stable live node and connection DOM
- Debug View retained for prototype/debug workflows
- deterministic automated tests / GitHub Actions

The current remaining architectural defect is that Site engineering and Region/Planet parent workspaces still use separate player-facing graph/connection implementations. Do not add more hierarchy-specific graph code on top of that duplication.

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
selection, node layout, panels, temporary interaction state
```

Physical state must not live only in DOM objects.

Knowledge actions reveal/estimate physical truth rather than mutate it merely because the player learned it.

Workspace node positions are application state unless an explicit gameplay rule makes physical position meaningful.

---

# Matter / Ownership Rules

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

## Physical ownership invariant

Every modeled unit of matter must have exactly one physical owner/location at a time, for example:

- natural resource occurrence/reserve
- Hopper/container contents
- machine internal buffer/chamber
- composite boundary buffer
- explicit transport inventory when transit is modeled
- discrete package/sample

A stream describes transfer between owners. It must not duplicate source/destination matter.

Use:

> **Abstract the history. Preserve the resulting matter.**

---

# Batch / Storage / Stream Semantics

## MaterialBatch is not flow

Never implement continuous flow by allocating batches per simulation tick.

`MaterialBatch` is for physically meaningful discrete lots such as samples, packages, shipments, or isolated process charges.

## MaterialStream is rate + state

Prefer constituent mass-flow rates as the source of truth:

```js
{
  componentMassFlowKgPerSecond: {
    hematite: ...,
    magnetite: ...,
    quartzAndGangue: ...
  },
  particleSizeMm: ...
}
```

Total flow is derived.

Only add additional properties such as temperature, pressure, phase, or moisture when an active issue needs them.

## Storage integrates streams

Conceptually:

```text
stored += inflow × dt
stored -= outflow × dt
```

If contents physically mix, aggregate them rather than retaining arbitrary historical sub-batches.

Boundary buffers follow the same storage/ownership semantics.

---

# Throughput / Backpressure / Atomicity

For a continuous process timestep, feasible throughput is limited by:

```text
input available
process throughput × dt
all required output free capacity
connectivity / operating requirements
```

Do not withdraw process input and then discover that an output cannot accept the result.

A transfer/process should be planned/staged and committed coherently so that:

- missing outputs block operation
- full outputs block/throttle operation
- partial input produces proportional output only
- constituent mass remains conserved
- failed planning does not mutate physical state

Until an explicit splitter exists, one material output port must not fan out to multiple destinations and duplicate flow.

---

# Uniform Workspace Graph — Hard UI Contract

The player-facing hierarchy must use **one shared node/port/connection architecture at every implemented scale**.

Do not interpret “uniform” as merely making separate Site, Region, and Planet renderers look similar.

From the player's perspective, primitive apparatus, boundary buffers, and composite systems share this interaction language:

```text
select
→ drag/rearrange
→ inspect
→ connect typed ports
→ enter/drill down if composite
→ observe live state
```

Examples:

```text
Primitive: Extractor, Hopper, Crusher, Magnetic Separator, Boundary Buffer
Composite: Site, Region, Planet, Facility later
```

## Shared graph abstraction

Implement/generalize the smallest common graph layer capable of projecting all current workspace entities into common UI concepts such as:

```text
GraphNode
├── id
├── label/type
├── position
├── typed ports
├── selected/inspectable state
└── optional child workspace

GraphConnection
├── source node + port
├── target node + port
├── live state/flow summary
├── selected/inspectable state
└── disconnect action
```

Names may differ, but the responsibilities must be shared.

Use one common path for:

- stable node DOM creation/update
- stable edge DOM/SVG creation/update
- layout positioning
- node dragging
- port drag/connect interaction
- graph-edge drawing
- edge selection
- Inspector selection
- disconnect behavior
- composite enter/drill-down

Do **not** maintain independent implementations equivalent to `renderNode()/renderConnections()` for Site and `renderParentNode()/renderSystemConnections()` for Region/Planet once Issue #18 is complete.

## Simulation adapters are allowed and expected

A uniform graph UI does **not** require one universal simulation solver.

For example:

```text
GraphConnection
      ↓ adapter
local Site connection → blueprint connection + MaterialStream
Region/Planet connection → BoundaryTransfer
```

Local process physics and hierarchy-transfer physics may remain distinct behind adapters.

The graph layer should depend on the common connection contract it needs to render and interact, not on hierarchy-specific storage details.

## Visibility invariant

A critical invariant is:

> **If a connection exists in simulation/application graph state and belongs to the current workspace, a corresponding visible graph edge must exist.**

The reverse should also hold for normal player-created edges: a visible persistent edge must correspond to a real underlying connection, not a decorative line.

Do not allow a state where validation reports a source as already connected while the workspace shows no corresponding edge.

## Layout semantics

Workspace node positions are UI/application state. Do not make Region/Planet layout coordinates physical simulation coordinates unless a future issue explicitly introduces that concept.

---

# Composite Boundary Buffers — Hard Physical Contract

Every composite system that exchanges material with its parent should expose explicit child-visible boundary storage nodes.

For the current hierarchy, every Site should have at minimum:

```text
Site Import Boundary Buffer
Site Export Boundary Buffer
```

Every Region should have at minimum:

```text
Region Import Boundary Buffer
Region Export Boundary Buffer
```

## Site Import

From Region view, the Site node exposes a parent-facing material input.

Inside Site view, that same boundary buffer exposes material outward to local systems:

```text
REGION
material → [Site input]

SITE
[Site Import] → local Hopper / machine / feature
```

## Site Export

Inside Site view, local systems connect into the Site Export buffer:

```text
local Hopper → [Site Export]
```

At Region level, the Site node exposes that same stored state as a parent-facing output:

```text
[Site output] → regional logistics
```

## Region boundaries

Apply the same model recursively:

```text
REGION WORKSPACE
[Region Import] → Sites/facilities
Sites/facilities → [Region Export]

PLANET WORKSPACE
[Region input] / [Region output]
```

## One physical state across hierarchy views

The internal boundary buffer and the parent-facing composite port are two views of the same physical state.

Never duplicate inventory because the same boundary is visible at two hierarchy levels.

For example, if Site Export contains 347 kg, the Region-level Site node may display `347 kg available`, but there is still exactly one 347 kg physical owner.

## Boundary nodes should be visibly distinct

Do not disguise Site Import as an ordinary unnamed Hopper or map Site Export directly onto a process Hopper.

Use explicit player-facing labels/node semantics such as:

```text
Site Import
Site Export
Region Import
Region Export
```

The implementation may reuse common storage helpers internally.

---

# No Implicit Cross-Boundary Logistics

A boundary existing does **not** imply transportation.

Do not automatically create Site → Region transfers when a Site engineering session is created, entered, reset, or registered.

The player must explicitly create the connection that moves matter across the next hierarchy level.

Desired chain:

```text
Concentrate Hopper
    ↓ explicit Site-workspace connection
Site Export Buffer
    ↓ explicit Region-workspace connection
Region Export / logistics
    ↓ explicit Planet-workspace connection
Destination Region Import Buffer
```

If a connection does not exist, material remains in its current physical buffer. When that buffer fills, normal backpressure should propagate.

---

# Parent Composite Nodes Are Views of Their Child Boundaries

A Site or Region node shown in its parent workspace should expose:

- typed input/output ports
- live available/imported material summaries where useful
- selection/Inspector state
- draggable layout position
- enter/drill-down action

The node itself must not create an independent duplicate buffer for each displayed port.

Use explicit mapping from parent-facing ports to the corresponding child-visible boundary buffers.

---

# Features Inside Sites

A Site is not one `ResourceOccurrence`.

A Site is a geographically bounded composite system associated with a Region and may contain:

- one or more Features / ResourceOccurrences
- extraction apparatus
- storage
- processing
- import/export boundaries
- later power/logistics/control systems

Do not architect Sites as source-only systems.

Features may eventually expose input/output interfaces where physically meaningful, for example injection wells, storage caverns, reservoirs, waste sinks, or backfill areas.

Site Import must remain available so future receiving behavior is natural.

---

# Simulation Time vs Machine Control

Maintain three concepts:

```text
WORLD TIME
running / paused

MACHINE COMMAND STATE
enabled / disabled

MACHINE OPERATING STATE
off / idle / running / blocked / faulted later
```

World simulation runs by default.

Pause is global player time control and must not change machine `enabled` flags.

Simulation progression must not depend on the currently rendered workspace.

Active apparatus defaults `enabled: false` when newly created.

`enabled: true` means operation is permitted, not guaranteed. An enabled machine may be Idle or Blocked and should automatically resume when its physical constraint clears.

Use the same `enabled` primitive as the future automation/control target.

---

# Live Inspector / Rendering Contract

The Inspector must remain interactive while simulation runs.

Keep the stable-DOM improvements from the recursive milestone. Do not regress to destroying/recreating every node, connection, or Inspector control every animation frame.

However, stable rendering must not reduce inspection detail.

## Hopper / boundary-buffer inspection

At minimum expose:

- stored mass
- capacity
- free capacity
- particle size
- non-zero constituent masses
- derived percentages where useful
- current total inflow/outflow when available

## Connection / MaterialStream inspection

At minimum expose:

- source node/port
- target node/port
- total flow kg/s
- particle size
- constituent flow rates kg/s

## Machine inspection

At minimum expose where relevant:

- enabled
- operating state
- configured capacity/throughput
- actual current throughput derived from live streams
- input/output port flow summaries
- process parameters
- particle-size constraints/settings
- last error/blocking reason

For Magnetic Separator specifically, show distinct live summaries for:

```text
feed
concentrate
tailings
```

The underlying simulation already has the corresponding stream state; do not duplicate physics to obtain Inspector values.

## Preferred rendering pattern

Build Inspector structure when selection or structure changes, then update dynamic spans/rows in place during live simulation.

If a variable-size constituent list changes, update only that constituent section rather than discarding the entire Inspector interaction tree every frame.

Where practical, extract a DOM-independent inspection/view-model helper so detailed values can be regression-tested without relying on browser DOM tests.

---

# Current Immediate Priority — Issue #18

The active corrective priority is:

> **Unify Site, Region, and Planet under one node/connection workspace architecture.**

The current app already has draggable node views at all three scales. The issue is that Site and parent-level workspaces still use different renderer/connection interaction stacks, which can allow simulation connections and visible graph edges to disagree.

Target architecture:

```text
SHARED WORKSPACE GRAPH

GraphNode / GraphPort / GraphConnection
        ↓
shared renderer + interaction + Inspector selection
        ↓
connection adapter
   ├── local blueprint connection / MaterialStream
   └── recursive BoundaryTransfer
```

This pass should focus on graph architecture and behavioral consistency, not new simulation domains.

---

# Requirements for Issue #18

## 1. One node renderer/interaction path

Primitive machines, Hoppers, boundary buffers, Sites, and Regions should project into one shared node UI abstraction.

Do not preserve separate hierarchy-specific node interaction implementations merely because their underlying simulation objects differ.

## 2. One connection renderer/interaction path

Local Site connections and Region/Planet transfers should project into one shared edge abstraction.

Every edge should support the same basic player behavior:

- visible line/path
- live state display where available
- selection
- inspection
- disconnect

## 3. One drag-to-connect interaction path

Use the same conceptual source-port → target-port gesture and common compatibility/error presentation at every hierarchy level.

Simulation-specific validation may be delegated to adapters.

## 4. Preserve simulation-specific execution behind adapters

Do not rewrite Magnetic Separator/Crusher/local continuous physics as `BoundaryTransfer` merely to make rendering common.

Do not rewrite hierarchy transfer as local process streams merely to make rendering common.

Unify the UI graph contract, not the physical solvers.

## 5. Preserve recursive ownership

Parent-facing Site/Region ports must continue to expose the same child boundary buffers without duplicating matter.

## 6. Preserve explicit logistics

No hierarchy-crossing material movement may become implicit as part of the refactor.

## 7. Preserve stable live interaction

Do not regress to frame-by-frame destructive node/edge/Inspector rebuilds.

## 8. Keep Debug View

Do not remove the Debug View or its manual validation controls.

---

# Required Regression Coverage for Issue #18

Add fast deterministic coverage for the common graph projection/adapter layer where practical.

At minimum prove:

### Edge visibility / identity

- every local connection projected into the current Site workspace produces one graph edge
- every Region-level `BoundaryTransfer` in the current Region workspace produces one graph edge
- every Planet-level `BoundaryTransfer` in the current Planet workspace produces one graph edge
- graph edges resolve to the same source/target ports used by the underlying connection
- no existing connection can be omitted merely because its endpoint uses a boundary adapter composite

### Interaction consistency

- selecting an edge can resolve the underlying local connection or boundary transfer through the common graph abstraction
- disconnecting through the common graph action removes the correct underlying connection
- moving nodes changes layout state only

### Ownership / physics regression

- parent/child boundary mapping still resolves to one physical buffer
- explicit connection requirements remain intact
- constituent conservation and backpressure remain intact
- local Magnetic Separator/Crusher physics remain unchanged

### Existing regression

All existing generation, batch, continuous-flow, world-clock, machine-state, boundary-buffer, Inspector, and recursive-transfer tests remain green.

---

# Explicitly Out of Scope for Issue #18

Do not add unless strictly required to prove the shared graph contract:

- right-click/context menus beyond minimal hooks needed for future use
- realistic rail/truck/conveyor pathfinding
- logistics scheduling/economics
- splitter/merger gameplay
- precise geological depletion/reserves
- full automated surveying system
- power grids
- thermodynamics
- fluids/gases
- pressure/vacuum
- chemistry/reaction networks
- wear/maintenance
- PLC/controller programming UI
- arbitrary player-authored composite creation/collapse
- mature aggregate factory solver
- persistence/backend/database
- multiplayer
- framework migration
- star/system generation
- Web Worker/Wasm optimization
- polished final art

The goal is to make the existing node language structurally uniform before adding more interaction features.

---

# Discovery / Survey Direction

The current Discover/prototype survey actions are scaffolding.

Future surveying should become an automated system that updates Knowledge State over time.

Do not expand surveying substantially in the shared-graph pass unless needed to access a test Site.

---

# Performance Direction

Favor aggregate state:

```text
streams    = rates/state
containers = quantities
processes  = transformations/capacities
systems    = graphs with explicit external contracts
layouts    = application-state positions
```

World simulation frequency remains independent from rendering FPS.

Future optimization may include dirty/dependency recalculation, Web Workers, or aggregated mature composite systems, but do not implement them prematurely.

Recursive boundaries should allow a detailed child system to expose an aggregate parent contract without requiring parent code to inspect every internal apparatus on every update.

---

# Development Philosophy

For simulation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

For gameplay features, ask:

> **What physical world state does this act on?**

When a parent/child design choice is ambiguous, favor the option that preserves:

1. physical conservation
2. one clear physical owner
3. explicit interfaces
4. one shared player-facing graph language at every scale
5. automation
6. future composition/nesting

without adding unnecessary machinery to the active issue.