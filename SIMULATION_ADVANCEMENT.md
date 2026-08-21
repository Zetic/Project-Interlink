# Project Interlink — Explicit Simulation Advancement

This document defines the simulation-time architecture introduced by the explicit batch/event advancement rework.

The governing rule is:

> Player interaction occurs while physical simulation time is paused. The player explicitly requests that the world advance to a later simulation time. The simulation layer, not the browser frame loop, owns how that interval is computed.

This changes scheduling and numerical execution architecture. It does **not** redefine kilograms, streams, material ownership, reactions, conservation, particle-size state, liberation, texture lineage, or apparatus physics.

---

## 1. Time ownership

Previous browser-oriented execution effectively followed:

```text
wall-clock time
    ↓
requestAnimationFrame accumulator
    ↓
0.1 s world tick
    ↓
all active apparatus
```

The target architecture is:

```text
PLAYER ENGINEERING MODE
world time frozen
    ↓
Advance +Δt / Advance to T
    ↓
Simulation Advancement Scheduler
    ↓
proven operating segment / event integration when available
or
exact 0.1 s fallback
    ↓
TARGET WORLD TIME
    ↓
return to paused engineering mode
```

`0.1 s` remains the authoritative detailed physics step and the correctness fallback. A system is never given a larger numerical interval merely because it exposes a `dt` parameter.

---

## 2. Public advancement contract

The advancement layer exposes two concepts:

```text
advanceWorldBy(world, seconds)
advanceWorldTo(world, targetSimulationSeconds)
```

Synchronous variants exist for tests/background contexts.

Requested time currently remains aligned to the authoritative 0.1-second grid. This avoids hidden fractional fallback steps while interval/event solvers are introduced process-by-process.

Every explicit advancement request ends with the world paused.

---

## 3. Universal exact fallback

Any unsupported topology/process continues through the current fixed-step path:

```text
while currentTime < targetTime:
    worldSimulationTick(world, 0.1)
```

This is not legacy behavior to remove quickly. It is the permanent reference implementation against which accelerated interval solvers are validated.

The current roasting furnace remains on this path. Its zone residence, thermal coupling, reaction kinetics, gas generation, output backpressure, and energy balance are therefore unchanged by this PR.

---

## 4. Operating segments

An **operating segment** is transient numerical metadata describing a regime that can be advanced without replaying every detailed step.

It is not world truth and is never serialized.

A segment records:

- its kind;
- the configuration/topology/source signature it depends on;
- the physical condition under which it remains valid;
- the next known event boundary when applicable.

The cache invalidates when relevant configuration changes, including apparatus parameters/enabled state, topology, boundary-transfer configuration, or referenced ResourceOccurrence truth.

Dynamic inventories are intentionally excluded from the configuration signature because those are the state being advanced by the segment.

---

## 5. Quiescent segments

A quiescent world has no material stream flow, no boundary-transfer flow, no machine reporting active operation, and no enabled furnace retaining material that may continue heating/reacting internally.

After quiescence is confirmed on consecutive detailed steps, the scheduler may cache:

```text
kind: quiescent
next event: external/configuration change
```

Advancing such a segment changes only authoritative simulation clocks. Material/energy state does not change because every modeled derivative is zero.

If the player changes the factory, the configuration signature changes and the segment is discarded before the next advancement request.

---

## 6. First active event segment: Extractor → Hopper

The first process-specific accelerated path is intentionally narrow:

```text
Feature → Extractor → Hopper
```

with no other process node types and no world boundary transfers.

This path is safe because the implemented Extractor is a constant-rate source of an immutable occurrence material state into passive storage. Its next internal event is the target Hopper reaching capacity.

For an observed rate `m_dot` and free capacity `M_free`:

```text
t_full = M_free / m_dot
```

The scheduler can combine many 0.1-second steps into one interval while remaining on the 0.1-second time grid and never crossing the predicted full-Hopper event.

At the event boundary, detailed fallback resolves the state transition to blocked operation. If the resulting world is quiescent, the remaining requested time can then fast-forward through the quiescent segment.

This demonstrates the intended architecture without applying unsafe arbitrary timesteps to nonlinear machinery.

