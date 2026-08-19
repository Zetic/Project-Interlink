# Project Interlink

Project Interlink is an early-stage, systems-driven simulation and management game being developed as a web application.

> **Everything is a system, and every system can become a component of a larger system.**

The long-term goal is to turn the matter and energy available in an unfamiliar world into a self-sustaining industrial network. Interlink is intended to become an interactive systems workspace built from physical resources, material and energy streams, processes, storage, logistics, instrumentation, automation, and recursively nested systems.

A guiding progression principle is:

> **Yesterday's factory becomes today's machine.**

The canonical long-term game design is documented in [`DESIGN.md`](DESIGN.md). This README records the **current implementation state**, the architectural contracts that now exist in code, and the next development direction.

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

# Current Project State

Interlink now has a coherent first vertical architecture from generated world state through continuous material processing and recursive player workspaces.

The major interface cleanup that followed the first prototype is complete: the old Debug/Player split, discovery-gated world navigation, special Engineering workspace, separate hierarchy UI shells, finite positive-only graph area, and unlabeled node families have all been replaced by one common application language.

The serialized versions are currently:

```text
schemaVersion: 6
generatorVersion: 2
```

## Implemented foundation

### World generation and state

- deterministic seeded planet generation
- causal generation passes rather than planet-archetype-first generation
- deterministic namespaced RNG streams
- Regions, Features, Sites, and normalized `ResourceOccurrence` entities
- every generated Feature has an enterable Site
- Site data uses `featureIds`
- Features with zero resource occurrences still remain real, visible world structure
- World / Knowledge / UI state separation
- structural world visibility is not gated by Knowledge State

### Matter and processing

- `MaterialBatch` for meaningful discrete lots/samples
- provenance separated from current material identity
- particle size as a modeled material property
- reusable `ProcessDefinition` metadata with explicit ports and parameters
- Crushing and Magnetic Separation
- shared transformation physics between discrete and continuous execution
- `MaterialStream` as rate + state rather than batches-per-tick
- finite-capacity Hopper storage
- constituent-level and total-mass conservation
- transactional process/backpressure behavior
- one-to-one material output connections until an explicit splitter exists

### Continuous simulation

- fixed-step world simulation independent from rendering FPS
- continuous Extractor, Crusher, and Magnetic Separator execution
- global world Pause/Resume
- per-machine `enabled` command state
- derived `off / idle / running / blocked` operating state
- persistent Site simulation sessions while navigating elsewhere
- automated systems continue running when the player views another workspace

### Recursive systems and physical boundaries

- typed primitive/composite system metadata
- Site and Region child workspaces
- explicit Site Import / Site Export boundary buffers
- explicit Region Import / Region Export boundary buffers
- parent-facing ports resolve to the same child-visible physical boundary state
- conserved cross-boundary `BoundaryTransfer` behavior
- no automatic Site → Region transfer merely because a boundary exists

### Player-facing graph architecture

- Planet → Region → Site navigation
- every implemented hierarchy level uses the same node/port/edge interaction language
- one shared `GraphNode` / `GraphPort` / `GraphConnection` projection layer
- one shared graph node renderer
- stable shared SVG edge rendering
- shared selection, connection preview, and adapter-based disconnect behavior
- Feature nodes are visible and inspectable inside Sites
- one shared workspace shell and Inspector geometry across hierarchy levels
- per-workspace pan/zoom state
- mouse-wheel pointer-centered zoom
- Zoom Out / Zoom In / Fit / Center controls
- signed, effectively unbounded logical graph coordinates
- node/connection dragging continues independently from transformed DOM-layer bounds
- graph coordinates remain UI/application state rather than physical coordinates

### Node recognition

Every graph node now has a persistent category header whose job is to answer:

> **What kind of thing is this?**

The current recognition vocabulary is:

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

Category is intentionally separate from subtype and operating state.

Examples:

```text
APPARATUS
Crusher

CONTAINER
Raw Ore Hopper

FEATURE
Banded Iron Formation
Mineral Deposit

BOUNDARY
Site Export
```

Current Crushers, Extractors, and Magnetic Separators are **APPARATUS** that execute processes; they are not themselves abstract `PROCESS` nodes.

Composite nodes carry a hierarchy/drill-down cue while retaining the same basic node interaction contract.

### Verification

- deterministic `node:test` regression suite
- GitHub Actions CI
- regression coverage for generation, conservation, knowledge isolation, recursive boundaries, graph adapters, viewport math, signed graph coordinates, and node-category mapping

---

# Current Playable Simulation Slice

The first continuous processing chain is still the iron-processing demonstration:

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

This chain is now a **temporary validation scaffold**, not the intended permanent player-construction model.

It is only instantiated for a Site with a compatible iron-ore occurrence. Site identity, Site visibility, Feature visibility, and Site entry do not depend on this compatibility.

