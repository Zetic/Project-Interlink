# Rust / WebAssembly simulation runtime

Project Interlink is migrating the authoritative numerical simulation toward a Worker-owned Rust core compiled to WebAssembly while keeping browser presentation and interaction in JavaScript/TypeScript.

## Crates

- `interlink-core` — platform-neutral material, storage, conservation, and low-level simulation data. This crate must not depend on browser APIs or `wasm-bindgen`.
- `interlink-processes` — platform-neutral apparatus/process execution built on `interlink-core`. Process code owns packed streams and reusable machine runtime behavior without depending on browser APIs.
- `interlink-routing` — platform-neutral multi-port logistics built on the core/process contracts. It owns Splitter/Merger routing, atomic multi-Hopper transactions, and the runtime-local thermal lookup required for exact mixed-stream energy parity.
- `interlink-comminution` — platform-neutral Crusher/Jaw/Cone/Ball-Mill physics. It owns packed particle-size redistribution, texture-driven liberation, Bond energy/power limiting, and abrasion diagnostics.
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

Readable JavaScript/save state keeps canonical string identifiers. Runtime-local numeric IDs are an execution detail and must not become persistent content IDs.

`packedRuntimeCompiler.js` is the canonical-state → execution-state boundary. It compiles solid material state, solid material bodies, Hopper inventories, and the constant-Cp species values needed by packed thermal routing while preserving canonical IDs outside the execution plane. `packedProcessCompiler.js` extends that boundary to canonical solid `MaterialStream` state using the same runtime ID tables. `packedComminutionCompiler.js` compiles particle-size vocabulary, liberation classes, mineral textures, and measured CWi/BWi/Ai values into the same numeric execution ID space.

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
3. Do not call WASM once per fraction or once per tiny arithmetic operation. Rust should own coarse runtime state and kernels.
4. Do not serialize runtime-local numeric IDs as game/content identity.
5. Do not enable the Rust Worker backend until the migrated state is authoritative enough that each fixed step does not require cloning the full JS world across the thread boundary.
6. Preserve deterministic fixed-step semantics and existing conservation tests during every port.
7. Prefer migrating reusable physical primitives before apparatus-specific behavior so later machine ports build on one Rust-owned material/transfer model.
8. Apparatus ports must preserve production operating-state and backpressure behavior in addition to numerical mass/energy parity.
9. Multi-port routing must commit all participating inventories atomically; partial output commits are not acceptable.
10. Comminution metadata must be compiled from canonical material definitions; do not hard-code persistent content identity into the Rust execution plane.
