# Project Interlink — Architecture and File Organization

This document records the **current implementation architecture** of Project Interlink: where responsibilities live, which dependency directions are intentional, how new systems should be added, and which files are compatibility surfaces rather than canonical implementation homes.

`DESIGN.md` describes what the game is intended to become. `README.md` summarizes the current playable/technical state. `.github/copilot-instructions.md` contains coding-agent guardrails. This file is the source of truth for **code organization and responsibility boundaries**.

---

## 1. Architectural Goals

The project is organized to support growth from a small material-processing prototype into a much larger simulation containing many apparatus types, physical properties, process models, material forms, controls, recursive systems, and world-generation domains without returning to central switchboards or duplicate registries.

The important boundaries are:

```text
content definitions
        ↓
core physical/system contracts
        ↓
process definitions + pure physics
        ↓
simulation runtimes
        ↓
workspace projection / interaction
```

Generation is a separate producer of world truth:

```text
content + deterministic RNG + core world assembly
                    ↓
               generated world
```

The application composes generation, Knowledge State, and the workspace; the core model does not need to know about browser rendering.

---

## 2. Dependency Direction

New code should preserve this broad dependency direction:

```text
src/app.js
├── generator
├── core
└── workspace

workspace
├── simulation
├── content
└── core

simulation
├── content
└── core

generator
├── content
└── core

content
└── core

core
└── core
```

### Rules

- `core` contains reusable physical, process, world-model, validation, Knowledge-State, and neutral system abstractions. It must not depend on workspace/UI or simulation runtime code.
- `content` defines what resources, Features, apparatus, and similar catalog entries exist. It may reference core contracts but should not contain running simulation behavior.
- `generator` decides what deterministic world content appears from physical conditions and seeded RNG. It consumes content definitions rather than owning those definitions.
- `simulation` owns continuous runtime behavior, inventories, streams, apparatus execution, world-time advancement, and boundary transfer.
- `workspace` owns player-facing graph projection, layout, navigation, catalog interaction, Inspector presentation, and DOM orchestration. It does not own physical truth.
- `src/app.js` is the composition root for the browser application and may compose generator, core application-facing state such as Knowledge State, and workspace modules.

### Legacy compatibility exception

`src/core/world/worldState.js` still exposes the historical `createWorld()` API and therefore imports `generator/generateWorld.js`. New application or feature code should **not** use that dependency direction. Use `src/generator/generateWorld.js` for generation and `src/core/world/model/*` / `src/core/world/validation/*` for the core world model.

Do not add additional `core → generator` dependencies. The compatibility entry point should remain thin until old callers can be migrated and removed safely.

---

## 3. Repository Organization

The current repository is intentionally lightweight: vanilla HTML/CSS/ES modules, Node-based tests, and no application framework or backend.

```text
Project-Interlink/
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/
│       └── test.yml
│
├── ARCHITECTURE.md
├── DESIGN.md
├── PATCH_NOTES.md
├── README.md
│
├── index.html
├── styles.css
├── workspace-overrides.css
├── apparatus-controls.css
├── package.json
│
├── src/
│   ├── app.js
│   ├── content/
│   ├── core/
│   ├── data/
│   ├── generator/
│   ├── simulation/
│   └── workspace/
│
└── tests/
```

The sections below describe the `src/` tree in detail. `tests/` is intentionally organized by behavior/domain rather than mirroring source folders one-for-one; architecture, simulation, material, generation, navigation, catalog, and UI contracts all have regression coverage there.

---

## 4. `src/content/` — Declarative Game Content

`content` answers **what can exist?** It should contain declarative definitions and compatibility/catalog metadata, not process runtime loops or DOM behavior.

```text
src/content/
├── apparatus/
│   └── definitions.js
│
├── features/
│   ├── featureCompatibility.js
│   ├── featureGeneration.js
│   ├── featureNames.js
│   └── featureTypes.js
│
└── resources/
    ├── occurrenceFamilies.js
    ├── rawResources.js
    ├── resourceCompositions.js
    ├── resourceDefinitions.js
    └── resourceDescriptors.js
```

### Apparatus definitions

`content/apparatus/definitions.js` is the canonical definition source for current placeable engineering nodes. It owns information such as:

- node type / identity
- catalog label, category, description, search terms, and order
- whether the apparatus is placeable
- process association
- canonical ports and port capabilities
- fixed capability metadata
- default values
- player-configurable process parameters