A non-iron or zero-occurrence Site still exists as a real workspace with its Feature(s) and Site boundaries even when no prototype process chain is available there.

---

# Foundational State Architecture

Interlink separates three kinds of state:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
measurements, analyses, estimates, confidence
        ↓
APPLICATION / UI STATE
selection, graph layout, viewport pan/zoom, panels, temporary interaction state
```

Physical truth must not migrate into DOM/UI state merely because it is easier to render there.

Knowledge actions may reveal measurements or estimates of world truth; they do not mutate physical truth merely because the player learned something.

Workspace node positions and viewport transforms are UI/application state unless a future gameplay rule explicitly gives those coordinates physical meaning.

## Structural visibility is not a Knowledge gate

After planet generation:

- all generated Regions exist and are visible
- all generated Sites exist and are visible in their Region
- every generated Feature belongs to an enterable Site
- entering a Site exposes its generated Feature node(s)

Knowledge State remains important for material analysis, composition estimates, sensors, scientific characterization, uncertainty, confidence, and other information the player actually learns.

It should not be used simply to hide generated Regions, Sites, or Features.

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

Composite-system boundary buffers follow exactly the same physical-ownership rule.

---

# Throughput, Blocking, and Conservation

Industrial behavior should emerge from physical limits.

Example:

```text
Extractor: 5 kg/s
Crusher:   4 kg/s
```

With a finite Hopper between them, the Hopper accumulates approximately 1 kg/s until another constraint changes the flow.

For a continuous process timestep, feasible throughput is limited by:

```text
input available
process capacity × dt
all required output free capacity
connectivity / operating requirements
```

Processes must not consume matter unless the corresponding outputs can be committed. Missing/full outputs should block or throttle equipment rather than destroy matter, and partial input availability must never create a full requested output.

---

# One Node Language at Every Scale

From the player's perspective:

> **Anything that can be treated as a system can be represented as a node with an explicit external interface.**

The common interaction language is:

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
APPARATUS     Extractor, Crusher, Magnetic Separator, Pump later
CONTAINER     Hopper, Tank, Silo, storage systems
FEATURE       Ore Deposit, Aquifer, Volcanic Vent, Cavern
BOUNDARY      Site Import/Export, Region Import/Export
COMPOSITE     Site, Region, Facility, Planet
```

The simulation object behind an edge may differ. A Site-local edge may resolve to a `MaterialStream`, while a Region/Planet edge may resolve to a hierarchy-crossing `BoundaryTransfer`.

That difference belongs behind the shared graph interface; it must not create a second player-facing graph system.

The graph visibility invariant is:

> **If a connection exists in simulation/application graph state and belongs to the current workspace, a corresponding visible graph edge must exist.**

---

# Workspace and Viewport Contract

Planet, Region, and Site are different graphs inside the same application shell.

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

## The viewport is finite; graph space is not

Logical graph coordinates may be positive or negative.

```text
(-4000, -2500)
(0, 0)
(8500, 300)
```

are all valid UI positions.

Pan/zoom determines which portion of the logical graph is visible; it must not determine where a node is allowed to exist.

`Fit` and `Center` derive their camera transform from the actual current node bounds, including nodes in negative graph space.

Node and edge layers always share the same viewport transform.

---

# Node Recognition Contract

Node recognition is now part of the permanent UI language.

The category header describes **semantic family**, not machine state and not exact subtype.

```text
┌─ APPARATUS ───────────────────┐
│ Magnetic Separator            │
│ Running · 3.9 kg/s            │
└───────────────────────────────┘
```

Rules:

- header = semantic category
- main body/title = instance/subtype identity
- status = operating condition
- ports = interface type/direction
- selection styling = selection/attention
- category appearance remains stable when operating state changes

Do not turn every machine subtype into a separate top-level category. The player should learn a small stable family vocabulary even as the machine catalog grows.

---

# Planet → Region → Site

The implemented hierarchy is simply:

```text
Planet Workspace
      ↓ enter Region
Region Workspace
      ↓ enter Site
Site Workspace
```

There is no special Engineering Mode.

Every generated Site is enterable regardless of which process prototypes currently exist.

A Site is a geographic/composite workspace. A Feature is a physical world system inside that Site.

```text
Planet
  └── Region
      └── Site
          ├── Feature(s)
          ├── Site Import
          ├── Site Export
          └── player apparatus / storage / processes
```

---

# Features

A Feature should exist because it creates a physical opportunity, constraint, resource, environment, or interaction for the player—not merely as decorative world-generation metadata.

Feature types should eventually expose interfaces appropriate to their physical behavior rather than all pretending to be ore sources.

Examples:

```text
Mineral Deposit  → solid extraction
Aquifer          → fluid source/sink behavior later
Reservoir        ↔ fluid interaction later
Storage Cavern   ↔ storage interaction later
Injection Well   ← material/fluid input later
Volcanic Vent    → heat/gas/fluid opportunity later
Geothermal Area  → thermal-energy opportunity later
```

