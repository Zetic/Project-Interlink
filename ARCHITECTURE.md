# Project Interlink — Architecture and File Organization

This document records the **current implementation architecture** of Project Interlink: where responsibilities live, which dependency directions are intentional, how new systems should be added, and which files are compatibility surfaces rather than canonical implementation homes.

`DESIGN.md` describes what the game is intended to become. `README.md` summarizes current implementation state. `.github/copilot-instructions.md` contains coding-agent guardrails. This file is the source of truth for **code organization and responsibility boundaries**.

---

## 1. Architectural Goals

The project is organized to grow from the current material-processing prototype into a much larger simulation containing many apparatus types, physical properties, process models, material forms, controls, recursive systems, and world-generation domains without returning to central switchboards or duplicate registries.

The important responsibility chain is:

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

The browser application composes generation, Knowledge State, and the workspace.

---

## 2. Dependency Direction

Preferred dependency direction:

```text
app → generator + core + workspace
workspace → simulation + content + core
simulation → content + core
generator → content + core
content → core
core → core
```

### Rules

- `core` contains reusable physical, process, world-model, validation, and neutral-system abstractions. It must not depend on workspace/UI or simulation-runtime code.
- `content` defines what resources, Features, apparatus, and similar catalog entries exist. It should not contain running simulation loops or DOM behavior.
- `generator` decides what deterministic world content appears from physical conditions and seeded RNG. It consumes content definitions rather than owning those definitions.
- `simulation` owns continuous runtime behavior, streams, storage, apparatus execution, world-time advancement, and boundary transfer.
- `workspace` owns player-facing graph projection, layout, navigation, catalog interaction, Inspector presentation, and DOM orchestration. It does not own physical truth.
- `src/app.js` is the browser composition root.

### Legacy compatibility exception

`src/core/world/worldState.js` still exposes the historical `createWorld()` compatibility API and therefore delegates to `generator/generateWorld.js`. New code should not extend this dependency direction.

Use:

- `src/generator/generateWorld.js` for new world generation callers;
- `src/core/world/model/*` for world-model responsibilities;
- `src/core/world/validation/*` for validation.

Do not add additional `core → generator` dependencies.

---

## 3. Repository Organization

The project intentionally remains lightweight: vanilla HTML/CSS/ES modules, Node-based tests, and no application framework or backend.

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

---

## 4. `src/content/` — Declarative Game Content

`content` answers **what can exist?** It owns declarative definitions and compatibility/catalog metadata, not process runtime loops or UI behavior.

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

`content/apparatus/definitions.js` is the canonical definition source for current placeable engineering nodes. It owns:

- node type / identity;
- NODE catalog label, category, description, search terms, order, and placeability;
- process association;
- canonical ports and interface capabilities;
- fixed capability metadata;
- defaults;
- player-configurable process parameter metadata.

Current placeable definitions are Extractor, Crusher, Screen, Magnetic Separator, and Hopper.

The NODE catalog is projected from these definitions. Do not create a second independent machine catalog.

### Resources and Features

Resource composition templates, descriptions, occurrence-family vocabulary, Feature types, Feature naming, hard compatibility, and generation weighting data belong under `content/`. Generator code consumes them and applies deterministic physical conditions/RNG.

---

## 5. `src/core/` — Reusable Physical Truth and Contracts

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

The implemented particulate state is sparse and aggregate-based:

```text
speciesId × sizeBinId × liberationClassId → quantity
```

A fraction represents a population, not one simulated particle.

Do not automatically make every new physical property another fraction-key dimension. Body-level state, phase-specific state, species reference properties, and derived property resolvers should remain separate where appropriate.

`properties/` is the intended home for domain-specific property resolution. Process physics should use property APIs when a resolver exists instead of reaching directly into registry internals.

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
│   ├── screening.js
│   └── index.js
│
├── executors/
│   ├── crushing.js
│   ├── magneticSeparation.js
│   ├── screening.js
│   └── index.js
│
├── physics/
│   ├── crushing.js
│   ├── magneticSeparation.js
│   ├── screening.js
│   └── index.js
│
├── processExecution.js
├── processDefinitions.js       [compatibility re-export]
└── processPhysics.js           [compatibility re-export]
```

Responsibilities are deliberately split:

```text
Process definition
    inputs / outputs / parameters / applicability / conservation policy

Pure physics
    material transformation or routing

Executor
    discrete MaterialBatch adapter

