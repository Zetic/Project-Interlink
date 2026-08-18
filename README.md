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

The project now has both a discrete material-processing foundation and its first continuous engineering-workspace prototype.

Current implemented behavior includes:

- deterministic seeded planet generation
- causal planet-generation passes
- regions, hidden features, and normalized `ResourceOccurrence` entities
- World / Knowledge / UI state separation
- deterministic namespaced RNG streams
- physical `MaterialBatch` state for meaningful discrete lots/samples
- provenance separated from current material identity
- particle size as a modeled material property
- reusable `ProcessDefinition` metadata with explicit ports and parameters
- Crushing and Magnetic Separation with shared discrete/continuous transformation physics
- deterministic batch process chaining with atomic commits
- continuous `MaterialStream` rate/state objects
- finite-capacity Hopper nodes that physically own bulk matter
- automated prototype extraction from an occurrence
- continuous Crusher and Magnetic Separator execution
- constituent-level and total-mass conservation
- transactional process/backpressure behavior for continuous machinery
- one-to-one material port connections until an explicit splitter is implemented
- connection compatibility checks tied to actual solver semantics
- recursive Planet → Region → Site system-node navigation with typed boundary ports
- world-owned fixed-step simulation with global Pause/Resume controls
- per-machine enabled/off/idle/running/blocked operating state
- per-site engineering sessions with draggable process/storage nodes
- live stream and node inspection
- retained Debug View for generation/discovery/batch-process testing
- deterministic `node:test` regression coverage and GitHub Actions CI

The first continuous chain is:

```text
Resource Occurrence
        ↓
Extractor
        ↓ material stream
Raw Ore Hopper
        ↓ material stream
Crusher
        ↓ material stream
Crushed Ore Hopper
        ↓ material stream
Magnetic Separator
       ├────────→ Concentrate Hopper
       └────────→ Tailings Hopper
```

The serialized world/generator versions remain:

```text
schemaVersion: 4
generatorVersion: 2
```

The continuous engineering runtime remains a prototype physical session, but its
sessions are registered with the world-level clock so navigation does not stop
automated systems.

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
selection, visual layout, panels, temporary controls
```

Physical truth must not migrate into DOM/UI state merely because it is easier to render there.

Knowledge actions should reveal or estimate world truth, not mutate that truth simply because the player learned it.

---

# Matter, Storage, and Streams

Natural resources are physical feedstocks with generated composition, not arbitrary crafting tokens.

For stored material, constituent quantities are authoritative. Percentages shown to the player are derived values.

A guiding rule is:

> **Abstract the history. Preserve the resulting matter.**

## Physical ownership

Bulk matter should exist because something physical is holding it:

- hopper
- bin
- silo
- tank
- pressure vessel
- machine buffer
- stockpile
- vehicle/cargo container
- discrete sample/package where discreteness matters

There should not be a magical free-floating bulk inventory dimension.

## MaterialBatch

`MaterialBatch` remains useful where a physically discrete lot matters, such as a sample, sealed package, cargo lot, reactor charge, or other isolated quantity.

It must not be used as the unit of continuous flow.

## MaterialStream

A continuous stream is a rate/state relation between ports, conceptually:

```text
MaterialStream
├── constituent mass-flow rates (kg/s)
├── total mass flow (derived)
├── particle size
└── other physical properties later when gameplay requires them
```

Do not create a new batch every simulation tick.

## Containers

Containers integrate streams over time:

```text
stored quantity += inflow × dt
stored quantity -= outflow × dt
```

If material is physically mixed in one container, the simulation should normally aggregate the resulting contents rather than retaining every historical transfer object.

---

# Throughput, Blocking, and Conservation

Industrial behavior should emerge from physical limits.

Example:

```text
Extractor: 5 kg/s
Crusher:   4 kg/s
```

With a finite hopper between them, the hopper accumulates approximately 1 kg/s until another constraint changes the flow.

For a process timestep, feasible throughput should be limited by:

```text
input available
process capacity × dt
required output capacity
connectivity / operating requirements
```

Processes must not consume matter unless the corresponding outputs can be committed. Missing/full outputs should block equipment rather than destroy matter, and partial input availability must never create a full requested output.

At any instant, matter should have exactly one physical owner/location: natural occurrence, storage, machine internal state, transport inventory when modeled, or another explicit physical holder.

---

# Player Interface: Recursive System Model

The Player View should use a **uniform system-node language across scales**.

This replaces the earlier assumption that Regions should merely look node-like without participating in the same interface model.

From the player's perspective:

> **Anything that can be treated as a system can be represented as a node with an explicit external interface.**

Internally, the implementation may distinguish primitive apparatus from composite systems, but the player interaction model should remain consistent.

## Primitive and composite nodes

Examples of primitive nodes:

```text
Extractor
Hopper
Crusher
Separator
Pump
```

Examples of composite nodes:

```text
Site
Facility
Region
Planet
Player-created production system
```

A composite node contains another workspace/subgraph.

The common interaction language should be:

```text
select
→ inspect
→ connect ports
→ enter/drill down when composite
→ observe state
```

## Boundary ports

Composite systems expose typed boundary ports to their parent workspace.

Example site:

```text
SITE WORKSPACE

