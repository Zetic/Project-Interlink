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

Do not recreate:

- the removed `planet-generator/` wrapper
- Debug/Player mode split
- special Engineering workspace
- structural Feature discovery gating
- hierarchy-specific graph renderers/shells
- positive-only finite logical graph space

---

# Current Implemented Foundation

Current `main` after merged PR #24 uses:

```text
schemaVersion: 7
generatorVersion: 4
```

Established architecture includes:

- deterministic causal seeded planet generation
- namespaced deterministic RNG streams
- World / Knowledge / UI state separation
- Planet → Region → Site → Feature → ResourceOccurrence ownership hierarchy
- broad regional resource potential materialized as access Sites/Features
- Feature → Extractor typed `resource-access` relationships
- extraction preserving ResourceOccurrence composition
- `MaterialBatch` for meaningful discrete lots
- `MaterialStream` constituent mass-flow state
- finite-capacity Hopper storage
- continuous Extractor / Crusher / Magnetic Separator execution
- constituent and total-mass conservation
- backpressure/transactional output behavior
- world-owned fixed-step simulation
- global Pause/Resume
- persistent Site sessions
- explicit Site and Region boundaries
- conserved `BoundaryTransfer` primitives
- shared graph projection/rendering
- shared workspace shell / Inspector
- per-workspace pan/zoom with signed logical graph coordinates
- stable node-recognition categories

Treat these as existing contracts to preserve.

---

# RESOLVED — ISSUE #25 ✓

Issue #25 (split independently exploitable sources into distinct Features) is complete as of generator v4.

## What was done

- Each generated localized Feature now has **exactly one ResourceOccurrence** (one physical source/body).
- Resource variety at a Site manifests as multiple Features, not multiple unrelated occurrences on one Feature.
- Resource–Feature compatibility uses a **scalable occurrence-family taxonomy** rather than per-Feature ID whitelists:
  - Resources declare `occurrenceFamily` (e.g. `groundwater → aqueous-fluid`, `obsidian → rock-mass`).
  - Feature types declare `FEATURE_ALLOWED_FAMILIES` (hard gate). Tags may only weight within the compatible pool.
  - This ensures Groundwater is never a candidate for Outcrop regardless of planetary water content.
- Iron ore remains one occurrence with its full mineral-mixture composition (hematite / magnetite / goethite / gangue).
- Sites now have names independent of their Features.
- Regression tests added: family-compatibility contract, Outcrop/Aquifer/Gas Reservoir isolation, determinism.

## Generation invariant to preserve

> **Each generated localized Feature defaults to exactly one ResourceOccurrence.**
> **Every occurrence's `occurrenceFamily` must be in the Feature type's `FEATURE_ALLOWED_FAMILIES`.**

Do not revert these invariants. Do not recreate per-ID whitelists.

---

# ACTIVE PRIORITY — PLAYER-AUTHORED SITE CONSTRUCTION

Issue #25 is resolved. The active milestone is now player-authored Site construction.

Players should be able to:

1. Enter a generated Site.
2. Inspect the distinct physical Features present.
3. Place compatible apparatus/storage nodes.
4. Connect Feature resource-access and material ports.
5. Configure and enable apparatus.
6. Observe actual source mixture / extraction flow / blocking.

Do not begin implementing power, logistics, sensors, or the chemistry engine before basic player construction is working.

---

# Canonical Natural-Resource Ownership — HARD CONTRACT

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

It references Sites and must not canonically own:

```text
features
backgroundResourceOccurrences
resources
resource quantities
```

Regional conditions may influence generation but are not physical inventory.

Never recreate `region.backgroundResourceOccurrences`.

## Site

A Site is a player-addressable geographic place in a Region.

A Site references one or more Features through `featureIds`.

`site.featureIds` being plural is intentional and should become meaningful under Issue #25.

Do not recreate `site.resourceOccurrenceIds` or any second occurrence-ownership list.

## Feature

A Feature is one distinct physical system/body/opportunity at a Site that may be independently interacted with or exploited.

Examples:

```text
Iron Vein
Aquifer
Gas Reservoir
Obsidian Outcrop
Forest
Volcanic Vent
Ice Field
Cavern
```

Each Feature:

- has one `siteId`
- belongs to the Site's Region
- references ResourceOccurrence IDs
- is visible/selectable/inspectable in the Site graph
- exposes typed physical interfaces where meaningful

For Issue #25, generated normal Features should default to exactly one occurrence.

## ResourceOccurrence

Every natural occurrence is Feature-owned:

```js
{
  sourceType: 'feature',
  sourceId: featureId,
  ...
}
```

No normal generated occurrence may use `sourceType: 'region'`.

Validation must continue rejecting legacy Region/Site ownership shapes rather than tolerating dual truth.

---

# Feature vs Occurrence vs Composition — HARD SEMANTIC CONTRACT

Use these meanings consistently:

```text
Site
= geographic place

Feature
= independently meaningful physical source/system/opportunity

ResourceOccurrence
= one physical source/feedstock body exposed by that Feature

Composition
= constituents of that physical body
```

