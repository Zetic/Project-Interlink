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
- nested boundary resolution and conserved transfer primitives
- stable engineering node and connection DOM during continuous simulation
- Debug View retained for prototype/debug workflows
- deterministic automated tests / GitHub Actions

Do not regress these contracts while correcting the recursive workspace UX.

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

# Uniform Recursive Workspace — Hard UI Contract

The player-facing hierarchy must use a **uniform draggable node-workspace model at every implemented scale**.

Do not interpret “system node” as a static CSS card with buttons.

From the player's perspective, primitive apparatus and composite systems share this interaction language:

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

## Reusable workspace presentation

Prefer the smallest reusable canvas/graph presentation abstraction that can support:

- stable node DOM elements
- stable connection DOM/SVG elements
- workspace-specific layout state
- dragging
- selection
- typed port interaction
- connection creation/removal
- live Inspector updates
- enter/drill-down action for composite nodes

The Site engineering workspace already proves much of this interaction. Reuse/generalize its patterns rather than maintaining unrelated “engineering canvas” and “parent card grid” interaction systems.

Planet and Region workspaces should therefore become actual draggable graph canvases.

Do not make parent-level node positions physical simulation coordinates.

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

The current automatic hidden Site → Regional Export behavior is a prototype defect and should be removed in the next corrective pass.

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

The current corrective issue does not need to implement all Feature port families, but Site Import must exist so future receiving behavior is natural.

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

# Current Immediate Priority

The next corrective pass should finish the recursive interaction contract introduced by the merged Site/Region/Planet milestone.

Target:

```text
PLANET WORKSPACE — draggable graph

[Region A] ○ ───────────→ ○ [Region B]
    ↓ enter

REGION A WORKSPACE — draggable graph

[Region Import] ○ ──→ ○ [Site / Facility]
[Mining Site] ○ ─────→ ○ [Region Export]
      ↓ enter

SITE WORKSPACE — draggable graph

[Site Import] ○ ──→ local systems
Resource → Extractor → Hopper → Crusher → Magnetic Separator
                                      ├─→ Concentrate Hopper → [Site Export]
                                      └─→ Tailings Hopper
```

This corrective pass should focus on interaction/model fidelity, not new simulation domains.

---

# Requirements for the Corrective Pass

## 1. Replace parent card grids with node canvases

Planet and Region workspaces must use draggable nodes, explicit ports, connection paths, selection, Inspector, and persistent layout state.

Do not leave Sites/Regions as static rectangular cards in a CSS grid.

## 2. Add explicit Site Import / Export boundary-buffer nodes

Every initialized Site engineering workspace should visibly contain both boundary nodes.

They should participate in normal material connection semantics and physically own material while buffered.

Do not map Site output directly to the concentrate Hopper.

## 3. Keep Region Import / Export explicit and draggable

Region boundary nodes should live on the same Region canvas as Site/composite nodes.

The Planet-level Region input/output ports must resolve to these physical buffers.

## 4. Remove automatic Site → Region export

Do not create hidden cross-boundary transfers on Site creation/activation/reset.

No material should leave Site Export until the player connects it in Region view.

## 5. Restore detailed inspection

Restore the information lost during the stable-live-render refactor and expand machine summaries using existing stream state.

## 6. Preserve current physics and world clock

Do not fork Crusher/Magnetic Separator physics.

Preserve:

- constituent conservation
- particle-size rules
- output-capacity backpressure
- one-to-one material port rule pending splitter
- no per-tick batch allocation
- deterministic fixed timestep
- world-owned continuous simulation
- per-machine enabled state
- persistent Site sessions

## 7. Keep parent/child ownership explicit

A parent-facing composite port exposes its child's boundary buffer; it is not a second physical inventory.

## 8. Keep Debug View

Do not remove the Debug View or its manual validation controls.

---

# Required Regression Coverage for the Corrective Pass

Add fast deterministic tests for at least:

### No implicit logistics

- creating/entering/resetting a Site creates no Site → Region transfer automatically
- with Magnetic Separator running and no Site Export connection, concentrate accumulates in the concentrate Hopper
- material does not move into Site Export until an explicit child-workspace connection exists
- material does not move from Site Export into Region-level storage until an explicit Region connection exists

### Boundary ownership

- Site Import and Site Export are distinct physical storage owners
- Site parent input resolves to Site Import
- Site parent output resolves to Site Export
- Region parent input resolves to Region Import
- Region parent output resolves to Region Export
- parent inspection/display does not duplicate constituent mass
- full boundary buffers backpressure upstream flow rather than deleting matter

### Import symmetry

- explicit material transfer into a Site parent input appears in the same Site Import buffer when the Site is entered
- child systems can draw from Site Import through an explicit local connection

### Draggable recursive layout

- Planet Region-node positions are application/UI state
- Region Site/boundary-node positions are application/UI state
- moving parent-level nodes does not mutate world matter or process state
- layout persists while navigating away/back during the current session

### Detailed inspection model

Prefer testing a DOM-independent inspection model/helper for:

- Hopper constituent masses + particle size
- boundary-buffer constituent masses + particle size
- MaterialStream constituent rates + particle size
- Crusher configured and actual flow summaries
- Magnetic Separator feed/concentrate/tailings summaries
- blocking/error reason when present

### Existing regression

All existing generation, batch, continuous-flow, world-clock, machine-state, and recursive-boundary tests remain green.

---

# Explicitly Out of Scope for This Corrective Pass

Do not add unless strictly required to prove the contracts above:

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

The goal is to make the already-implemented recursive system architecture behave visibly and consistently before adding more domains.

---

# Discovery / Survey Direction

The current Discover/prototype survey actions are scaffolding.

Future surveying should become an automated system that updates Knowledge State over time.

Do not expand surveying substantially in the corrective recursive-workspace pass unless needed to access a test Site.

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
4. the same player interaction language at every scale
5. automation
6. future composition/nesting

without adding unnecessary machinery to the active issue.