Continuous runtime
    placed-machine flow / backpressure adapter

Conservation policy
    validates the quantities conserved by the process family
```

Current mechanical processes use species conservation. Future chemistry or thermal processes can introduce stronger/different conservation policies rather than weakening mechanical conservation.

#### Current process kernels

- **Crushing** changes size distribution and liberation while preserving species mass.
- **Screening** routes existing fractions to `undersize` or `oversize` according to an ideal aperture cut without changing their species, size class, liberation, or quantity.
- **Magnetic Separation** routes fractions according to magnetic response plus size, liberation, field strength, and entrainment/carryover.

### 5.3 Neutral system primitives

```text
src/core/systems/
├── connections.js
├── nodeCategories.js
├── ports.js
├── systemNode.js
└── systemValidation.js
```

These modules describe reusable node/port/connection concepts shared by natural hierarchy nodes and engineered systems.

Connection eligibility derives from edge kind plus interface/physical capabilities, not explicit machine-pair whitelists.

Current important concepts include:

- `resource-access` edge kind;
- `material` edge kind;
- `resource-source` capability;
- `solid-particulate` capability;
- `stored-solid-particulate` capability.

`stored-solid-particulate` means the receiving process requires a buffered/withdrawable particulate owner. It is an interface requirement, not material provenance or a distinct physical form.

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

Validation domains own their own checks and are composed by `validateWorld()`.

Canonical natural ownership remains:

```text
Planet → Region → Site → Feature → ResourceOccurrence
```

---

## 6. `src/generator/` — Deterministic World Generation

`generator` answers **what physical world is produced from this seed and these conditions?** It owns deterministic algorithms and RNG use, not authoritative content catalogs.

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

Some top-level modules remain compatibility/public entry points while focused domain directories establish the long-term organization. Generation changes that alter same-seed world truth must follow generator-version rules.

`generateWorld.js` composes deterministic generation with `core/world/model/worldAssembly.js`.

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
│   ├── screen.js
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

Runtime modules contain the behavior of placed active machinery. The runtime registry owns generic creation/simulation dispatch so `simulationEngine.js` does not acquire a machine-specific branch for every new apparatus.

Current registry-backed node types are:

```text
extractor
hopper
crusher
screen
magSep
```

Hopper/storage implementation remains in `hopperNode.js` and is registered through `apparatus/registry.js`.

### Screen runtime contract

The Screen is the first new apparatus added after the architecture restructure and intentionally validates the extension boundaries.

```text
stored solid feed
      ↓
    Screen
   ├───────┐
   ↓       ↓
undersize oversize
```

Both outputs are explicit and required. The runtime stages feed and both destinations before committing, so a required output constraint cannot delete matter after feed consumption.

The Screen uses the shared `core/processes/physics/screening.js` kernel; continuous runtime does not duplicate screening physics.

### Simulation engine

`simulationEngine.js` remains a graph/simulation orchestrator. It owns generic blueprint operations, connection validation, stream setup, fixed-step registry dispatch, and apparatus control entry points. Machine-specific physical transformations belong in process kernels and apparatus runtime modules.

### Streams and storage

`MaterialStream` represents transfer rates, not inventory. Hoppers and boundary buffers own stored matter. Continuous processes respect downstream capacity and multi-output processes commit atomically.

---

## 8. `src/workspace/` — Player-Facing Graph Application

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

`workspaceController.js` is the current DOM/application orchestrator. Focused graph/catalog/inspector/navigation/shell modules own reusable responsibilities when they can be independently meaningful and tested.

The Screen requires no dedicated NODE registration or generic Inspector eligibility branch. Its catalog entry, parameter control, removability, ports, and generic machine inspection flow through existing definition-driven paths. That is an architectural invariant to preserve for future machines.

---

## 9. `src/data/` — Compatibility Namespace

```text
src/data/
├── occurrence-families.js
├── raw-resources.js
└── resourceDefinitions.js
```

These are compatibility forwarding modules. Canonical resource content lives under `src/content/resources/`.

Do not add new authoritative content to `src/data/`.

---

## 10. Canonical Extension Path — Adding an Apparatus

Screen has now exercised this path successfully. A future process apparatus such as a Mill or Gravity Separator should normally require focused additions rather than unrelated central edits.

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
   physics, conservation, connectivity, backpressure, runtime, generic UI integration
```

The following should **not** normally be required merely to add a machine:

- a machine-pair connection whitelist;
- a second NODE catalog registration list;
- a node-type list for removability;
- a node-type list for generic Inspector eligibility;
- a new central simulation `if/switch` dispatch branch.

If one becomes necessary, determine whether the new apparatus introduces a genuinely new system concept or an existing generic boundary is being bypassed.

---

## 11. Canonical Extension Path — Adding a Material Property

A property should enter the simulation when at least one process needs it to determine a physical outcome.

Preferred pattern:

```text
species/reference data or material/body state
              ↓
core/materials/properties/<domain>.js
              ↓
core/processes/physics/<process>.js
              ↓
apparatus/process result
```

Future property domains may include density, mechanical/grindability, thermal, electrical, surface, chemical, and fluid properties.

Guidelines:

- do not add speculative values just to fill a universal table;
- distinguish intrinsic species properties from body/mixture/structural state;
- do not make every property another particulate fraction-key axis;
- add state/property resolution when an implemented process consumes it;
- keep process physics dependent on property APIs rather than UI/runtime representation.

---

## 12. Matter, Process, and Connection Invariants

### Matter ownership

Every modeled unit of matter has one physical owner/location at a time. A `MaterialStream` describes transfer rate and does not duplicate inventory.

### Mechanical conservation

Current Crusher, Screen, and Magnetic Separator operations preserve species mass. Screening additionally preserves each routed fraction descriptor exactly.

### Transactional outputs

A process must establish feasible output capacity before committing feed consumption. Multi-output machinery stages all required destinations and commits only after the planned transfer is valid.

### Typed connections

Compatibility derives from port edge kind and capabilities. Do not reintroduce pair tables such as `hopper → screen` or `screen → hopper`.

### Material fan-out/fan-in

One material output cannot fan out until an explicit Splitter exists. Multiple streams must not silently combine into one input without an explicit merger/mixer contract.

### Resource access

`Feature → Extractor` resource access is not matter flow and creates no `MaterialStream`.

---

## 13. Compatibility Entry Points

The restructure intentionally retained thin forwarding/compatibility modules in several areas:

- root files inside `src/core/materials/` forwarding to `solids/` or `species/`;
- `src/core/processes/processDefinitions.js` and `processPhysics.js`;
- `src/core/world/worldState.js`;
- `src/simulation/apparatusDefinitions.js` and `systemNode.js`;
- several root `src/workspace/*.js` files;
- `src/data/*`.

A compatibility module is not a second implementation home.

Do not add new physics, machine behavior, authoritative registries, or content to a compatibility forwarding path merely because the import is shorter.

---

## 14. Tests as Architecture Contracts

The test suite covers both simulation behavior and architectural extension points. Relevant groups include:

- `architectureBoundaries.test.js` — dependency/registry/typed-port boundaries;
- `futureApparatusScalability.test.js` — definition-driven catalog, generic Inspector, arbitrary multi-output inspection, removal policy;
- `apparatusControlUI.test.js` — definition-driven choice controls;
- `continuousSimulation.test.js` — flow, backpressure, conservation, continuous apparatus behavior;
- `materialProcessing.test.js` / `solidMaterialState.test.js` — batch and physical material invariants;
- `screening.test.js` — Screen definition, sharp-cut physics, batch/continuous conservation, required outputs, backpressure, parameter choices, connectivity.

When adding another apparatus or physical property, tests should prove both its physical behavior and that it uses the intended generic extension paths.

---

## 15. Growth Direction

The current solid-processing foundation now supports:

```text
Feature
  ↓
Extractor
  ↓
Hopper
  ↓
Crusher
  ↓
Hopper
  ↓
Screen
 ├─────────────┐
 ↓             ↓
undersize    oversize
```

The next likely architecture/gameplay additions are explicit Splitter/Mixer-Merger behavior, then a Mill/Grinder with finer particle-size classes, followed by a density property domain and Gravity Separation.

Longer-term thermal, fluid, chemical, electrical, control, and logistics systems should extend the same boundaries rather than being packed into universal material objects or central machine engines.

---

## 16. Documentation Rule

When code organization changes, update this file in the same PR when practical.

Use:

- `DESIGN.md` for long-term design contracts;
- `ARCHITECTURE.md` for current code ownership and extension paths;
- `README.md` for current implementation state and roadmap;
- `.github/copilot-instructions.md` for implementation guardrails;
- `PATCH_NOTES.md` for historical context.

If documentation and implementation disagree, resolve the discrepancy rather than allowing multiple architectural stories to coexist.