The NODE catalog derives from these definitions; do not create a second independent machine catalog.

### Resource and Feature content

Resource composition templates, descriptions, occurrence-family taxonomy, Feature type rules, and Feature-generation weighting data belong here. Generator code consumes these definitions and applies deterministic selection/randomization.

---

## 5. `src/core/` — Reusable Simulation Truth and Contracts

`core` contains domain logic that should remain useful regardless of how a system is displayed or which runtime apparatus invokes it.

```text
src/core/
├── materials/
├── processes/
├── systems/
└── world/
```

### 5.1 Materials

```text
src/core/materials/
├── materialBatches.js
├── materialBody.js
├── materialForms.js
├── occurrenceMaterialization.js
├── sampleAcquisition.js
│
├── properties/
│   └── magneticProperties.js
│
├── solids/
│   ├── liberationClasses.js
│   ├── particleSizeBins.js
│   └── solidMaterialState.js
│
├── species/
│   ├── materialSpecies.js
│   └── speciesRegistry.js
│
├── liberationClasses.js        [compatibility re-export]
├── materialSpecies.js          [compatibility re-export]
├── particleSizeBins.js         [compatibility re-export]
└── solidMaterialState.js       [compatibility re-export]
```

The implemented particulate solid state is sparse and aggregate-based:

```text
speciesId × sizeBinId × liberationClassId → quantity
```

A fraction describes a population, not an individually simulated particle.

Additional physical properties should **not** automatically become more fraction-key axes. Body-level state, phase-specific state, and property resolvers should be added only when a process needs them.

`properties/` is the intended home for domain-specific property access/resolution. Physics code should use these property APIs rather than reaching directly into registry internals when a resolver exists.

### 5.2 Processes

```text
src/core/processes/
├── conservation/
│   ├── conservation.js
│   └── speciesConservation.js
│
├── definitions/
│   ├── crushing.js
│   ├── magneticSeparation.js
│   └── index.js
│
├── executors/
│   ├── crushing.js
│   ├── magneticSeparation.js
│   └── index.js
│
├── physics/
│   ├── crushing.js
│   ├── magneticSeparation.js
│   └── index.js
│
├── processExecution.js
├── processDefinitions.js       [compatibility re-export]
└── processPhysics.js           [compatibility re-export]
```

Responsibilities are intentionally split:

```text
Process definition
    what inputs/outputs/parameters/contracts exist

Pure physics
    what the transformation physically does

Executor
    adapts the pure transformation to discrete MaterialBatch execution

Continuous runner/runtime
    adapts the same physical behavior to apparatus flow

Conservation policy
    validates the conserved quantities appropriate to the process family
```

Mechanical processes currently use species conservation. Future chemistry or thermal processes may require different conservation policies rather than forcing every process into species-preserving rules.

### 5.3 Neutral system primitives

```text
src/core/systems/
├── connections.js
├── nodeCategories.js
├── ports.js
├── systemNode.js
└── systemValidation.js
```

These modules describe neutral recursive node/port/connection concepts shared by natural hierarchy nodes and engineered systems.

Connection eligibility should be based on edge kind plus interface/physical capabilities, not explicit machine-pair whitelists.

Current important kinds/capabilities include:

- `resource-access`
- `material`
- `resource-source`
- `solid-particulate`
- `stored-solid-particulate`

`stored-solid-particulate` describes a buffered/withdrawable interface requirement; it is not material provenance or a distinct physical material form.

### 5.4 World model and validation

```text
src/core/world/
├── knowledgeState.js
├── versions.js
├── worldState.js               [legacy compatibility entry point]
│
├── model/
│   ├── feature.js
│   ├── planet.js
│   ├── region.js
│   ├── resourceOccurrence.js
│   ├── site.js
│   ├── worldAssembly.js
│   └── worldState.js
│
└── validation/
    ├── helpers.js
    ├── hierarchyValidation.js
    ├── occurrenceValidation.js
    ├── processHistoryValidation.js
    ├── worldValidation.js
    └── index.js
```

Validation domains own their own checks and are composed by `validateWorld()`; they should not be separated by filtering error strings.

The canonical natural ownership hierarchy is:

```text
Planet → Region → Site → Feature → ResourceOccurrence
```

---

## 6. `src/generator/` — Deterministic World Generation

`generator` answers **what physical world is produced from this seed and these conditions?** It owns deterministic algorithms and RNG use, not the authoritative catalog of resources/Feature types.

