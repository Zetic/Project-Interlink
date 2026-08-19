# Project Interlink — Copilot Agent Instructions

## Documentation Roles

Use repository documents for distinct purposes:

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

The player-facing language should stay consistent across scale:

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

A Feature should exist because it creates a physical opportunity, constraint, resource, environment, or interaction—not merely decorative metadata.

---

# Platform Guardrails

The runnable app lives at repository root.

Preserve:

- HTML/CSS
- vanilla JavaScript while sufficient
- ES modules
- relative imports compatible with GitHub Pages project paths
- DOM-independent simulation/process logic
- deterministic Node regression tests

Do not introduce a framework, backend, database, ECS, DI framework, WebAssembly, or large infrastructure layer without a concrete requirement.

Do not recreate the removed `planet-generator/` wrapper.

Do not reintroduce:

- Debug/Player mode split
- special Engineering workspace
- structural Feature discovery gating
- hierarchy-specific graph renderers/shells
- positive-only finite logical graph space

---

# Current Implemented Foundation

`main` after the Site/Feature resource-access rework is expected to use:

```text
schemaVersion: 7
generatorVersion: 3
```

Current architecture includes:

- deterministic causal seeded planet generation
- namespaced deterministic RNG streams
- World / Knowledge / UI state separation
- Planet → Region → Site → Feature → ResourceOccurrence hierarchy
- every generated Feature associated with one enterable Site
- every current Feature has at least one resource/opportunity association
- regional resource potential materialized as access Sites/Features
- `MaterialBatch` for meaningful discrete lots
- provenance separated from material identity
- particle-size state
- `MaterialStream` constituent mass-flow state
- finite-capacity Hopper storage
- continuous Extractor / Crusher / Magnetic Separator execution
- constituent and total-mass conservation
- transactional output-capacity/backpressure behavior
- one-to-one material-port connections pending explicit splitter support
- world-owned fixed-step simulation
- global Pause/Resume
- active-machine `enabled` command state
- derived `off / idle / running / blocked` state
- persistent Site simulation sessions while navigating
- explicit Site and Region boundary buffers
- conserved `BoundaryTransfer` primitives
- explicit rather than automatic cross-boundary logistics
- one shared graph projection and rendering path
- one shared workspace shell / Inspector
- per-workspace pan/zoom and signed logical graph coordinates
- stable node-recognition categories

Treat these as existing contracts to preserve, not future TODOs.

---

# Canonical Natural-Resource Ownership — HARD CONTRACT

The canonical physical hierarchy is:

```text
Planet
  ↓
Region
  ↓
Site
  ↓
Feature
  ↓
ResourceOccurrence
```

## Region

A Region is geographic/logistical context only.

A Region owns/references Sites.

A canonical Region must **not** own:

```text
features
backgroundResourceOccurrences
resources
resource quantities
```

Regional conditions may influence generator choices, but they are not a physical resource inventory.

Do not recreate a `region.backgroundResourceOccurrences` concept.

## Site

A Site is a player-addressable location in a Region.

A Site references Features through `featureIds`.

Do not duplicate Feature ResourceOccurrence IDs on the Site. In particular, do not recreate:

```text
site.resourceOccurrenceIds
```

Resource availability at a Site is derived through its Features.

## Feature

A Feature is the physical source/opportunity inside a Site.

Each Feature:

- has one `siteId`
- belongs to the Site's Region
- references one or more `ResourceOccurrence` IDs
- is visible/selectable/inspectable in the Site graph
- exposes typed physical interfaces where meaningful

## ResourceOccurrence

Every natural ResourceOccurrence is Feature-owned:

```js
{
  sourceType: 'feature',
  sourceId: featureId,
  ...
}
```

No normal generated occurrence may use `sourceType: 'region'`.

Validation should reject legacy Region/Site ownership shapes rather than silently tolerating dual truth.

---

# Resource Distribution Is Generation Metadata Only

Raw resource definitions may carry a generation hint:

```text
distribution: localized | regional | both
```

This describes how generation should create access opportunities. It does **not** describe runtime ownership.

For example, `wood` may be broadly available in a suitable Region, but runtime state should become:

```text
Region
└── Great Forest Site
    └── Forest Feature
        └── Wood ResourceOccurrence
```

not:

```text
Region
└── Wood inventory
```

Broad/regional availability is a generator cause that materializes Sites + Features + Feature-owned occurrences.

Do not invent precise reserve tonnage for broad resources until depletion/reserve mechanics actually require it.

---

# Every Current Feature Needs a Resource / Opportunity

For the current testing stage, every generated Feature must have at least one meaningful `ResourceOccurrence` or resource-like opportunity.

This does **not** mean every Feature must output mineable solid ore.

Examples:

```text
Mineral Deposit      → ore/mineral feedstock
Aquifer              → groundwater/brine
Gas Reservoir        → natural gas/hydrocarbons
Magma Chamber        → magma/geothermal fluid
Ice Body             → ice/volatile material
Forest               → wood/biomass
Surface Deposit      → clay/sand/regolith
Atmospheric Zone     → atmospheric gas
```

