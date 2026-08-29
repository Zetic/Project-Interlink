# interlink-runtime

`interlink-runtime` is the platform-neutral conductor for Project Interlink's packed Rust simulation.

It is the first layer that owns a complete execution graph rather than one apparatus at a time. The crate deliberately contains no DOM, Worker, `wasm-bindgen`, or browser code.

## Ownership

A `PackedWorldRuntime` owns:

- the world simulation clock and pause/resume state;
- registered Site runtimes and their elapsed/extraction statistics;
- packed Hopper inventories;
- packed ResourceOccurrence sources;
- Exhaust Vent gas inventories;
- all migrated active apparatus runtimes;
- shared thermal, comminution, separation, and thermochemical property tables;
- Site-local passive boundary-buffer transfers;
- world-level boundary transfers.

Runtime numeric IDs are execution-local. Canonical string IDs remain in JavaScript/content/save state and are compiled into numeric IDs during setup.

## Deterministic fixed-step order

The scheduler preserves the production JavaScript ordering instead of substituting a generic graph traversal:

```text
for each registered Site, in registration order:
  Extractor             phase 10
  Material Merger       phase 15
  Feeder                phase 18
  Crusher / Jaw         phase 20
  Cone Crusher          phase 22
  Ball Mill             phase 24
  Screen                phase 30
  Splitter              phase 35
  Magnetic Separator    phase 40
  Roasting Furnace      phase 45

  Site-local passive Hopper transfers

world boundary transfers, ordered by priority then canonical transfer order

advance world clock
```

Within one apparatus phase, canonical node insertion order is retained through a numeric ordinal. This preserves same-tick propagation behavior that existing gameplay/tests rely on.

The authoritative fixed step remains `0.1 s` through `tick_fixed()`.

## Cross-apparatus ownership

Most migrated machines operate directly on Rust-owned Hopper state. Two valid production edges do not have an intermediate Hopper:

- Feeder → Roasting Furnace
- Roasting Furnace → Roasting Furnace

The scheduler handles those edges with staged Rust-owned transactions. It does not copy material populations through JavaScript and does not introduce alternate physics implementations.

## World boundaries

Site-local explicit boundary-buffer links execute after apparatus phases for that Site, matching `simulationEngine.js`.

Registered world transfers execute only after every Site has advanced for the tick, matching `worldSimulation.js`. Their order remains deterministic by transfer priority and canonical transfer ordering.

## Browser boundary

`WasmPackedWorldRuntime` is the thin browser adapter. Canonical world topology and material/property data are compiled once by `packedWorldRuntimeCompiler.js`, then normal simulation can advance the entire packed graph through one coarse `tick_fixed()` call.

The adapter intentionally does **not** create a per-apparatus or per-fraction synchronization protocol.

## What this PR does not cut over

The JavaScript simulation remains production-authoritative in this migration PR.

Existing live world clocks, per-Site accumulated statistics, and retained Roasting Furnace internal zone state are compiled into a deferred state-import snapshot but are not incrementally pushed into WASM. The Worker cutover must import that complete state atomically when Rust becomes authoritative.

That separation prevents two competing authoritative worlds from being synchronized every 100 ms and keeps the final architecture as:

```text
main browser thread
  UI / graph editor / Inspector
          |
          | commands + compact snapshots
          v
simulation Worker
          |
          v
PackedWorldRuntime (Rust/WASM)
  graph scheduling
  material inventories
  apparatus physics
  thermochemistry
  world transfers
  fixed-step clock
```

## Validation priorities

Scheduler tests pin:

- exact apparatus phase ordering;
- same-phase insertion ordering;
- same-tick Extractor → Feeder propagation;
- all-Sites-before-world-boundary timing;
- pause semantics;
- Site passive transfer timing;
- direct Feeder → Furnace staging;
- packed compiler ID/topology behavior;
- unsupported Extractor physical forms remaining blocked rather than receiving dangling runtime IDs;
- browser `wasm32-unknown-unknown` compilation.
