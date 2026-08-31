import test from 'node:test';
import assert from 'node:assert/strict';

import { createRustWasmWorkerHost } from '../src/simulation/rustWasmWorkerHost.js';
import {
  REALTIME_RUNTIME_PROTOCOL_VERSION,
  RUNTIME_COMMAND_TYPES,
  RUNTIME_EVENT_TYPES,
  createRuntimeCommand,
} from '../src/simulation/runtimeProtocol.js';

function baseSetup() {
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

function setupWithSecondSite() {
  const setup = structuredClone(baseSetup());
  setup.sites.push({ siteId: 2, canonicalSiteId: 'site-b', elapsedSeconds: 0, extractedKg: 0 });
  setup.runtimeIds.sites.push('site-b');
  return setup;
}

class TransactionalWasmWorld {
  static failOnSecondSite = false;
  static freed = 0;

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

  clone_for_live_reconfigure() {
    const clone = new TransactionalWasmWorld();
    clone._running = this._running;
    clone._elapsed = this._elapsed;
    clone._sites = new Map([...this._sites.entries()].map(([id, stats]) => [id, { ...stats }]));
    return clone;
  }

  import_world_elapsed_seconds(value) { this._elapsed = value; }
  import_site_stats(id, elapsedSeconds, extractedKg) {
    this._sites.set(id, { elapsedSeconds, extractedKg });
  }
  add_site(id) {
    if (id === 2 && TransactionalWasmWorld.failOnSecondSite) {
      throw new Error('synthetic live reconfiguration failure');
    }
    if (!this._sites.has(id)) this._sites.set(id, { elapsedSeconds: 0, extractedKg: 0 });
  }
  begin_live_reconfigure() {}
  finish_live_reconfigure() {}
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
  free() { TransactionalWasmWorld.freed += 1; }
}

test('failed live reconfiguration discards its clone and leaves the authoritative runtime untouched', () => {
  TransactionalWasmWorld.failOnSecondSite = false;
  TransactionalWasmWorld.freed = 0;
  const host = createRustWasmWorkerHost({
    WasmPackedWorldRuntime: TransactionalWasmWorld,
    runtimeProtocolVersion: () => REALTIME_RUNTIME_PROTOCOL_VERSION,
  });
  const initialSetup = baseSetup();
  host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT, { setup: initialSetup }));
  host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED));
  const authoritativeBefore = host.runtime;
  assert.ok(Math.abs(host.runtime.elapsed_seconds() - 4.3) < 1e-12);

  TransactionalWasmWorld.failOnSecondSite = true;
  assert.throws(
    () => host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.RECONFIGURE, {
      setup: setupWithSecondSite(),
      resetNodeIds: [],
    })),
    /synthetic live reconfiguration failure/,
  );

  assert.equal(host.runtime, authoritativeBefore);
  assert.equal(host.setup, initialSetup);
  assert.ok(Math.abs(host.runtime.elapsed_seconds() - 4.3) < 1e-12);
  assert.equal(TransactionalWasmWorld.freed, 1, 'failed candidate should be released');
});

test('successful live reconfiguration swaps the clone while preserving the running world clock', () => {
  TransactionalWasmWorld.failOnSecondSite = false;
  TransactionalWasmWorld.freed = 0;
  const host = createRustWasmWorkerHost({
    WasmPackedWorldRuntime: TransactionalWasmWorld,
    runtimeProtocolVersion: () => REALTIME_RUNTIME_PROTOCOL_VERSION,
  });
  host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT, { setup: baseSetup() }));
  host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED));
  const authoritativeBefore = host.runtime;
  const nextSetup = setupWithSecondSite();

  const event = host.handle(createRuntimeCommand(RUNTIME_COMMAND_TYPES.RECONFIGURE, {
    setup: nextSetup,
    resetNodeIds: [],
  }));

  assert.equal(event.type, RUNTIME_EVENT_TYPES.RECONFIGURED);
  assert.notEqual(host.runtime, authoritativeBefore);
  assert.equal(host.setup, nextSetup);
  assert.ok(Math.abs(host.runtime.elapsed_seconds() - 4.3) < 1e-12);
  assert.equal(event.payload.snapshot.sites.length, 2);
  assert.equal(TransactionalWasmWorld.freed, 1, 'previous authoritative runtime should be released after swap');
});
