# Rust / WebAssembly simulation runtime

Project Interlink is migrating the authoritative numerical simulation toward a Worker-owned Rust core compiled to WebAssembly while keeping browser presentation and interaction in JavaScript/TypeScript.

## Crates

- `interlink-core` — platform-neutral material, storage, conservation, and low-level simulation data. This crate must not depend on browser APIs or `wasm-bindgen`.
- `interlink-processes` — platform-neutral apparatus/process execution built on `interlink-core`. Process code owns packed streams and reusable machine runtime behavior without depending on browser APIs.
- `interlink-routing` — platform-neutral multi-port logistics built on the core/process contracts. It owns Splitter/Merger routing, atomic multi-Hopper transactions, and the runtime-local thermal lookup required for exact mixed-stream energy parity.
- `interlink-comminution` — platform-neutral Crusher/Jaw/Cone/Ball-Mill physics. It owns packed particle-size redistribution, texture-driven liberation, Bond energy/power limiting, and abrasion diagnostics.
- `interlink-separation` — platform-neutral Screen/Magnetic-Separator physics. It owns conservative two-way material partitioning, sharp particle-size classification, magnetic recovery, dual-output backpressure, and partitioned sensible-energy transport.
- `interlink-extraction` — platform-neutral ResourceOccurrence/Extractor execution. It owns normalized occurrence material templates, extraction throttling, optional finite reserve accounting, output streams, and occurrence → Hopper commits.
- `interlink-thermal` — platform-neutral packed gas and sensible-thermal runtime. It owns gas composition/bodies/streams, temperature↔enthalpy derivation, gas mixing, ambient heat transfer, and bounded solid↔gas heat exchange.
- `interlink-thermochemistry` — platform-neutral reaction execution. It currently owns the goethite dehydroxylation kinetics/stoichiometry/energy solve while taking its numeric parameters from compiled declarative content.
- `interlink-roasting` — platform-neutral retained-zone Roasting Furnace runtime built on the material, thermal, process, and thermochemistry contracts.
- `interlink-wasm` — the browser adapter. It exposes coarse stateful operations from the Rust crates to JavaScript through `wasm-bindgen`.

The Rust crates are intentionally usable as ordinary native Rust so the same simulation can later run in browser WASM, native tools, headless tests, or another frontend.

## Packed execution state

Solid-particulate runtime state uses a structure-of-arrays representation:

```text
species_id[]            u16
size_bin_id[]           u8
liberation_class_id[]   u8
texture_profile_id[]    u32
quantity[]              f64
```

Packed gas state uses the simpler composition representation:

```text
species_id[]            u16
quantity[]              f64
```

Gas-body quantities are kg; gas-stream quantities are kg/s. Sensible enthalpy remains a separate authoritative scalar on the owning body/stream contract rather than another material identity axis.

Readable JavaScript/save state keeps canonical string identifiers. Runtime-local numeric IDs are an execution detail and must not become persistent content IDs.

`packedRuntimeCompiler.js` is the canonical-state → execution-state boundary. It compiles solid material state, solid material bodies, Hopper inventories, and the constant-Cp species values needed by packed thermal routing while preserving canonical IDs outside the execution plane. `packedProcessCompiler.js` extends that boundary to canonical solid `MaterialStream` state using the same runtime ID tables. `packedComminutionCompiler.js` compiles particle-size vocabulary, liberation classes, mineral textures, and measured CWi/BWi/Ai values into the same numeric execution ID space. `packedSeparationCompiler.js` compiles the particle-size cut metadata, liberation recovery factors, magnetic species response, and thermal properties used by packed classification/separation. `packedExtractionCompiler.js` compiles Feature-owned solid ResourceOccurrences into normalized one-kilogram packed material templates in that same ID space. `packedThermalGasCompiler.js` compiles canonical gas bodies into the same species ID table so gas-only species are included in constant-Cp thermal lookup without introducing a separate identity namespace. `packedRoastingCompiler.js` compiles declarative thermochemical parameters, particle-size reaction factors, reaction-derived texture lineage, and existing furnace state into that same runtime ID space.

