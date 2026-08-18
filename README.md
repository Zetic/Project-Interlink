# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is to turn the matter and energy available in an unfamiliar world into a self-sustaining industrial network. Interlink is intended to become an interactive systems workspace built from physical resources, material and energy streams, processes, storage, logistics, instrumentation, automation, and recursively nested systems.

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

The project has a deterministic world-generation foundation, discrete material-processing semantics, a continuous solid-material simulation, recursive Site/Region/Planet runtime ownership, and a shared player-facing graph architecture.

Current implemented behavior includes:

- deterministic seeded planet generation and causal generation passes
- Regions, Features, Sites, and normalized `ResourceOccurrence` entities
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
- persistent per-Site simulation sessions while navigating elsewhere
- recursive Site and Region system metadata with typed boundary ports
- explicit Site Import / Site Export and Region Import / Region Export physical boundary buffers
- conserved cross-boundary transfer primitives
- draggable Site, Region, and Planet node workspaces
- one shared `GraphNode` / `GraphPort` / `GraphConnection` projection and rendering layer across Site, Region, and Planet
- shared node rendering, edge rendering, selection, connection preview, and adapter-based disconnect behavior
- detailed live Hopper, stream, machine, boundary, and transfer inspection
- stable node/connection DOM during live simulation
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

## Current interface cleanup gap

Issue #18 / PR #19 successfully unified the underlying graph interaction architecture, but the application still visibly carries several prototype-era interface systems around that shared graph.

Current cleanup targets include:

- Site workspaces and Region/Planet workspaces still use different outer layout shells
- normal Site nodes and parent/composite nodes use different default dimensions
- Site and parent workspaces use different canvas dimensions and overflow behavior
- Site Inspector and Region/Planet Inspector use different widths, colors, spacing, and DOM structures
- the original Debug View / Planet Generator interface still exists beside the Player View
- Player View world creation still reaches back into the old Debug UI controls
- legacy Discover / Prototype Survey behavior still gates Feature/Site visibility
- Site entry is still coupled to prototype process compatibility
- the code still uses `engineering` as a special workspace/session concept even though a Site should simply be another recursive game workspace

The next cleanup milestone should make the game feel like one application at every hierarchy level rather than several prototypes sharing simulation code.

---

# Foundational State Architecture

Interlink separates three kinds of state:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
measurements, analyses, estimates, and other information learned by the player
        ↓
APPLICATION / UI STATE
selection, node layout, viewport position/zoom, panels, temporary interaction state
```

Physical truth must not migrate into DOM/UI state merely because it is easier to render there.

Knowledge actions may reveal measurements or estimates of world truth; they do not mutate physical truth merely because the player learned something.

## Structural visibility is not a Knowledge gate

The current design direction no longer uses Feature discovery/surveying to decide whether generated world structure exists in the player interface.

After planet generation:

- all generated Regions exist and are visible
- all generated Sites exist and are visible in their Region
- every generated Feature belongs to an enterable Site
- entering a Site exposes its generated Feature node(s)

Knowledge State remains important for actual information such as material analysis, composition estimates, sensor measurements, confidence, and future scientific characterization. It should not be used simply to hide generated Regions, Sites, or Features.

Workspace node positions and viewport pan/zoom are UI/application state unless a future gameplay rule explicitly gives those coordinates physical meaning.

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

## Primitive, physical, and composite nodes

Primitive/apparatus examples:

```text
Extractor
Hopper
Crusher
Magnetic Separator
Boundary Buffer
Pump later
```

World-Feature examples:

```text
Ore Deposit
Volcanic Vent
Aquifer
Reservoir
Storage Cavern
Salt Flat
Fault / geological structure
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
→ connect typed ports where physically meaningful
→ enter/drill down if composite
→ observe live state
```

## One graph architecture

Issue #18 established a shared player-facing graph abstraction:

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

The simulation object behind a connection may differ. A Site-local edge may resolve to a `MaterialStream`, while a Region/Planet edge may resolve to a hierarchy-crossing `BoundaryTransfer`. That difference belongs behind the shared graph interface; it must not create a second player-facing graph system.

The invariant is:

> **If a connection exists in simulation state, the current workspace must represent it as the corresponding graph edge.**

---

# One Workspace Shell at Every Scale

The next interface direction is stronger than shared graph mechanics: Planet, Region, and Site should be different graphs rendered inside the **same application shell**.

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
│       pan / zoom / nodes / connections       │   same width   │
│                                              │   same style   │
│                                              │   everywhere   │
└──────────────────────────────────────────────┴────────────────┘
```

The hierarchy changes the graph contents, not the surrounding interface.

