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
    hoppers: [{
      nodeId: 7, canonicalNodeId: 'hopper-a', capacityKg: 100,
      body: { speciesIds: new Uint16Array(), sizeBinIds: new Uint8Array(), liberationClassIds: new Uint8Array(), textureProfileIds: new Uint32Array(), quantities: new Float64Array(), sensibleEnthalpyJ: 0 },
    }],
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
    runtimeIds: { nodes: ['unused', 'unused-1', 'unused-2', 'unused-3', 'unused-4', 'unused-5', 'unused-6', 'hopper-a'], sites: ['site-a'], occurrences: [], transfers: [] },
    materialIds: { species: ['none', 'iron', 'silica'], sizeBins: ['coarse', 'fine'], liberationClasses: ['locked', 'liberated'], textureProfiles: [] },
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
  hopper_stored_mass_kg(id) { return id === 7 ? 10 : 0; }
  hopper_sensible_enthalpy_j(id) { return id === 7 ? 500 : 0; }
  hopper_species_ids(id) { return id === 7 ? new Uint16Array([1, 2]) : new Uint16Array(); }
  hopper_size_bin_ids(id) { return id === 7 ? new Uint8Array([0, 1]) : new Uint8Array(); }
  hopper_liberation_class_ids(id) { return id === 7 ? new Uint8Array([0, 1]) : new Uint8Array(); }
  hopper_texture_profile_ids(id) { return id === 7 ? new Uint32Array([0, 0]) : new Uint32Array(); }
  hopper_quantities(id) { return id === 7 ? new Float64Array([7, 3]) : new Float64Array(); }
  hopper_temperature_k(id) { if (id !== 7) throw new Error('unknown hopper'); return 350; }
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

class FlakyInitWasmWorld extends FakeWasmWorld {
  static attempts = 0;
  static freed = 0;

  constructor() {
    super();
    this._attempt = ++FlakyInitWasmWorld.attempts;
  }

  add_site() {
    if (this._attempt === 1) throw new Error('synthetic population failure');
  }

  free() {
    FlakyInitWasmWorld.freed += 1;
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

test('Worker host initialization is transactional and retryable after population failure', () => {
  FlakyInitWasmWorld.attempts = 0;
  FlakyInitWasmWorld.freed = 0;
  const host = createRustWasmWorkerHost({
    WasmPackedWorldRuntime: FlakyInitWasmWorld,
    runtimeProtocolVersion: () => REALTIME_RUNTIME_PROTOCOL_VERSION,
  });
  const init = createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT, { setup: emptySetup() });

  assert.throws(() => host.handle(init), /synthetic population failure/);
  assert.equal(host.runtime, null);
  assert.equal(host.setup, null);
  assert.equal(FlakyInitWasmWorld.freed, 1);
  assert.throws(
    () => host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED)),
    /has not been initialized/,
  );

  const ready = host.handle(init);
  assert.equal(ready.type, RUNTIME_EVENT_TYPES.READY);
  assert.equal(ready.payload.elapsedSeconds, 4.2);
  assert.notEqual(host.runtime, null);
  assert.notEqual(host.setup, null);
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

test('Worker host returns canonical selected Hopper detail with request correlation', () => {
  const host = createRustWasmWorkerHost({
    WasmPackedWorldRuntime: FakeWasmWorld,
    runtimeProtocolVersion: () => REALTIME_RUNTIME_PROTOCOL_VERSION,
  });
  host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT, { setup: emptySetup() }, 1));
  const event = host.handle(createRuntimeCommand(
    RUNTIME_COMMAND_TYPES.QUERY_DETAIL,
    { entityType: 'hopper', id: 'hopper-a' },
    41,
  ));
  assert.equal(event.type, RUNTIME_EVENT_TYPES.DETAIL);
  assert.equal(event.requestId, 41);
  assert.equal(event.payload.ok, true);
  assert.equal(event.payload.detail.storedMassKg, 10);
  assert.equal(event.payload.detail.temperatureK, 350);
  assert.deepEqual(event.payload.detail.compositionKg, { iron: 7, silica: 3 });
  assert.deepEqual(event.payload.detail.particleSizeDistributionKg, { coarse: 7, fine: 3 });
  assert.deepEqual(event.payload.detail.liberationDistributionKg, { locked: 7, liberated: 3 });
});

test('bad detail request is non-terminal at the Worker host boundary', () => {
  const host = createRustWasmWorkerHost({
    WasmPackedWorldRuntime: FakeWasmWorld,
    runtimeProtocolVersion: () => REALTIME_RUNTIME_PROTOCOL_VERSION,
  });
  host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT, { setup: emptySetup() }, 1));
  const detail = host.handle(createRuntimeCommand(
    RUNTIME_COMMAND_TYPES.QUERY_DETAIL,
    { entityType: 'hopper', id: 'missing' },
    2,
  ));
  assert.equal(detail.type, RUNTIME_EVENT_TYPES.DETAIL);
  assert.equal(detail.payload.ok, false);
  assert.match(detail.payload.error.message, /Unknown runtime Hopper/);
  const stepped = host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED, {}, 3));
  assert.equal(stepped.payload.advanced, true);
  assert.equal(stepped.requestId, 3);
});

