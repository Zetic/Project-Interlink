# Project Interlink — Copilot Coding Instructions

This file contains coding guardrails only. The active GitHub issue defines the task and scope. `DESIGN.md` is long-term design context; `README.md` describes implementation/roadmap. Do not expand an issue merely because those documents mention future systems.

## Working Rules

- Read the full issue and relevant existing code/tests before editing.
- Prefer the smallest coherent change that satisfies the issue.
- Preserve existing architecture unless the issue explicitly requires changing it.
- Do not rewrite unrelated systems for cleanup.
- Do not claim browser/manual behavior was verified unless it was actually tested.
- Run the complete regression suite before declaring work complete.
- Add focused regression tests for new invariants and bug fixes.
- Keep deterministic behavior deterministic; use existing namespaced RNG patterns for generation.
- If behavior changes generated output for the same seed, bump `GENERATOR_VERSION`.
- Bump `SCHEMA_VERSION` only when the serialized world-state contract changes.

## Platform Guardrails

Preserve the current lightweight web architecture unless an issue explicitly requires otherwise:

- HTML/CSS and vanilla JavaScript/ES modules while sufficient.
- Relative imports compatible with GitHub Pages project paths.
- DOM-independent simulation/process logic.
- Node-based deterministic regression tests.

Do not introduce a framework, backend, database, ECS, dependency-injection framework, WebAssembly, or other large infrastructure layer without a concrete issue requirement.

Do not recreate removed architecture such as:

- separate Debug/Player modes;
- a special Engineering workspace;
- structural Feature discovery gating;
- hierarchy-specific graph renderers or interaction models;
- finite positive-only graph coordinates.

## State Separation

Keep these concerns separate:

```text
World / Simulation State
→ objective physical truth

Knowledge State
→ measurements, analysis, estimates, confidence

UI / Application State
→ selection, layout, viewport, temporary interaction state
```

Physical truth must not exist only in DOM/UI objects.

## Canonical Natural-Resource Ownership

Preserve this ownership hierarchy:

```text
Planet
→ Region
→ Site
→ Feature
→ ResourceOccurrence
```

- Region groups Sites and does not own resource inventory or Features directly.
- Site references Features through `featureIds`; do not create a second occurrence-ownership list on Site.
- Every natural `ResourceOccurrence` is Feature-owned with `sourceType: 'feature'` and the owning Feature ID.
- Generated localized Features default to one ResourceOccurrence; independently exploitable sources normally become separate Features.
- Multiple constituents of one physical source belong in its composition, not in separate fake resource sources.

Do not reintroduce legacy Region/Site resource ownership or tolerate dual sources of truth.

## Occurrence-Family Compatibility

Resource/Feature compatibility is based on the canonical occurrence-family vocabulary.

- ResourceDefinitions declare `occurrenceFamily`.
- Feature types declare accepted occurrence families.
- Occurrence family is the hard physical-compatibility gate.
- Tags/environmental affinity may only weight candidates after hard compatibility.
- Do not replace this with per-Feature resource-ID whitelists.
- Keep the occurrence-family taxonomy small and add a new family only when existing families are physically inappropriate.
- Preserve catalog-integrity tests so unknown or accidentally unreachable localized resources are caught.

## Resource Access vs Material Flow

Preserve the physical extraction contract:

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
- creates no MaterialStream;
- may connect only to apparatus configured for an occurrence owned by that Feature.

Material begins flowing only from apparatus material output.

Extraction preserves the occurrence's actual composition. Do not turn natural feedstocks into purified crafting tokens merely because extraction occurred.

## Matter, Streams, and Conservation

- Every modeled unit of matter has one physical owner/location at a time.
- `MaterialBatch` is for meaningful discrete lots/samples, not continuous tick flow.
- `MaterialStream` represents constituent mass-flow rates, not stored inventory or batches-per-tick.
- Total flow is derived from constituent rates.
- Storage integrates inflow/outflow over `dt`.
- Missing/full outputs must block or throttle; never silently delete matter.
- Multi-output processes must commit atomically so one output cannot consume input while another fails.
- Until an explicit splitter exists, one material output cannot fan out to multiple material consumers.
- Do not apply material fan-out restrictions to non-material relationships such as `resource-access`.

## Simulation Contracts

- Simulation uses fixed time steps independent of render FPS.
- Navigation does not stop active Site simulation.
- Keep world pause/resume separate from machine enabled/disabled state.
- Keep machine command state separate from derived operating state (`off`, `idle`, `running`, `blocked`, later `faulted`).
- New active apparatus defaults disabled unless an issue explicitly specifies otherwise.
- Keep simulation logic independent from browser rendering.

## Recursive Boundaries

Composite matter exchange uses explicit boundary storage/ports.

- Parent-facing ports and child-visible boundary storage represent the same physical state.
- A boundary existing does not imply transfer.
- Cross-boundary movement must be explicit and conserved.
- Do not create invisible/implicit cross-workspace logistics.

## Shared Graph and Workspace Interaction

Planet, Region, Site, and future recursive systems use the same graph language:

```text
nodes
ports
edges
selection
inspection
drag/rearrange
connect/disconnect
drill-down for composites
```

- Use shared projection/rendering and interaction paths rather than hierarchy-specific implementations.
- A persistent graph relationship in the current workspace must have a visible edge.
- Edge meaning is typed; not every edge is material flow.
- The viewport is finite; logical graph space is effectively unbounded and supports signed coordinates.
- Node positions must not determine document/page dimensions.
- Node category is semantic identity (`SITE`, `FEATURE`, `APPARATUS`, `CONTAINER`, etc.), not operating state.

## UI Implementation Guardrails

- Prefer shared shell/layout components over per-view markup duplication.
- Workspace-specific content may fill defined shell slots but should not relocate common controls.
- Graph coordinates, pan, and zoom belong to UI state and must not mutate physical world state.
- Inspector content should emphasize actionable/gameplay-relevant information rather than dumping every stored field.
- Preserve accessibility to generated structural Regions/Sites/Features; Knowledge mechanics should affect characterization, not basic structural visibility.

## Scope Control

Unless the active issue explicitly requires them, do not add:

- full chemistry/speciation;
- giant resource/mineral databases;
- power/energy networks;
- logistics systems;
- sensors/controllers;
- multiplayer/backend infrastructure;
- star/system generation expansion;
- reserve/depletion systems;
- unrelated gameplay features.

Implement only enough neighboring code to keep the requested change coherent and tested.

## Completion Checklist

Before finishing an issue/PR:

1. Confirm the requested behavior is implemented through the existing architecture where practical.
2. Confirm no hard ownership, conservation, compatibility, graph, or state-separation contract regressed.
3. Add/update focused tests for the requested invariant.
4. Run the complete test suite.
5. Perform browser smoke testing when the issue affects layout, interaction, or rendering; otherwise state that manual browser verification remains required.
6. Update version constants only when their stated rules require it.
7. Update README/design documentation only when the issue materially changes a documented contract or roadmap; do not turn this instruction file into a project-status log.