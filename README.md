# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is to turn the matter and energy available in an unfamiliar world into a self-sustaining industrial network. Interlink is intended to become an interactive engineering workspace built from physical resources, material and energy streams, processes, storage, logistics, instrumentation, automation, and recursively nested systems.

A guiding progression principle is:

> **Yesterday's factory becomes today's machine.**

The canonical long-term game design is documented in [`DESIGN.md`](DESIGN.md). This README records the current implementation state and near-term architectural direction.

---

# Core Gameplay Direction

The intended gameplay loop is:

```text
Acquire
  ↓
Analyze
  ↓
Experiment
  ↓
Engineer
  ↓
Blueprint
  ↓
Automate
  ↓
Scale
  ↓
Optimize
  ↺
```

Automation is not intended to be a late-game convenience. The player should learn Interlink's system language from the beginning:

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

Player-facing systems should increasingly replace repetitive action buttons with physical systems that operate continuously when their requirements are satisfied.

---

# Current State

The project has a deterministic world-generation foundation, discrete material-processing semantics, a continuous solid-material simulation, and the first recursive Site/Region/Planet runtime model.

Current implemented behavior includes:

- deterministic seeded planet generation and causal generation passes
- regions, hidden features, and normalized `ResourceOccurrence` entities
- World / Knowledge / UI state separation
- deterministic namespaced RNG streams
- physical `MaterialBatch` state for meaningful discrete lots/samples
- provenance separated from current material identity
- particle size as a modeled material property
- reusable `ProcessDefinition` metadata with explicit ports and parameters
- Crushing and Magnetic Separation with shared discrete/continuous transformation physics
- continuous `MaterialStream` rate/state objects
- finite-capacity Hopper nodes that physically own bulk matter
- automated prototype extraction from a real occurrence
- continuous Crusher and Magnetic Separator execution
- constituent-level and total-mass conservation
- transactional process/backpressure behavior
- one-to-one material port connections until an explicit splitter is implemented
- connection compatibility tied to actual solver semantics
- world-owned fixed-step simulation with global Pause/Resume
- per-machine `enabled` plus `off / idle / running / blocked` operating state
- persistent per-Site engineering sessions while navigating elsewhere
- recursive Site and Region system metadata with typed boundary ports
- explicit Site Import / Site Export and Region Import / Region Export physical boundary buffers
- conserved cross-boundary transfer primitives
- draggable Site, Region, and Planet node workspaces
- detailed live Hopper, stream, machine, boundary, and transfer inspection
- stable node/connection DOM during live simulation
- retained Debug View
- deterministic `node:test` regression coverage and GitHub Actions CI

The serialized versions are currently:

```text
schemaVersion: 5
generatorVersion: 2
```

The first continuous processing chain remains:

```text
Resource Occurrence
        ↓
Extractor
        ↓
Raw Ore Hopper
        ↓
Crusher
        ↓
Crushed Ore Hopper
        ↓
Magnetic Separator
       ├────────→ Concentrate Hopper
       └────────→ Tailings Hopper
```

## Important current UX/architecture gap

The hierarchy is now visibly node-based at Site, Region, and Planet scale, but the implementation still contains **two separate graph/connection UI stacks**:

- Site engineering uses the blueprint node/connection/stream renderer and interaction code.
- Region and Planet use a separate parent-system node/`BoundaryTransfer` renderer and interaction path.

That duplication can make the UI disagree with simulation truth. For example, a Region-level transfer can exist and reject a second connection as “already connected” while the corresponding visible edge is missing.

This is not a conservation-model problem. It is a workspace-architecture problem.

The next corrective pass is tracked in **Issue #18** and should unify all implemented hierarchy levels behind one shared node/port/connection presentation and interaction layer.

---

# Foundational State Architecture

Interlink separates three kinds of state:

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

Physical truth must not migrate into DOM/UI state merely because it is easier to render there.

Knowledge actions reveal or estimate world truth; they do not mutate world truth merely because the player learned it.

Workspace node positions are UI/application state unless a future gameplay rule explicitly gives spatial coordinates physical meaning.

---

# Matter, Storage, and Streams

Natural resources are physical feedstocks with generated composition, not arbitrary crafting tokens.

For stored material, constituent quantities are authoritative. Percentages shown to the player are derived values.

A guiding rule is:

