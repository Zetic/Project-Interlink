# Project Interlink — Copilot Coding Instructions

This file contains implementation guardrails for coding agents.

Document roles:

- `DESIGN.md` — long-term game/simulation design
- `ARCHITECTURE.md` — current code organization, dependency direction, canonical extension paths, and compatibility surfaces
- `README.md` — current implementation state and near-term direction
- `.github/copilot-instructions.md` — coding-agent rules
- the active GitHub issue / PR request — immediate task scope and acceptance criteria

The active issue defines what to implement. Do not expand an issue merely because the design documents mention future systems.

---

## Working Rules

- Read the full issue, `ARCHITECTURE.md`, and relevant existing code/tests before editing.
- Prefer the smallest coherent change that satisfies the requested behavior.
- Preserve established physical and architectural contracts unless the issue explicitly changes them.
- Do not rewrite unrelated systems merely for cleanup.
- Do not claim browser/manual behavior was verified unless it was actually tested.
- Run the complete regression suite before declaring work complete.
- Add focused regression tests for new invariants, extension points, and bug fixes.
- Keep deterministic behavior deterministic; use existing namespaced RNG patterns for generation.
- If generated world truth changes for the same seed, follow the `GENERATOR_VERSION` rule.
- Bump `SCHEMA_VERSION` only when the serialized world-state contract changes.
- Update documentation when a task materially changes a documented contract or file-ownership boundary.

---

## Platform Guardrails

Preserve the current lightweight architecture unless an issue explicitly requires otherwise:

- HTML/CSS and vanilla JavaScript/ES modules while sufficient
- relative imports compatible with GitHub Pages project paths
- DOM-independent simulation/process physics
- Node-based deterministic regression tests

Do not introduce a framework, backend, database, ECS, dependency-injection framework, WebAssembly, or another large infrastructure layer without a concrete requirement.

Do not recreate removed architecture such as:

- separate Debug/Player modes
- a special Engineering workspace
- structural Feature discovery gating
- hierarchy-specific graph renderers or interaction models
- finite positive-only graph coordinates
- machine-pair connection whitelists
- duplicate machine catalogs

---

## Current Architecture and Dependency Direction

Canonical responsibility domains are:

```text
src/content/
    declarative resources, Features, apparatus definitions

src/core/
    materials, properties, process contracts/physics/conservation,
    neutral system primitives, world model/validation

src/generator/
    deterministic world-generation algorithms

src/simulation/
    running apparatus, streams, storage, fixed-step simulation,
    boundary transfers

src/workspace/
    graph projection, placement, catalog, navigation, Inspector,
    layout/UI state and DOM orchestration

src/app.js
    browser composition root
```

Preferred dependency direction:

```text
app → generator + workspace
workspace → simulation + content + core
simulation → content + core
generator → content + core
content → core
core → core
```

### Legacy compatibility exception

`src/core/world/worldState.js` still exposes the historical `createWorld()` compatibility API and delegates to `generator/generateWorld.js`.

- New generation code should import `src/generator/generateWorld.js` directly.
- New core model code should use `src/core/world/model/*` and validation modules.
- Do not add additional `core → generator` dependencies.
- Do not put new implementation logic into compatibility forwarding modules.

See `ARCHITECTURE.md` for the full current file tree and compatibility entry points.

---

## State Separation

Keep these concerns separate:

```text
World / Simulation State
→ objective physical truth

Knowledge State
→ measurements, analysis, estimates, confidence

UI / Application State
→ selection, layout, viewport, panels, temporary interaction state
```

Physical truth must not exist only in DOM/UI objects.

Graph layout, pan, zoom, selection, and temporary connection gestures are UI state and must not mutate matter or world truth.

---

## Canonical Natural-Resource Ownership

Preserve this hierarchy:

```text
Planet
→ Region
→ Site
→ Feature
→ ResourceOccurrence
```

- Region groups Sites and does not own natural resource inventory or Features directly.
- Site references Features through `featureIds`; do not create a second occurrence-ownership list on Site.
- Every natural `ResourceOccurrence` is Feature-owned with `sourceType: 'feature'` and the owning Feature ID.
- Generated localized Features currently expose one ResourceOccurrence; independently exploitable natural sources normally become separate Features.
- Multiple constituents of one physical source belong in one occurrence composition, not separate fake source objects.
- Broad/widespread resources must still be exposed through physical access Sites/Features rather than Region-owned inventory.

