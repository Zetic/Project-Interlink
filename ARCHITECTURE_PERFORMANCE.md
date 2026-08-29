# Project Interlink realtime browser runtime architecture

This document defines the performance direction for the realtime simulation runtime.

## Player-facing contract

Project Interlink remains a continuously running fixed-step simulation with explicit **Pause / Resume** controls. The authoritative physics step remains `0.1 s` unless a future physics change deliberately revises it. Performance work must not replace realtime play with batch/event fast-forward semantics.

## Runtime layers

The browser runtime is split conceptually into four independent layers:

1. **Presentation** — DOM/UI, graph interaction, Inspector, input, navigation.
2. **Scheduling** — wall-clock accumulation and fixed-step realtime pacing.
3. **Simulation execution** — compiled graph topology, apparatus order, material routing, thermochemical/process state.
4. **Numerical acceleration** — WASM/SIMD/worker or WebGPU kernels where workload shape justifies them.

The readable Blueprint/world structures remain the authoring, persistence, debugging, and test representation. Performance-specific projections are transient runtime state and must not become serialized physical truth.

## Implemented in PR #48

### Compiled fixed-step execution

Stable Blueprint topology is projected once into an execution plan containing apparatus phase buckets, direct runtime references, stream lookup, and explicit boundary-storage links. Topology edits invalidate this plan.

World session enumeration and boundary-transfer ordering are cached until their registries change. Solid fraction descriptor parsing/static registry validation is also bounded and cached because descriptor keys are immutable, while quantity and texture ownership remain state-specific and continue to be validated.

### Dirty-driven presentation

Simulation, topology, and graph layout publish transient revision counters. Graph projections and node/edge DOM walks are reused or skipped when no relevant revision changed.

The requestAnimationFrame loop remains the wall-clock scheduler, but state-dependent Site presentation runs after an authoritative physics step rather than once per monitor refresh. A 60/120/240 Hz monitor therefore no longer forces identical graph/Inspector work between 10 Hz physics steps. Node dragging also updates the affected element and connection geometry directly instead of invoking a complete Site render for every pointer movement.

### Hot presentation summaries

Material-stream total flow is cached when canonical stream state changes, so rendering an edge no longer has to sum every solid/gas population every presentation query. The cache is non-enumerable and does not affect serialization.

### Acceleration capability and backend contract

`runtimeCapabilities.js` reports Web Worker, hardware-concurrency, WebAssembly/SIMD, shared-memory threading, WebGPU and OffscreenCanvas support. The DEBUG panel exposes the relevant browser capabilities so benchmark results can be compared across machines.

`realtimeRuntime.js` defines the fixed-step backend contract and validates that the current backend retains authoritative `0.1 s` semantics. PR #48 deliberately keeps the proven compiled JavaScript execution backend as the selectable production path. It does **not** pretend that a Worker backend is complete by copying the object-heavy world across a thread boundary every tick.

## Worker boundary — next execution backend

The next backend migration is a dedicated simulation worker. The intended ownership model is:

- main thread owns DOM, pointer/input events, graph interaction and presentation;
- worker owns fixed-step simulation execution;
- topology/command edits cross the boundary as explicit commands;
- presentation receives compact snapshots/deltas rather than cloning the complete world every frame;
- detailed Inspector state is queried/snapshotted only when required.

A full-world `structuredClone` every physics step is explicitly not the target architecture because it moves the bottleneck to serialization and garbage collection.

The Worker should become authoritative only after simulation state has a coarse command/snapshot boundary. Until that point, the compiled main-thread backend remains the correct fallback and reference implementation.

## Data-oriented / WASM boundary

The long-term simulation execution representation should stop using string-heavy sparse-object structures in numerical hot paths. Readable serialized material state can be compiled to numeric IDs and packed arrays for execution.

Target execution data includes typed arrays for species, size-bin, liberation/texture identifiers and quantities. This representation enables better JavaScript cache locality immediately and provides a natural boundary for Rust/WebAssembly and SIMD later.

WASM should own coarse simulation kernels/state rather than receive one JS→WASM call per fraction or apparatus. The browser UI should communicate through coarse commands such as advancing one fixed step, changing an apparatus parameter, or requesting an inspection snapshot.

## CPU parallelism

Worker parallelism should be applied to genuinely independent work, such as independent Site simulation components, world-generation batches, Monte Carlo generation, or large numerical material transforms. Parallelism must preserve deterministic ordering at synchronization boundaries and must not weaken conservation rules.

Shared-memory WASM threading can be introduced once the runtime state is packed sufficiently to justify `SharedArrayBuffer`/cross-origin-isolated deployment.

## GPU / WebGPU policy

WebGPU is a selective numerical backend, not a blanket replacement for CPU simulation.

Current factory graphs are relatively small, branch-heavy and dependency-heavy. Crushers, routing, backpressure, state machines and most furnace orchestration are generally better CPU workloads.

WebGPU becomes appropriate for large regular workloads such as:

- planetary/geological spatial fields;
- millions of cells/voxels;
- heat, diffusion, erosion or fluid grids;
- bulk reaction/property evaluation over large homogeneous arrays;
- Monte Carlo or matrix-style numerical batches;
- future high-volume particle/cellular simulations.

Sending a small graph of apparatus through the GPU simply to claim GPU usage is prohibited by this architecture because transfer/synchronization overhead can make it slower.

## Deployment

The application remains compatible with static hosting. Basic Worker/WASM/WebGPU paths require no application server. Shared-memory WASM threading requires cross-origin isolation headers, so maximum-performance deployments may require a static host that allows COOP/COEP headers rather than relying on a host that cannot configure them.

## Performance acceptance criteria

Performance changes should be evaluated on both strong and weak hardware with the same deterministic fixtures. At minimum measure 1, 10, 25, 50 and 100 factory lines and capture:

- display FPS / frame average / frame p95;
- physics CPU time per fixed step;
- presentation CPU time;
- realtime factor;
- simulation backlog/debt;
- JS heap;
- population count;
- apparatus hotspot breakdown when deep profiling is enabled.

The primary success metric is not maximum FPS on a strong desktop. It is how far the runtime can scale while keeping realtime factor near `1.0x` and presentation near the display target on weaker hardware.
