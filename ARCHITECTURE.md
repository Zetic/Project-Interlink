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

Use `src/generator/generateWorld.js` for new generation callers, `src/core/world/model/*` for world-model responsibilities, and `src/core/world/validation/*` for validation.

---

## 3. Repository Organization

The project intentionally remains lightweight: vanilla HTML/CSS/ES modules, Node-based tests, and no application framework or backend.

```text
Project-Interlink/
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/test.yml
├── ARCHITECTURE.md
├── DESIGN.md
├── PATCH_NOTES.md
├── README.md
├── index.html
├── styles.css
├── workspace-overrides.css
├── apparatus-controls.css
├── package.json
├── src/
│   ├── app.js
│   ├── content/
│   ├── core/
│   ├── data/
│   ├── generator/
│   ├── simulation/
│   └── workspace/
└── tests/
```

---

## 4. `src/content/` — Declarative Game Content

`content` answers **what can exist?** It owns declarative definitions and compatibility/catalog metadata, not process runtime loops or UI behavior.

`content/apparatus/definitions.js` is the canonical definition source for placeable engineering nodes. It owns node identity, NODE catalog metadata, process association, canonical ports/capabilities, fixed capabilities, defaults, and player-configurable process parameters.

Current placeable definitions are:

```text
Extractor
Jaw Crusher
Cone Crusher
Ball Mill
Screen
Splitter
Material Merger
Feeder
Dry Drum Magnetic Separator
Hopper
```

The old generic `Crusher` definition is compatibility-only and `placeable: false`.

The NODE catalog is projected from these definitions. Do not create a second independent machine catalog.

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

Relevant solid-material implementation:

```text
src/core/materials/
├── materialBatches.js
├── materialBody.js
├── materialForms.js
├── occurrenceMaterialization.js
├── sampleAcquisition.js
├── properties/
│   └── magneticProperties.js
├── solids/
│   ├── liberationClasses.js
│   ├── mineralTextures.js
│   ├── particleSizeBins.js
│   └── solidMaterialState.js
└── species/
    ├── materialSpecies.js
    └── speciesRegistry.js
```

The implemented particulate state is sparse and aggregate-based. Textured ore populations use:

```text
speciesId × sizeBinId × liberationClassId × textureProfileId → quantity
```

Legacy/untextured populations remain valid as the historical three-axis form:

```text
speciesId × sizeBinId × liberationClassId → quantity
```

A fraction represents a statistical population, not one simulated particle.

`solidMaterialState.textureProfiles` is a small profile registry referenced by textured fraction IDs. It exists so blending two physically different ore textures does not collapse them into one otherwise-identical population and permanently lose information needed by later comminution.

A mineral texture profile currently contains:

```text
id
fallbackLiberationSizeUm
curveSpread
boundaryBreakageAffinity
speciesLiberationSizeUm
```

Texture is **occurrence/geological structural state**, not a `MaterialSpecies` property. Hematite can therefore have different grain/intergrowth scales in different deposits.

The source texture profile remains immutable lineage while particle size and liberation state evolve. This fourth particulate identity axis is justified because merging it away would change future physical outcomes.

Do **not** generalize this into appending every future property to the fraction key. Temperature, pressure, moisture, phase state, and similar body-scale/phase-scale variables should remain outside the sparse particulate identity unless loss of that axis would genuinely merge populations with different future particulate behavior.

`properties/` remains the intended home for domain-specific intrinsic/reference property resolution. Process physics should use property APIs when a resolver exists rather than reaching directly into species registry internals.

### 5.2 Processes

Current staged comminution adds dedicated process definitions/kernels for Jaw crushing, Cone crushing, and milling while retaining generic crushing only for compatibility.

The conceptual responsibility split remains:

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

Current mechanical process behavior:

- **Jaw Crushing** — primary size reduction with a coarse PSD and intentionally very low direct liberation.
- **Cone Crushing** — secondary/tertiary size reduction with nominal PSD/oversize behavior and limited texture-dependent direct liberation.
- **Milling** — sub-millimetre grinding; liberation depends on resulting particle size relative to the source texture's species-specific characteristic liberation scale.
- **Screening** — routes existing fractions to `undersize`/`oversize` by ideal aperture cut without changing descriptors.
- **Material Splitting** — divides every existing population proportionally across explicit outputs.
- **Material Merging** — combines sparse populations while retaining distinct texture lineages.
- **Controlled Feeding** — preserves material state while runtime meters requested mass flow.
- **Magnetic Separation** — routes fractions according to magnetic response plus size, liberation, field strength, and entrainment/carryover.

All current mechanical transformations preserve species mass. Routing/classification also preserves texture lineage.

### 5.3 Texture-aware liberation rule