```text
src/generator/
├── random.js
├── generateWorld.js
├── generatePlanet.js
├── generateRegions.js
├── generateFeatures.js
├── generateResources.js
│
├── planet/
│   └── generatePlanet.js
├── regions/
│   └── generateRegions.js
├── sites/
│   └── generateSites.js
├── features/
│   └── generateFeatures.js
└── resources/
    └── generateResources.js
```

Some top-level generator modules remain compatibility/public entry points while domain folders provide focused organization. New generation behavior should preserve deterministic namespaced RNG and follow generator-version rules when same-seed output changes.

`generateWorld.js` combines deterministic generation with `core/world/model/worldAssembly.js`.

---

## 7. `src/simulation/` — Running Physical Systems

`simulation` owns continuous time evolution and placed-system behavior.

```text
src/simulation/
├── apparatus/
│   ├── blueprintHelpers.js
│   ├── crusher.js
│   ├── extractor.js
│   ├── magneticSeparator.js
│   └── registry.js
│
├── apparatusDefinitions.js     [compatibility re-export]
├── boundaryTransfer.js
├── continuousProcessing.js
├── extractorNode.js
├── hopperNode.js
├── materialStream.js
├── simulationEngine.js
├── systemNode.js               [compatibility re-export]
└── worldSimulation.js
```

### Apparatus runtimes

Runtime modules contain the behavior of placed machines. The runtime registry provides creation/simulation dispatch so `simulationEngine.js` does not need another machine-specific branch for every apparatus.

Current registry-backed apparatus are:

- Extractor
- Hopper
- Crusher
- Magnetic Separator

Hopper/storage implementation currently remains in `hopperNode.js` and is registered through `apparatus/registry.js` rather than having a separate `apparatus/hopper.js` file.

### Simulation engine

`simulationEngine.js` remains the graph/simulation orchestrator. It owns generic blueprint operations, connection validation, stream setup, fixed-step apparatus dispatch, and apparatus control entry points. Machine-specific transformation behavior belongs in apparatus runtime or core physics modules.

### Streams and storage

`MaterialStream` represents transfer rates, not inventory. Hoppers and boundary buffers own stored matter. Continuous processes must respect downstream capacity and commit multi-output changes atomically.

---

## 8. `src/workspace/` — Player-Facing Graph Application

`workspace` owns player interaction and projection of physical state into the common graph interface.

```text
src/workspace/
├── workspaceController.js
├── workspaceState.js
├── sitePrototype.js
├── siteSession.js
│
├── catalog/
│   ├── catalogState.js
│   └── nodeCatalog.js
│
├── graph/
│   ├── nodePlacement.js
│   ├── nodePresentation.js
│   ├── nodeRemoval.js
│   ├── viewport.js
│   └── workspaceGraph.js
│
├── inspector/
│   ├── apparatusControlUI.js
│   ├── genericApparatusInspectorUI.js
│   ├── inspectionViewModel.js
│   └── inspectorUI.js
│
├── navigation/
│   ├── navigationProjection.js
│   └── navigationState.js
│
├── shell/
│   ├── utils.js
│   └── workspaceUI.js
│
├── apparatusControlUI.js       [public installer / compatibility surface]
├── inspectionViewModel.js      [compatibility re-export]
├── navigationProjection.js     [compatibility re-export]
├── nodeCatalog.js              [compatibility re-export]
├── nodePlacement.js            [compatibility re-export]
├── nodePresentation.js         [compatibility re-export]
├── nodeRemoval.js              [compatibility re-export]
├── viewport.js                 [compatibility re-export]
├── workspaceGraph.js           [compatibility re-export]
└── workspaceUI.js              [compatibility re-export]
```

`workspaceController.js` is the current DOM/application orchestrator. Domain rules should continue to move into the focused graph/catalog/inspector/navigation/shell modules when they can be made independently meaningful and testable. Do not recreate a second hierarchy-specific workspace implementation.

The generic apparatus Inspector and definition-driven NODE catalog are important scalability boundaries: future apparatus should not require a new central UI type list merely to be placeable, removable, inspectable, or configurable.

---

## 9. `src/data/` — Compatibility Namespace

```text
src/data/
├── occurrence-families.js
├── raw-resources.js
└── resourceDefinitions.js
```

These are compatibility forwarding modules. Canonical resource content now lives under `src/content/resources/`.