> **Abstract the history. Preserve the resulting matter.**

## Physical ownership

Every modeled unit of matter must have one physical owner/location at a time, such as:

- natural occurrence/reserve
- hopper/bin/tank/vessel/stockpile
- machine internal buffer/chamber
- boundary buffer
- explicit transport inventory when transit is modeled
- discrete package/sample where discreteness matters

There should not be a magical free-floating bulk inventory dimension.

## MaterialBatch

`MaterialBatch` is for physically meaningful discrete lots such as samples, packages, shipments, or isolated process charges.

It must not be used as the unit of continuous flow.

## MaterialStream

A continuous stream is a rate/state relation between ports:

```text
MaterialStream
├── constituent mass-flow rates (kg/s)
├── total mass flow (derived)
├── particle size
└── additional physical properties later when gameplay requires them
```

Do not create a new batch every simulation tick.

## Containers and boundary buffers

Containers integrate streams over time:

```text
stored quantity += inflow × dt
stored quantity -= outflow × dt
```

If contents physically mix, aggregate the resulting material state rather than retaining arbitrary historical transfer objects.

Composite-system boundaries that can hold matter should follow the same ownership rule: the boundary buffer is the physical owner while material waits to cross the hierarchy boundary.

---

# Throughput, Blocking, and Conservation

Industrial behavior should emerge from physical limits.

Example:

```text
Extractor: 5 kg/s
Crusher:   4 kg/s
```

With a finite Hopper between them, the Hopper accumulates approximately 1 kg/s until another constraint changes the flow.

For a continuous process timestep, feasible throughput should be limited by:

```text
input available
process capacity × dt
all required output free capacity
connectivity / operating requirements
```

Processes must not consume matter unless the corresponding outputs can be committed. Missing/full outputs should block or throttle equipment rather than destroy matter, and partial input availability must never create a full requested output.

---

# Player Interface: One Node Language at Every Scale

The Player View uses a **uniform node-workspace language across scales**.

From the player's perspective:

> **Anything that can be treated as a system can be represented as a node with an explicit external interface.**

Internally, the simulation may distinguish primitive apparatus from composite systems, but the player's core interaction model should remain consistent.

## Primitive and composite nodes

Primitive examples:

```text
Extractor
Hopper
Crusher
Magnetic Separator
Boundary Buffer
Pump later
```

Composite examples:

```text
Site
Facility
Region
Planet
Player-created production system later
```

A composite node contains another workspace/subgraph.

The common interaction language is:

```text
select
→ drag/rearrange
→ inspect
→ connect ports
→ enter/drill down if composite
→ observe live state
```

## One graph architecture, not merely similar-looking views

Uniformity means more than making Region and Planet nodes visually resemble Site machinery.

All implemented workspace levels should project into the same player-facing graph abstraction:

```text
GraphNode
├── id
├── label / type
├── layout position
├── typed ports
├── selectable / inspectable
└── enterable child workspace when composite

GraphConnection
├── source node + port
├── target node + port
├── live state / flow summary
├── selectable / inspectable
└── disconnect action
```

The same renderer and interaction code should handle:

- node dragging
- port dragging / connection creation
- edge drawing
- edge selection
- Inspector selection
- disconnect behavior
- layout state
- composite drill-down

The simulation object behind a connection may differ. A Site-local edge may resolve to a `MaterialStream`, while a Region/Planet edge may resolve to a hierarchy-crossing `BoundaryTransfer`. That difference belongs behind the shared graph interface; it should not create a second player-facing graph system.

The invariant is:

> **If a connection exists in simulation state, the current workspace must represent it as the corresponding graph edge.**

## Draggable workspace hierarchy

Target presentation:

```text
PLANET WORKSPACE

[ Region A ] ─────────────→ [ Region B ]
     ↓ enter

REGION A WORKSPACE

[ Region Import ] ──→ [ Processing Site ]
[ Mining Site ] ─────→ [ Region Export ]
      ↓ enter

MINING SITE WORKSPACE

[ Site Import ] ──→ local systems
Resource → Extractor → Hopper → Processing → [ Site Export ]
```

Planet, Region, and Site workspaces should therefore share the same visual interaction model and implementation primitives:

- stable draggable node DOM
- workspace-specific layout state
- typed ports
- connection drawing
- selection
- live Inspector
- composite enter/drill-down action

