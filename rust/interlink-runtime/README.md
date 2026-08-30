# interlink-runtime

`interlink-runtime` is the platform-neutral conductor for Project Interlink's production packed Rust simulation. It owns the complete execution graph and deliberately contains no DOM, Worker, `wasm-bindgen`, or browser code.

## Ownership

A `PackedWorldRuntime` owns:

- the authoritative world simulation clock and pause/resume state;
- registered Site runtimes and elapsed/extraction statistics;
- packed Hopper inventories;
- packed ResourceOccurrence sources;
- Exhaust Vent gas inventories;
- active apparatus runtime state;
- shared thermal, comminution, separation, and thermochemical property tables;
- Site-local passive boundary-buffer transfers;
- world-level boundary transfers.

Runtime numeric IDs are execution-local. Canonical string IDs remain content/save identity and are compiled into numeric IDs during setup.

## Deterministic fixed-step order

The scheduler preserves the established production phase ordering:

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

Within one apparatus phase, canonical node insertion order is retained through a numeric ordinal. This preserves deterministic same-tick propagation behavior.

The authoritative fixed step is `0.1 s` through `tick_fixed()`.

## Cross-apparatus ownership

Most machines operate directly on Rust-owned Hopper state. Valid production edges may also connect active machinery without an intermediate Hopper, including:

- Feeder → Roasting Furnace
- Roasting Furnace → Roasting Furnace

The scheduler handles those edges with staged Rust-owned transactions. Material populations are not copied through JavaScript and no alternate physics implementation is involved.

## World boundaries

Site-local explicit boundary-buffer links execute after apparatus phases for that Site. Registered world transfers execute only after every Site has advanced for the tick. World-transfer ordering remains deterministic by transfer priority and canonical transfer order.

## Browser boundary

`WasmPackedWorldRuntime` is the thin browser adapter used inside the dedicated simulation Worker. Canonical world topology and material/property data are compiled by the JavaScript setup compilers, then the complete packed graph advances through coarse runtime calls.

The production authority boundary is:

```text
main browser thread
  UI / graph editor / Inspector
          |
          | commands + compact snapshots
          v
simulation Worker
          |
          v
WasmPackedWorldRuntime
          |
          v
PackedWorldRuntime
  graph scheduling
  material inventories
  apparatus physics
  thermochemistry
  world transfers
  fixed-step clock
```

The adapter intentionally does **not** create per-apparatus or per-fraction synchronization. JavaScript is not a fallback physics engine.

## Profiling

The runtime exposes an optional profiled tick path for deep diagnostics. Normal `tick_fixed()` remains clock-free. When profiling is enabled, timing is aggregated inside Rust/WASM and returned to the Worker as compact telemetry rather than one message per apparatus execution.

Profiling distinguishes total authoritative Rust tick time from scheduled apparatus time so remaining scheduler/passive-transfer overhead can be measured separately.

## Validation priorities

Scheduler and bridge tests pin:

- exact apparatus phase ordering;
- same-phase insertion ordering;
- same-tick upstream/downstream propagation;
- all-Sites-before-world-boundary timing;
- pause semantics;
- Site passive-transfer timing;
- direct Feeder → Furnace and Furnace → Furnace staging;
- packed compiler ID/topology behavior;
- unsupported Extractor physical forms remaining blocked rather than receiving dangling runtime IDs;
- conservation of mass and sensible energy through supported processes;
- browser `wasm32-unknown-unknown` compilation.
