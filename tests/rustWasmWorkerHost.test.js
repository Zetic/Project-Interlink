import test from 'node:test';
import assert from 'node:assert/strict';

import { createRustWasmWorkerHost } from '../src/simulation/rustWasmWorkerHost.js';
import {
  REALTIME_RUNTIME_PROTOCOL_VERSION,
  RUNTIME_COMMAND_TYPES,
  RUNTIME_EVENT_TYPES,
  createRuntimeCommand,
} from '../src/simulation/runtimeProtocol.js';

function emptySetup() {
  return {
    running: true,
    elapsedSeconds: 4.2,
    sites: [{ siteId: 1, canonicalSiteId: 'site-a', elapsedSeconds: 1.2, extractedKg: 3.4 }],
    hoppers: [],
    occurrences: [],
    exhaustVents: [],
    machines: [],
    passiveLinks: [],
    boundaryTransfers: [],
    thermalProperties: [],
    comminution: {
      sizeBins: [],
      liberationClasses: [],
      textures: [],
      properties: [],
      legacyLtOneMmId: 0,
    },
    separation: { sizeBins: [], liberationClasses: [], magneticResponses: [] },
    reaction: {
      sourceSpeciesId: 1,
      solidProductSpeciesId: 2,
      gasProductSpeciesId: 3,
      sourceMassPerExtentKg: 1,
      solidProductMassPerExtentKg: 0.9,
      gasProductMassPerExtentKg: 0.1,
      reactionEnthalpyJPerMolExtent: 1,
      activationEnergyJPerMol: 1,
      preExponentialFactorPerSecond: 1,
      sizeFactors: [],
      textureMappings: [],
    },
    furnaceStateSnapshots: [],
    runtimeIds: { nodes: [], sites: ['site-a'], occurrences: [], transfers: [] },
    materialIds: { species: [], sizeBins: [], liberationClasses: [], textureProfiles: [] },
  };
}

class FakeWasmWorld {
  constructor() {
    this._running = true;
    this._elapsed = 0;
    this._sites = new Map();
    return new Proxy(this, {
      get: (target, property, receiver) => {
        if (property in target) {
          const value = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return () => undefined;
      },
    });
  }

  import_world_elapsed_seconds(value) { this._elapsed = value; }
  import_site_stats(id, elapsedSeconds, extractedKg) {
    this._sites.set(id, { elapsedSeconds, extractedKg });
  }
  pause() { this._running = false; }
  resume() { this._running = true; }
  running() { return this._running; }
  elapsed_seconds() { return this._elapsed; }
  site_elapsed_seconds(id) { return this._sites.get(id)?.elapsedSeconds ?? 0; }
  site_extracted_kg(id) { return this._sites.get(id)?.extractedKg ?? 0; }
  tick_fixed() {
    if (!this._running) return false;
    this._elapsed += 0.1;
    return true;
  }
  advance_fixed_steps(steps) {
    if (!this._running) return 0;
    this._elapsed += steps * 0.1;
    return steps;
  }
}

test('Worker host imports state once and owns subsequent fixed-step advancement', () => {
  const host = createRustWasmWorkerHost({
    WasmPackedWorldRuntime: FakeWasmWorld,
    runtimeProtocolVersion: () => REALTIME_RUNTIME_PROTOCOL_VERSION,
  });

  const ready = host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT, { setup: emptySetup() }));
  assert.equal(ready.type, RUNTIME_EVENT_TYPES.READY);
  assert.equal(ready.payload.elapsedSeconds, 4.2);
  assert.equal(ready.payload.snapshot.sites[0].elapsedSeconds, 1.2);

  const stepped = host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED));
  assert.equal(stepped.type, RUNTIME_EVENT_TYPES.STEPPED);
  assert.equal(stepped.payload.advanced, true);
  assert.ok(Math.abs(stepped.payload.elapsedSeconds - 4.3) < 1e-12);

  host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.PAUSE));
  const paused = host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED));
  assert.equal(paused.payload.advanced, false);
  assert.ok(Math.abs(paused.payload.elapsedSeconds - 4.3) < 1e-12);

  host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.RESUME));
  const advanced = host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.ADVANCE_FIXED, { steps: 3 }));
  assert.equal(advanced.payload.ticks, 3);
  assert.ok(Math.abs(advanced.payload.elapsedSeconds - 4.6) < 1e-12);
});

test('Worker host rejects browser/WASM protocol drift before accepting a world', () => {
  assert.throws(
    () => createRustWasmWorkerHost({
      WasmPackedWorldRuntime: FakeWasmWorld,
      runtimeProtocolVersion: () => REALTIME_RUNTIME_PROTOCOL_VERSION - 1,
    }),
    /does not match browser protocol/,
  );
});
