# Project Interlink realtime browser runtime architecture

This document defines the current production performance architecture for the realtime simulation.

## Player-facing contract

Project Interlink is a continuously running fixed-step simulation with explicit **Pause / Resume** controls. The authoritative physics step is `0.1 s` unless a future physics change deliberately revises it. Performance work must preserve realtime play rather than replace it with batch/event fast-forward semantics.

## Production ownership model

```text
main browser thread
  DOM / graph / Inspector / input
  readable Blueprint authoring state
  presentation projection
            │
            │ versioned commands + compact snapshots
            ▼
dedicated simulation Worker
            │
            ▼
Rust interlink-runtime → interlink-core/process crates → WebAssembly
  fixed-step scheduling
  packed retained runtime state
  graph/apparatus execution
  routing and boundary transfer
  process physics
  material / thermal / chemistry state
  conservation
```

The production authority rules are strict:

- the main browser thread owns UI, input, navigation, authoring, persistence-oriented structures, compilation, and presentation;
- the dedicated Worker owns the live simulation session boundary;
- Rust/WASM owns all physical time advancement and retained physical state;
- JavaScript must not provide a second physics engine or fallback execution path;
- browsers without both Web Worker and WebAssembly support are unsupported rather than silently selecting different simulation semantics.

Readable Blueprint/world structures remain the authoring, persistence, debugging, and test representation. They are compiled into the packed Rust/WASM runtime and must not be treated as a second live physical state.

## Runtime layers

The browser runtime is split conceptually into four layers:

1. **Presentation** — DOM/UI, graph interaction, Inspector, input, navigation.
2. **Realtime pacing** — wall-clock accumulation on the main thread and one outstanding fixed-step request at a time.
3. **Authoritative simulation** — Worker-hosted Rust/WASM scheduling, apparatus execution, routing, thermochemistry, and retained state.
4. **Selective acceleration** — SIMD, future WASM threading, or WebGPU only where workload shape justifies them.

The main-thread accumulator represents normal fixed-step phase. Only time beyond one normal step window is scheduler debt. Realtime-factor telemetry must use a rolling observation window long enough to avoid quantization from the `0.1 s` step.

## Worker boundary

Topology and parameter edits cross the Worker boundary as explicit versioned commands. Presentation receives compact authoritative snapshots rather than cloning an object-heavy world every frame. Detailed Inspector state is queried only when required.

A full-world `structuredClone` every physics step is explicitly prohibited as a target architecture because it moves the bottleneck to serialization and garbage collection.

The normal live step path is:

```text
requestAnimationFrame pacing
  → STEP_FIXED(0.1 s)
  → Worker command dispatch
  → Rust/WASM authoritative tick
  → compact snapshot construction
  → Worker response
  → main-thread projection/render
```

Deep profiling may measure the Rust tick, apparatus execution, Worker round trip, and presentation update separately. Profiling must remain optional so the disabled path does not add per-apparatus timers or message traffic.

## Packed runtime state

Numerical hot paths use compact runtime-local numeric IDs and packed arrays rather than repeatedly parsing string-heavy serialized structures. Runtime-local IDs are execution details, not persistent content IDs.

JavaScript compilation modules may translate readable content/Blueprint definitions into packed initialization data, but they do not advance physical state. WASM should receive coarse commands rather than one JS→WASM call per material fraction or apparatus.

## Presentation policy

State-dependent presentation runs from authoritative Worker snapshots rather than once per monitor refresh. A 60/120/240 Hz monitor therefore does not force identical graph/Inspector work between 10 Hz physics steps.

Graph and Inspector projections should remain dirty/revision-driven where possible. Expensive detail is queried on demand instead of being attached to every routine snapshot.

## CPU parallelism

Parallelism should be introduced only for genuinely independent work, such as independent simulation components, world-generation batches, Monte Carlo work, or large regular material transforms. Parallel execution must preserve deterministic ordering at synchronization boundaries and must not weaken conservation rules.

Shared-memory WASM threading can be considered when measured workloads justify the deployment and synchronization complexity. It requires cross-origin isolation (`SharedArrayBuffer` / COOP / COEP).

## GPU / WebGPU policy

WebGPU is a selective numerical backend, not a blanket replacement for CPU simulation.

Current factory graphs are relatively small, branch-heavy, and dependency-heavy. Routing, backpressure, apparatus state machines, and most furnace orchestration are generally better CPU workloads.

WebGPU becomes appropriate for large regular workloads such as:

- planetary/geological spatial fields;
- millions of cells or voxels;
- heat, diffusion, erosion, or fluid grids;
- bulk reaction/property evaluation over large homogeneous arrays;
- Monte Carlo or matrix-style numerical batches;
- future high-volume particle/cellular simulations.

Moving a small apparatus graph to the GPU merely to use the GPU is not an optimization target.

## Deployment

The application remains compatible with static hosting. Worker/WASM/WebGPU paths require no application server. Shared-memory WASM threading requires cross-origin isolation headers, so maximum-performance deployments may require a static host that supports COOP/COEP configuration.

## Performance acceptance criteria

Performance changes should use deterministic fixtures on both strong and weak hardware. At minimum capture:

- display FPS / frame average / frame p95;
- Rust/WASM physics CPU time per fixed step;
- apparatus execution time and hotspot breakdown when deep profiling is enabled;
- Worker step round-trip average / p95;
- main-thread presentation update average / p95;
- fixed-step accumulator and scheduler debt;
- rolling realtime factor;
- JS heap;
- simulated population / apparatus count.

Percentages reported for physics/profile timings use the authoritative `100 ms` fixed-step budget. They are simulation-budget utilization, not operating-system CPU utilization.

The primary success metric is how far the runtime scales while keeping realtime factor near `1.0x`, scheduler debt near zero, and presentation responsive on weaker hardware. High display FPS alone does not demonstrate simulation capacity.

## Architecture guardrail

All future physical mechanics must enter the Rust/WASM Worker authority boundary. Browser JavaScript may define content, authoring metadata, compilation inputs, commands, and presentation projections, but it must not retain or advance a duplicate physical simulation state.
