# Project Interlink — Copilot Coding Instructions

This file contains implementation guardrails for coding agents.

Document roles:

- `DESIGN.md` — long-term game/simulation design
- `ARCHITECTURE.md` — current code organization, dependency direction, extension paths, and compatibility surfaces
- `README.md` — current implementation state and near-term direction
- `.github/copilot-instructions.md` — coding-agent rules
- the active GitHub issue / PR request — immediate task scope and acceptance criteria

The active task defines what to implement. Do not expand scope merely because design documents mention future systems.

---

## Working Rules

- Read the full task, `ARCHITECTURE.md`, and relevant code/tests before editing.
- Prefer the smallest coherent change that satisfies the requested behavior.
- Preserve established physical and architectural contracts unless the task explicitly changes them.
- Do not rewrite unrelated systems merely for cleanup.
- Do not claim browser/manual behavior was verified unless it was actually tested.
- Run the complete regression suite before declaring work complete.
- Add focused regression tests for new invariants, extension points, and bug fixes.
- Keep deterministic behavior deterministic; use existing namespaced RNG patterns for generation.
- If generated world truth changes for the same seed, follow the `GENERATOR_VERSION` rule.
- Bump `SCHEMA_VERSION` only when the serialized world-state contract changes.
- Update documentation when a task materially changes current behavior or code-ownership boundaries.

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

## Current Architecture

Canonical domains are:

```text
src/content/
    declarative resources, Features, apparatus definitions

src/core/
    materials, properties, process definitions/physics/conservation,
    neutral system primitives, world model/validation

src/generator/
    deterministic world-generation algorithms

src/simulation/
    running apparatus, streams, storage, fixed-step simulation,
    boundary transfers

src/workspace/
    graph, placement, catalog, navigation, Inspector,
    layout/UI state and DOM orchestration

src/app.js
    browser composition root
```

Preferred dependency direction:

```text
app → generator + core + workspace
workspace → simulation + content + core
simulation → content + core
generator → content + core
content → core
core → core
```

`src/core/world/worldState.js` retains a historical `createWorld()` compatibility API that delegates to generator code. Do not add more `core → generator` dependencies. New generation callers should use `src/generator/generateWorld.js` directly.

See `ARCHITECTURE.md` for the full current file tree.

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

Physical truth must not exist only in DOM/UI objects. Graph layout, pan, zoom, selection, and temporary gestures are UI state and must not mutate world matter.

---

## Natural Resource Ownership

Preserve:

```text
Planet
→ Region
→ Site
→ Feature
→ ResourceOccurrence
```

- Region groups Sites and does not own natural resource inventory or Features directly.
- Site references Features through `featureIds`; do not create a second occurrence-ownership list.
- Every natural `ResourceOccurrence` is Feature-owned with `sourceType: 'feature'` and the owning Feature ID.
- Generated localized Features currently expose one ResourceOccurrence; independently exploitable sources normally become separate Features.
- Multiple constituents of one physical source belong in one occurrence composition.
- Widespread resources still require physical access through Sites/Features rather than Region inventory.

Do not reintroduce `region.features`, `region.resources`, `region.backgroundResourceOccurrences`, or other dual ownership.

---

## Content vs Generation

Canonical content locations:

```text
src/content/resources/
src/content/features/
src/content/apparatus/
```

Deterministic algorithms live under `src/generator/`.

- Resource composition templates/descriptors belong in content.
- Occurrence-family vocabulary belongs in content.
- Feature type/name/compatibility/weighting definitions belong in content.
- Generator code consumes content and applies conditions + deterministic RNG.
- `src/data/` is compatibility-only; do not add new authoritative resource content there.

---

## Occurrence-Family Compatibility

- ResourceDefinitions declare `occurrenceFamily`.
- Feature types declare accepted occurrence families.
- Occurrence family is the hard physical compatibility gate.
- Tags/environmental affinity may only weight candidates after hard compatibility.
- Do not replace the family model with per-Feature resource-ID whitelists.
- Keep the taxonomy small and add a family only when existing families are physically inappropriate.

---

## Material Model

Implemented particulate solid state is aggregate/statistical:

```text
speciesId × sizeBinId × liberationClassId → quantity
```

A fraction represents a population, not one simulated particle.

Do not conflate:

- **composition** — which species are present and how much;
- **liberation** — how physically detached constituent populations are;
- **separation** — routing based on physical properties or classifications.

A fully liberated material can still be a mixed collection of separate mineral grains. Liberation is not purity.

Current solid generation emits registered concrete species. Do not reintroduce generic pseudo-species such as `gangue`, `gangue-mixture`, or `ironOxides` as new authoritative generated output. Legacy aliases may remain only where compatibility requires them.

---

## Property Architecture

A material property should enter the simulation when an implemented process needs it to determine a physical result.

Canonical resolver location:

```text
src/core/materials/properties/
```

Current example: `magneticProperties.js`.

Rules:

- use property-domain APIs from physics when a resolver exists;
- do not build one unstructured universal property object;
- do not add speculative values merely to fill a table;
- distinguish intrinsic species properties from body/mixture/structural state and process conditions;
- do not add every new property as another particulate fraction-key dimension;
- add density, mechanical, thermal, electrical, surface, chemical, fluid, etc. domains when a real process consumes them.

---

## Process Architecture

Canonical process organization:

```text
src/core/processes/
├── definitions/
├── physics/
├── executors/
├── conservation/
└── processExecution.js
```

Keep responsibilities distinct:

```text
Definition
→ inputs, outputs, parameters, applicability, metadata, conservation policy

Pure physics
→ material transformation/routing only

Executor
→ discrete MaterialBatch adaptation

Continuous runtime
→ placed-machine flow/backpressure adaptation

Conservation
→ validates conserved quantities appropriate to the process family
```

Pure physics must not depend on DOM/UI or placed graph nodes. Do not duplicate transformation algorithms between batch and continuous execution when both can call one physical kernel.

Current mechanical processes conserve species mass. Future chemical/thermal work must introduce appropriate conservation models rather than bypassing validation.

---

## Apparatus Architecture

Canonical apparatus metadata lives in:

```text
src/content/apparatus/definitions.js
```

Definitions own identity, catalog metadata/order, placeability, canonical ports/capabilities, associated process, fixed capabilities, defaults, and configurable parameter metadata.

Runtime behavior lives under:

```text
src/simulation/apparatus/
```

Runtime dispatch lives in:

```text
src/simulation/apparatus/registry.js
```

Current registry-backed node types include Extractor, Hopper, Crusher, Screen, and Magnetic Separator.

### Adding a new apparatus

A future process apparatus such as Mill should normally require:

1. apparatus definition metadata/ports/capabilities;
2. process definition if it performs a new process;
3. pure process physics;
4. batch executor only if discrete execution is needed;
5. continuous runtime module;
6. runtime registry entry;
7. focused tests.

It should **not** normally require:

- a machine-pair connection whitelist;
- an independently authored NODE catalog entry;
- a hardcoded removable-node type list;
- a generic-Inspector eligibility type list;
- a central simulation `if/switch` dispatch branch.

Machine-specific Inspector presentation is allowed only as an enhancement; a newly registered active apparatus must remain functional/configurable through generic paths.

---

## Typed Ports and Connections

Connection eligibility derives from edge kind plus interface/physical capabilities.

Current important capabilities include:

```text
resource-source
solid-particulate
stored-solid-particulate
```

`stored-solid-particulate` means the receiving process requires a buffered/withdrawable particulate owner. It is not provenance and not a distinct material form.

Rules:

- do not reintroduce topology tables such as `hopper → crusher` or `hopper → screen`;
- keep material and non-material relationships distinct;
- one material output cannot fan out until an explicit Splitter exists;
- one material input cannot silently combine multiple streams without an explicit merger/mixer contract;
- do not apply material fan-out rules to `resource-access`.

---

## Resource Access vs Material Flow

Preserve:

```text
Feature
  ↓ resource-access
Extractor
  ↓ material output
MaterialStream
```

`resource-access` carries no matter/kg/s and creates no `MaterialStream`. It selects/authorizes a Feature-owned natural source.

Extraction preserves occurrence composition and materializes only the amount actually extracted; do not copy an entire geological source into a Hopper.

---

## Matter, Streams, and Conservation

- Every modeled unit of matter has one physical owner/location at a time.
- `MaterialBatch` is for meaningful discrete lots/samples, not continuous tick flow.
- `MaterialStream` represents transfer-rate state, not stored inventory.
- Storage integrates inflow/outflow over `dt`.
- Missing/full required outputs block or throttle; never silently delete matter.
- Multi-output processes commit atomically.
- Preserve per-species conservation for current mechanical processes.

