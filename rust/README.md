# Rust / WebAssembly simulation runtime

Project Interlink is migrating the authoritative numerical simulation toward a Worker-owned Rust core compiled to WebAssembly while keeping browser presentation and interaction in JavaScript/TypeScript.

## Crates

- `interlink-core` — platform-neutral material, storage, conservation, and low-level simulation data. This crate must not depend on browser APIs or `wasm-bindgen`.
- `interlink-processes` — platform-neutral apparatus/process execution built on `interlink-core`. Process code owns packed streams and reusable machine runtime behavior without depending on browser APIs.
- `interlink-routing` — platform-neutral multi-port logistics built on the core/process contracts. It owns Splitter/Merger routing, atomic multi-Hopper transactions, and the runtime-local thermal lookup required for exact mixed-stream energy parity.
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

`packedRuntimeCompiler.js` is the canonical-state → execution-state boundary. It compiles solid material state, solid material bodies, Hopper inventories, and the constant-Cp species values needed by packed thermal routing while preserving canonical IDs outside the execution plane. `packedProcessCompiler.js` extends that boundary to canonical solid `MaterialStream` state using the same runtime ID tables.

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

`interlink-processes` introduces the first Rust-owned continuous process path:

- packed solid streams whose quantities are kg/s;
- cached total stream mass flow and specific sensible enthalpy;
- Feeder rate and throughput controls;
- off / idle / blocked / running operating-state transitions;
- downstream Hopper capacity/backpressure limiting;
- atomic Hopper → Feeder → Hopper execution;
- identity-process preservation of composition and specific sensible enthalpy;
- matching input and output stream publication after a successful tick.

`WasmPackedFeeder` owns its packed streams inside WASM and advances two Rust-owned Hoppers through one coarse tick call. Per-population material arrays do not cross the JS/WASM boundary during normal execution; column accessors remain migration/debug snapshots only.

## Migrated multi-port routing

`interlink-routing` extends the permanent runtime from one-input/one-output machinery to real graph-routing primitives:

- Splitter: one packed Hopper input → two packed Hopper outputs;
- Merger: two packed Hopper inputs → one packed Hopper output;
- all participating inventories are staged and committed atomically;
- Splitter throughput is throttled by the tightest required downstream capacity;
- Merger preserves the production proportional draw from both source inventories;
- all input/output `PackedSolidStream` states are published from the committed transaction;
- mixed-input sensible enthalpy uses the same constant-Cp equilibrium-temperature model as production;
- runtime-local species Cp values are compiled from canonical `MaterialSpecies` definitions without turning numeric runtime IDs into save/content identity.

`WasmPackedSplitter` and `WasmPackedMerger` each advance a complete multi-Hopper routing operation through one coarse WASM call. The material populations remain Rust-owned throughout the transaction.

The matching JavaScript packed runtimes are migration fallbacks and parity oracles, not a second permanent physics engine. Regression tests run the real production JS Feeder, Splitter, and Merger graphs and compare packed inventories, species distributions, sensible enthalpy, stream rates/composition, capacity throttling, and apparatus operating state.

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