Generated ore no longer receives a universal liberation gain based only on how many size bins a machine crosses.

The physical dependency is:

```text
resulting particle size
        ↓
size relative to species grain/liberation scale
        +
source ResourceOccurrence mineral texture
        +
equipment breakage regime
        ↓
liberation advancement
```

Jaw/Cone equipment strongly limits direct liberation even when size reduction is large. Ball Mill grinding can create substantial liberation when particles approach or fall below the occurrence-specific characteristic mineral scale.

Two ores with the same bulk composition and the same Ball Mill PSD may therefore leave the mill with different liberation distributions.

### 5.4 Neutral system primitives

`src/core/systems/` describes reusable node/port/connection concepts shared by natural hierarchy nodes and engineered systems.

Connection eligibility derives from edge kind plus interface/physical capabilities, not explicit machine-pair whitelists.

Important current concepts include `resource-access`, `material`, `resource-source`, `solid-particulate`, and `stored-solid-particulate`.

`stored-solid-particulate` means the receiving process requires a buffered/withdrawable particulate owner. It is an interface requirement, not material provenance or a distinct physical form.

### 5.5 World model and validation

Canonical natural ownership remains:

```text
Planet → Region → Site → Feature → ResourceOccurrence
```

Schema `9` requires generated ore-body ResourceOccurrences to carry valid `mineralTexture` data. Generator `7` deterministically creates those texture profiles. Same-seed physical world truth remains deterministic within that generator version.

Occurrence validation checks texture profile structure and species coverage for ore-body composition.

---

## 6. `src/generator/` — Deterministic World Generation

`generator` answers **what physical world is produced from this seed and these conditions?** It owns deterministic algorithms and RNG use, not authoritative content catalogs.

`generateResources.js` now generates ore-body texture profiles after composition is generated. Current prototype texture generation intentionally spans a broad geological range rather than hard-coding one liberation size per resource name:

- occurrence fallback characteristic liberation scale is generated broadly in the tens-to-hundreds of microns;
- each constituent species receives a deterministic scale variation within the occurrence;
- curve spread varies the width of the statistical liberation transition;
- boundary-breakage affinity influences the small amount of liberation possible during crushing.

These values are physical world truth. Exact values should not automatically become player knowledge merely because they exist in the world model.

Generation changes that alter same-seed world truth must follow generator-version rules.

---

## 7. `src/simulation/` — Running Physical Systems

`simulation` owns continuous time evolution and placed-system behavior.

Runtime behavior remains registry-driven. Current active apparatus include Extractor, Jaw Crusher, Cone Crusher, Ball Mill, Screen, Splitter, Material Merger, Feeder, and Dry Drum Magnetic Separator; Hopper is the current storage owner.

### Routing/material-state preservation

Texture lineage must survive any operation that does not physically replace the geological lineage contract:

- Hopper receive/withdraw;
- MaterialStream cloning/scaling;
- Splitter;
- Material Merger;
- Feeder;
- Screen;
- Jaw/Cone/Ball Mill outputs;
- Dry Drum Magnetic Separator concentrate/tailings;
- compatibility Crusher paths.

Material Merger may combine two texture registries into one state, but same-ID conflicting profile definitions are rejected. Fractions with different texture IDs remain separate even when species, size, and liberation class are otherwise identical.

Screen and Splitter remain explicit multi-output apparatus with transactional commits. Material Merger remains explicit fan-in. Feeder remains an identity transformation over material state with flow-control semantics.

`simulationEngine.js` remains a graph/simulation orchestrator. Machine-specific transformations belong in process kernels and runtime modules rather than central type switches.

`MaterialStream` represents transfer rates, not inventory. Hoppers/boundary buffers own stored matter.

---

## 8. `src/workspace/` — Player-Facing Graph Application

`workspace` owns graph projection, catalog, placement, navigation, Inspector presentation, and DOM orchestration. It does not own physical truth.

The generic Inspector currently summarizes composition, particle-size distribution, and liberation. Texture profile IDs/precise grain scales are intentionally not dumped into normal material UI merely because they exist in World State; future analysis/measurement can expose texture knowledge through the Knowledge layer when gameplay needs it.

New machinery should continue to flow through definition-driven catalog, parameter, port, removability, and generic inspection paths instead of acquiring node-type branches.

---

## 9. `src/data/` — Compatibility Namespace

`src/data/*` contains compatibility forwarding modules. Canonical resource content lives under `src/content/resources/`.

Do not add new authoritative content to `src/data/`.

---

## 10. Canonical Extension Path — Adding an Apparatus

Typical path:

```text
1. content/apparatus/definitions.js
   identity, catalog metadata, ports/capabilities, process association,
   fixed capabilities, defaults, configurable parameters

2. core/processes/definitions/<process>.js
   process contract

3. core/processes/physics/<process>.js
   pure physical transformation/routing behavior

4. core/processes/executors/<process>.js
   when discrete MaterialBatch execution is supported/needed

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

---

## 11. Canonical Extension Path — Adding a Material Property or Structural Descriptor

A property/state descriptor should enter the simulation when at least one process needs it to determine a physical outcome.

First determine its physical owner:

```text
intrinsic species property      → MaterialSpecies / property resolver
occurrence geological structure → ResourceOccurrence + carried lineage
body/mixture state              → MaterialBody / phase state
process operating condition     → apparatus/process state
```

Texture is the current example of an occurrence-owned structural descriptor that must also travel with particulate populations because downstream liberation depends on it after blending.

Guidelines:

- do not add speculative values just to fill a universal table;
- distinguish intrinsic species properties from occurrence/body/mixture/structural state;
- do not make every property another particulate fraction-key axis;
- use a new population identity axis only when collapsing it would erase physically relevant future behavior;
- add state/property resolution when an implemented process consumes it;
- keep process physics independent from UI/runtime representation.

---

## 12. Matter, Process, and Connection Invariants

### Matter ownership

Every modeled unit of matter has one physical owner/location at a time. A `MaterialStream` describes transfer rate and does not duplicate inventory.

### Mechanical conservation

Jaw Crusher, Cone Crusher, Ball Mill, compatibility Crusher, Screen, Splitter, Material Merger, Feeder, and Dry Drum Magnetic Separator preserve species mass.

Comminution may change particle size and liberation. It does not change species or texture lineage. Screen/routing/magnetic separation preserve texture lineage while routing populations.

### Transactional inputs and outputs

A process must establish feasible output capacity before committing feed consumption. Multi-output machinery stages all required destinations. Multi-input routing stages all source withdrawals and the destination. A transaction commits only after planned movement is valid.

### Typed connections

Compatibility derives from port edge kind and capabilities. Do not reintroduce pair tables such as `hopper → screen` or `screen → hopper`.

### Material fan-out/fan-in

An ordinary material output remains single-connection. Explicit branching occurs through Splitter output ports. An ordinary input remains single-source. Explicit recombination occurs through Material Merger input ports.

### Resource access

`Feature → Extractor` resource access is not matter flow and creates no `MaterialStream`.

---

## 13. Compatibility Entry Points

Thin compatibility modules remain in several areas, including root material re-exports, `processDefinitions.js` / `processPhysics.js`, `core/world/worldState.js`, simulation compatibility exports, workspace forwarding files, and `src/data/*`.

A compatibility module is not a second implementation home. Do not add new authoritative physics, machine behavior, registries, or content there merely because the import is shorter.

The legacy generic Crusher likewise remains a compatibility apparatus, not the player-facing comminution model.

---

## 14. Tests as Architecture Contracts

The suite covers both simulation behavior and architectural extension points. In addition to existing architecture, routing, screening, and conservation groups, `stagedComminution.test.js` now proves:

- fine-through-ROM particle-size vocabulary;
- mostly locked run-of-mine extraction;
- Jaw primary-crushing size reduction with little liberation;
- Cone feed envelope and nominal PSD;
- Ball Mill feed envelope and fine PSD;
- screen-to-mill eligibility;
- exact species conservation through staged comminution;
- persistent texture lineage from extraction;
- identical Ball Mill settings producing different liberation for different ore textures;
- blended ores retaining separate texture populations rather than collapsing.

`worldIntegrity.test.js` proves ore-body texture generation, species coverage, schema/generator versioning, and determinism.

When adding another apparatus or physical property, tests should prove both its physical behavior and that it uses intended generic extension paths.

---

## 15. Growth Direction

The current ore-processing foundation now represents a realistic high-level distinction:

```text
run-of-mine ore
      ↓
Jaw Crusher       coarse size reduction / little liberation
      ↓
Cone Crusher      secondary/tertiary reduction / limited liberation
      ↕
Screen / recycle
      ↓
Ball Mill         fine grinding / texture-dependent liberation
      ↓
beneficiation selected from actual material properties
```

The Dry Drum Magnetic Separator can serve as coarse dry preconcentration for suitable strongly magnetic material; it is not being treated as universal final beneficiation.

The next major capability should be chosen from the physical state now available rather than added to compensate for missing liberation physics. Density + Gravity Separation is a strong candidate. Slurry/fluid handling then opens wet classification, flotation, and wet magnetic separation. Hardness/grindability and energy can later distinguish comminution efficiency/HPGR behavior.

Longer-term systems should extend these boundaries rather than being packed into universal material objects or central machine engines.

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
