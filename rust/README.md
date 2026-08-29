# Rust / WebAssembly simulation runtime

Project Interlink is migrating the authoritative numerical simulation toward a Worker-owned Rust core compiled to WebAssembly while keeping browser presentation and interaction in JavaScript/TypeScript.

## Crates

- `interlink-core` — platform-neutral simulation data and kernels. This crate must not depend on browser APIs or `wasm-bindgen`.
- `interlink-wasm` — the browser adapter. It exposes coarse operations from `interlink-core` to JavaScript through `wasm-bindgen`.

The core crate is intentionally usable as ordinary native Rust so the same simulation can later run in browser WASM, native tools, headless tests, or another frontend.

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

`packedRuntimeCompiler.js` is the canonical-state → execution-state boundary. It now compiles solid material state, solid material bodies, and Hopper inventories while preserving mass and the body's sensible-enthalpy ledger.

## Migrated storage semantics

`interlink-core` now owns packed equivalents of the first conservation-sensitive runtime operations:

- well-mixed proportional solid withdrawal;
- finite solid material bodies with sensible enthalpy;
- finite-capacity Hopper storage;
- capacity-clipped continuous packed inflow;
- proportional enthalpy withdrawal;
- atomic conservative Hopper-to-Hopper transfer.

The WASM adapter exposes packed Hoppers and coarse transfer/receive operations. Material arrays remain inside WASM during a Hopper-to-Hopper transfer rather than crossing the JS/WASM boundary per population.

The matching JavaScript packed runtime is a migration fallback and parity oracle, not a second permanent physics engine. Regression tests compare it directly against the current canonical Hopper implementation so production behavior remains the specification until Rust becomes authoritative.

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