The shared shell should standardize:

- viewport dimensions / available screen allocation
- Inspector width and styling
- node dimensions for normal nodes
- panel backgrounds, borders, typography, and spacing
- toolbar placement
- selected-state styling
- port styling
- connection styling
- action/button presentation
- status/error presentation

Specialized node colors or content are fine; hierarchy-specific visual systems are not.

## Pan and zoom

The visible graph area should be a fixed viewport over a larger logical graph world.

Conceptually:

```text
VIEWPORT
  └── GRAPH WORLD
      ├── node layer
      └── connection/SVG layer

viewport state:
  panX
  panY
  zoom
```

Expected interaction direction:

- mouse wheel zooms toward the pointer
- middle-mouse drag and/or Space + left-drag pans
- left-drag on a node moves the node
- drag from a port creates a connection
- toolbar provides Zoom Out / Zoom In / Fit / Center
- each workspace remembers its own viewport state

Node positions and viewport transforms remain application state. Pointer-to-graph coordinate conversion must account for zoom so dragging and connecting remain accurate at every scale.

---

# Planet → Region → Site: No Special "Engineering" Mode

The hierarchy should read simply as:

```text
Planet Workspace
      ↓ enter Region
Region Workspace
      ↓ enter Site
Site Workspace
```

A Site is not an "Engineering Mode" and should not require an "engineering interaction" compatibility check.

The code and UI should move away from concepts such as:

```text
engineering available
engineering unavailable
compatibleOccurrenceForSite()
currentLevel === 'engineering'
renderEngineeringWorkspace()
createEngineeringSession()
engineeringSessions
```

and toward ordinary Site concepts such as:

```text
currentLevel === 'site'
renderSiteWorkspace()
createSiteSession()
siteSessions
```

Every generated Site should be enterable regardless of which process prototypes are currently implemented.

---

# Sites and Features

A Site is a geographically bounded composite workspace. A Feature is a physical world system located at a Site.

The intended relationship is:

```text
Planet
  └── Region
      └── Site
          ├── Feature(s)
          ├── Site Import
          ├── Site Export
          └── player apparatus / storage / processes
```

## Every generated Feature gets a Site

World generation should no longer create Sites only for Features that happen to contain a currently supported resource occurrence.

Every generated Feature should belong to an enterable Site from world creation onward.

The Site data model should prefer:

```text
featureIds: [...]
```

over a singular `featureId`, even if generation initially produces one Feature per Site. This preserves the intended long-term model where one geographic Site may contain multiple related Features.

A serialized shape change should increment `schemaVersion` appropriately.

## Features are real graph nodes inside Sites

Entering a Site should make its Feature(s) visible as selectable and inspectable nodes in the Site graph.

Examples:

```text
[ Ore Deposit ] → extraction apparatus
[ Injection Well ] ← fluid/material input
[ Reservoir ] ↔ fluid interaction
[ Storage Cavern ] ↔ storage interaction
[ Volcanic Vent ] → heat / gas / fluid opportunities later
```

A Feature does not need to be another nested workspace merely because it is selectable. The Site is the location/workspace; the Feature is a physical system inside it.

## Every Feature should create a gameplay opportunity

Long term, every Feature type generated by the game should be exploitable or interactable in some meaningful physical way.

A useful design rule is:

> **A Feature should exist because it creates a physical opportunity, constraint, resource, environment, or interaction for the player—not merely as decorative world-generation metadata.**

Different Feature types should eventually expose interfaces appropriate to their physical behavior. Do not assume every Feature is simply a material-output source.

Future interfaces may include material, fluid, gas, heat/energy, pressure/environment, data/measurement, or other typed interactions as gameplay requires them.

The current cleanup milestone does **not** need to implement full exploitation mechanics for every generated Feature type. It must, however, remove visibility/entry gating and establish the correct Site/Feature architecture so those interactions can be added incrementally.

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
[ Site Import ] ○ ───→ local system / Feature interaction
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

Never implement duplicated inventory for the same boundary.

## No implicit transfer

A boundary existing does not automatically move material.

Desired behavior:

```text
local system
    ↓ player-created Site connection
Site Export Buffer
    ↓ player-created Region-level connection
Region logistics / Region Export Buffer
    ↓ player-created Planet-level connection
Destination Region Import Buffer
```

If the player has not created the next connection, the current buffer should simply accumulate until it fills and backpressure propagates naturally.

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

# One Inspector Contract

Planet, Region, Site, Feature, boundary, machine, storage, and connection selection should all use one Inspector container and design language.

The surrounding Inspector should remain stable:

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

Content varies by selected entity; the panel width, typography, spacing, colors, section styling, action placement, and live-update behavior should not.

