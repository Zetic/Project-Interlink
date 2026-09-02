# Project Interlink — Game Design

`DESIGN.md` describes what Project Interlink is intended to become.

It is the long-term design reference for the game. `README.md` describes the current implementation state. `ARCHITECTURE.md` describes current code organization and responsibility boundaries.

Implementation should remain incremental. A design concept appearing here does **not** mean it should be implemented immediately.

---

# 1. Core Vision

Project Interlink is a systems-driven simulation and management game built around one central principle:

> **Everything is a system, and every system can become a component of a larger system.**

The player begins with limited capability in an unfamiliar physical environment and gradually turns locally available matter and energy into a self-sustaining industrial system.

The intended fantasy is:

> **Understand the world, discover what matter is available, determine how to transform it, engineer systems that can perform those transformations, automate them, and recursively combine those systems into larger industrial capabilities.**

The game should reward understanding relationships rather than memorizing arbitrary recipes.

---

# 2. Core Gameplay Loop

The long-term gameplay loop is:

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

A more physical description is:

```text
Discover matter
    ↓
Determine what it contains and what conditions affect it
    ↓
Develop a process that transforms or separates it
    ↓
Build an apparatus capable of those conditions
    ↓
Produce a new material or capability
    ↓
Use that capability to reach harsher, cleaner, hotter,
colder, higher-pressure, lower-pressure, faster, or more precise regimes
    ↓
Automate the old process
    ↓
Scale and integrate it
    ↓
Repeat
```

World generation exists to create meaningful starting conditions and industrial problems for this loop. Generation is not the final game by itself.

Early development should periodically create small playable vertical slices of this loop rather than postponing all gameplay until world generation is complete.

---

# 3. Systems Become Components

Interlink should support recursive abstraction:

```text
Primitive Function
    ↓
Apparatus
    ↓
Process
    ↓
Production Line
    ↓
Facility
    ↓
Industrial Network
    ↓
Planetary System
```

A system that required detailed engineering earlier should eventually be usable as a component inside a larger design.

> **Yesterday's factory becomes today's machine.**

This does not mean simulation detail disappears. The system should retain meaningful operating limits, inputs, outputs, efficiencies, and failure conditions while allowing the player to hide already-solved internal complexity when desired.

A recursively packaged system should remain physically legible at its boundary: inputs, outputs, capacities, operating conditions, control interfaces, and failure states should still have understandable causes.

---

# 4. Interface and Player Interaction

The primary game interface should feel closer to an engineering workspace than a conventional character-controlled world.

Long-term interaction may include:

- nodes and ports
- material streams
- energy streams
- process diagrams
- nested systems
- instrumentation
- graphs
- dashboards
- sensors
- controllers
- alerts
- composition readouts
- operating envelopes
- reusable blueprints

The visual world can still matter for geography, surveying, access, infrastructure, and context, but the central gameplay should be about understanding and designing systems rather than manually operating an avatar for every task.

## Hierarchical inspection and debugging

Nested systems should remain inspectable.

A player should be able to move between levels such as:

```text
Industrial Network
    ↓ inspect
Facility
    ↓ inspect
Production Line
    ↓ inspect
Process
    ↓ inspect
Apparatus
    ↓ inspect
Functional Components
```

When something fails, the game should help the player reason about where and why the failure occurred rather than reducing failures to unexplained random events.

The same graph language should remain useful across scales: nodes, typed ports, edges, inspection, drill-down, live state, and controls.

---

# 5. Functional Apparatus Instead of Only Predefined Machines

Where practical, apparatus should emerge from functional requirements rather than only from fixed machine recipes.

Foundational functions may include concepts such as:

- reaction or holding volume
- matter input
- matter output
- heating
- cooling
- atmosphere / gas control
- pressure control
- agitation
- size reduction
- screening
- gravity separation
- magnetic separation
- filtration
- phase separation
- sensing
- control logic
- electrical input/output
- mechanical work

A useful apparatus is a system composed from functions that together create the conditions required by a process.

Predefined apparatus are still useful during early development and when a real machine has a recognizable engineering identity. The long-term direction should allow those apparatus to be understood through their physical capabilities rather than making every machine a unique recipe token.

The game should not simulate every bolt, pipe fitting, weld, or molecule merely because it can. The functional level should be detailed enough to create engineering decisions without turning solved construction into repetitive busywork.

---

# 6. Progress Through Capability