---

## 7. Why large `dt` is not a generic apparatus capability

Several current systems are explicitly unsafe to fast-forward by simply calling their normal runtime once with a large `dt`.

### Furnace residence

Material enters the first internal zone and over-capacity material propagates downstream. A very large runtime step could allow material to cascade across several zones numerically without representing the intended residence history.

### Backpressure

If a Hopper fills 0.25 seconds into a 60-second interval, the physically relevant sequence is:

```text
0.00–0.25 s  process runs
0.25–60 s    output blocked
```

Applying one averaged throttle over all 60 seconds can alter upstream/downstream state.

### Phase ordering

Repeated:

```text
Extractor 0.1
Feeder    0.1
Crusher   0.1
```

is not generally equivalent to:

```text
Extractor 60
Feeder    60
Crusher   60
```

### Thermal/reaction integration

Heat loss, heater power, temperature-dependent kinetics, reaction enthalpy, composition-dependent heat capacity, and gas evolution require error-bounded numerical or analytical integration before larger intervals are valid.

For these reasons accelerated advancement is opt-in by proven process/regime contract, not inferred from a function signature.

---

## 8. UI behavior

The workspace is now presented as **Paused Engineering** mode.

Player actions such as:

- placing/removing apparatus;
- changing connections;
- changing feeder/furnace settings;
- navigating workspaces;
- inspecting material/state;

occur without physical world-time progression.

The workspace toolbar and DEBUG overlay provide explicit time-advance controls.

The historical Resume/Pause control is disabled by the engineering-mode presentation adapter during the migration. The legacy RAF scheduler remains in `workspaceController.js` as a compatibility surface but is cancelled when a workspace shell is installed; it no longer owns normal player simulation time.

---

## 9. Performance telemetry

For batch/event simulation, FPS is no longer the primary simulation scalability metric.

Each explicit advancement reports:

```text
requested simulation time
calculation wall time
simulation throughput (simulated seconds / wall second)
fixed-step-equivalent count
scheduler operation count
detailed 0.1 s steps
linear interval equivalent steps
quiescent fast-forward equivalent steps
schedule compression ratio
cached operating-segment kind
```

Example:

```text
Requested             60.0 s
Fixed-step equivalent 600
Scheduler operations  14
Schedule compression  42.9×
Calculation time       85 ms
Simulation throughput 706× realtime
```

`Schedule compression` describes how many reference fixed steps were represented per scheduler operation. It is not a claim that physical equations were skipped without an interval contract.

---

## 10. Future process migration

The expected order for adding accelerated interval/event contracts is:

1. storage and simple routing;
2. Feeder / Splitter / Merger;
3. Screen / magnetic separation;
4. stable comminution regimes;
5. thermochemical furnace using adaptive/error-bounded integration and steady-operating segments;
6. larger connected-component operating segments;
7. worker/typed numerical execution if profiling justifies it.

A future runtime registry may expose optional capabilities conceptually similar to:

```text
step(dt)              exact fallback
advanceInterval(...)  proven interval solver
nextEventTime(...)    event boundary prediction
```

The scheduler owns numerical policy. Physical apparatus definitions must not acquire arbitrary player-visible or fixed "update frequencies" merely to improve performance.

---

## 11. Required equivalence discipline

Every accelerated path must retain a detailed reference path.

For the same starting world and target simulation time:

```text
A = detailed 0.1 s reference
B = accelerated advancement
```

compare, as applicable:

- total mass;
- species/elemental conservation;
- particle-size distribution;
- liberation/texture lineage;
- thermal energy and temperature;
- gas production;
- apparatus retained inventories;
- final blocked/running state;
- stream state at the target time.

A new accelerated process path should not be accepted merely because it is faster. It must first establish its physical/numerical equivalence tolerance and event boundaries.

---

## 12. Architectural boundary

The intended responsibility separation is:

```text
World / MaterialBody / apparatus state
        physical truth

Simulation advancement scheduler
        chooses numerical work needed to reach target world time

Process/apparatus runtime
        physical transformations and optional proven interval contracts

Workspace
        commands advancement and observes results
```

The browser frame rate is presentation state and is not a physical clock.