Do not use several ResourceOccurrences on one Feature merely because several resource definitions matched broad tags.

### Same physical source → composition

```text
FEATURE: Iron Vein
└── ResourceOccurrence: iron-bearing ore
    ├── hematite
    ├── magnetite
    ├── goethite
    └── gangue
```

This is one occurrence with mixed constituents.

```text
FEATURE: Gas Reservoir
└── ResourceOccurrence: reservoir gas
    ├── CH4
    ├── C2H6
    ├── CO2
    └── N2
```

This is also one occurrence with mixed constituents.

### Different independently exploitable things → different Features

```text
SITE
├── Aquifer Feature
│   └── groundwater occurrence
└── Obsidian Outcrop Feature
    └── obsidian occurrence
```

Do not collapse these merely because both exist at one Site.

---

# Chemical / Constituent Truth Direction

Long-term physical truth should prefer chemical/mineral constituents over commodity-token abstractions where practical.

Resource names/classes remain useful for:

- generation
- UI descriptions
- player language
- categorization
- compatibility

but should not replace physical constituent truth when the simulation needs composition.

For example, do not treat `fresh-water`, `saline-water`, and `brine` as necessarily three primitive substances if they represent classifications of an underlying aqueous mixture.

Long-term direction:

```text
Aquifer occurrence
composition:
H2O
Na+
Cl-
Ca2+
HCO3-
...
        ↓
derived/descriptive classification
fresh water / saline water / brine
```

Likewise reservoir gas should trend toward CH4/C2H6/CO2/N2/etc., and mineral/ore bodies should retain mineral/species mixtures.

### Important scope guardrail

Issue #25 is **not** permission to implement a full chemistry engine.

Do not add:

- aqueous speciation solver
- pH/electrochemistry
- complete mineral database
- reaction thermodynamics
- giant chemistry dependency layer

unless a later issue explicitly requires it.

For resources without detailed composition templates, coarse resource identity may temporarily remain the constituent representation.

The architectural rule is:

> **Prefer future evolution toward constituent/species truth rather than proliferating commodity tokens.**

---

# Feature Type / Resource Compatibility

Feature type must constrain the physical source it can own.

Examples:

```text
Aquifer          → groundwater/brine-type aqueous body
Gas Reservoir    → reservoir-gas mixture
Mineral Deposit  → ore/mineral body
Outcrop          → exposed rock/mineral body
Forest           → biomass/wood-bearing body
Magma Chamber    → magma body
Ice Body         → ice/volatile body
```

Do not assign an unrelated ResourceOccurrence merely because generic tag matching found it.

If the generator wants both an aquifer and an obsidian source at the same Site, generate two Features.

---

# Resource Distribution Is Generation Metadata Only

Raw resource definitions may use:

```text
distribution: localized | regional | both
```

This controls generation propensity only.

Broad availability must continue to materialize as physical Site/Feature topology:

```text
Region
└── Great Forest Site
    └── Forest Feature
        └── wood/biomass source body
```

never:

```text
Region
└── Wood inventory
```

Do not invent precise reserve tonnage for broad resources until depletion/reserve mechanics require it.

---

# Feature Access vs Material Flow — HARD PHYSICAL CONTRACT

Preserve the PR #24 extraction model:

```text
Feature
  resource-access output
        │
        ▼
Extractor / compatible apparatus
  resource-access input
        │
        │ material output
        ▼
MaterialStream
```

`resource-access`:

- is a real graph relationship
- may be selected/disconnected
- does **not** create a MaterialStream
- does **not** carry kg/s
- does **not** own or duplicate matter

An Extractor may operate only when:

1. the connected source node is a Feature;
2. that Feature owns the configured occurrence;
3. material output is connected;
4. downstream capacity permits transfer.

Do not allow direct occurrence binding to bypass the Feature connection.

---

# Extraction Preserves Actual Source Matter

Do not turn ResourceOccurrences into purified crafting tokens.

If an occurrence has composition, extraction preserves it proportionally at the actual rate.

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