Progression should emerge primarily from what the player's infrastructure can physically achieve.

Important capability dimensions may include:

- temperature
- pressure
- vacuum
- purity
- separation efficiency
- particle-size control
- liberation
- chemical resistance
- corrosion resistance
- structural strength
- electrical capability
- heat flux
- throughput
- measurement accuracy
- control precision
- reliability

A new material is valuable because it can enable new operating regimes, not merely because it belongs to a higher arbitrary tier.

The central progression pattern is:

```text
new material
    ↓
new construction capability
    ↓
new operating regime
    ↓
new process
    ↓
new material / capability
```

Early materials should continue to have useful roles instead of becoming universally obsolete.

---

# 7. Blueprint Maturity

A useful conceptual maturity path for engineered systems is:

```text
Experimental
    ↓
Engineered
    ↓
Automated
    ↓
Industrialized
```

### Experimental

The player is discovering whether a process works at all. Manual adjustment and imperfect operation are acceptable.

### Engineered

The operating conditions, inputs, outputs, and component requirements are understood well enough to reproduce the system intentionally.

### Automated

Sensors and controls can maintain the process without constant player intervention.

### Industrialized

The system can be treated as a reliable reusable component with known throughput, resource requirements, operating envelope, and failure modes.

The transition between these stages should emerge from measured capability and system quality where possible rather than from arbitrary upgrade labels.

---

# 8. Matter Model

Interlink should preserve the important structure of matter without requiring atom-by-atom simulation.

A useful conceptual hierarchy is:

```text
Elements
    ↓
Chemical Species / Compounds
    ↓
Phases / Structures
    ↓
Bulk Materials / Mixtures
    ↓
Player-Facing Resource Classifications
```

A chemical formula does not uniquely define every useful material identity.

For example:

- a mineral has composition and crystal structure
- a rock may be a mixture of minerals
- sand and silt are particle-size classes and can share chemistry
- volcanic glass may have variable composition
- an ore is an industrially useful natural feedstock containing multiple constituents

Do not force `MaterialID = chemical formula`.

## Aggregate particulate solids

Particulate solids can be simulated statistically rather than as individual particles. The current useful representation is conceptually:

```text
species × particle-size class × liberation class → quantity
```

This means a state such as:

```text
sphalerite | 1–5 mm | partial → 12 kg
```

represents a population of sphalerite-bearing material in that size/liberation class, not one explicit particle.

This aggregate model should remain compatible with large simulations because the important distributions can be tracked without simulating millions of grains.

## Composition, liberation, and separation are different concepts

Composition answers **what is present?**

Liberation answers **how physically detached are constituent mineral populations?**

Separation answers **how effectively can a process route those populations using a physical difference?**

A fully liberated mixture can still contain many species. Liberation does not mean purity.

## Preserve resulting matter

Simulation may abstract formation history when that history is no longer important, but it should preserve the resulting material properties that matter to later gameplay.

> **Abstract the history. Preserve the resulting matter.**

Where practical, conserved quantities should correspond to meaningful matter and energy balances rather than arbitrary recipe tokens.

---

# 9. Material Properties Should Be Process-Driven

Interlink will eventually need many material and body properties, but it should not create a universal flat table or high-dimensional state tensor simply because those properties may matter someday.

The governing rule should be:

> **A material property enters the simulation when an apparatus or process needs it to determine a physical outcome.**

Potential property domains include:

- density
- magnetic response
- hardness / grindability
- thermal properties
- electrical properties
- surface chemistry / hydrophobicity
- solubility
- reaction / equilibrium data
- viscosity
- vapor-pressure / phase-equilibrium data

These properties do not all belong in the same place.

Examples:

- mineral density can be reference species data;
- bulk density may be derived from composition, porosity, and structure;
- liberation is a particulate structural state, not an intrinsic species property;
- temperature should generally be derived from conserved energy, not stored as an unrelated universal fraction tag;
- hydrophobic behavior can depend on species surface properties **and** fluid chemistry/process conditions;
- magnetic separation behavior can depend on intrinsic magnetic response plus particle size, liberation, field strength, and process entrainment.

The model should distinguish intrinsic properties, body state, structure, process conditions, and derived behavior where that distinction creates useful physics.

---

# 10. Natural Resources and Feedstocks

Natural resources are physical feedstocks, not automatically pure substances.

The canonical natural access hierarchy is:

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
    ↓
