# Project Interlink — Material and Reaction System Foundation

## Status

This document defines the intended foundation for the next implementation phase of Project Interlink.

It is an architecture and simulation-design target, not a statement that every system described here is already implemented.

The current `Project-Interlink` repository is a TypeScript-first rebuild of the browser/application architecture while retaining Rust/WASM as the production physics authority. The mature JavaScript-era implementation in `Zetic/Project-Interlink-2` is the behavioral and physics reference for mechanics that already existed there. In particular, the rebuilt project is expected to regain the mature ore-processing model rather than replace it with a simplified composition-only model.

The purpose of this phase is to establish a material representation that can support that existing particulate physics while also providing a clean path toward industrial chemistry, liquids, gases, phase changes, purified materials, and simplified terminal/export products.

---

# 1. Design Goal

Project Interlink is primarily expected to simulate industrial material processing:

```text
natural resource
    ↓
extraction
    ↓
crushing / grinding / classification
    ↓
physical separation / concentration
    ↓
mineral or chemical intermediates
    ↓
industrial reactions / phase changes
    ↓
purified compounds / elements / alloys
    ↓
finished or exportable products
```

The material system therefore needs to be detailed where physical state affects a process, but it should not carry irrelevant history forever.

The core rule is:

> **Preserve a material property while it can still influence a future physical or chemical process. Collapse or discard it when it no longer has physical meaning.**

Examples:

- mineral texture should survive extraction, crushing, grinding, blending, and other operations while it can affect liberation;
- particle-size state should survive while size affects classification, separation, reaction rate, transport, filtration, or another process;
- geological texture should not remain attached to a homogeneous melt after that texture has physically ceased to exist;
- a finished export product should not retain the complete microscopic history of the ore from which it was made unless a surviving property still affects product behavior or grade.

This gives Interlink detailed process physics without forcing every final product to carry the maximum possible state dimension.

---

# 2. Migration Rule: Preserve Existing Physics

`Project-Interlink-2` is the reference implementation for previously developed mechanics.

The JavaScript-to-TypeScript migration does **not** mean rewriting the production physics engine in TypeScript. It also does not mean reconsidering or simplifying an existing physical mechanic merely because the browser architecture is being rebuilt.

For mechanics already present in the reference implementation, the default migration sequence is:

```text
Project-Interlink-2 behavior
        ↓
identify the canonical physical contract
        ↓
represent authoring/presentation contracts in TypeScript
        ↓
compile compact runtime setup
        ↓
execute authoritative physics in Rust/WASM
        ↓
project runtime state back to TypeScript for UI/inspection
```

Existing parity targets include, among other things:

- registered material/mineral species;
- particulate populations represented by species, particle-size bin, liberation class, and mineral-texture lineage;
- occurrence-specific mineral texture;
- staged Jaw/Cone crushing;
- Ball Mill grinding;
- screening;
- splitting, merging, and controlled feeding;
- magnetic separation dependent on species response, liberation, particle size, and process conditions;
- conserved material ownership and transactional backpressure;
- material thermal state;
- minimal gas state;
- thermochemical roasting and gas exhaust.

The new architecture may improve representation, typing, packing, performance, and extension points. It should not silently reduce the physical behavior of these migrated systems.

---

# 3. Responsibility Boundary: TypeScript vs Rust

The material system spans both languages, but there must remain one production simulation authority.

## TypeScript owns

TypeScript is responsible for readable authored/canonical information such as:

- deterministic world and resource generation;
- material/species definitions needed by authoring and UI;
- occurrence composition and geological properties;
- graph topology and typed ports;
- apparatus definitions and player parameters;
- validation of authored state;
- compilation of canonical state into compact runtime setup;
- Worker protocol and runtime presentation;
- Inspector, graphs, readouts, and other UI.

TypeScript answers questions such as:

> What material source exists here?

> Which apparatus are connected?

> What did the player configure?