Future interfaces may include:

```text
material
fluid
 gas
thermal / energy
pressure / environment
data / measurement
mechanical work
```

Only add a physical interface when its gameplay/simulation semantics are defined. Do not add decorative ports merely to make every Feature look connected.

---

# Composite Boundaries and Explicit Logistics

Every composite system that exchanges matter with its parent should expose explicit child-visible boundary storage.

For Sites:

```text
Site Import Boundary Buffer
Site Export Boundary Buffer
```

For Regions:

```text
Region Import Boundary Buffer
Region Export Boundary Buffer
```

The child-visible boundary and the parent-facing composite port are two views of the **same physical state**, not duplicate inventories.

A boundary existing does not imply movement.

```text
local system
    ↓ explicit Site connection
Site Export Buffer
    ↓ explicit Region-level connection
regional system / Region Export
    ↓ explicit Planet-level connection
Destination Region Import
```

If the next connection does not exist, material remains where it is. A full buffer should propagate normal backpressure rather than causing hidden transport or matter loss.

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

Pause is a player time-control/inspection tool. Pausing must not change machine `enabled` values.

New active machinery defaults disabled/off. `enabled: true` means operation is permitted, not guaranteed. An enabled machine may still be Idle or Blocked and should resume automatically when the physical constraint clears.

---

# One Inspector Contract

Planet, Region, Site, Feature, boundary, apparatus, storage, and connection selection share the same Inspector shell and design language.

The selected entity determines which fields appear; it should not create a separate hierarchy-specific Inspector system.

Useful current inspection includes:

- Hopper/boundary stored mass, capacity, free capacity, particle size, and constituents
- stream source/target, total flow, particle size, and constituent flow rates
- machine enabled/operating state, configured and actual throughput, process parameters, and blocking/error state
- Magnetic Separator feed/concentrate/tailings summaries
- Feature generated physical properties
- hierarchy transfer capacity/rate and boundary state

The Inspector remains interactive while simulation runs.

---

# Current Limitation: Construction Is Still a Prototype Scaffold

The workspace architecture is now ready for player construction, but the first iron process chain is still created automatically for compatible Sites.

This is the largest remaining mismatch between the current prototype and the intended game loop.

The long-term interaction should be:

```text
enter Site
→ inspect Feature
→ choose apparatus/storage
→ place nodes
→ connect typed ports
→ configure equipment
→ enable machinery
→ observe flow / constraints
→ iterate
```

rather than receiving a pre-built factory.

---

# Immediate Development Priority

The recommended next milestone is **player-authored Site construction and the transition away from the automatically spawned iron factory**.

The goal is:

> **The player should build the first useful system using the same node language they will eventually use to build a planetary industry.**

A focused first construction milestone should:

1. add a simple apparatus/container construction palette or equivalent placement interaction;
2. allow the player to place the existing Extractor, Hopper, Crusher, and Magnetic Separator nodes where physically applicable;
3. place new active apparatus disabled/off by default;
4. keep graph layout coordinates purely in UI state;
5. use the existing typed-port connection system rather than creating a second construction connection path;
6. preserve existing process/backpressure/conservation behavior after player placement;
7. make Feature/applicability requirements explicit without using them to gate Site entry;
8. keep Site/Region boundary movement explicit;
9. allow removal/reconfiguration without silently destroying owned matter;
10. retain a test/bootstrap construction helper if useful for deterministic simulation tests, but stop treating the automatically created iron chain as the normal player experience once construction is usable;
11. add regression coverage for placement, defaults, removal safety, and connection behavior;
12. perform browser smoke testing for construction interactions.

After that foundation is usable, deepen Feature exploitation **one physical interaction type at a time** rather than adding superficial mechanics to every generated Feature at once.

---

# Near-Term Roadmap

1. **Player-authored Site construction using the existing graph architecture.**
2. Retire the automatic iron-chain player bootstrap while retaining deterministic test helpers where useful.
3. Improve node recognition/details and construction ergonomics as real gameplay exposes needs.
4. Implement deeper mineral-deposit extraction and reserve/depletion semantics.
5. Add the next meaningful Feature interaction family, such as fluid source/sink or thermal opportunity.
6. Add explicit splitter/merger behavior when branching material flow becomes necessary.
7. Add logistics apparatus/capacity incrementally: conveyors, pipelines, vehicles, roads/rail where justified.
8. Add power/energy requirements and operating constraints.
9. Expand sensors, Knowledge-State measurements, controllers, and automation.
10. Allow solved player-created subgraphs to become reusable composite systems.
11. Introduce larger-scale aggregation/performance strategies for mature nested systems.
12. Expand chemistry, thermodynamics, pressure/vacuum, fluids/gases, and planetary/system-scale industry iteratively.

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

For interface additions, ask:

> **Does this make a node, connection, state, or decision easier to recognize without inventing a second interaction language?**

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