---

## Current Mechanical Apparatus Contracts

### Crusher

Canonical target cuts:

```text
1, 5, 15, 25, 60, 120 mm
```

Legacy noncanonical values may remain accepted only for old compatibility; do not expose them as new player choices.

An enabled connected Crusher with feed and capacity moves feasible material even if feed is already at/below target. Already-sized fractions pass unchanged.

### Screen

Screen has one stored particulate feed and two explicit outputs:

```text
feed → Screen → undersize
              → oversize
```

Canonical aperture choices are:

```text
1, 5, 15, 25, 60, 120 mm
```

Current physics is an ideal sharp split. A fraction whose size-bin upper bound is at/below the aperture routes to `undersize`; coarser fractions route to `oversize`.

Screening is routing only: do not change species, size-bin ID, liberation class, or quantity while screening.

Both outputs are required. Continuous Screen execution must stage both outputs and feed transactionally so an unavailable required destination cannot cause partial consumption/loss.

Do not add realistic near-cut misplacement, moisture effects, deck loading, shape effects, vibration, or other screen-efficiency physics unless the active task calls for them.

### Magnetic Separator

Current Magnetic Separator requires all feed particle-size classes at or below 25 mm. Oversized mixed feed blocks the whole process; it is not an implicit Screen.

Magnetic recovery uses the material-property resolver plus liberation, particle-size suitability, field strength, and entrainment/carryover.

---

## Simulation Contracts

- fixed time steps independent of render FPS;
- navigation does not stop active Site simulation;
- world pause/resume is separate from machine enabled/disabled state;
- machine command state is separate from derived `off / idle / running / blocked` state;
- new active apparatus defaults disabled unless a task explicitly specifies otherwise;
- simulation logic remains independent from browser rendering;
- apparatus execution is registry-driven with explicit phase/order where needed.

---

## Recursive Boundaries

Composite matter exchange uses explicit boundary storage/ports.

- Parent-facing and child-visible boundary interfaces represent the same physical ownership state.
- A boundary existing does not imply movement.
- Cross-boundary movement must be explicit and conserved.
- Do not create invisible cross-workspace logistics.

---

## Shared Graph and Workspace

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

- persistent relationships in the current workspace must have visible edges;
- edge meaning is typed;
- logical graph space is effectively unbounded and supports signed coordinates;
- node category is semantic identity, not operating state;
- physical truth does not belong in workspace DOM state.

Canonical workspace domains live under:

```text
src/workspace/catalog/
src/workspace/graph/
src/workspace/inspector/
src/workspace/navigation/
src/workspace/shell/
```

`workspaceController.js` is the current DOM/application orchestrator. Prefer generic definition-driven apparatus UI behavior before adding machine-specific controller branches.

---

## Compatibility Entry Points

The restructure retained thin forwarding/compatibility modules in portions of:

- `src/core/materials/`
- `src/core/processes/`
- `src/core/world/worldState.js`
- `src/simulation/`
- `src/workspace/`
- `src/data/`

A compatibility file must not become a second implementation home. Do not add authoritative content, machine behavior, or duplicate physics there when a canonical location exists.

---

## Scope Control

Unless the active task explicitly requires them, do not add:

- full chemistry/speciation
- giant resource/mineral databases
- power/energy networks
- logistics systems
- sensors/controllers
- multiplayer/backend infrastructure
- star/system generation expansion
- reserve/depletion systems
- speculative material properties with no active process consumer
- unrelated gameplay features

---

## Completion Checklist

Before finishing a task/PR:

1. Confirm the behavior uses canonical architecture paths where practical.
2. Confirm ownership, conservation, compatibility, graph, state-separation, and deterministic-generation contracts did not regress.
3. Confirm new apparatus did not require avoidable central type lists or pair whitelists.
4. Add/update focused tests for the requested invariant and extension path.
5. Run the complete test suite.
6. Perform browser smoke testing for layout/interaction/rendering changes, or clearly state when manual browser verification remains.
7. Update schema/generator versions only when their rules require it.
8. Update README/ARCHITECTURE/design/guardrails when a documented contract or current implementation state changed.