Layout movement is application state and must not mutate physical matter.

---

# Composite Boundaries: Explicit Import and Export Buffers

Every composite system that can exchange matter with its parent should expose explicit child-visible boundary nodes.

For the current hierarchy, a normal Site should have both:

```text
Site Import Boundary Buffer
Site Export Boundary Buffer
```

and a Region should likewise have:

```text
Region Import Boundary Buffer
Region Export Boundary Buffer
```

## Direction semantics

The same boundary is viewed from opposite sides of the hierarchy.

A Site Import looks like an input port on the Site node from the Region workspace:

```text
REGION WORKSPACE

material ───→ ○ [ Site ]
```

Inside the Site, the same physical buffer exposes an output toward local systems:

```text
SITE WORKSPACE

[ Site Import ] ○ ───→ Hopper / machine / feature
```

A Site Export is the reverse:

```text
SITE WORKSPACE

local system ───→ ○ [ Site Export ]
```

which appears at Region level as:

```text
[ Site ] ○ ───→ regional logistics
```

## One physical buffer, two hierarchy views

The internal boundary node and the parent-facing composite port are **not separate inventories**.

For example:

```text
Site Export Buffer = 347 kg
```

may be displayed both inside the Site and on the Site node in Region view, but there is still only one physical 347 kg state.

Never implement:

```text
347 kg internal + 347 kg external
```

for the same boundary.

## No implicit transfer

A boundary existing does not automatically move material.

Desired behavior:

```text
Concentrate Hopper
    ↓ player-created Site connection
Site Export Buffer
    ↓ player-created Region-level connection
Region logistics / Region Export Buffer
    ↓ player-created Planet-level connection
Destination Region Import Buffer
```

If the player has not created the next connection, the current buffer should simply accumulate until it fills and backpressure propagates naturally.

Do not automatically create a Site → Region export transfer merely because the Site has been entered or initialized.

---

# Features Inside Sites

A Site is not synonymous with one `ResourceOccurrence`. It is a geographically bounded composite system that may contain one or more features/resources plus apparatus.

Features may eventually expose interfaces appropriate to their physical behavior. Some are sources; others may receive matter or support bidirectional interaction.

Examples include:

```text
ore deposit            → extraction source
injection well         ← fluid input
storage cavern         ↔ material/fluid
waste disposal feature ← waste
reservoir              ↔ water
backfill area           ← fill material
```

The current prototype does not need to implement every feature interaction type, but the Site Import/Export architecture must not assume Sites can only send material outward.

---

# Simulation Time and Machine Control

World time and machine control are different concepts:

```text
WORLD TIME
Running / Paused

MACHINE COMMAND STATE
Enabled / Disabled

MACHINE OPERATING STATE
Off / Idle / Running / Blocked / Faulted later
```

The world simulation runs by default.

Pause is a player time-control/inspection tool. Pausing must not change machine `enabled` values. Resuming continues with the same command state.

Simulation belongs to the world/session, not the currently visible workspace. Leaving a Site or Region must not make automated systems stop merely because the player is looking elsewhere.

New active machinery defaults disabled/off. `enabled: true` means operation is permitted, not guaranteed. An enabled machine may still be Idle or Blocked and should resume automatically when the physical constraint clears.

---

# Inspector and Live UI Contract

The Inspector must remain fully usable while simulation is running.

Stable interactive DOM is the correct direction: do not return to rebuilding nodes, connections, or Inspector controls every animation frame.

However, stable rendering must not reduce the amount of useful physical information available to the player.

## Storage / boundary-buffer inspection

At minimum show:

```text
Stored mass
Capacity
Free capacity
Particle size
Constituent masses
Derived constituent percentages where useful
Current inflow/outflow when available
```

## Material-stream inspection

At minimum show:

```text
Source / target ports
Total flow kg/s
Particle size
Constituent flow rates kg/s
```

## Active-machine inspection

At minimum show useful configuration and live operating information, including where available:

```text
Enabled
Operating state
Configured throughput/capacity
Actual current throughput
Input/output port flow summaries
Particle-size constraints/settings
Process-specific parameters
Last blocking/error reason
```

For the Magnetic Separator, the player should be able to distinguish feed, concentrate, and tailings flow while it runs.