## Migrated storage semantics

`interlink-core` owns packed equivalents of the first conservation-sensitive runtime operations:

- well-mixed proportional solid withdrawal;
- finite solid material bodies with sensible enthalpy;
- finite-capacity Hopper storage;
- capacity-clipped continuous packed inflow;
- proportional enthalpy withdrawal;
- atomic conservative Hopper-to-Hopper transfer.

The WASM adapter exposes packed Hoppers and coarse transfer/receive operations. Material arrays remain inside WASM during a Hopper-to-Hopper transfer rather than crossing the JS/WASM boundary per population.

## Migrated stream and apparatus plumbing

`interlink-processes` owns the first Rust continuous apparatus path:

- packed solid streams whose quantities are kg/s;
- cached total stream mass flow and specific sensible enthalpy;
- Feeder rate and throughput controls;
- off / idle / blocked / running operating-state transitions;
- downstream Hopper capacity/backpressure limiting;
- atomic Hopper → Feeder → Hopper execution;
- identity-process preservation of composition and sensible enthalpy.

`WasmPackedFeeder` advances two Rust-owned Hoppers through one coarse tick call. Per-population material arrays do not cross the JS/WASM boundary during normal execution; column accessors remain migration/debug snapshots only.

## Migrated multi-port routing

`interlink-routing` extends the permanent runtime to real graph-routing primitives:

- Splitter: one packed Hopper input → two packed Hopper outputs;
- Merger: two packed Hopper inputs → one packed Hopper output;
- all participating inventories are staged and committed atomically;
- Splitter throughput is throttled by the tightest required downstream capacity;
- Merger preserves proportional draw from both source inventories;
- mixed-input sensible enthalpy uses the same constant-Cp equilibrium model as production.

`WasmPackedSplitter` and `WasmPackedMerger` each execute one complete multi-Hopper routing operation in one coarse WASM call.

## Migrated comminution physics

`interlink-comminution` ports both the historical generic Crusher compatibility model and the staged engineering comminution model used by Jaw Crusher, Cone Crusher, and Ball Mill.

The packed implementation preserves:

- the canonical fine-to-coarse particle-size vocabulary plus historical compatibility aliases;
- Jaw/Cone/Ball-Mill equipment-specific product-size distributions;
- maximum feed-size envelopes;
- mineral D10/D50/D90 and occurrence-mode-driven liberation equilibrium;
- monotonic liberation so comminution cannot re-lock already liberated matter;
- sub-tolerance allocation consolidation so tiny child populations do not lose conserved mass;
- mass-weighted Bond Crushing Work Index, Bond Ball Mill Work Index, and Bond Abrasion Index;
- Bond F80/P80 specific-energy calculation;
- rated-power throughput limiting and actual power diagnostics;
- abrasion exposure accumulation;
- atomic Hopper → comminution apparatus → Hopper execution with stream and sensible-energy conservation.

Canonical string IDs and texture definitions are compiled once into `PackedComminutionTables`. `WasmPackedComminutionMachine` then advances the complete apparatus transaction without per-fraction JS/WASM calls.

The JavaScript production simulation remains the behavioral oracle during migration. Native Rust tests mirror production PSD, oversize, texture/liberation, power-limit, mass, and energy expectations, while JavaScript tests verify the canonical metadata compiler that feeds those numeric tables.

## Migrated classification and separation

`interlink-separation` introduces a reusable conservative two-way partition primitive and uses it for both Screen and Magnetic Separator rather than duplicating multi-output transaction code.

The packed implementation preserves:

- ideal sharp-cut screening by each fraction's particle-size-bin upper bound;
- unchanged species, size, liberation, and texture descriptors through Screen classification;
- the current Magnetic Separator field-strength curve and base carryover/entrainment term;
- species `normalizedSeparationCoefficient` values from canonical material definitions;
- liberation-class recovery factors;
- the existing particle-size suitability table, including historical `<32 µm` / `<1 mm` compatibility behavior;
- the Magnetic Separator maximum-feed-size envelope;
- throughput limiting and capacity scaling against the tightest required nonzero output;
- atomic source/concentrate-tailings or source/undersize-oversize commits;
- composition-dependent sensible-enthalpy allocation using the same constant-Cp equilibrium model as production.