> How should this runtime state be displayed?

## Rust/WASM owns

Rust/WASM remains authoritative for time-evolving physical state and process execution, including:

- retained inventories;
- material transfer;
- machine throughput;
- backpressure;
- particle-size transformation;
- liberation transformation;
- separation;
- thermodynamic state evolution;
- reaction extent and kinetics;
- phase-sensitive physical transformations;
- conservation-sensitive operations;
- machine operating state;
- runtime rates and process outputs.

Rust answers questions such as:

> How much material moved this fixed step?

> How did the particle-size distribution change?

> How much liberation occurred for this ore texture?

> Which species partitioned to concentrate and tailings?

> How far did a reaction proceed at these conditions?

> Can the downstream owner accept all required products atomically?

The browser should never become a second production physics engine.

---

# 4. Universal Matter Concept

The system should have a common concept of a physical material body while allowing **form-specific state**.

The universal representation must not assume that every material is ore.

A conceptual model is:

```text
MaterialBody
│
├─ physical form
├─ conserved amount / mass
├─ species composition or composition reference
├─ shared state that is physically meaningful for that form
│
└─ form-specific state
    ├─ solid particulate
    ├─ liquid / solution
    ├─ gas
    ├─ bulk solid
    └─ terminal product / packaged output
```

This should not be interpreted as one enormous object containing every possible field. Runtime storage should be specialized so a gas does not allocate liberation state and an ore particle population does not allocate unrelated object metadata.

## Principle: capability-specific state

A property exists because a process can use it.

For example:

| Property | Solid particulate | Liquid | Gas | Bulk solid | Terminal product |
| --- | --- | --- | --- | --- | --- |
| Species composition | yes | yes | yes | yes/grade | optional/summary |
| Particle-size distribution | yes when particulate | suspended phase only if modeled | no | no | no |
| Liberation | mineral particulate where meaningful | no | no | no | no |
| Mineral texture lineage | ore-derived particulate where meaningful | normally no | no | no | no |
| Temperature / energy | where simulated | where simulated | where simulated | where simulated | usually optional |
| Pressure | usually environmental/process context | where relevant | yes where relevant | no | no |
| Concentration | derivable from composition/state | important for solutions | composition/partial pressure | usually no | grade only if useful |
| Product identity / grade | not primary | not primary | not primary | sometimes | primary |

This avoids a universal sparse-property bag that is hard to validate and expensive to simulate.

---

# 5. Material Species Registry

A `MaterialSpecies` describes intrinsic properties of a substance or constituent.

Examples include:

```text
hematite      Fe2O3
magnetite     Fe3O4
goethite      FeO(OH)
quartz        SiO2
iron          Fe
carbon        C
carbon monoxide CO
carbon dioxide  CO2
water         H2O
calcium carbonate CaCO3
calcium oxide CaO
```

Intrinsic properties should be stored once in a canonical registry rather than copied into every kilogram or every fraction.

Candidate property groups include:

```text
identity
  id
  name
  formula
  kind

chemistry
  elemental composition
  molar mass

physical properties
  density
  magnetic response
  phase data where available

thermal / thermodynamic properties
  heat capacity or appropriate model
  formation thermodynamic data where available
  melting / boiling / transition information where useful
```

Not every species needs every property on day one. A process that requires a property should explicitly require supported data rather than inventing a silent default that produces misleading physics.

## Runtime packing

The readable TypeScript registry may use stable string IDs, while Rust hot paths should use compact numeric IDs/tables.

Conceptually:

```text
TypeScript species id: "magnetite"
             ↓ setup compiler
Rust species id: 14
             ↓
packed property lookup tables
```

A particulate population then stores the numeric species identifier and dynamic descriptors, not duplicated density, magnetic response, formula, or heat-capacity values.

---

# 6. Solid Particulate Matter

Solid particulate matter is the first detailed material form because it underpins the existing ore-processing simulation.