The Inspector must remain fully usable while simulation is running. Prefer building structural content when selection changes and updating live values in place rather than rebuilding the interaction tree every frame.

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

## Feature inspection

A Feature Inspector should present the generated physical properties and currently implemented interfaces/actions for that Feature without labeling the Feature as "engineering available" or "engineering unavailable."

---

# Application Start Flow

The long-term application should not start inside a debug/prototype interface.

Target startup flow:

```text
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

The landing screen owns world creation directly. Generating a world should:

1. create World State;
2. create Knowledge State;
3. initialize the world simulation;
4. initialize Player workspace state;
5. transition directly to the Planet workspace.

Player world generation must not simulate a click on hidden Debug View controls.

---

# Remove Legacy Debug / Discovery Presentation

The original Debug View, mode toggle, Planet Generator summary UI, global Discover Feature button, and prototype batch/process panels were useful during early development but should now be removed from the normal application.

Removing the Debug View means removing its **presentation and obsolete UI-only coordination code**, not deleting valid simulation APIs, generators, process physics, or automated tests merely because those systems were once exercised through the Debug UI.

The cleanup should remove dead debug-only handlers and state once their presentation is gone.

Feature discovery / survey gating should also be removed from the normal world flow:

```text
Generate World
→ all Regions visible
→ all Sites visible
→ all Sites enterable
→ all generated Feature nodes visible inside their Sites
```

Knowledge State remains for meaningful measurements and analysis rather than structural visibility.

---

# Immediate Development Priority

The next milestone is a **major player-interface and prototype-code cleanup**.

The goal is:

> **Planet, Region, and Site are different graphs inside the same interface—not different interfaces.**

The cleanup should:

1. replace the Debug/Player mode system with a Landing → Game flow;
2. remove the old Debug View, mode toggle, legacy global discovery UI, and debug-only processing presentation;
3. make all generated Regions and Sites immediately visible;
4. create/associate an enterable Site for every generated Feature;
5. move the Site model toward `featureIds` and bump schema version if the serialized shape changes;
6. make every Site enterable without process/ore compatibility gating;
7. remove the special `engineering` workspace/session concept and rename it to ordinary Site terminology;
8. render generated Feature node(s) inside Site workspaces;
9. retain Feature-specific physical interfaces as an extensible concept without requiring all Feature exploitation mechanics in this cleanup;
10. create one shared workspace shell for Planet, Region, and Site;
11. standardize normal node dimensions and UI styling;
12. create one fixed graph viewport with shared pan, zoom, Fit, and Center behavior;
13. store viewport pan/zoom per workspace as UI state;
14. use one Inspector container/style/update contract at every hierarchy level;
15. preserve the shared graph architecture established by Issue #18;
16. preserve matter ownership, recursive boundary buffers, explicit logistics, backpressure, world time, machine state, and process physics;
17. add regression coverage for Site/Feature generation, direct visibility/entry, viewport coordinate transforms where practical, and existing simulation invariants;
18. perform a browser smoke pass because pan/zoom and shell behavior are DOM/pointer-interaction heavy.

This pass should clean and consolidate the current UI/CSS rather than add another override layer where practical.

---

# Near-Term Roadmap

1. **Unified workspace shell / startup / Feature-access cleanup.**
2. Stabilize shared viewport, Inspector, and context-sensitive interaction APIs.
3. Replace remaining prototype auto-layout/auto-created processing assumptions with player construction workflows where useful.
4. Deepen Feature-specific exploitation one physical interaction type at a time.
5. Deepen resource reserve/depletion and extraction physics when the player-facing loop can consume them.
6. Add explicit logistics apparatus/capacity such as conveyors, roads/rail, pipelines, or vehicles incrementally.
7. Add power/energy requirements and operating constraints.
8. Expand continuous processing, sensors, controllers, and automation.
9. Allow player-created solved subgraphs to become reusable composite nodes.
10. Introduce larger-scale aggregation/performance strategies for mature nested systems.
11. Expand chemistry, thermodynamics, pressure/vacuum, fluids/gases, and planetary/system-scale industry iteratively.

---

# Performance Direction

Favor aggregate state:

```text
streams    = rates/state
containers = stored quantities
processes  = transformations/capacities
systems    = graphs with explicit boundary contracts
layouts    = application-state node positions
viewports  = application-state pan/zoom
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

For generated Features, ask:

> **What physical opportunity, constraint, resource, environment, or interaction does this Feature create?**

Prefer small coherent vertical slices, explicit physical ownership, reusable interaction semantics, and one consistent application language over broad speculative abstractions.

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