Generated species/material composition
```

A Region provides geographic and environmental context; it does **not** own a second resource inventory.

Broad or widespread resources should still become exploitable through physical access representations such as Sites and Features. This allows a widespread atmosphere, regolith field, forest, clay field, ice sheet, or crustal rock source to be accessed without creating Region-owned matter that bypasses the natural hierarchy.

Example:

```text
Mineral Deposit Feature
└── Iron Ore ResourceOccurrence
    ├── Hematite
    ├── Magnetite
    ├── Goethite
    └── Quartz / other gangue minerals
```

Processing should transform that occurrence through operations such as comminution, screening, beneficiation, separation, concentration, chemical treatment, thermal processing, refining, and material synthesis.

Increasing technological sophistication should reveal additional useful products inside feedstocks the player already handles.

Trace constituents can therefore become economically useful later without requiring the world to spawn a new deposit just because a technology was unlocked.

---

# 11. World Generation Is an Upstream Cause of Gameplay

World generation should create the physical initial conditions from which gameplay emerges.

The intended long-term causal hierarchy is broader than the current planet generator:

```text
Star
    ↓
System / Formation Environment
    ↓
Protoplanetary Material and Orbital Architecture
    ↓
Planet
    ↓
Region
    ↓
Sites / Features / ResourceOccurrences
    ↓
Survey / Extraction / Processing / Industry
```

The current implementation begins at the planet level for scope reasons. It should **not** permanently assume that planet properties originate independently inside a single generator function.

As development matures, star and system generation should become upstream providers of important planetary inputs.

## Star-level causes

Useful future stellar properties may include:

- stellar mass
- age
- luminosity
- effective temperature
- metallicity
- elemental abundance ratios that materially affect planetary composition
- activity / radiation environment

These properties should exist because they influence downstream system or planetary conditions, not merely as decorative statistics.

## System / formation-level causes

Useful future system properties may include:

- available solid and volatile material
- broad formation composition
- temperature / condensation structure during formation
- radial material distribution
- mixing / migration history where useful
- formation efficiency
- orbital architecture
- major impact / accretion history abstractions
- satellite and ring formation context where gameplay-relevant

Do not build a research-grade astrophysics simulator. Keep a property when it materially affects downstream matter, conditions, discovery, access, or industry.

## Planet generation

The planet should increasingly consume upstream formation/system inputs rather than inventing every cause locally.

Useful planet-level outcomes include:

- orbital distance and eccentricity
- mass
- bulk composition
- volatile inventory
- rotation and axial tilt
- equilibrium temperature
- differentiation
- core / deep interior / envelope structure
- radius
- density
- gravity
- escape velocity
- atmosphere
- internal heat
- geologic activity
- magnetic state
- surface state
- biosphere state where applicable

The target is causally plausible and gameplay-useful, not academically exhaustive.

---

# 12. Regions

A Region is a bundle of local physical and environmental properties, not merely a biome label.

Useful regional properties include:

- area
- latitude
- elevation
- relief
- local composition tendencies
- heat
- moisture / volatile availability
- geologic activity
- age / history where meaningful
- surface cover
- heterogeneity

These regional conditions can cause broad resources to exist, influence accessibility, and determine what kinds of Sites/Features are likely.

However, the canonical world model should not treat the Region itself as a resource inventory owner. Widespread exploitable matter is represented through one or more physical access Sites/Features whose availability may be effectively enormous at ordinary gameplay scales.

This keeps physical ownership explicit while still allowing abundant resources to feel geographically widespread.

---

# 13. Geological and Environmental Features

Features represent localized structures, concentrations, unusual conditions, or access paths.

Examples include:

- mineral deposits
- geological formations
- aquifers
- gas reservoirs
- caves / caverns
- ravines
- faults
- craters
- volcanic vents
- hydrothermal systems
- magma chambers
- ice bodies
- salt basins
- outcrops

Not every Feature is a valuable deposit.

A Feature may:

- contain a concentrated resource body
- expose deeper materials
- provide access to another physical regime
- create unusual pressure or temperature conditions
- change extraction difficulty
- produce observable survey signatures

Feature formation should increasingly follow planetary and regional causes rather than broad unrelated random rolls.

If two natural bodies can be independently exploited, they should normally be represented as distinct Features. Multiple constituents of one physical body belong in one occurrence composition rather than being split into fake independent resources.

---

# 14. Discovery and Surveying

The physical world exists independently of what the player knows about it.

A useful long-term knowledge progression is:

```text
Unknown
    ↓