Do not reintroduce legacy Region/Site resource ownership or tolerate dual sources of truth.

---

## Content vs Generation

Keep declarative content separate from deterministic generation algorithms.

Canonical content locations include:

```text
src/content/resources/
src/content/features/
src/content/apparatus/
```

Generation lives under:

```text
src/generator/
```

Rules:

- Resource composition templates/descriptors belong in content.
- Occurrence-family vocabulary belongs in content.
- Feature type/name/compatibility/weighting definitions belong in content.
- Generator code should consume content and apply physical conditions + deterministic RNG.
- Do not move authoritative catalogs back into generator implementation files.
- `src/data/` is a compatibility namespace only; do not add new authoritative resource content there.

---

## Occurrence-Family Compatibility

Resource/Feature compatibility is based on the canonical occurrence-family vocabulary.

- ResourceDefinitions declare `occurrenceFamily`.
- Feature types declare accepted occurrence families.
- Occurrence family is the hard physical-compatibility gate.
- Tags/environmental affinity may only weight candidates after hard compatibility.
- Do not replace this with per-Feature resource-ID whitelists.
- Keep the taxonomy small and add a new family only when existing families are physically inappropriate.
- Preserve catalog-integrity tests so unknown or accidentally unreachable localized resources are caught.

---

## Material Model

The implemented solid-particulate state is aggregate/statistical:

```text
speciesId × sizeBinId × liberationClassId → quantity
```

A fraction is a population, not an individually simulated particle.

Current important concepts:

- concrete material/mineral species
- mass / quantity
- particle-size class
- liberation class
- physical form through `MaterialBody`
- magnetic response through the material-property boundary

### Composition vs liberation

Do not conflate these concepts:

- **composition** = which species are present and how much
- **liberation** = how physically detached constituent populations are
- **separation** = process routing based on physical differences

A fully liberated body can still be a mixed collection of separate mineral grains. Liberation is not purity.

### Concrete species

Current solid generation emits registered concrete species. Do not reintroduce pseudo-species such as generic `gangue`, `gangue-mixture`, or `ironOxides` as new authoritative generated output merely for convenience.

Legacy aliases may remain accepted only where compatibility requires them.

---

## Property Architecture

A property should enter the simulation when a process needs it to determine a physical result.

Canonical resolver location:

```text
src/core/materials/properties/
```

Current example:

```text
magneticProperties.js
```

Rules:

- Physics should use property-domain APIs when available instead of reaching directly into species registry internals.
- Do not build one unstructured universal property object.
- Do not add speculative physical values simply to fill a table.
- Distinguish intrinsic species properties from body/mixture/structural state and process conditions.
- Do not add every new property as another solid-fraction key dimension.
- Add density, mechanical, thermal, electrical, surface, chemical, fluid, etc. domains when an implemented process requires them.

---

## Process Architecture

Canonical process organization is:

```text
src/core/processes/
├── definitions/
├── physics/
├── executors/
├── conservation/
└── processExecution.js
```

Keep these responsibilities distinct:

```text
Definition
→ ports, parameters, applicability, metadata, conservation policy

Pure physics
→ material transformation/routing only

Executor
→ discrete MaterialBatch adaptation

Continuous runtime
→ placed-machine flow adaptation

Conservation
→ validates conserved quantities appropriate to process family
```

Pure physics modules must not depend on DOM/UI or placed graph nodes.

Do not duplicate a transformation algorithm between batch execution and continuous runtime. Both should call the same physical kernel where practical.

Mechanical processes currently conserve each species. Future chemistry/thermal work must be able to use different conservation policies rather than weakening existing mechanical conservation.

---

## Apparatus Architecture

Canonical apparatus metadata lives in:

```text
src/content/apparatus/definitions.js
```

Current apparatus definitions own:

- identity / node type
- catalog metadata and order
- placeability
- canonical ports and interface capabilities
- associated process
- fixed capabilities
- defaults
- configurable parameter metadata

Runtime behavior lives under:

```text
src/simulation/apparatus/
```

Runtime dispatch lives in:

```text
src/simulation/apparatus/registry.js
```

The main simulation engine should orchestrate apparatus generically rather than implement every machine's physics itself.

### Adding a new apparatus

A process apparatus such as Screen should normally require:

1. apparatus definition metadata/ports/capabilities;
2. process definition if it performs a new process;
3. pure process physics;
4. batch executor only if discrete execution is needed;
5. continuous runtime module;
6. runtime registry entry;
7. focused tests.

It should **not** normally require:

- a new machine-pair connection whitelist;
- a second NODE catalog entry authored independently from the apparatus definition;
- a new hardcoded removable-node type list;
- a new generic-Inspector eligibility type list;
- a new central simulation `if/switch` dispatch branch.

The NODE catalog derives from canonical apparatus definitions. Generic apparatus Inspector behavior should allow a newly registered active apparatus to receive state, enable controls, capability display, flow display, configurable parameters, and diagnostics without a new controller branch.

Machine-specific Inspector presentation is allowed when it adds genuinely useful specialized information, but it must be an enhancement rather than a requirement for the machine to function.

---

## Typed Ports and Connection Compatibility

Connection eligibility should derive from edge kind plus interface/physical capabilities.

Current important capabilities include:

```text
resource-source
solid-particulate
stored-solid-particulate
```

`stored-solid-particulate` means the receiving process requires a buffered/withdrawable particulate owner. It is an interface requirement, not material provenance and not a distinct material form.

Rules:

- Do not reintroduce explicit node-pair topology tables such as `hopper → crusher`.
- Keep material and non-material relationships semantically distinct.
- One material output cannot fan out until an explicit Splitter/routing system exists.
- One material input cannot silently combine multiple independent streams unless an explicit merger/mixer contract permits it.
- Do not apply material fan-out rules to `resource-access`.

---

## Resource Access vs Material Flow

Preserve this contract:

```text
Feature
  ↓ resource-access relationship
Extractor / compatible apparatus
  ↓ material output
MaterialStream
```

`resource-access`:

- is a typed graph relationship;
- carries no matter and no kg/s;
- creates no `MaterialStream`;
- selects/authorizes a Feature-owned natural source.

Material begins flowing only from apparatus material output.

Extraction preserves the occurrence's actual composition. Do not turn natural feedstocks into purified crafting tokens because extraction occurred.

An Extractor should materialize only the amount actually extracted during operation rather than copying an entire geological source into storage.

---

## Matter, Streams, and Conservation

- Every modeled unit of matter has one physical owner/location at a time.
- `MaterialBatch` is for meaningful discrete lots/samples, not continuous tick flow.
- `MaterialStream` represents constituent/material-state flow rates, not stored inventory.
- Storage integrates inflow/outflow over `dt`.
- Missing/full required outputs must block or throttle; never silently delete matter.
- Multi-output processes must commit atomically so one output cannot consume input while another fails.
- Preserve per-species conservation for current mechanical processes.
- A process that changes species must introduce an appropriate stronger conservation model rather than bypassing validation.

---

## Current Crushing and Magnetic-Separation Contracts

### Crusher

Player-facing canonical target cuts are currently:

```text
1, 5, 15, 25, 60, 120 mm
```

Legacy noncanonical values may remain accepted only for old persisted/test compatibility; do not expose them as new player choices.

An enabled, connected Crusher with feed and downstream capacity moves material at feasible throughput even when feed is already at/below the configured target. Already-sized material passes through unchanged rather than causing the Crusher to behave like an implicit sensor or controller.

### Magnetic Separator

Current magnetic separation requires feed particle size at or below 25 mm. If any material is in an oversized class, the mixed feed is rejected/blocked; the separator is not an implicit Screen.

Magnetic recovery uses the material-property resolver and process context such as liberation, size suitability, field strength, and entrainment/carryover.

---

## Simulation Contracts

- Simulation uses fixed time steps independent of render FPS.
- Navigation does not stop active Site simulation.
- Keep world pause/resume separate from machine enabled/disabled state.
- Keep machine command state separate from derived operating state (`off`, `idle`, `running`, `blocked`, later `faulted`).
- New active apparatus defaults disabled unless an issue explicitly specifies otherwise.
- Keep simulation logic independent from browser rendering.
- Apparatus execution should be registry-driven and phase/order behavior explicit where ordering matters.