`WasmPackedScreen` and `WasmPackedMagneticSeparator` each execute one complete three-Hopper transaction through a coarse WASM call. `WasmPackedSeparationTables` is populated once from canonical particle, liberation, species magnetic-response, and thermal definitions; no per-fraction JavaScript bridge loop is introduced.

As with comminution, JavaScript remains the production oracle until the later authoritative runtime cutover. Rust and JavaScript parity tests pin the current classification/recovery curves and capacity/conservation behavior.

## Migrated extraction and world material access

`interlink-extraction` establishes the first world-material source owned by the Rust execution plane. A canonical Feature-owned solid `ResourceOccurrence` is compiled once into a normalized one-kilogram packed material template. That template preserves the current occurrence composition, run-of-mine/coarse-solid fragmentation policy, liberation classes, and mineral-texture runtime IDs.

The packed Extractor preserves current production behavior:

- the active source is still selected by the Feature `resource-access` connection at the graph/world layer;
- only physical forms supported by the current Extractor are compiled into the solid extraction registry;
- the default Extractor rate remains 5 kg/s unless apparatus configuration says otherwise;
- output is throttled against downstream Hopper capacity before mutation;
- output material composition/particle state is the actual occurrence mixture rather than a purified resource label;
- occurrence → Hopper mutation is staged and committed atomically;
- extracted material is published as one packed solid stream with zero reference sensible enthalpy, matching occurrence materialization today.

Current generated occurrences contain qualitative `quantityClass` and `availabilityClass`, not a measured reserve mass. The compiler therefore **does not invent a kg reserve from those labels**. `PackedResourceOccurrence` defaults to an unbounded source to preserve today's JavaScript behavior. It also supports an explicit finite `remaining_mass_kg` for a future world model that supplies a real physical reserve; when used, Rust clips the final extraction tick exactly and blocks subsequent ticks as depleted.

`compileExtractableWorldOccurrencesForRuntime()` compiles every currently eligible solid occurrence into one shared runtime ID space and reports unsupported liquid/gas occurrences separately rather than discarding canonical world data. `WasmPackedExtractor` advances the occurrence, output Hopper, and packed stream through one coarse WASM call.

## Migrated gas and sensible-thermal runtime

`interlink-thermal` ports the reusable thermal/material contracts required by the Roasting Furnace before the furnace itself moves to Rust.

The packed implementation preserves the existing production assumptions:

- `sensibleEnthalpyJ` is authoritative; temperature is derived rather than stored independently;
- the thermal reference temperature is 298.15 K;
- species thermal behavior currently uses constant specific heat capacity values from canonical `MaterialSpecies` definitions;
- a body with effectively zero sensible enthalpy resolves to the reference temperature without requiring thermal-property coverage;
- gas composition is conserved by species mass and gas mixing conserves the summed sensible enthalpy;
- proportional gas withdrawal preserves composition and specific sensible enthalpy;
- continuous gas streams keep kg/s composition separate from J/kg specific sensible enthalpy;
- ambient heat transfer uses the same coefficient × temperature-difference × time equation already used by the furnace;
- requested cooling can be bounded against a positive minimum absolute temperature;
- finite-capacity conductive exchange is clipped at exact equilibrium so one large fixed step cannot numerically overshoot and reverse the hot/cold ordering;
- solid↔gas heat exchange stages both energy ledgers and commits them together, conserving combined sensible energy.

This is intentionally **not** an ideal-gas, pressure, volume, phase-equilibrium, or CFD model. Those concepts should only enter the runtime if future gameplay requires them and they have explicit physical state/ownership contracts.

`WasmPackedGasBody`, `WasmPackedGasStream`, and `WasmPackedThermalModel` provide coarse browser adapters. Canonical gas arrays and species heat capacities are populated during setup; mixing, stream receipt, temperature derivation, and solid↔gas heat exchange then execute inside Rust/WASM without per-species bridge calls during normal simulation.

