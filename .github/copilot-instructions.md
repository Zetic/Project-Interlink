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
- persistent Site simulation sessions while navigating
- recursive Site/Region system metadata and typed boundary ports
- explicit Site Import / Site Export and Region Import / Region Export physical boundary buffers
- nested boundary resolution and conserved transfer primitives
- draggable Site, Region, and Planet node workspaces
- one shared `GraphNode` / `GraphPort` / `GraphConnection` projection layer
- one shared graph-node renderer and stable edge renderer across Site, Region, and Planet
- common selected-node projection, common connection-preview renderer, and adapter-based disconnect dispatch
- Region hidden-terminal → visible-boundary endpoint projection regression coverage
- detailed Hopper/stream/machine/boundary/transfer inspection
- stable live node and connection DOM
- deterministic automated tests / GitHub Actions

Issue #18 / PR #19 completed the shared graph architecture. Do **not** reintroduce hierarchy-specific graph renderers or parallel node/edge systems.

The active cleanup problem is now the application shell and remaining prototype-era concepts around that graph: separate Site vs parent workspace shells, inconsistent Inspector styling/sizing, different node/canvas dimensions, legacy Debug View/startup wiring, discovery/survey gating, and special `engineering` terminology/compatibility gates.

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

The project direction no longer uses Feature discovery/surveying to determine whether generated Regions, Sites, or Features exist in Player View.

After planet generation:

- all generated Regions are visible
- all generated Sites are visible in their Regions
- every generated Feature belongs to an enterable Site
- entering a Site exposes its Feature node(s)

Do not introduce or preserve `unknown/discovered` gating merely to hide generated structural entities.

Knowledge State remains useful for meaningful analysis/measurement data such as exact composition, estimates, sensor readings, characterization, uncertainty, or confidence.

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

The player-facing hierarchy uses **one shared node/port/connection architecture at every implemented scale**.

Do not interpret “uniform” as merely making separate Site, Region, and Planet renderers look similar.

From the player's perspective, primitive apparatus, Feature nodes, boundary buffers, and composite systems share this interaction language:

```text
select
→ drag/rearrange
→ inspect
→ connect typed ports where physically meaningful
→ enter/drill down if composite
→ observe live state
```

Examples:

```text
Primitive: Extractor, Hopper, Crusher, Magnetic Separator, Boundary Buffer
Physical Feature: Ore Deposit, Aquifer, Volcanic Vent, Reservoir, Cavern
Composite: Site, Region, Planet, Facility later
```

## Shared graph abstraction

Preserve the common graph responsibilities established by Issue #18:

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

Use one common path for:

- stable node DOM creation/update
- stable edge DOM/SVG creation/update
- graph-node selection state
- port rendering
- port drag/connect gesture
- graph-edge drawing
- edge selection
- connection preview
- adapter-based disconnect behavior

Do **not** reintroduce independent implementations equivalent to separate Site and Region/Planet graph renderers.

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

A critical invariant is:

> **If a connection exists in simulation/application graph state and belongs to the current workspace, a corresponding visible graph edge must exist.**

The reverse should also hold for normal player-created edges: a visible persistent edge must correspond to a real underlying connection, not a decorative line.

Do not allow a state where validation reports a source as already connected while the workspace shows no corresponding edge.

---

# Uniform Workspace Shell — Hard UI Contract

Planet, Region, and Site are different graphs inside the **same application shell**.

Target structure:

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

Do not maintain separate outer interaction-area designs for Site vs Region/Planet once the cleanup is complete.

The shared shell must own or standardize:

- graph viewport allocation/size behavior
- Inspector width
- Inspector background/border/spacing/typography
- normal node dimensions
- toolbar placement
- port and selected-node visual language
- edge visual language
- status/error presentation
- action/button styling

Specialized node content and modest type-specific colors are fine. Different hierarchy levels should not feel like different applications.

## Viewport pan / zoom contract

Use a fixed visible viewport over a larger logical graph world.

Per-workspace UI state should include conceptually:

```text
panX
panY
zoom
```

Requirements:

- mouse wheel zooms toward the pointer
- middle-mouse drag and/or Space + left-drag pans
- left-drag on a node continues to move the node
- port dragging continues to create connections
- toolbar exposes Zoom Out / Zoom In / Fit / Center and current zoom percentage
- zoom is bounded to a sane range
- each workspace remembers its own viewport transform
- node layer and SVG/connection layer use the same transform
- pointer coordinates are converted from screen/viewport coordinates to graph coordinates before node dragging or port interaction math
- viewport state remains UI/application state and must not affect simulation truth

Where practical, extract pure coordinate/viewport helpers so zoom/pan math can be unit-tested without browser DOM.

---

# One Inspector — Hard UI Contract

Use one Inspector container, style system, and interaction contract across Planet, Region, Site, Feature, boundary, machine, storage, and connection selection.

The outer structure should remain conceptually stable:

```text
INSPECTOR

TYPE / NAME

STATE
...

DETAILS
...

CONTROLS
...

CONNECTIONS / CONTENTS
...

ACTIONS
...
```