The mature reference representation is conceptually:

```text
speciesId × particleSizeBinId × liberationClassId × textureProfileId → quantity
```

A fraction is a **statistical material population**, not an individually simulated particle.

This representation should be restored in the TypeScript/Rust architecture with careful attention to packed runtime layout and aggregation.

## 6.1 Composition

Composition answers:

> Which species are present and how much?

For example, one iron-ore occurrence may contain varying proportions of:

- hematite;
- magnetite;
- goethite;
- quartz.

Extraction conserves that composition unless a physical or chemical process changes it.

## 6.2 Particle size

Particle-size classes describe the current size distribution of particulate material.

The mature reference includes ranges from run-of-mine rock above 1 m through fine material below 4 µm.

Particle size is process state, not immutable source identity. It changes through comminution and can affect:

- crusher/mill applicability;
- screening;
- magnetic separation suitability;
- reaction rate/surface-area effects;
- filtration/classification;
- future solids-handling mechanics.

The new runtime should preserve the existing staged size vocabulary unless an intentional physics change is separately approved.

## 6.3 Mineral texture

Mineral texture describes how constituent minerals occur and intergrow in a particular geological occurrence.

It belongs to the **resource occurrence**, not to the universal species definition.

Two deposits can have the same chemical/mineral composition but different textures and therefore different processing behavior.

The reference texture model includes species-specific grain-size distributions and occurrence modes such as free, boundary, intergrown, and included populations.

Texture is geological lineage. It remains stable while comminution changes particle size and liberation.

## 6.4 Liberation

Liberation answers:

> How physically detached are mineral populations at the current point in processing?

The existing model uses classes such as:

```text
locked
partial
mostly-liberated
liberated
```

Liberation is not purity. A fully liberated particulate body can still be a mixture of separate mineral grains.

Grinding/crushing behavior should continue to resolve liberation from the interaction between:

```text
resulting particle size
× source mineral texture
× equipment breakage regime
```

rather than applying a universal liberation bonus.

## 6.5 When populations merge

Runtime population count is a major performance concern.

Two fractions should aggregate when all process-relevant descriptors are physically equivalent.

For example:

```text
same species
same particle-size bin
same liberation class
same texture lineage
same other required state
```

can usually be represented as one population with a larger quantity.

However, otherwise identical magnetite populations from two texture profiles must remain distinct while that texture can cause different future grinding/liberation behavior.

The general rule is:

> **Merge physically equivalent populations aggressively; preserve distinctions only when they can change future process behavior.**

---

# 7. Liquids, Solutions, and Slurries

Industrial chemistry will eventually require liquid-state material.

The architecture should support this without forcing liquid matter into the ore-particulate descriptor dimensions.

A liquid/solution state may eventually need:

```text
species quantities / composition
thermal state
pressure where relevant
phase identity
solution concentration derived from composition and volume/density
```

Some industrial operations may also contain suspended particulate material. That should not be modeled by pretending the entire slurry is one liquid species.

A future slurry representation can combine or associate:

```text
liquid continuous phase
+
solid particulate suspended phase
```

while preserving particulate descriptors only for the suspended solid population.

The initial material foundation does not need to implement full hydrodynamics, viscosity, or multiphase transport. It needs clean ownership and type boundaries that do not prevent those systems later.

---

# 8. Gas Matter

Gas state is needed for industrial reactions, process atmospheres, exhaust, reduction/oxidation, and phase changes.

A gas body may include:

```text
species composition
amount / mass / moles
thermal state
pressure and volume or another consistent thermodynamic closure when modeled
```

Examples include:

- water vapor from dehydroxylation;
- oxygen-bearing process gas;
- hydrogen;
- carbon monoxide / carbon dioxide;
- future furnace, reactor, or exhaust mixtures.

Gas streams should transfer matter and energy between physical owners. A stream is not itself persistent inventory.

