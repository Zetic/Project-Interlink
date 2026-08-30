# Rust / WebAssembly simulation runtime

Project Interlink's production physical simulation is owned by Rust compiled to WebAssembly and hosted in a dedicated browser Worker. Browser JavaScript remains responsible for UI, Blueprint authoring, content/world compilation, Worker messaging, serialization, and presentation; it is not a fallback physics engine.

## Crates

- `interlink-core` — platform-neutral material, storage, conservation, and low-level simulation data.
- `interlink-processes` — reusable apparatus/process execution contracts built on `interlink-core`.
- `interlink-routing` — multi-port Splitter/Merger logistics and atomic multi-storage transactions.
- `interlink-comminution` — Crusher/Jaw/Cone/Ball-Mill particle-size, liberation, power, and abrasion physics.
- `interlink-separation` — Screen and Magnetic Separator conservative two-way partitioning.
- `interlink-extraction` — ResourceOccurrence and Extractor execution.
- `interlink-thermal` — packed gas and sensible-thermal state/transfer behavior.
- `interlink-thermochemistry` — reaction kinetics, stoichiometry, and energy solves.
- `interlink-roasting` — retained-zone Roasting Furnace runtime.
- `interlink-runtime` — complete packed world graph, deterministic fixed-step scheduler, apparatus routing, boundary transfers, and simulation clock.
- `interlink-wasm` — thin `wasm-bindgen` browser adapter exposing only the coarse `WasmPackedWorldRuntime` production surface plus protocol/fixed-step helpers.

The platform-neutral crates intentionally contain no DOM or Worker dependencies so the same simulation code can be exercised in native Rust tests and future headless/native frontends.

## Production authority

```text
main browser thread
  UI / Blueprint editor / Inspector
  content + world compilation
  presentation projection
          |
          | versioned commands + compact snapshots
          v
simulation Worker
          |
          v
WasmPackedWorldRuntime
          |
          v
PackedWorldRuntime and physics crates
  fixed-step clock
  packed retained material/gas state
  graph scheduling and routing
  apparatus physics
  thermal / thermochemistry
  conservation
```

`PackedWorldRuntime` is the live physical authority. Normal simulation advances the complete packed world through a coarse fixed-step operation; JavaScript does not receive per-fraction or per-apparatus state in order to execute physics.

## Packed execution state

Solid particulate state is data-oriented and uses runtime-local numeric IDs:

```text
species_id[]            u16
size_bin_id[]           u8
liberation_class_id[]   u8
texture_profile_id[]    u32
quantity[]              f64
```

Packed gas state uses species IDs and quantities, with sensible enthalpy carried by the owning gas body/stream contract.

Canonical string IDs remain content/save identity. JavaScript compiler modules translate readable content, topology, and initial state into packed setup data. Runtime-local numeric IDs must never become persistent content IDs.

## Physical contracts

The Rust runtime owns the conservation-sensitive behavior used by production simulation, including:

- finite solid and gas inventories;
- sensible-enthalpy accounting and derived temperature;
- Hopper capacity and backpressure;
- atomic transfers and multi-output commits;
- Splitter/Merger routing;
- extraction from Feature-owned ResourceOccurrences;
- comminution particle-size redistribution and liberation;
- screening and magnetic separation;
- gas/solid heat transfer;
- thermochemical reaction energy closure;
- retained-zone Roasting Furnace execution;
- Site and world boundary transfers;
- deterministic apparatus phase scheduling.

The authoritative fixed step is `0.1 s`.

## Browser boundary

`interlink-wasm` intentionally exposes one production state owner: `WasmPackedWorldRuntime`. Setup commands populate the packed world and property tables through that object; live ticks remain inside Rust/WASM until a compact presentation snapshot or requested detail is returned.

Standalone browser-facing WASM wrappers for individual Hoppers, Extractors, comminution machines, separators, furnaces, gas bodies, and material states are not part of the production API. Their physics remains in the platform-neutral Rust crates and is orchestrated internally by `PackedWorldRuntime`.

Do not add a protocol that synchronizes individual populations, fractions, species, or machines each tick. Do not reintroduce JavaScript physics for unsupported browsers; Worker + WebAssembly support is part of the production runtime requirement.

## Thermodynamic scope

Sensible enthalpy is authoritative and temperature is derived from energy and composition-dependent heat capacity. The current model deliberately does not invent independent gas pressure, volume, phase-equilibrium, or CFD state. New thermodynamic state should be added only when gameplay/process behavior requires it and conservation/ownership semantics are explicit.

## Development rules

1. Keep DOM/UI behavior outside Rust.
2. Keep all physical time advancement and retained physical state inside the Rust/WASM Worker authority boundary.
3. Use coarse WASM calls; never bridge once per fraction/species/tiny arithmetic operation.
4. Never serialize runtime-local numeric IDs as persistent content identity.
5. Preserve deterministic fixed-step ordering and conservation tests.
6. Reuse shared physical primitives instead of creating apparatus-specific copies of transfer/material semantics.
7. Commit multi-inventory operations atomically; partial output commits are invalid.
8. Compile material/process metadata from canonical content definitions rather than hard-coding persistent identities in execution code.
9. Do not reinterpret qualitative generation labels such as `quantityClass` as conserved physical quantities.
10. Keep temperature derived from the authoritative energy ledger.
11. Add new gas/phase state only when a real process requires it.
12. Treat whole-world import, scheduling, and presentation snapshots as coarse runtime operations.

## Commands

From the repository root:

```bash
cargo test --workspace
cargo check -p interlink-wasm --target wasm32-unknown-unknown
npm run check:runtime
```

The repository pins the stable Rust toolchain and the `wasm32-unknown-unknown` target in `rust-toolchain.toml`.