Crushing, separation, concentration, smelting, chemistry, etc. create refined matter later.

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
selection / graph layout / viewport / temporary interactions
```

Physical state must not live only in DOM objects.

Structural Regions/Sites/Features remain immediately visible. Knowledge State is for measurements, scientific characterization, uncertainty, and sensor-derived information.

---

# Matter Ownership / Batch / Stream Rules

Every modeled unit of matter has one physical owner/location at a time, for example:

- ResourceOccurrence
- Hopper/container
- machine internal buffer/chamber
- composite boundary buffer
- explicit transport inventory when modeled
- discrete sample/package/charge

A MaterialStream describes transfer and must not duplicate stored matter.

Use `MaterialBatch` for meaningful discrete lots, never continuous per-tick flow.

Prefer constituent mass-flow rates as stream truth:

```js
componentMassFlowKgPerSecond
```

Total flow is derived.

Storage integrates flow:

```text
stored += inflow × dt
stored -= outflow × dt
```

---

# Throughput / Backpressure / Atomicity

Feasible throughput is constrained by:

```text
input available
process throughput × dt
all required output free capacity
connectivity / operating requirements
```

Do not withdraw input and then discover output cannot accept the result.

Missing/full outputs must block/throttle rather than delete matter.

Until an explicit splitter exists, one material output cannot fan out to multiple material consumers.

Do not mechanically apply material fan-out rules to `resource-access`, which does not move matter.

---

# Uniform Workspace Graph — HARD UI CONTRACT

All implemented hierarchy levels use one node/port/edge architecture.

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

A persistent visible edge must correspond to a real underlying relationship.

Do not assume every edge represents material flow:

```text
material         → matter transfer
resource-access  → source/access relationship
```

A Site containing several Features must render several Feature nodes through the same shared graph path.

---

# Workspace Shell / Viewport / Node Recognition

Planet, Region, and Site remain different graphs inside one application shell.

Preserve:

- common toolbar
- common Inspector geometry/style
- per-workspace pan/zoom
- pointer-centered wheel zoom
- Zoom In / Out / Fit / Center
- signed effectively unbounded graph coordinates
- same node/SVG transform
- correct screen→graph pointer conversion

The viewport is finite; graph space is not.

Node category vocabulary remains:

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

Header = semantic category. Body = instance/subtype + operating information.

---

# Feature Inspector Contract

Keep Feature inspection focused on gameplay-relevant information.

Prefer:

```text
Name
Feature type
Physical source/resource body
Useful classification/description
Known composition where modeled
Resource-access state
Connected apparatus
```

Do not dump procedural metadata merely because it exists.

Depth, geometry, accessibility, pressure, temperature, etc. may remain in World State but should become prominent only when active mechanics use them.

After Issue #25, a Site with several independent sources should present several Feature nodes rather than one Feature Inspector listing unrelated resource bodies.

---

# Temporary Iron Prototype

The automatic iron chain is a temporary validation scaffold.

For a compatible iron source:

```text
Iron-bearing Feature
  ↓ resource-access
Extractor
  ↓ actual mixed material
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

Issue #25 must preserve the iron source as one occurrence containing its mineral mixture.

Do not split hematite/magnetite/gangue into separate Features merely because they are separate constituents.

Non-iron Sites must not receive the iron chain simply because they are enterable.

---

# Recursive Boundaries — HARD PHYSICAL CONTRACT

Every composite exchanging matter with its parent uses explicit child-visible boundary storage:

```text
Site Import
Site Export
Region Import
Region Export
```

Parent-facing ports and child-visible boundary nodes refer to the same physical ownership state.

A boundary existing does not imply movement.

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

Simulation runs by default, off-screen Sites continue running, and new active apparatus defaults disabled/off.

---

# Versioning — Completed (Issue #25)

`GENERATOR_VERSION` was bumped to 4. `SCHEMA_VERSION` remains 7 (the ownership contract did not change).

---

# Completed Regression Coverage (Issue #25)

All of the following are verified by the test suite (148 tests pass):

- same seed deterministic under generator v4 ✓
- Region contains Site references only, no direct Feature/resource ownership ✓
- a Site may contain multiple Features ✓
- every Feature has exactly one Site owner ✓
- generated localized Features default to exactly one ResourceOccurrence ✓
- every ResourceOccurrence has exactly one Feature owner ✓
- every occurrence's `occurrenceFamily` is compatible with its Feature's `FEATURE_ALLOWED_FAMILIES` ✓
- Outcrop cannot receive aqueous-fluid occurrences even on water-rich planets ✓
- Aquifer cannot receive solid/rock/ore occurrences ✓
- Gas Reservoir cannot receive solids or aqueous fluids ✓
- regional resource potential produces physical `regional-access` Sites/Features ✓
- iron ore remains one occurrence with a mineral mixture ✓
- Feature → Extractor access creates no MaterialStream ✓
- Extractor cannot operate without valid Feature access ✓
- extraction preserves occurrence composition ✓
- material conservation/backpressure tests pass ✓
- recursive boundary ownership tests pass ✓

---

# Active Development Order

Issue #25 is complete. The active milestone is player-authored Site construction.

Current order:

1. ~~**Issue #25 — Feature granularity + composition/classification semantic correction**~~ **Done (generator v4).**
2. **player-authored Site construction** — active milestone
3. remove automatic iron-chain placement from normal gameplay
4. deepen reserve/depletion/extraction mechanics when needed
5. additional Feature interaction families
6. splitter/merger when branching requires it
7. logistics
8. power/energy
9. sensors/controllers/Knowledge mechanics
10. reusable composite systems and progressively deeper chemistry/thermo/fluids/gases

Do not jump ahead into a full chemistry engine, power system, multiplayer, framework migration, or giant generator expansion while player construction remains unfinished.

---

# Development Philosophy

For simulation detail, ask:

> **What decision, constraint, or opportunity does this create for the player?**

For world modeling, ask:

> **What physical thing actually exists here?**

For resource representation, ask:

> **Is this a separate physical source, or merely a constituent/classification of the same source?**

Use that distinction to choose between:

```text
new Feature
vs
new ResourceOccurrence
vs
composition constituent
vs
player-facing classification
```

Prefer physical ownership clarity over convenient resource-list generation.