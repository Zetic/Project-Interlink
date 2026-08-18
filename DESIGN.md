# Project Interlink — Game Design

`DESIGN.md` describes what Project Interlink is intended to become.

It is the long-term design reference for the game. The README describes the current project state, while `.github/copilot-instructions.md` describes how coding agents should safely develop toward this design.

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

Early development should therefore periodically create small playable vertical slices of this loop rather than postponing all gameplay until world generation is complete.

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

## Hierarchical Inspection and Debugging

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
- separation
- filtration
- phase separation
- sensing
- control logic
- electrical input/output
- mechanical work

A useful apparatus is a system composed from functions that together create the conditions required by a process.

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
- an ore is an economically/industrially useful natural feedstock containing multiple constituents

Do not force `MaterialID = chemical formula`.

## Preserve Resulting Matter

Simulation may abstract formation history when that history is no longer important, but it should preserve the resulting material properties that matter to later gameplay.

> **Abstract the history. Preserve the resulting matter.**

Where practical, conserved quantities should ultimately correspond to meaningful matter balances rather than arbitrary recipe tokens.

---

# 9. Natural Resources and Feedstocks

Natural resources are physical feedstocks, not automatically pure substances.

Preferred hierarchy:

```text
Region or Feature
    ↓
Natural Resource / Feedstock Occurrence
    ↓
Generated Mineral / Species / Material Composition
    ↓
Elemental Composition where useful
```

Example:

```text
Mineral Deposit
└── Iron Ore occurrence
    ├── Hematite
    ├── Magnetite
    ├── Goethite
    └── Gangue minerals
```

Processing should transform that occurrence through operations such as beneficiation, separation, concentration, chemical treatment, thermal processing, refining, and material synthesis.

Increasing technological sophistication should reveal additional useful products inside feedstocks the player already handles.

Trace constituents can therefore become economically useful later without requiring the world to spawn a new deposit just because a technology was unlocked.

---

# 10. World Generation Is an Upstream Cause of Gameplay

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
Features and Resource Occurrences
    ↓
Survey / Extraction / Processing / Industry
```

The current implementation begins at the planet level for scope reasons. It should **not** permanently assume that planet properties originate independently inside `generatePlanet()`.

As development matures, star and system generation should become upstream providers of important planetary inputs.

## Star-Level Causes

Useful future stellar properties may include:

- stellar mass
- age
- luminosity
- effective temperature
- metallicity
- elemental abundance ratios that materially affect planetary composition
- activity / radiation environment

These properties should exist because they influence downstream system or planetary conditions, not merely as decorative statistics.

## System / Formation-Level Causes

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

## Planet Generation

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

# 11. Regions

A region is a bundle of local physical and environmental properties, not merely a biome label.

Useful regional properties include:

- area
- latitude
- elevation
- relief
- local composition
- heat
- moisture / volatile availability
- geologic activity
- age / history where meaningful
- surface cover
- heterogeneity

Regions can themselves be directly exploitable sources of widespread matter such as crustal rock, regolith, atmosphere, water, ice, sand, or biomass.

---

# 12. Geological and Environmental Features

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

Not every feature is a resource deposit.

A feature may:

- contain concentrated resources
- expose deeper materials
- provide access to another feature
- create unusual pressure or temperature conditions
- change extraction difficulty
- produce observable survey signatures

Feature formation should increasingly follow planetary and regional causes rather than broad unrelated random rolls.

---

# 13. Discovery and Surveying

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

---

# 14. Exploitation and Depletion

Both regions and localized features can be exploitable.

Different natural sources may use different depletion models:

- finite deposit: remaining mass
- huge regional bulk material: finite but effectively enormous at normal scales
- reservoir / flow source: extraction rate plus replenishment or pressure behavior

The planet should feel physically finite without forcing the game to track meaningless quantities at atomic scale.

Early technology may depend on concentrated deposits. Later capability should increasingly allow use of lower-grade but widespread material.

---

# 15. Processing and Production

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
- temperature
- pressure
- residence time
- purity
- phase
- catalysts / media
- equipment capability
- control quality

The player should be able to understand why output changes when inputs or operating conditions change.

---

# 16. Automation and Control

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

---

# 17. Simulate Decisions, Aggregate Busywork

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

# 18. Deterministic and Lazy World Detail

The world should be deterministic for a given seed and generator version.

As scale grows, generation should become increasingly lazy:

1. establish star/system/world seeds and major state
2. establish planetary and regional material budgets / potentials
3. resolve major structures when appropriate
4. resolve finer details when surveyed or needed
5. persist anything discovered, extracted, modified, constructed, or named
6. reconstruct untouched detail deterministically

Lazy generation must resolve pre-existing reality rather than dynamically invent favorable resources in response to player action.

---

# 19. Early Development Strategy

Development should advance **simulation foundation and gameplay validation together**.

Do not wait for a perfect universe generator before testing whether the central game loop is fun and legible.

A useful sequence is:

```text
Simulation contracts / tests
    ↓
coherent world/resource occurrences
    ↓
small surveying + acquisition prototype
    ↓
small analysis / composition prototype
    ↓
one simple parameter-driven material transformation
    ↓
basic apparatus / process representation
    ↓
first reusable or automated process
```

These early gameplay systems can use limited resources and simplified processes. Their purpose is to validate the architecture and player experience, not to prematurely implement the entire technology tree.

Every major world-generation feature should eventually answer:

> **What decision or opportunity does this create for the player?**

Every major gameplay system should answer:

> **What physical world state does this act on?**

---

# 20. Scope Guardrails

Interlink should remain ambitious in direction and incremental in implementation.

Avoid prematurely adding complexity simply because it appears in this document.

In particular:

- do not build all star/system simulation before current planetary and gameplay prototypes can use it
- do not add every chemical species before processing gameplay needs them
- do not build a huge technology tree before capability progression is proven
- do not create millions of geological objects when lazy deterministic detail can represent them
- do not introduce a heavy engine/framework/backend without a concrete requirement

The correct development question is not:

> Can this be simulated?

It is:

> **Does simulating this now create useful causes, decisions, or capabilities for Interlink?**