The current mature roasting/exhaust behavior is a migration target and should eventually be represented within this generalized form-specific material architecture.

---

# 9. Bulk Solids and Simplified End Products

Not every solid needs a particulate distribution.

A cast ingot, plate, block, purified bulk solid, or similar manufactured form may use a simpler state such as:

```text
material/species composition or grade
mass
thermal state where relevant
possibly form/quality metadata required by downstream processes
```

Likewise, terminal/export products should be allowed to collapse further:

```text
product identity
quantity
quality / grade when economically or mechanically relevant
```

For example:

```text
ore
  detailed particulate state
      ↓ beneficiation
concentrate
  detailed particulate state
      ↓ chemical processing / melting
homogeneous liquid or bulk material
      ↓ casting / finishing
bulk product
      ↓ packaging/export
terminal product identity + quantity + grade
```

The goal is not to erase conservation or composition prematurely. The goal is to stop retaining dimensions that no longer have physical meaning.

---

# 10. Matter Ownership and Streams

All material forms should follow the existing conservation principle:

> **Every modeled unit of matter has one physical owner/location at a time.**

Owners can include:

- natural occurrences;
- Hoppers;
- tanks;
- reactors;
- machine internal hold-up;
- gas volumes;
- boundary buffers;
- future transport inventories;
- meaningful discrete lots/packages.

A `MaterialStream` represents transfer between owners. It does not duplicate inventory.

For every fixed-step process:

```text
available input
∩ machine capacity
∩ operating constraints
∩ downstream capacity
= feasible transfer / reaction extent
```

Multi-output operations must remain transactional. A process must not consume input and only afterward discover that a required product has nowhere to go.

---

# 11. Chemical Reaction System Goal

Project Interlink should avoid requiring a manually authored recipe for every possible industrial chemical reaction.

The long-term goal is a **species-driven hybrid chemistry system**:

```text
registered species
+
elemental composition
+
thermodynamic data
+
process conditions
+
kinetic/mechanism rules where required
        ↓
physically possible transformations
```

This is different from a conventional crafting database.

An apparatus should primarily provide physical conditions and capabilities:

```text
temperature
pressure
atmosphere
residence time
mixing/agitation where relevant
energy input
feed/removal rates
separation behavior
```

The material and chemistry system should determine what can happen under those conditions.

---

# 12. Species-Driven Reaction Discovery

A reaction engine can derive many candidate transformations from the species database rather than enumerating every equation as a unique recipe.

For a reactor containing elements from a set such as:

```text
Fe, O, C
```

registered candidate species might include:

```text
Fe
FeO
Fe3O4
Fe2O3
C
CO
CO2
O2
```

Species containing unavailable elements cannot appear spontaneously.

This creates a foundational invariant:

```text
atoms in = atoms out
```

subject only to explicit matter crossing the modeled system boundary.

## Candidate selection

The runtime should not test every species in the entire game for every reactor tick.

Candidate species should be resolved or cached from:

- elements actually present;
- allowed physical phases/process domains;
- apparatus capability;
- temperature/pressure domain where relevant;
- mechanism families or known chemistry subsets when required.

This keeps the system extensible without creating an uncontrolled combinatorial search.

---

# 13. Thermodynamics vs Kinetics

Thermodynamic favorability and reaction rate must remain distinct concepts.

## Thermodynamics asks

> Which chemical state is favored under the current conditions?

A future equilibrium layer could use registered thermodynamic properties and element-conservation constraints to determine equilibrium tendencies/composition without requiring every balanced reaction to be handwritten.

Conceptually:

```text
initial species + T + P
        ↓
element conservation
        ↓
thermodynamic objective / equilibrium calculation
        ↓
favored species distribution
```

The exact solver and thermodynamic data model should be selected during implementation with performance, numerical stability, browser/WASM suitability, and data availability in mind.

## Kinetics asks

> How quickly does the material approach that state?