Deposit → Miner → Hopper → [SITE ORE OUTPUT]
                     
                 [FUEL INPUT] → equipment later
```

At the Region level that same site may appear as:

```text
┌───────────────────┐
│ Iron Ridge Site   │
│                   │
│           ore out ○
└───────────────────┘
```

The parent does not need to know every internal apparatus to use the child's external contract.

## Recursive geography and logistics

The intended hierarchy is approximately:

```text
STAR/SYSTEM WORKSPACE (later)
        ↓
PLANET WORKSPACE
        ├── Region Node
        ├── Region Node
        └── Region Node
                 ↓ enter
          REGION WORKSPACE
                 ├── Site Node
                 ├── Site Node
                 ├── Logistics Nodes
                 └── Region Boundary Ports
                         ↓ enter site
                    SITE WORKSPACE
                         ├── Resource Occurrence
                         ├── Extractor
                         ├── Storage
                         ├── Processing
                         └── Site Boundary Ports
```

This allows logistics to interlink naturally at several scales:

```text
within site       → conveyors / local transport
within region     → road / rail / pipeline
between regions   → long-distance rail / pipeline / grid
between planets   → orbital/interplanetary logistics later
```

The interface language stays consistent even as the physical/logistical scale changes.

## Boundary ports do not teleport matter

A boundary port is an abstraction boundary, not free transportation.

For example:

```text
Mine
→ local handling
→ Site Output
→ regional transport node
→ Region Output
→ inter-region transport
→ destination Region Input
→ receiving system
```

Moving between hierarchy levels must preserve conservation and any modeled logistics constraints. Parent/child ports expose a system contract; they do not bypass transportation physics.

## Player-created systems

The same mechanism should eventually support selecting a solved subgraph and exposing it as a reusable composite component:

```text
Crusher → Separator → Storage
```

becomes:

```text
Ore Concentrator
feed in ○
         ○ concentrate out
         ○ tailings out
```

Entering the node reveals its internal system again.

This is the architectural basis for **“Yesterday's factory becomes today's machine.”**

---

# Simulation Time and Machine Control

World time and machine control are different concepts and must remain separate.

The intended model is:

```text
WORLD TIME
Running / Paused

MACHINE COMMAND STATE
Enabled / Disabled

MACHINE OPERATING STATE
Off / Idle / Running / Blocked / Faulted / other states later
```

## World simulation

The world simulation should run by default.

Pause is a player time-control/inspection tool. Pausing must not change machine `enabled` values. Resuming should continue with the same command state.

Long-term simulation ownership belongs to the world/session, not the currently visible Engineering workspace. Leaving a facility or Region should not make its automated systems stop merely because the player is looking elsewhere.

## Machine enable state

Active apparatus should have an explicit `enabled` control.

Examples:

```text
Extractor           enabled / disabled
Crusher             enabled / disabled
Magnetic Separator  enabled / disabled
Pump                enabled / disabled later
```

Newly placed active machinery should default to **disabled/off** so construction or wiring does not unexpectedly begin consuming resources.

Passive nodes such as ordinary storage do not need a universal On/Off switch.

`enabled` means the player/controller is permitting operation; it does not guarantee operation.

Example:

```text
Enabled: ON
State: BLOCKED
Reason: output storage full
```

When the blocking condition clears, an enabled machine should resume automatically.

This same `enabled` primitive should later be controllable by automation/controllers rather than creating a separate control concept.

---

# Inspector and Live UI Direction

The Inspector should remain usable while simulation is running.

The current prototype rebuilds engineering-node DOM repeatedly during the animation loop, which can interrupt click/drag interactions. The next UI iteration should keep interactive DOM objects stable and update only dynamic presentation state such as:

- hopper fill/quantity text
- stream width/rate
- operating-state indicators
- inspector values

A selected node/connection should remain selected while values update live.

The Inspector should progressively become a common interaction surface across hierarchy levels, not only engineering apparatus. Regions, Sites, composite systems, storage, machines, connections, and streams should be inspectable when useful.

---

# Discovery / Survey Direction

The current Debug View `Discover Feature` action and Player View prototype survey bootstrap are scaffolding.

Long-term discovery should itself be a system:

```text
Unknown world
    ↓
