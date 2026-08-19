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

A generated Feature should eventually matter because it creates a physical opportunity, constraint, resource, environment, or interaction for the player. Do not treat Features as decorative metadata with no eventual gameplay role.

---

# Repository / Platform Guardrails

The runnable app lives at repository root.

Keep the project web-based and preserve:

- HTML/CSS
- vanilla JavaScript while sufficient
- ES modules
- relative imports compatible with GitHub Pages project paths
- DOM-independent simulation/process logic
- deterministic Node-based regression tests

Do not introduce a framework, backend, database, ECS, dependency-injection framework, WebAssembly, or large infrastructure layer without a concrete requirement.

Do not recreate the removed `planet-generator/` wrapper directory.

Do not reintroduce the removed Debug/Player mode split, special Engineering workspace, structural discovery gating, or hierarchy-specific graph UI systems.

---

# Current Implemented Foundation

`main` currently includes:

- `schemaVersion: 6`
- `generatorVersion: 2`
- deterministic seeded causal world generation
- namespaced deterministic RNG streams
- World / Knowledge / UI state separation
- every generated Feature associated with an enterable Site
- Site `featureIds`
- structural Region/Site/Feature visibility independent from Knowledge State
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
- world-owned fixed-step simulation
- global Pause/Resume
- active-machine `enabled` command state
- derived `off / idle / running / blocked` operating state
- persistent Site simulation sessions while navigating
- recursive Site/Region system metadata and typed boundary ports
- explicit Site Import / Site Export and Region Import / Region Export physical boundary buffers
- nested boundary resolution and conserved `BoundaryTransfer` primitives
- explicit rather than automatic cross-boundary logistics
- Planet → Region → Site navigation
- draggable Site, Region, and Planet node workspaces
- one shared `GraphNode` / `GraphPort` / `GraphConnection` projection layer
- one shared graph-node renderer and stable edge renderer
- common connection preview and adapter-based disconnect behavior
- one shared outer workspace shell and Inspector geometry
- per-workspace pan/zoom state
- pointer-centered wheel zoom plus Zoom In / Zoom Out / Fit / Center controls
- signed logical graph coordinates with no positive-origin placement wall
- window-level active drag tracking so transformed DOM-layer bounds do not stop node/connection dragging
- generated Feature nodes visible and inspectable inside Site
- stable player-facing node category headers
- deterministic automated tests / GitHub Actions

The major workspace/prototype cleanup from Issues #18 and #20 and follow-up PRs is complete. Treat the unified graph, shared shell, unbounded graph-space behavior, accessible Site/Feature model, and node-recognition system as **existing architecture to preserve**, not future TODOs.

---

# Foundational State Architecture

Preserve the established separation:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
measurements / analysis / estimates / confidence
        ↓
APPLICATION / UI STATE
selection / graph layout / viewport pan+zoom / panels / temporary interactions
```

Physical state must not live only in DOM objects.

Knowledge actions may measure or estimate physical truth; they do not mutate physical truth merely because the player learned something.

Workspace node positions and viewport transforms are application state unless an explicit gameplay rule later makes physical position meaningful.

## Structural world visibility is not a Knowledge gate

After planet generation:

- all generated Regions are visible
- all generated Sites are visible in their Regions
- every generated Feature belongs to an enterable Site
- entering a Site exposes its Feature node(s)

Do not introduce `unknown/discovered` gating merely to hide generated structural entities.

Knowledge State remains useful for meaningful analysis/measurement data such as composition estimates, sensors, characterization, uncertainty, confidence, or scientific results.

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

Do not force processed matter to retain one original natural-resource identity.

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

Only add temperature, pressure, phase, moisture, etc. when an active gameplay issue needs them.

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

The player-facing hierarchy uses **one shared node/port/connection architecture at every implemented scale**.

From the player's perspective, apparatus, containers, Feature nodes, boundary buffers, and composite systems share this interaction language:

```text
select
→ drag/rearrange
→ inspect
→ connect typed ports where physically meaningful
→ enter/drill down if composite
→ observe live state
```

Do not interpret “uniform” as making separate hierarchy-specific graph implementations merely look similar.

## Shared graph abstraction

Preserve the common graph responsibilities:

```text
GraphNode
├── id
├── label / subtype
├── semantic category
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