A thermodynamically favorable reaction may be negligible on gameplay timescales without suitable temperature, particle size, catalyst, residence time, or other conditions.

Therefore Interlink should retain kinetic/mechanism models where necessary.

The existing goethite dehydroxylation implementation is an example of an explicit kinetic reaction using Arrhenius behavior and particle-size influence. The future system should generalize beyond one reaction without throwing away this ability to represent physically important rate behavior.

---

# 14. Reaction Families and Mechanisms

The goal is not necessarily zero explicit chemistry definitions.

A practical architecture can combine:

1. a species/thermodynamic database;
2. automatically resolved candidate chemistry;
3. reusable mechanism/reaction families;
4. explicit special-case kinetic definitions where real process behavior requires them.

Examples of reusable mechanism families may eventually include:

```text
oxidation / reduction
carbonate decomposition
dehydroxylation
combustion
acid/base neutralization
dissolution
precipitation
electrolysis
phase transition
```

A family can cover multiple species without defining a unique crafting recipe for every combination.

For example, a carbonate-decomposition family can potentially express a pattern such as:

```text
metal carbonate → metal oxide + CO2
```

with species-specific feasibility, thermodynamic data, and kinetics determining whether and how it actually proceeds.

This hybrid approach avoids both extremes:

- thousands of arbitrary hand-authored recipes;
- an unrealistically unconstrained chemistry solver expected to infer all kinetics from formulas alone.

---

# 15. Example: Iron Oxide Reduction

A future reduction process might contain:

```text
solid iron oxides
+
CO / CO2 process gas
+
heat
```

The apparatus provides conditions rather than an "iron recipe" button.

The chemistry system may consider registered species such as:

```text
Fe2O3
Fe3O4
FeO
Fe
CO
CO2
```

Thermodynamics determines which states are favored at the current conditions, while kinetics and physical state determine how quickly material can transform.

Particle size can remain relevant because it may affect reaction surface area/rate. Geological texture may cease to matter once the original mineral structure has been destroyed or transformed. This illustrates the property-lifetime rule: detailed state survives only as long as it can affect future physics.

---

# 16. Example: Ore Processing into Chemistry

The material architecture should support a continuous path such as:

```text
Feature / ore body
      ↓
Extractor
      ↓
Hopper
      ↓
Jaw Crusher
      ↓
Cone Crusher / Screen recycle
      ↓
Ball Mill
      ↓
physical beneficiation
      ↓
concentrate
      ↓
thermal / chemical reactor
      ↓
purified compound / element / melt
      ↓
bulk product
      ↓
export product
```

At the ore-processing stages, useful state may include:

```text
species
particle size
liberation
texture lineage
thermal state
```

At later homogeneous chemical stages, useful state may instead become:

```text
species / elemental inventory
phase
thermal state
pressure where relevant
```

At the terminal product stage, only:

```text
product identity
quantity
quality / grade
```

may remain necessary.

---

# 17. Performance Requirements

Performance is a first-class design constraint because the simulation is intended to run in a browser while Rust/WASM may eventually manage large industrial networks.

## 17.1 Never simulate individual particles

Particle state is aggregate/statistical.

A population such as:

```text
magnetite + 15–25 mm + partial + texture-17 = 42.7 kg
```

is one runtime population regardless of the physical number of grains represented.

## 17.2 Use packed numeric runtime IDs

Readable canonical IDs belong at authoring boundaries. Rust hot paths should use dense numeric identifiers and compact arrays/tables where practical.

## 17.3 Separate intrinsic data from dynamic state

A million kilograms of magnetite should not duplicate magnetite density, formula, magnetic response, and thermodynamic constants.

Store intrinsic properties once; dynamic populations store only identifiers and changing state.

## 17.4 Aggressively aggregate equivalent populations

Operations that split or merge matter should coalesce physically equivalent populations to control state growth.