The selected entity determines which sections/fields appear. It must not determine a completely different Inspector panel design.

Do not retain one `.ws-inspector` system for Site and another `.ws-composite-inspector` system for Region/Planet after cleanup.

The Inspector must remain interactive while simulation runs. Build structural content when selection/structure changes and update live values in place where practical.

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

For Magnetic Separator specifically, show distinct live summaries for feed, concentrate, and tailings.

## Feature inspection

Feature inspection should expose generated physical properties and currently implemented interfaces/actions.

Do not display player-facing concepts such as:

```text
engineering available
engineering unavailable
```

A currently unimplemented Feature interaction is a development limitation, not a world-state classification.

---

# Application Start Flow — Hard Contract

Remove the prototype Debug/Player mode split from the application flow.

Target:

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

The landing screen owns world creation directly.

Generating a world should:

1. create World State;
2. create Knowledge State;
3. initialize world simulation;
4. initialize Player workspace state;
5. transition directly to Planet workspace.

Do not generate a Player world by filling hidden Debug inputs and programmatically clicking a Debug button.

## Remove legacy Debug presentation

Remove from the normal app:

- Debug / Player mode toggle
- old Debug Planet Generator header and summary panels
- legacy Regions debug listing
- global Discover Feature button/counter
- old prototype batch/process UI panels
- obsolete debug-only UI state and event handlers that exist solely for those panels

Removing the Debug View does **not** mean deleting valid generator, simulation, material/process APIs, or tests merely because the old UI once exercised them.

Do not create a replacement hidden Debug View in the same cleanup.

---

# Planet → Region → Site — No Special Engineering Mode

The player hierarchy is simply:

```text
Planet Workspace
      ↓
Region Workspace
      ↓
Site Workspace
```

A Site is not a special Engineering Mode.

Remove or rename player/application concepts such as:

```text
currentLevel === 'engineering'
renderEngineeringWorkspace()
createEngineeringSession()
engineeringSessions
engineering available
engineering unavailable
compatibleOccurrenceForSite()
```

Use ordinary Site language instead, conceptually:

```text
currentLevel === 'site'
renderSiteWorkspace()
createSiteSession()
siteSessions
```

Do not gate Site entry on iron ore, process compatibility, or whether a particular prototype apparatus can currently use the Feature.

Every generated Site is enterable.

---

# Sites and Features — Hard World/UI Contract

A Site is a geographically bounded composite workspace associated with a Region.

A Feature is a physical world system located inside a Site.

The intended hierarchy is:

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

World generation must not create Sites only for Features with a currently supported `ResourceOccurrence`.

Every generated Feature must be associated with an enterable Site from world creation onward.

Prefer the Site shape:

```text
featureIds: [...]
```

over a singular `featureId`, even if current generation creates one Feature per Site.

This preserves the long-term ability for one Site to contain multiple Features.

If the serialized world shape changes, increment `schemaVersion` and update version-sensitive tests/fixtures accordingly.

## Features appear as graph nodes inside Site

Entering a Site should expose its Feature node(s) through the shared graph system.

Feature nodes should be:

- visible immediately after world creation when entering the Site
- selectable
- inspectable
- laid out in Site UI state
- able to expose typed ports/interfaces where physically appropriate

Do not require a Feature to become a separate nested workspace simply because it is a node. The Site is the location/workspace.

## Every Feature should eventually be exploitable/interactable

The long-term design rule is:

> **A Feature should exist because it creates a physical opportunity, constraint, resource, environment, or interaction for the player—not merely as decorative world-generation metadata.**

Feature interfaces should follow physical meaning rather than a universal ore-source assumption.

Examples:

```text
Ore Deposit       → solid extraction
Injection Well    ← material/fluid input
Reservoir         ↔ fluid interaction
Storage Cavern    ↔ storage interaction
Volcanic Vent     → thermal/gas/fluid opportunities later
```

Future interface kinds may include material, fluid, gas, thermal/energy, pressure/environment, data/measurement, or other types when active gameplay requires them.

The active cleanup does **not** need to implement mature exploitation mechanics for every Feature type. It must establish the correct accessible Feature-node architecture and remove the old visibility/compatibility gates.

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
[Site Import] → local system / Feature interaction
```

## Site Export

Inside Site view, local systems connect into the Site Export buffer:

```text
local system → [Site Export]
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

Boundary nodes should remain visibly distinct and explicitly labeled.

---

# No Implicit Cross-Boundary Logistics

A boundary existing does **not** imply transportation.

Do not automatically create Site → Region transfers when a Site session is created, entered, reset, or registered.

The player must explicitly create the connection that moves matter across the next hierarchy level.

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

# Current Immediate Priority — Unified Game Interface / Prototype Cleanup

The active corrective milestone is:

> **Planet, Region, and Site are different graphs inside the same interface—not different interfaces.**

This is a cleanup and structural UI milestone. Preserve the physical simulation while removing prototype-era application structure and terminology.

## Required implementation direction