Use the existing common path for:

- stable node DOM creation/update
- stable edge DOM/SVG creation/update
- graph-node selection state
- category-header rendering
- port rendering
- port drag/connect gesture
- graph-edge drawing
- edge selection
- connection preview
- adapter-based disconnect behavior

Do **not** create independent Site vs Region/Planet equivalents.

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

## Visibility invariant

> **If a connection exists in simulation/application graph state and belongs to the current workspace, a corresponding visible graph edge must exist.**

The reverse should also hold for normal player-created edges: a visible persistent edge must correspond to a real underlying connection, not a decorative line.

---

# Uniform Workspace Shell — Hard UI Contract

Planet, Region, and Site are different graphs inside the **same application shell**.

```text
┌───────────────────────────────────────────────────────────────┐
│ Breadcrumbs / World Controls                                 │
├───────────────────────────────────────────────────────────────┤
│ Zoom Out · Zoom % · Zoom In · Fit · Center                  │
├──────────────────────────────────────────────┬────────────────┤
│                                              │                │
│              GRAPH VIEWPORT                  │   INSPECTOR    │
│                                              │                │
│       pan / zoom / nodes / connections       │   same shell   │
│                                              │   everywhere   │
└──────────────────────────────────────────────┴────────────────┘
```

Do not reintroduce separate outer interaction-area designs for Site vs Region/Planet.

Specialized node content is fine. Different hierarchy levels should not feel like different applications.

---

# Viewport / Graph-Space Contract

The visible viewport is finite. The logical graph space is not.

Per-workspace UI state contains:

```text
panX
panY
zoom
```

Graph positions may be signed:

```text
(-4000, -2500)
(0, 0)
(8500, 300)
```

are all valid node positions.

Hard requirements:

- never clamp graph X/Y merely to keep them non-negative
- mouse wheel zooms toward the pointer
- middle-mouse and supported pan gestures move the viewport
- left-drag moves nodes correctly at every zoom level
- active drag tracking must not stop because the transformed graph DOM layer ends
- port connection preview remains correct while panned/zoomed
- Zoom Out / Zoom In / Fit / Center remain functional
- zoom remains bounded to a sane range
- each workspace remembers its own viewport transform
- node layer and SVG/edge layer use the same transform
- pointer coordinates are converted through the viewport into graph coordinates exactly once
- `Fit` / `Center` derive bounds from actual node positions, including negative coordinates
- viewport state must not mutate simulation truth or node physical state

Prefer pure viewport/coordinate helpers with unit tests for the math.

---

# Node Recognition — Hard UI Contract

Every rendered graph node has a persistent category header.

The recognition rule is:

> **Header = what kind of thing the node is. Body = which instance/subtype it is and what it is doing.**

Current category vocabulary:

```text
PLANET
REGION
SITE
FACILITY
FEATURE
APPARATUS
CONTAINER
BOUNDARY
PROCESS
SENSOR
CONTROLLER
LOGISTICS
SYSTEM
```

Examples:

```text
APPARATUS / Crusher
APPARATUS / Magnetic Separator
CONTAINER / Hopper
BOUNDARY / Site Export
FEATURE / generated Feature name
REGION / generated Region name
```

Rules:

- category is semantic family, not exact subtype
- operating state must not replace category identity
- do not change the whole category appearance just because a machine is running/blocked/off
- current Extractor, Crusher, and Magnetic Separator nodes are `APPARATUS`, not `PROCESS`
- Hopper/Tank/Silo-style storage is `CONTAINER`
- import/export physical boundary buffers are `BOUNDARY`
- Features are `FEATURE`
- composite hierarchy nodes retain a drill-down cue
- unknown future node types should fall back to `SYSTEM` rather than inventing ad hoc new categories
- add a new top-level category only when it represents a durable semantic family players should learn

Keep category mapping centralized in `src/workspace/nodePresentation.js`; do not scatter subtype-to-color/header rules through hierarchy renderers.

---