Unsupported exploitation machinery may remain unimplemented. The physical Feature/resource should still be visible and meaningful.

---

# Feature Access vs Material Flow — HARD PHYSICAL CONTRACT

A Feature does not magically push matter into the industrial graph.

Use:

```text
Feature
  resource-access output
        │
        ▼
Extractor / Miner
  resource-access input
        │
        │ material output
        ▼
MaterialStream
```

## `resource-access` relationship

Feature → Extractor is a typed connection with kind:

```text
resource-access
```

It represents physical access/attachment to a source.

It must:

- exist as a real graph connection
- be selectable/disconnectable through shared graph behavior
- **not** create a `MaterialStream`
- **not** carry kg/s
- **not** duplicate matter ownership

The relationship may be visually distinguished from material-flow edges through the shared renderer.

## Material begins at Extractor output

The Extractor's material-output connection is where extracted matter becomes a `MaterialStream`.

An enabled Extractor may operate only when:

1. a Feature is connected to its resource-access input;
2. that Feature owns the configured `occurrenceId`;
3. the Extractor has a valid material output connection;
4. downstream capacity permits transfer.

Do not allow direct occurrence binding to bypass the Feature connection.

## Fan-out rules differ by physical semantics

Until an explicit splitter exists:

- one **material** output cannot fan out to multiple material consumers
- `resource-access` is not material flow and may eventually allow multiple apparatus to access one Feature

Do not apply material duplication rules mechanically to non-material interface kinds.

---

# Extraction Preserves Actual Source Matter

Do not turn ResourceOccurrences into purified crafting tokens.

If an occurrence has a constituent composition, the Extractor output stream must preserve that composition at the actual extraction rate.

Example:

```text
Occurrence:
hematite        62%
magnetite       13%
quartz/gangue   21%
other            4%

Extractor 5 kg/s
↓
stream:
hematite        3.10 kg/s
magnetite       0.65 kg/s
quartz/gangue   1.05 kg/s
other           0.20 kg/s
```

Crushing, separation, smelting, chemistry, etc. create processed products later.

For coarse resources without a detailed constituent model, using the resource ID itself as the current coarse constituent is acceptable until deeper composition mechanics are active.

> **Abstract the history. Preserve the resulting matter.**

---

# State Separation

Preserve:

```text
WORLD / SIMULATION STATE
objective physical truth
        ↓
PLAYER KNOWLEDGE STATE
measurements / analysis / estimates / confidence
        ↓
APPLICATION / UI STATE
selection / graph layout / viewport / temporary interaction state
```

Physical state must not live only in DOM objects.

Structural Regions/Sites/Features are visible immediately; Knowledge State remains for meaningful scientific/measurement information.

Workspace coordinates and viewport transforms are application state unless a future gameplay mechanic explicitly gives them physical meaning.

---

# Matter Ownership

Every modeled unit of matter must have one physical owner/location at a time, such as:

- ResourceOccurrence
- Hopper/container
- machine internal buffer/chamber
- composite boundary buffer
- explicit transport inventory when modeled
- discrete sample/package/charge

A MaterialStream describes transfer between owners and must not duplicate stored matter.

A `resource-access` connection describes access to a natural source and likewise must not own or duplicate matter.

---

# Batch / Stream / Storage Semantics

## MaterialBatch

Use for meaningful discrete lots such as samples, packages, shipments, or isolated charges.

Never allocate MaterialBatches per continuous-simulation tick.

## MaterialStream

Prefer constituent mass-flow rates as truth:

```js
componentMassFlowKgPerSecond
```

Total flow is derived.

Only add temperature, pressure, phase, moisture, etc. when an active mechanic needs them.

## Storage

Conceptually:

```text
stored += inflow × dt
stored -= outflow × dt
```

If contents physically mix, aggregate resulting material state rather than keeping arbitrary historical transfer objects.

---

# Throughput / Backpressure / Atomicity

Feasible throughput is constrained by:

```text
input available
process throughput × dt
all required output free capacity
connectivity / operating requirements
```

Do not withdraw input and then discover an output cannot accept the result.

Missing/full outputs should block or throttle operation rather than delete matter.

Failed planning must not mutate physical state.

---

# Uniform Workspace Graph — HARD UI CONTRACT

All implemented hierarchy levels use one player-facing node/port/edge architecture.

Common language:

```text
select
→ drag/rearrange
→ inspect
→ connect compatible typed ports
→ enter/drill down if composite
→ observe live state
```

Preserve one shared path for:

- node projection/rendering
- port rendering
- edge rendering
- node/edge selection
- connection preview
- disconnect dispatch
- node category presentation

Simulation adapters may differ behind the common graph UI.

A persistent visible edge must correspond to a real underlying relationship.

## Edge/interface kinds are semantic

Do not assume every graph edge represents MaterialStream flow.

Current examples:

```text
material         → matter transfer
resource-access  → source/access relationship
```

Inspector and styling must respect connection kind.