The existing routing crate still owns the runtime-local `PackedSpeciesThermalTable` type used by already-migrated Splitter/Merger/separation kernels. `interlink-thermal` deliberately reuses that same table implementation rather than introducing competing thermal-property semantics. A later ownership/scheduler cleanup may relocate the lookup type without changing its numerical contract.

## Migrated thermochemistry and Roasting Furnace

`interlink-thermochemistry` ports the current goethite dehydroxylation kernel while keeping reaction definitions declarative. JavaScript content supplies stoichiometric participants, molar masses, Arrhenius parameters, reaction enthalpy, particle-size response, and source texture lineage; the compiler resolves those values into numeric runtime tables.

The Rust reaction kernel preserves:

- the current first-order Arrhenius conversion model and mean-temperature approximation;
- deterministic bounded final-temperature solving;
- exact goethite → hematite + water-vapor stoichiometry;
- endothermic reaction-energy demand and strict sensible-energy closure;
- per-fraction particle-size rate factors and tolerance handling;
- solid product size and liberation-class preservation;
- reaction-derived mineral texture lineage rather than treating roasted hematite as naturally occurring source texture;
- solver-evaluation diagnostics used by the existing performance overlay.

`interlink-roasting` composes that kernel with the thermal and process layers. Its packed furnace preserves the production ordering and retained-state model: heat zones, react retained charge only when both outputs are available, then advance pending feed through the zone train and discharge final overflow. It also preserves finite heater power, per-zone heat loss, chamber hold-up, output backpressure, whole-inventory gas venting, solid/gas stream publication, operating state, and furnace diagnostics.

The Rust furnace accepts a generic packed solid-product sink so the later graph scheduler can route product either to a Hopper or directly to another Roasting Furnace without adding furnace-specific graph logic. `WasmPackedRoastingFurnace` currently exposes a coarse Hopper + ExhaustVent migration path; whole-world state import and arbitrary connection ownership intentionally remain the responsibility of the upcoming Rust graph/world scheduler rather than growing a per-apparatus setup protocol.

## Commands

From the repository root:

```bash
cargo test --workspace
cargo check -p interlink-wasm --target wasm32-unknown-unknown
npm run check:runtime
```

The repository pins the stable Rust toolchain and the `wasm32-unknown-unknown` target in `rust-toolchain.toml`.

## Migration rules

1. Do not move DOM/UI behavior into Rust.
2. Do not duplicate permanent simulation features in JS and Rust indefinitely; JS implementations are parity references during migration.
3. Do not call WASM once per fraction, species, or tiny arithmetic operation. Rust should own coarse runtime state and kernels.
4. Do not serialize runtime-local numeric IDs as game/content identity.
5. Do not enable the Rust Worker backend until the migrated state is authoritative enough that each fixed step does not require cloning the full JS world across the thread boundary.
6. Preserve deterministic fixed-step semantics and existing conservation tests during every port.
7. Prefer migrating reusable physical primitives before apparatus-specific behavior so later machine ports build on one Rust-owned material/transfer model.
8. Apparatus ports must preserve production operating-state and backpressure behavior in addition to numerical mass/energy parity.
9. Multi-port routing and separation must commit all participating inventories atomically; partial output commits are not acceptable.
10. Comminution, separation, extraction, thermochemistry, and roasting metadata must be compiled from canonical material/world/content definitions; do not hard-code persistent content identity into the Rust execution plane.
11. Do not reinterpret qualitative world-generation labels such as `quantityClass` as physical conserved quantities. A finite reserve requires explicit quantitative world data.
12. Temperature remains derived from authoritative energy plus composition-dependent heat capacity; do not add an independently mutable temperature field that can disagree with the energy ledger.
13. Do not add gas pressure/volume/phase state speculatively. Introduce new thermodynamic state only when a process actually requires it and conservation/ownership semantics are defined.
14. Whole-world cutover/import is a scheduler responsibility. Avoid per-apparatus state-loading APIs that would turn startup into thousands of fine-grained JS↔WASM calls.