Anomaly / Suspected
    ↓
Identified
    ↓
Composition Estimated
    ↓
Quantity Estimated
    ↓
Characterized
```

Possible observable signatures may include:

- spectral
- magnetic
- gravity
- thermal
- seismic
- electrical
- atmospheric / chemical

Surveying should reveal pre-existing deterministic world truth rather than spawning resources because the player searched for them.

Structural world organization and player knowledge should remain separate. A Feature can physically exist and be addressable in the world while its composition, grade, quantity, or process-relevant properties remain uncertain.

---

# 15. Exploitation and Depletion

Natural exploitation should occur through explicit physical source access.

Different natural sources may use different depletion models:

- finite deposit: remaining mass
- huge widespread material body: finite but effectively enormous at ordinary scales
- reservoir / flow source: extraction rate plus replenishment or pressure behavior
- atmosphere-like source: large shared body whose local access may be rate-limited rather than meaningfully depleted by early machinery

The planet should feel physically finite without forcing the game to track meaningless quantities at atomic scale.

Early technology may depend on concentrated deposits. Later capability should increasingly allow use of lower-grade but widespread material.

The access representation should stay consistent even for broad resources:

```text
Region conditions
    ↓ generate / expose
Site
    ↓
Feature
    ↓ resource-access
Extractor or compatible apparatus
```

This avoids a special Region-owned inventory path that would bypass normal physical ownership and connection rules.

---

# 16. Processing and Production

Production should be based on material and energy throughput rather than only discrete recipe completion.

A process conceptually consumes:

- material streams
- energy / work
- operating conditions
- time / throughput capacity

and produces:

- product streams
- waste streams
- heat
- emissions or secondary streams
- equipment wear or contamination where meaningful

Process performance can depend on:

- feed composition
- particle size
- liberation
- density
- magnetic/electrical/surface properties
- temperature
- pressure
- residence time
- purity
- phase
- catalysts / media
- equipment capability
- control quality

The player should be able to understand why output changes when inputs or operating conditions change.

## Process physics should be reusable

A physical transformation should not have unrelated implementations for experiments and factories.

Conceptually:

```text
Pure process physics
        ↑
        │
 ┌──────┴──────────┐
 │                 │
Batch runner   Continuous apparatus runtime
 │                 │
Experiments      Factory operation
```

This makes early experiments and later automation different execution contexts for the same underlying physical model.

## Conservation should match the process family

Mechanical size reduction and separation can conserve each species directly.

Future chemistry may change species while conserving elements, total mass, charge, and energy.

Future thermal processing may require explicit energy conservation and phase behavior.

Do not force all process families into one overly restrictive conservation rule.

---

# 17. Apparatus, Ports, and Physical Topology

Apparatus should communicate through typed interfaces rather than through hard-coded machine-to-machine compatibility lists.

A connection should be valid because the source provides something the target can physically/interface-wise accept, not because a central table happens to list `MachineA → MachineB`.

Potential edge/interface kinds include:

```text
resource access
material
energy
signal
mechanical work
```

Each kind should preserve its physical meaning.

For example:

- `resource-access` is an access relationship and carries no matter;
- a material stream carries transfer rates but owns no inventory;
- a signal should not accidentally inherit material conservation rules;
- an energy connection should eventually use energy-specific state/contracts.

Matter fan-out must not implicitly duplicate matter. Branching requires an explicit physical/logical splitter or equivalent routing system.

---

# 18. Automation and Control

Automation should be an engineering capability, not merely an unlock button.

Relevant concepts may include:

- sensors
- setpoints
- controllers
- valves / gates / switches
- feedback loops
- alarms
- interlocks
- sequencing
- throughput coordination

A process should often begin as something the player manually experiments with and later become a stable automated subsystem.

Automation is part of the core loop because it frees attention for larger-scale systems.

World time, machine command state, and machine operating state should remain separate concepts. Pausing the world should not rewrite the player's apparatus commands, and navigating away from a system should not silently stop it.

---

# 19. Thermodynamics, Fluids, and Chemistry Direction

These systems are major long-term goals, but their state models should be introduced carefully.

## Thermal state

A robust thermal model should trend toward conserved internal energy or enthalpy with temperature derived from material composition, phase, and state rather than treating temperature as an independent magic tag.

When useful, separate physical bodies should have their own thermal state, for example:

```text
solid charge
molten bath
gas volume
apparatus wall
coolant loop
```

Do not force every possible thermal detail into every material object before a process needs it.

## Fluids and gases

Fluids and gases should use physical-form-appropriate state rather than being forced into particulate-solid dimensions such as particle size and liberation.

Future fluid/gas systems may need:

- pressure
- temperature / energy
- density
- viscosity
- phase
- volume
- composition
- flow resistance / conductance
- equation-of-state behavior where useful

## Chemistry

Chemical processing should eventually allow species to transform while preserving meaningful conserved quantities.

Before deep chemistry, establish enough structure for:

- elemental composition / stoichiometry
- reaction inputs/outputs
- phase/state context
- energy accounting
- equilibrium or kinetics only where gameplay needs them

The goal is not to reproduce a research chemistry package. It is to create understandable industrial consequences from material composition and operating conditions.

---

# 20. Simulate Decisions, Aggregate Busywork

Simulation detail should earn its complexity.

Simulate a detail when changing that detail creates meaningful decisions, tradeoffs, debugging, or planning.

Aggregate a detail when it mostly produces repetitive setup work with little strategic consequence.

This principle applies to:

- chemistry
- thermodynamics
- construction
- logistics
- controls
- geology
- astronomy
- maintenance

Interlink should feel deep because its systems interact, not because the player must perform every microscopic task manually.

---

# 21. Deterministic and Lazy World Detail

The world should be deterministic for a given seed and generator version.

As scale grows, generation should become increasingly lazy:

1. establish star/system/world seeds and major state
2. establish planetary and regional physical budgets / potentials
3. resolve major structures when appropriate
4. resolve finer details when surveyed or needed
5. persist anything discovered, extracted, modified, constructed, or named
6. reconstruct untouched detail deterministically

Lazy generation must resolve pre-existing reality rather than dynamically invent favorable resources in response to player action.

---

# 22. Implementation Architecture Is a Design Constraint

File organization is not itself game design, but several architectural boundaries are important because they protect the intended simulation model.

The current implementation separates:

```text
content
    what definitions exist