---

# Uniform Workspace Shell / Viewport

Planet, Region, and Site are different graphs inside the same shell.

Preserve:

- common toolbar
- common viewport geometry
- common Inspector geometry/style
- common node dimensions unless a specific node type genuinely needs otherwise
- per-workspace pan/zoom
- pointer-centered wheel zoom
- Zoom In / Out / Fit / Center
- signed unbounded logical graph coordinates
- same transform for node and SVG layers
- correct screen→graph pointer conversion

The viewport is finite; graph space is not.

Do not reintroduce coordinate clamps at zero or fixed logical 1600×900-style world bounds.

---

# Node Recognition Contract

Every graph node carries a stable semantic category header.

Current vocabulary:

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

Rule:

```text
Header = semantic category
Body   = instance/subtype + live/operating information
```

Do not use category color to represent operating state.

Current Extractor/Crusher/Magnetic Separator nodes are APPARATUS, not PROCESS nodes.

---

# Feature Inspector Contract

Keep the primary Feature Inspector focused on current gameplay value.

Prefer:

```text
Name
Feature type
Resources
Availability / composition where useful
Resource-access state
Connected apparatus
```

Do not dump procedural metadata merely because it exists.

Depth, geometry, accessibility, pressure, temperature, etc. may remain in World State but should become prominent only when active mechanics use them.

Do not show `engineering available/unavailable`.

---

# Site Session / Temporary Iron Prototype

The automatic iron chain is a temporary validation scaffold.

For a compatible iron Site it must be constructed as:

```text
owning Feature
  ↓ resource-access
Extractor
  ↓ material
Hopper
  ↓
Crusher
  ↓
Hopper
  ↓
Magnetic Separator
  ├→ Concentrate Hopper
  └→ Tailings Hopper
```

The Extractor must not operate merely because it stores an occurrence ID.

Non-iron Sites should not receive the iron crusher/separator chain merely because they are enterable.

Site-session construction should remain testable without DOM/browser code.

---

# Recursive Boundaries — HARD PHYSICAL CONTRACT

Every composite exchanging matter with its parent uses explicit child-visible boundary storage.

Current minimum:

```text
Site Import
Site Export
Region Import
Region Export
```

Parent-facing ports are views into the same physical child boundary state.

Never duplicate boundary inventory across hierarchy views.

A boundary existing does not imply movement. Cross-boundary transfer is explicit.

---

# World Time vs Machine State

Keep distinct:

```text
WORLD TIME
running / paused

MACHINE COMMAND STATE
enabled / disabled

MACHINE OPERATING STATE
off / idle / running / blocked / faulted later
```

World simulation runs by default.

Pause must not alter machine command state.

Simulation must continue for off-screen Sites.

New active apparatus defaults disabled/off.

---

# Active Development Order

The Feature/resource-access rework is the prerequisite immediately before player-authored construction.

After it is stable, favor this next gameplay slice:

```text
Enter Site
→ inspect Feature/resources
→ place apparatus/storage
→ connect Feature access and material ports
→ configure
→ enable
→ observe flow/blocking
→ iterate
```

Do not jump directly into power, thermodynamics, complex chemistry, multiplayer, framework migration, or giant world-generation expansions while the construction loop is still missing.

Near-term order:

1. player-authored Site construction
2. remove automatic iron-chain placement from normal gameplay
3. deepen extraction/reserve/depletion where needed
4. add additional Feature interaction families incrementally
5. splitter/merger when branching requires it
6. logistics
7. power/energy
8. sensors/controllers/Knowledge mechanics
9. reusable composite systems
10. chemistry/thermo/fluids/gases and larger-scale industry iteratively

---

# Regression Expectations

For changes touching natural resources, prove as applicable:

- same seed remains deterministic
- Region canonical state contains Sites, not direct Features/resources
- every Site references valid Features
- every Feature has exactly one Site owner
- every Feature has at least one resource/opportunity in current generation
- every ResourceOccurrence is Feature-owned
- regional resource potential produces physical `regional-access` Sites/Features
- no Region-owned occurrence exists
- no Site duplicates occurrence ownership
- Feature→Extractor access creates no MaterialStream
- Extractor cannot operate without valid Feature access
- Extractor cannot use an occurrence owned by another Feature
- extraction preserves occurrence composition
- material fan-out remains blocked without splitter
- conservation/backpressure remains green
- recursive boundary ownership remains green
- viewport/shared graph regressions remain green

Run the complete test suite, not only focused tests.

For DOM-heavy UI changes, manually smoke-test the browser when automation is unavailable and report that limitation rather than claiming verification.

---

# Development Philosophy

For simulation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

For gameplay features, ask:

> **What physical world state does this act on?**

For generated Features, ask:

> **What physical opportunity, constraint, resource, environment, or interaction does this create?**

When ambiguous, favor:

1. conservation
2. one clear physical owner
3. explicit typed interfaces
4. shared player-facing graph language
5. shared application shell
6. automation
7. future composition/nesting

without inventing machinery that the active issue does not need.