Do not add new authoritative content to `src/data/`.

---

## 10. Canonical Extension Path — Adding an Apparatus

A new apparatus such as Screen should normally require focused additions rather than edits to unrelated central switchboards.

Typical path:

```text
1. content/apparatus/definitions.js
   identity, catalog metadata, ports/capabilities, process association,
   fixed capabilities, defaults, configurable parameters

2. core/processes/definitions/<process>.js
   process contract when the apparatus performs a process

3. core/processes/physics/<process>.js
   pure physical transformation/routing behavior

4. core/processes/executors/<process>.js
   only when discrete MaterialBatch execution is supported/needed

5. simulation/apparatus/<apparatus>.js
   continuous placed-machine behavior, backpressure, transaction boundaries

6. simulation/apparatus/registry.js
   runtime registration/phase

7. tests/
   physics, conservation, connectivity, backpressure, runtime, and generic UI integration
```

The following should **not** normally be required just to add a machine:

- a machine-pair connection whitelist
- a second NODE catalog registration list
- a node-type list for removability
- a node-type list for generic Inspector eligibility
- a new central simulation `if/switch` branch

If those become necessary, first determine whether the new apparatus exposes a genuinely new system concept or whether an existing generic boundary is being bypassed.

---

## 11. Canonical Extension Path — Adding a Material Property

A material/species property should enter the simulation when at least one process needs it to determine a physical outcome.

Preferred pattern:

```text
species/reference data
        ↓
core/materials/properties/<domain>.js resolver
        ↓
core/processes/physics/<process>.js
        ↓
apparatus result
```

Examples of future domains may include density, mechanical/grindability, thermal, electrical, surface, and chemical properties.

Guidelines:

- Do not add speculative values only to fill a universal property table.
- Distinguish intrinsic species properties from body/mixture/structure state.
- Do not make every new property another particulate fraction-key dimension.
- Keep process context in the process model when the behavior is not intrinsic to the species.
- Physics modules should depend on property APIs, not UI or runtime nodes.

---

## 12. Canonical Extension Path — New Content or Generation Rules

When adding a new resource/Feature concept:

```text
content/
    what exists, classifications, compatibility, descriptors, templates

generator/
    when/where/how the content is selected from deterministic conditions + RNG
```

Do not move declarative content back into generator implementation files.

If same-seed generated truth changes, follow the `GENERATOR_VERSION` rule in `src/core/world/versions.js`.

If serialized world structure changes, follow the `SCHEMA_VERSION` rule.

---

## 13. Compatibility Entry-Point Policy

The architecture refactor preserved small forwarding files so existing imports and tests did not need to move all at once.

A compatibility entry point should:

- re-export or delegate to a canonical module;
- contain little or no independent domain logic;
- not become the preferred import path for new code;
- not become a second source of truth.

When a compatibility surface has no remaining consumers, removal can be handled as a focused cleanup rather than mixed into unrelated feature work.

---

## 14. Tests as Architectural Contracts

The test suite is not only behavior coverage; several tests deliberately protect architecture boundaries.

Important classes of tests include:

- deterministic generation and version behavior
- Planet → Region → Site → Feature → ResourceOccurrence ownership
- concrete generated solid species/property coverage
- MaterialBody/fraction validation
- conservation and atomic backpressure
- no material fan-out without a splitter
- resource-access carrying no matter
- typed-port compatibility and boundary topology
- registry-backed apparatus creation/simulation
- definition-driven NODE catalog
- generic future-apparatus Inspector behavior
- domain-separated world validation
- process definition/physics/executor/conservation boundaries
- workspace state vs physical state separation

Run the complete suite after architectural or simulation changes:

```bash
npm test
```

---

## 15. Documentation Maintenance Rule

When implementation structure changes materially:

- update **`ARCHITECTURE.md`** for file ownership/dependency/extension-path changes;
- update **`README.md`** when the current implementation state or near-term direction changes;
- update **`DESIGN.md`** only when the long-term design contract changes;
- update **`.github/copilot-instructions.md`** when coding-agent guardrails or canonical implementation paths change;
- keep **`PATCH_NOTES.md`** as historical development context rather than current architectural authority.

The goal is for a contributor or coding agent to answer both of these questions without reverse-engineering the repository:

> **Where does this kind of code belong?**

and

> **Which existing boundary should a new system extend instead of bypass?**