The preferred implementation is to build Inspector structure when selection changes and then update dynamic fields in place. Do not discard detailed fields merely because they require live updates.

---

# Debug Interface

Keep the existing Debug View available even as Player View becomes the primary experience.

It remains useful for:

- seed generation/control
- raw World Truth inspection
- Knowledge State debugging
- feature/resource validation
- discrete batch/process testing
- regression investigation

The Debug View should not dictate normal player interaction semantics.

---

# Immediate Development Priority

The next corrective milestone is **Issue #18: unify Site, Region, and Planet under one node/connection workspace architecture.**

The goal is not to redesign process physics or hierarchy ownership. It is to remove duplicate player-facing graph stacks so the same node/port/edge behavior is used everywhere.

Required direction:

```text
Shared Workspace Graph Layer
├── GraphNode projection
├── GraphPort projection
├── GraphConnection projection
├── one node renderer
├── one edge renderer
├── one drag/connect interaction path
├── one selection/Inspector path
└── adapters to underlying simulation objects
      ├── local MaterialStream / blueprint connection
      └── hierarchy BoundaryTransfer
```

Issue #18 should:

1. extract/generalize one reusable graph node renderer for primitive, boundary, Site, and Region nodes;
2. extract/generalize one reusable connection renderer for local streams and parent-level transfers;
3. use one drag-to-connect interaction path and one port compatibility presentation path;
4. use one connection selection/inspection/disconnect interaction at all hierarchy levels;
5. ensure every simulation connection visible in a workspace always has a corresponding edge;
6. preserve explicit Site/Region boundary buffers and one-owner matter conservation;
7. preserve local process physics and hierarchy-transfer physics behind adapters rather than forcing them into one solver;
8. keep layout state as UI/application state;
9. keep world simulation, machine state, Inspector detail, and Debug View unchanged unless required by the refactor;
10. add regression coverage for graph projection/edge visibility so a transfer cannot exist while its workspace shows no line.

Do not expand Issue #18 into richer logistics, pathfinding, power, surveying, thermodynamics, fluids, chemistry, or polished UI work.

---

# Near-Term Roadmap

1. **Issue #18 — one shared node/port/connection workspace architecture across Site, Region, and Planet.**
2. Stabilize the resulting shared graph API and context-sensitive interaction hooks.
3. Add an initial real survey-system process to replace prototype discovery bootstrap.
4. Deepen resource reserve/depletion and extraction physics when the player-facing loop can consume them.
5. Add explicit logistics apparatus/capacity such as conveyors, roads/rail, pipelines, or vehicles incrementally.
6. Add power/energy requirements and operating constraints.
7. Expand continuous processing, sensors, controllers, and automation.
8. Allow player-created solved subgraphs to become reusable composite nodes.
9. Introduce larger-scale aggregation/performance strategies for mature nested systems.
10. Expand chemistry, thermodynamics, pressure/vacuum, fluids/gases, and planetary/system-scale industry iteratively.

---

# Performance Direction

Favor aggregate state:

```text
streams    = rates/state
containers = stored quantities
processes  = transformations/capacities
systems    = graphs with explicit boundary contracts
layouts    = application-state node positions
```

World simulation frequency remains independent from rendering FPS.

Future optimization may include dependency/dirty-subgraph updates, Web Workers, or aggregated simulation of mature composite systems. Wasm should only be introduced if profiling justifies it.

Recursive boundaries should eventually allow a detailed solved child system to expose a smaller parent-level contract without requiring parent calculations to inspect every internal apparatus.

---

# Development Philosophy

For simulation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

For gameplay features, ask:

> **What physical world state does this act on?**

Prefer small coherent vertical slices, explicit physical ownership, and reusable interaction semantics over broad speculative abstractions.

---

# Running the Web App

Because the project uses JavaScript ES modules, run it through a local HTTP server from repository root:

```bash
python -m http.server 8000
```

or on Windows:

```bash
py -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Run automated tests with:

```bash
npm test
```

## GitHub Pages

The repository layout supports GitHub Pages from:

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

---

# Project Documentation

- [`DESIGN.md`](DESIGN.md) — canonical long-term Interlink game design
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — implementation guidance and current coding-agent guardrails
- [`PATCH_NOTES.md`](PATCH_NOTES.md) — historical development record

Long-term design, current implementation state, implementation guardrails, and development history should remain distinct.