Lineage or other descriptors should prevent aggregation only when they can alter future behavior.

## 17.5 Avoid universal property maps in hot paths

Rust should favor typed/form-specific structures over per-population string-keyed property dictionaries.

The model should make invalid states difficult to represent:

- gas should not carry liberation;
- homogeneous bulk solids should not accidentally carry particulate bins;
- terminal products should not allocate unused process-state structures.

## 17.6 Do not send the full simulation state to the browser every frame

The Worker boundary should remain coarse.

As the simulation grows, presentation should move toward compact snapshots/deltas and selected/visible details rather than serializing every material population at display frequency.

Detailed material inspection can be query-driven when appropriate.

## 17.7 Cache static reaction/candidate structure

Chemical candidate resolution, stoichiometric matrices, species-property lookup tables, and other static calculations should be compiled/cached when topology or candidate chemistry changes rather than rebuilt every fixed step.

## 17.8 Complexity should be able to decrease downstream

The material system must support collapsing detail after transformations erase its physical relevance. This is both physically correct and a major long-term performance tool.

---

# 18. Future-Proofing Rules

The foundational implementation should follow these rules.

### Rule 1 — Do not make ore descriptors universal matter fields

Particle size, liberation, and mineral texture belong to particulate matter where meaningful.

### Rule 2 — Do not throw away migrated physics for implementation convenience

If the reference simulation uses a property to determine process behavior, the TypeScript/Rust migration must preserve that behavior unless a deliberate design change is approved.

### Rule 3 — Separate source identity from runtime state

Geological occurrence properties describe the source. Runtime material state describes what has happened to extracted matter.

### Rule 4 — Separate species constants from population state

Intrinsic density, chemistry, magnetic response, and thermodynamic data belong in species/property registries.

### Rule 5 — Preserve conservation across form changes

Changing particulate solid → liquid → gas → bulk solid may change representation, but conserved elements/mass/energy must remain accounted for according to the simulation model.

### Rule 6 — Allow representation transitions

A material form should be allowed to become another form when a physical process warrants it. The architecture must not lock a resource into the representation it had when first generated.

### Rule 7 — Keep chemistry extensible through data

Adding a new registered species should make it available to compatible existing chemistry/mechanism systems without requiring bespoke machine code for every new combination.

### Rule 8 — Keep apparatus focused on capability and conditions

Machines provide operating envelopes and physical conditions. Avoid turning each apparatus into a hardcoded crafting-recipe selector.

---

# 19. Next Implementation Phase

Before reconnecting the rest of the processing machines, the next phase should establish this foundation.

A proposed sequence is:

## Phase A — Typed material vocabulary

- migrate the mature material-species registry into the active TypeScript architecture;
- restore the canonical particle-size vocabulary;
- restore liberation classes;
- restore occurrence-specific mineral texture contracts;
- define explicit physical-form/material-body contracts;
- ensure the design leaves extension paths for liquid, gas, bulk solid, and terminal product forms.

## Phase B — Packed Rust material representation

- compile readable TypeScript IDs/properties to compact Rust runtime IDs/tables;
- represent solid particulate populations as packed statistical state;
- preserve texture lineage and liberation rather than Phase 6 placeholder zeros;
- preserve existing extraction/Hopper behavior and conservation;
- establish deterministic aggregation rules;
- avoid per-tick or per-population duplicated intrinsic properties.

## Phase C — Reaction foundation

- migrate/normalize chemical elemental-composition and molar-mass data;
- define reaction-system interfaces around conserved elemental inventory;
- define candidate-species resolution boundaries;
- establish reusable thermodynamic/kinetic data contracts;
- retain compatibility with explicit kinetic reactions such as goethite dehydroxylation;
- design for future derived/equilibrium chemistry without requiring it to be fully implemented in the same PR.

## Phase D — Validation and presentation