Survey apparatus/network
    ↓
Knowledge improves
    ↓
Features/resources become known
    ↓
measurement confidence improves
```

Do not build future progression around repeated manual discovery clicks.

---

# Debug Interface

Keep the existing prototype/debug view available for development even as the Player View becomes the primary experience.

It remains useful for:

- seed generation/control
- raw world values
- region/feature/resource inspection
- Knowledge State debugging
- discrete batch/process testing
- validation and regression investigation

The Debug View should not dictate final player interaction semantics.

---

# Current Known Gaps

After the recursive workspace milestone, important remaining gaps include:

- parent-level logistics remains an explicit transfer placeholder rather than realistic transport
- feature interaction/inspection remains limited
- survey bootstrap remains manual
- resource reserve/depletion remains approximate/unimplemented
- only solid-material Crushing and Magnetic Separation are implemented
- power, thermodynamics, fluids/gases, controls, transport capacity, and industrial logistics remain future systems

These are expected next-stage architecture tasks, not reasons to discard the existing matter/process foundation.

---

# Development Priority

The recursive simulation milestone is implemented as a prototype vertical
slice. The next milestone should build on it:

> **Extend the shared boundary contract into real surveying and logistics.**

The prototype should demonstrate at least this recursive flow:

```text
PLANET WORKSPACE

[Region A] ── logistics ── [Region B]
     ↓ enter

REGION A WORKSPACE

[Mining Site] ──→ [Regional Movement / Export]
      ↓ enter

MINING SITE WORKSPACE

Resource Occurrence
       ↓
Extractor (default OFF)
       ↓
Hopper
       ↓
Crusher (default OFF)
       ↓
Site Output
```

At the parent level, the Mining Site exposes its output through a boundary port. At the Planet level, the Region exposes selected external flows through Region boundary ports. Matter must remain conserved across every boundary.

This milestone should also establish:

1. a reusable primitive/composite node interface
2. typed boundary ports for composite systems
3. parent ↔ child port mapping without matter teleportation
4. world simulation running by default with global Pause/Resume
5. per-machine `enabled` state, default OFF for newly placed active apparatus
6. runtime operating state such as Off / Idle / Running / Blocked
7. stable live Inspector interaction while the simulation continues
8. persistent simulation of existing site systems while navigating between workspaces
9. regression tests for conservation and state continuity across hierarchy boundaries

Do not expand this issue into full rail physics, power grids, depletion, surveying, fluids, thermodynamics, arbitrary user-authored nested blueprint tooling, or polished logistics gameplay. Prove the recursive system contract first.

---

# Near-Term Roadmap

1. **Recursive system-node + world-clock/control milestone** described above.
2. Stabilize composite boundary-port and hierarchy conservation semantics.
3. Add an initial real survey-system process to replace prototype discovery bootstrap.
4. Deepen resource reserve/depletion and extraction physics when the player-facing loop can consume them.
5. Add explicit logistics apparatus/capacity between Site, Region, and Planet boundaries.
6. Add power/energy requirements and operating constraints to apparatus.
7. Expand continuous processing, sensors, controllers, and automation.
8. Allow player-created solved subgraphs to become reusable composite nodes.
9. Introduce larger-scale aggregation/performance strategies for mature nested systems.
10. Expand chemistry, thermodynamics, pressure/vacuum, fluids/gases, and planetary/system-scale industry iteratively.

---

# Performance Direction

The architecture should remain compatible with large networks by favoring aggregate state:

```text
streams    = rates/state
containers = stored quantities
processes  = transformations/capacities
systems    = graphs with explicit boundary contracts
```

Future optimization may include lower simulation frequency than rendering, dependency/dirty-subgraph updates, Web Workers, and aggregated simulation of mature composite systems. Wasm should only be introduced if profiling justifies it.

The recursive-system design is also a performance strategy: a detailed solved system can eventually expose a smaller parent-level contract without requiring every parent calculation to reason directly about every internal conveyor or apparatus.

---

# Development Philosophy

For simulation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

For gameplay features, ask:

> **What physical world state does this act on?**

Prefer small vertical slices that prove real contracts over broad speculative frameworks.

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