---

## Recursive Boundaries

Composite matter exchange uses explicit boundary storage/ports.

- Parent-facing ports and child-visible boundary storage represent the same physical ownership state.
- A boundary existing does not imply transfer.
- Cross-boundary movement must be explicit and conserved.
- Do not create invisible/implicit cross-workspace logistics.
- Boundary storage participates in typed-port compatibility using the same physical interface concepts as ordinary storage.

---

## Shared Graph and Workspace Interaction

Planet, Region, Site, and future recursive systems use the same graph language:

```text
nodes
ports
edges
selection
inspection
drag / rearrange
connect / disconnect
drill-down for composites
```

- Use shared projection/rendering and interaction paths rather than hierarchy-specific implementations.
- A persistent graph relationship in the current workspace must have a visible edge.
- Edge meaning is typed; not every edge is material flow.
- The viewport is finite; logical graph space is effectively unbounded and supports signed coordinates.
- Node positions must not determine document/page dimensions.
- Node category is semantic identity (`SITE`, `FEATURE`, `APPARATUS`, `CONTAINER`, etc.), not operating state.

---

## Workspace Organization

Canonical workspace domains are under:

```text
src/workspace/catalog/
src/workspace/graph/
src/workspace/inspector/
src/workspace/navigation/
src/workspace/shell/
```

`workspaceController.js` is the current DOM/application orchestrator.

Rules:

- Keep domain rules in focused modules when they can be independently meaningful/testable.
- Do not move physical truth into the controller.
- Do not create a second hierarchy-specific workspace implementation.
- Prefer generic definition-driven apparatus UI behavior before adding machine-specific branches.
- Inspector content should emphasize actionable/gameplay-relevant information rather than dumping every stored field.
- Preserve structural Region/Site/Feature accessibility; Knowledge mechanics should affect characterization, not basic structural visibility.

Root workspace forwarding files are compatibility/public entry points. New domain logic should live in the canonical subfolders/controller documented in `ARCHITECTURE.md`.

---

## Compatibility Entry Points

The architecture refactor intentionally retained thin compatibility forwarding modules in several places, including portions of:

- `src/core/materials/`
- `src/core/processes/`
- `src/core/world/worldState.js`
- `src/simulation/`
- `src/workspace/`
- `src/data/`

A compatibility module should not become a second implementation home.

Do not:

- add new authoritative registries there;
- duplicate physics there;
- put new machine behavior there when a canonical runtime module exists;
- use a compatibility path merely because it is shorter.

When all consumers have migrated, compatibility cleanup should be a focused change.

---

## Scope Control

Unless the active issue explicitly requires them, do not add:

- full chemistry/speciation
- giant resource/mineral databases
- power/energy networks
- logistics systems
- sensors/controllers
- multiplayer/backend infrastructure
- star/system generation expansion
- reserve/depletion systems
- unrelated gameplay features
- speculative material properties with no active process consumer

Implement only enough neighboring code to keep the requested change coherent, physically valid, architecturally aligned, and tested.

---

## Completion Checklist

Before finishing an issue/PR:

1. Confirm the requested behavior is implemented through canonical architecture paths where practical.
2. Confirm no hard ownership, conservation, compatibility, graph, state-separation, or deterministic-generation contract regressed.
3. Confirm new apparatus did not require unrelated central type lists/switchboards unless the issue intentionally introduces a new generic concept.
4. Add/update focused tests for the requested invariant and relevant extension boundary.
5. Run the complete test suite.
6. Perform browser smoke testing when the issue affects layout, interaction, controls, or rendering; otherwise state that manual browser verification remains required.
7. Update version constants only when their stated rules require it.
8. Update `ARCHITECTURE.md` when file ownership/dependency/extension paths materially change.
9. Update `README.md` when implementation state, versions, or near-term direction materially change.
10. Update `DESIGN.md` only when the long-term design contract changes.

Do not turn this instruction file into a chronological status log. Keep it focused on durable rules that help future agents extend Interlink without recreating the architectural problems already removed.