core
    physical/system/world/process contracts + pure physics

generator
    deterministic creation of world truth

simulation
    runtime evolution of placed systems and matter

workspace
    player-facing projection and interaction
```

This direction should be preserved as the project grows.

A new machine should ideally extend:

```text
apparatus definition
+ process definition
+ physical kernel
+ runtime
+ tests
```

rather than adding branches to unrelated central catalogs, UI switches, or machine-pair compatibility tables.

A new property domain should ideally be introduced through a material/property resolver and used by the physical process that actually needs it.

A new world-content concept should be defined in content and selected by generator algorithms, rather than embedding both catalog data and deterministic generation logic in one file.

See `ARCHITECTURE.md` for the current concrete organization and compatibility surfaces.

---

# 23. Early Development Strategy

Development should advance **simulation foundation and gameplay validation together**.

Do not wait for a perfect universe generator before testing whether the central game loop is fun and legible.

The current processing foundation should expand in small apparatus/property steps that test architecture while creating gameplay:

```text
source access + storage
    ↓
size reduction
    ↓
size classification / routing
    ↓
explicit split / merge
    ↓
finer grinding + liberation
    ↓
property-driven separation
    ↓
fluids / thermal / chemical systems as justified
```

A useful near-term pattern is to add one process that requires one new physical idea, verify that it creates a real decision, then extend the model rather than prebuilding every possible property.

Every major world-generation feature should eventually answer:

> **What decision or opportunity does this create for the player?**

Every major gameplay system should answer:

> **What physical world state does this act on?**

Every new material property should answer:

> **Which process needs this value to produce a different physical outcome?**

---

# 24. Scope Guardrails

Interlink should remain ambitious in direction and incremental in implementation.

Avoid prematurely adding complexity simply because it appears in this document.

In particular:

- do not build all star/system simulation before current planetary and gameplay prototypes can use it
- do not add every chemical species before processing gameplay needs them
- do not build a huge technology tree before capability progression is proven
- do not create millions of geological objects when lazy deterministic detail can represent them
- do not add thermodynamic axes to all materials before an apparatus needs thermal state
- do not add property values merely to make a registry look complete
- do not introduce a heavy engine/framework/backend without a concrete requirement
- do not bypass conservation or physical ownership to make a machine easier to implement

The correct development question is not:

> Can this be simulated?

It is:

> **Does simulating this now create useful causes, decisions, or capabilities for Interlink?**