- Inspector can summarize composition, size distribution, liberation, texture lineage, and applicable thermodynamic state from authoritative Rust state;
- runtime validation checks conservation and invalid descriptor combinations;
- tests verify that extraction and storage preserve complete material identity;
- Worker transfer remains bounded and does not turn detailed material state into constant high-frequency DOM work.

Only after this foundation is established should machine parity proceed through the comminution/separation/thermal chain.

---

# 20. Acceptance Criteria for the Foundation Phase

The foundation should be considered successful when all of the following are true:

1. An ore occurrence can be authored in TypeScript with the mature composition and mineral-texture information required by the reference behavior.
2. Runtime extraction materializes a physically meaningful particulate state rather than replacing liberation/texture with placeholder identifiers.
3. A Hopper can retain and later return the same process-relevant species, particle-size, liberation, texture, quantity, and applicable energy state without flattening them.
4. Intrinsic species properties are centrally defined and compiled into efficient Rust lookup structures rather than duplicated across material populations.
5. The runtime has a clear form-specific architecture that can add liquid, gas, bulk-solid, and terminal-product state without expanding every matter record with unrelated optional fields.
6. The system has explicit rules for population equivalence and aggregation.
7. Chemical species include the elemental identity required for atom-conserving reaction work.
8. Reaction architecture supports both explicit kinetic mechanisms and future derived/candidate chemistry rather than requiring every future reaction to be a machine-specific recipe.
9. TypeScript remains the authoring/presentation layer and Rust remains the sole production physical-simulation authority.
10. Tests and documentation explicitly treat `Project-Interlink-2` as the parity reference for already-developed physical mechanics.

---

# 21. Non-Goals of the Foundation Phase

This phase does **not** need to implement all future chemistry at once.

It does not require:

- a universal quantum/molecular simulator;
- CFD or particle-by-particle dynamics;
- full liquid hydrodynamics;
- every possible chemical species;
- every possible phase diagram;
- a complete thermodynamic equilibrium database;
- all reaction families;
- every existing apparatus from the reference project in one PR;
- final UI for all future material forms.

The goal is to establish contracts and runtime ownership that let these capabilities be added without another material-system rewrite.

---

# 22. Direction After the Foundation

Once the material/reaction foundation is stable, apparatus migration should resume against the `Project-Interlink-2` behavioral reference.

A likely progression is:

```text
material/reaction foundation
        ↓
Jaw Crusher
        ↓
Cone Crusher
        ↓
Ball Mill
        ↓
Screen + recycle
        ↓
Splitter / Material Merger / Feeder
        ↓
Dry Drum Magnetic Separator
        ↓
thermal MaterialBody + gas parity
        ↓
Electric Roasting Furnace + Exhaust Vent
        ↓
broader industrial reaction and phase systems
```

The exact PR boundaries may change, but the dependency direction should remain stable: **build the matter model first, then reconnect machines to it.**

---

# 23. Summary

Project Interlink's material system should be detailed enough to model ore beneficiation and industrial chemistry while remaining efficient enough for large browser-hosted industrial networks.

The central architecture is:

```text
READABLE TYPESCRIPT AUTHORING
species / occurrences / graph / apparatus settings
                ↓
        packed setup compiler
                ↓
AUTHORITATIVE RUST/WASM MATTER STATE
form-specific state + conservation + process physics
                ↓
        compact presentation/query data
                ↓
TYPESCRIPT UI / INSPECTION / CONTROL
```

The central material principle is:

> **Preserve process-relevant physical state; discard irrelevant history only when physics makes it irrelevant.**

The central chemistry principle is:

> **Define substances and physical conditions broadly enough that many reactions can be derived or generalized, while retaining explicit kinetics/mechanisms where real process behavior requires them.**

This foundation should allow Interlink to progress from detailed heterogeneous ores through physical beneficiation and industrial chemistry to simple stable end products without either sacrificing physical meaning or allowing simulation state to grow without bound.