1. Replace the Debug/Player mode split with a dedicated landing screen and direct world creation.
2. Remove the legacy Debug View and debug-only presentation/event-handling code.
3. Transition from world generation directly into Planet workspace.
4. Remove global Feature discovery, Prototype Survey Bootstrap, discovery counters, and structural visibility gating.
5. Ensure all generated Regions and Sites are visible immediately.
6. Ensure every generated Feature is associated with an enterable Site.
7. Change Site data toward `featureIds` rather than singular `featureId`; bump schema if serialized shape changes.
8. Make every Site enterable regardless of process/resource compatibility.
9. Remove/rename `engineering` workspace/session concepts to normal Site terminology.
10. Render Feature node(s) inside Site workspaces through the shared graph architecture.
11. Do not classify Features as engineering available/unavailable.
12. Build one shared outer workspace shell for Planet, Region, and Site.
13. Standardize normal node dimensions rather than hierarchy-specific default sizes.
14. Build one fixed graph viewport with common pan/zoom/fit/center behavior.
15. Store per-workspace viewport transform as UI state.
16. Ensure pan/zoom transforms both node and edge layers identically.
17. Convert pointer coordinates correctly under zoom for node movement and connections.
18. Use one Inspector container/style/update contract everywhere.
19. Consolidate overlapping UI/CSS rules rather than adding another permanent override layer where practical.
20. Preserve the shared graph architecture from Issue #18.
21. Preserve recursive boundary ownership, explicit logistics, matter conservation, backpressure, process physics, world clock, and machine state.
22. Keep the current automatic iron-processing prototype only as needed for simulation validation; it must not gate Site entry or define Feature availability.
23. Remove dead prototype code only when no retained test/runtime behavior depends on it.
24. Run all automated tests and perform a browser smoke pass for viewport/Inspector/entry interaction.

---

# Required Regression Coverage for the Cleanup

Add fast deterministic coverage where practical.

## World / Site / Feature structure

Prove that:

- every generated Region remains represented in the Planet workspace model
- every generated Feature is associated with a Site
- every generated Site is addressable/enterable regardless of current process compatibility
- a Feature with zero resource occurrences still receives an enterable Site
- Site `featureIds` reference valid Features
- no Site/Feature structural visibility depends on discovery state
- world generation remains deterministic for the same seed

## Knowledge isolation

Prove that:

- removing Feature discovery gating does not collapse World and Knowledge state
- material-batch analysis continues to update Knowledge only
- future measurement/analysis state can remain separate from physical truth

Delete or rewrite tests whose only purpose was validating the removed structural discovery mechanic.

## Viewport math

Where extracted as pure helpers, prove:

- screen → graph coordinate conversion is correct at different zoom values
- pan offsets are correctly applied
- zooming around a pointer preserves the intended graph point under the cursor
- Fit/Center calculations do not mutate node positions or simulation state

## Shared shell / graph invariants

Preserve proof that:

- local Site connections render as graph edges
- Region BoundaryTransfers render as graph edges
- Planet BoundaryTransfers render as graph edges
- hidden boundary adapters resolve to visible endpoints
- selected-node state is consistent
- connection preview remains common
- disconnect dispatch reaches the correct simulation adapter

## Ownership / physics regression

All existing relevant tests for:

- constituent conservation
- backpressure
- Hopper capacity
- Crusher / Magnetic Separator physics
- world-owned simulation clock
- machine state
- recursive boundary ownership
- explicit boundary transfer
- stable graph identity

must remain green.

## Browser smoke pass

Automated Node tests may not fully exercise DOM/SVG pointer behavior. Manually verify at minimum:

- landing screen generates a world and opens Planet view
- Planet → Region → Site navigation works for different Feature types
- all Sites are enterable
- Feature nodes appear inside Sites
- node dragging works at 100%, zoomed in, and zoomed out
- port drag/connect preview stays aligned while zoomed/panned
- edges remain aligned with ports during pan/zoom
- Fit and Center behave predictably
- Inspector geometry/style is the same at Planet, Region, and Site levels
- world Pause/Resume remains functional
- existing automated systems continue running when navigating elsewhere

---

# Explicitly Out of Scope for This Cleanup

Do not expand the cleanup into unrelated gameplay systems unless strictly necessary for the structural changes above:

- mature exploitation mechanics for every generated Feature type
- realistic rail/truck/conveyor pathfinding
- logistics scheduling/economics
- splitter/merger gameplay
- precise geological depletion/reserves
- a new survey/discovery system
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
- full replacement of the current prototype processing chain with player construction

The purpose is to make the current game interface and hierarchy coherent before adding more simulation domains.

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

# Development Philosophy

For simulation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

For gameplay features, ask:

> **What physical world state does this act on?**

For generated Features, ask:

> **What physical opportunity, constraint, resource, environment, or interaction does this Feature create?**

When a parent/child design choice is ambiguous, favor the option that preserves:

1. physical conservation
2. one clear physical owner
3. explicit interfaces
4. one shared player-facing graph language at every scale
5. one shared application shell and interaction language
6. automation
7. future composition/nesting

without adding unnecessary machinery to the active issue.