# One Inspector — Hard UI Contract

Use one Inspector container, style system, and interaction contract across Planet, Region, Site, Feature, boundary, machine, storage, and connection selection.

The selected entity determines which sections/fields appear. It must not determine a completely different Inspector panel design.

The Inspector must remain interactive while simulation runs. Build structural content when selection/structure changes and update live values in place where practical.

## Storage / boundary-buffer inspection

Expose where available:

- stored mass
- capacity
- free capacity
- particle size
- non-zero constituent masses
- derived percentages
- current total inflow/outflow

## Connection / MaterialStream inspection

Expose where available:

- source node/port
- target node/port
- total flow kg/s
- particle size
- constituent flow rates kg/s

## Machine inspection

Expose where relevant:

- enabled
- operating state
- configured capacity/throughput
- actual current throughput
- input/output flow summaries
- process parameters
- particle-size constraints/settings
- last error/blocking reason

For Magnetic Separator, preserve distinct live feed, concentrate, and tailings summaries.

## Feature inspection

Feature inspection should expose generated physical properties and implemented interfaces/actions.

Do not display `engineering available` / `engineering unavailable` or equivalent compatibility classifications.

---

# Application Start / Hierarchy Contract

The normal application flow is:

```text
LANDING SCREEN
PROJECT INTERLINK
Seed [________________]
[ Generate World ]
        ↓
Planet Workspace
        ↓
Region Workspace
        ↓
Site Workspace
```

Do not restore the prototype Debug View or Debug/Player mode toggle.

Do not restore a special Engineering workspace/session concept.

Use Site terminology:

```text
currentLevel === 'site'
renderSiteWorkspace()
createSiteSession()
siteSessions
```

Every generated Site is enterable regardless of current process/resource compatibility.

---

# Sites and Features — Hard World/UI Contract

A Site is a geographically bounded composite workspace associated with a Region.

A Feature is a physical world system located inside a Site.

```text
Planet
  └── Region
      └── Site
          ├── Feature(s)
          ├── Site Import
          ├── Site Export
          └── apparatus / storage / processes
```

## Every Feature gets an enterable Site

World generation must continue to associate every generated Feature with an enterable Site, including Features with zero `ResourceOccurrence` entries.

Use:

```text
featureIds: [...]
```

not a singular `featureId`.

If serialized world shape changes, increment `schemaVersion` and update version-sensitive tests/fixtures.

## Features are graph nodes inside Site

Feature nodes must remain:

- visible after entering the Site
- selectable
- inspectable
- laid out in Site UI state
- represented through the shared graph system
- able to gain typed interfaces when their physical gameplay semantics exist

Do not require a Feature to become another nested workspace simply because it is selectable.

## Every Feature should eventually create gameplay

> **A Feature should exist because it creates a physical opportunity, constraint, resource, environment, or interaction for the player—not merely as decorative world-generation metadata.**

Feature interfaces should follow physical meaning rather than a universal ore-source assumption.

Examples:

```text
Mineral Deposit  → solid extraction
Injection Well   ← material/fluid input
Reservoir        ↔ fluid interaction
Storage Cavern   ↔ storage interaction
Volcanic Vent    → heat/gas/fluid opportunities
```

Do not add decorative ports for mechanics that do not exist yet.

---

# Composite Boundary Buffers — Hard Physical Contract

Every composite system that exchanges material with its parent should expose explicit child-visible boundary storage.

Current Sites have:

```text
Site Import Boundary Buffer
Site Export Boundary Buffer
```

Current Regions have:

```text
Region Import Boundary Buffer
Region Export Boundary Buffer
```

The internal boundary buffer and parent-facing composite port are **two views of the same physical state**.

Never duplicate inventory because the same boundary is visible at two hierarchy levels.

Boundary nodes remain visibly distinct and category `BOUNDARY`.

---

# No Implicit Cross-Boundary Logistics

A boundary existing does **not** imply transportation.

Do not automatically create Site → Region transfers when a Site session is created, entered, reset, registered, or constructed.

Desired chain:

```text
local system
    ↓ explicit Site-workspace connection
Site Export Buffer
    ↓ explicit Region-workspace connection
Region Export / logistics
    ↓ explicit Planet-workspace connection
Destination Region Import Buffer
```

If a connection does not exist, material remains in its current physical buffer. When the buffer fills, normal backpressure should propagate.

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

New active apparatus defaults `enabled: false`.

`enabled: true` means operation is permitted, not guaranteed. An enabled machine may be Idle or Blocked and should automatically resume when its physical constraint clears.

Use the same `enabled` primitive as the future automation/control target.

---

# Temporary Iron Prototype — Do Not Confuse With Game Architecture

`src/workspace/sitePrototype.js` exists only to determine whether the temporary iron-processing demonstration can be instantiated.

Current behavior:

```text
compatible iron occurrence
→ temporary Extractor / Hopper / Crusher / MagSep chain may be created

non-iron or zero-occurrence Site
→ Site still exists and is enterable
→ Feature(s) + Site boundaries remain visible
→ no fake iron chain should appear
```

Compatibility may decide whether the **temporary demonstration apparatus** exists. It must never decide:

- whether a Site exists
- whether a Site is visible
- whether a Site is enterable
- whether a Feature is visible
- whether a Feature is classified as available/unavailable

Do not broaden `prototypeOccurrenceForSite()` into a general Feature-access or Site-navigation concept.

---

# Current Immediate Priority — Player-Authored Site Construction

The major interface cleanup is complete. The next recommended milestone is to transition the first playable Site from an automatically supplied iron factory to **player-authored construction using the existing graph architecture**.

The goal is:

> **The player should build the first useful system using the same node language they will eventually use to build planetary industry.**

## Construction direction

A focused construction slice should use existing simulation and graph contracts rather than create parallel systems.

Implement incrementally:

1. provide a simple construction palette/toolbox or equivalent placement action;
2. allow placement of existing apparatus/storage types needed for the iron slice;
3. create node simulation state through existing node constructors/helpers;
4. create layout position separately in UI/application state;
5. default newly placed active apparatus to disabled/off;
6. connect nodes through the existing typed-port graph gesture and blueprint connection APIs;
7. surface incompatibility through normal validation/Inspector feedback rather than silent failure;
8. preserve existing throughput/backpressure/conservation physics after player placement;
9. support useful removal/reconfiguration without silently deleting owned matter;
10. keep composite boundary movement explicit;
11. retain deterministic helper-created test blueprints where useful;
12. once the construction flow is usable, stop treating the automatically spawned iron chain as the normal player-facing experience.

## Construction must not invent a second architecture

Do not add separate “build mode connections,” separate node objects, or a fake construction inventory graph if the existing graph/simulation contracts already solve the problem.

Conceptually:

```text
construction action
      ↓
existing simulation node
      +
UI layout position
      ↓
existing GraphNode projection
      ↓
existing ports / edges / Inspector
```

## Removal safety

A node that physically owns material cannot simply disappear and destroy its contents.

When removal/replacement becomes player-facing, define a safe rule such as requiring the node to be empty or explicitly transferring/recovering its contents before deletion.

Do not silently violate matter ownership for construction convenience.

---

# Feature Exploitation Direction After Construction

After construction is functional, deepen Feature interaction **one physical family at a time**.

Prefer a complete vertical slice such as:

```text
Feature physical state
→ typed interface
→ applicable apparatus
→ stream/storage behavior
→ constraints
→ Inspector feedback
→ automation opportunity
```

over adding superficial ports/actions to every Feature type.

Likely future families include:

- solid/mineral extraction and depletion
- fluid source/sink behavior
- thermal/geothermal interaction
- storage cavern/reservoir behavior
- gas handling
- environmental/pressure interfaces
- measurement/sensor interfaces

Do not implement all of these in one issue.

---

# Required Regression Coverage for Construction Work

Keep tests fast and deterministic.

Where the active issue touches construction, prove as applicable:

- node placement creates the intended simulation node exactly once
- UI layout placement does not mutate physical state
- signed graph coordinates remain valid
- newly placed active apparatus defaults disabled/off
- ports are projected through the shared graph system
- connection validation uses existing solver semantics
- valid player-created chains simulate identically to equivalent deterministic test blueprints
- backpressure and conservation remain correct
- non-iron/zero-occurrence Sites remain enterable and do not receive fake iron apparatus
- removal cannot silently destroy stored matter
- recursive Site/Region boundaries remain explicit and conserved
- viewport pan/zoom/drag behavior remains intact
- node category mapping remains intact

All existing relevant simulation/world/graph tests must remain green.

For DOM-heavy construction interaction, perform a browser smoke pass in addition to Node tests.

---

# Browser Smoke Expectations

When a change touches workspace interaction, manually verify the relevant path rather than relying only on pure tests.

At minimum for construction/UI work, check:

- landing → generated Planet
- Planet → Region → multiple Site types
- Feature nodes remain visible
- node category headers remain correct
- node dragging works at 50%, 100%, 150%, and 200% zoom where practical
- dragging can cross negative and positive graph coordinates without invisible walls
- wheel zoom, toolbar zoom, Fit, and Center work
- port preview remains aligned while panned/zoomed
- persistent edges remain aligned and selectable
- Inspector actions remain usable
- Pause/Resume remains correct
- off-screen automated systems continue running
- newly introduced construction actions work through the same graph shell

If browser automation is unavailable, say so explicitly and list the human checks still outstanding. Do not claim a browser smoke pass ran when it did not.

---

# Explicitly Out of Scope Unless an Active Issue Requires It

Do not expand a focused construction/Feature issue into unrelated systems:

- mature mechanics for every Feature type at once
- realistic rail/truck/conveyor pathfinding
- logistics scheduling/economics
- splitter/merger behavior unless branching is the active requirement
- precise geological reserve/depletion unless it is the active slice
- a replacement structural survey/discovery gate
- power grids
- thermodynamics
- fluids/gases
- pressure/vacuum
- broad chemistry/reaction networks
- wear/maintenance
- PLC/controller programming UI
- arbitrary player-authored composite collapse unless specifically requested
- mature aggregate factory solver
- persistence/backend/database
- multiplayer
- framework migration
- star/system generation
- Web Worker/Wasm optimization
- polished final art

Add these incrementally when they create a concrete player decision and have a defined physical/state contract.

---

# Performance Direction

Favor aggregate state:

```text
streams    = rates/state
containers = quantities
processes  = transformations/capacities
systems    = graphs with explicit external contracts
layouts    = application-state positions
viewports  = application-state pan/zoom
```

World simulation frequency remains independent from rendering FPS.

Future optimization may include dirty/dependency recalculation, Web Workers, or aggregated mature composite systems, but do not implement them prematurely.

Recursive boundaries should allow a detailed child system to expose an aggregate parent contract without requiring parent code to inspect every internal apparatus on every update.

---

# Coding / Review Discipline

For each implementation task:

1. inspect the current code rather than assuming an older prototype structure still exists;
2. preserve the shared graph/shell/state contracts unless the issue explicitly changes them;
3. prefer small reusable helpers over duplicated hierarchy-specific logic;
4. keep simulation logic DOM-independent;
5. keep UI-only coordinates/state out of World State;
6. add focused regression coverage for the behavior changed;
7. run the complete test suite before declaring completion;
8. check exact final-head CI when working through a PR;
9. perform or explicitly defer browser smoke testing for DOM/pointer-heavy changes;
10. do not declare a checklist complete while known blockers remain.

Avoid broad cleanup unrelated to the active issue unless it is required to make the implementation coherent.

---

# Development Philosophy

For simulation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

For gameplay features, ask:

> **What physical world state does this act on?**

For generated Features, ask:

> **What physical opportunity, constraint, resource, environment, or interaction does this Feature create?**

For node/UI additions, ask:

> **Does this improve recognition or interaction while preserving one shared system language?**

When a design choice is ambiguous, favor the option that preserves:

1. physical conservation
2. one clear physical owner
3. explicit interfaces
4. one shared player-facing graph language
5. one shared application shell
6. stable node-recognition semantics
7. automation
8. future composition/nesting

without adding unnecessary machinery to the active issue.
