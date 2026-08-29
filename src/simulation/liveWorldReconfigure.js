import { PACKED_NO_RUNTIME_ID } from './packedWorldRuntimeCompiler.js';

function runtimeIdForCanonical(values, canonicalId) {
  const id = values?.indexOf(canonicalId) ?? -1;
  return id < 0 ? PACKED_NO_RUNTIME_ID : id;
}

function ids(rows, field) {
  return new Set((rows ?? []).map(row => row[field]));
}

function solidBodyArgs(body) {
  return [
    body.speciesIds,
    body.sizeBinIds,
    body.liberationClassIds,
    body.textureProfileIds,
    body.quantities,
    body.sensibleEnthalpyJ,
  ];
}

function upsertMachine(wasmWorld, machine, preserveRetainedState) {
  switch (machine.kind) {
    case 'extractor':
      wasmWorld.upsert_extractor_live(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.rateKgPerSecond, machine.enabled,
        machine.occurrenceId, machine.outputHopperId,
      );
      return;
    case 'merger':
      wasmWorld.upsert_merger_live(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.throughputKgPerSecond, machine.enabled,
        machine.inputAHopperId, machine.inputBHopperId, machine.outputHopperId,
      );
      return;
    case 'feeder':
      wasmWorld.upsert_feeder_live(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.flowRateKgPerSecond, machine.throughputKgPerSecond, machine.enabled,
        machine.inputHopperId, machine.outputTarget.kind, machine.outputTarget.id,
      );
      return;
    case 'comminution':
      wasmWorld.upsert_comminution_live(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.equipmentKind, machine.targetSizeId, machine.targetParticleSizeMm,
        machine.throughputKgPerSecond, machine.ratedPowerKw, machine.enabled,
        machine.inputHopperId, machine.outputHopperId,
      );
      return;
    case 'screen':
      wasmWorld.upsert_screen_live(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.apertureSizeMm, machine.throughputKgPerSecond, machine.enabled,
        machine.inputHopperId, machine.undersizeHopperId, machine.oversizeHopperId,
      );
      return;
    case 'splitter':
      wasmWorld.upsert_splitter_live(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.splitFractionToA, machine.throughputKgPerSecond, machine.enabled,
        machine.inputHopperId, machine.outputAHopperId, machine.outputBHopperId,
      );
      return;
    case 'magneticSeparator':
      wasmWorld.upsert_magnetic_separator_live(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.fieldStrength, machine.maxFeedParticleSizeMm,
        machine.throughputKgPerSecond, machine.enabled,
        machine.inputHopperId, machine.concentrateHopperId, machine.tailingsHopperId,
      );
      return;
    case 'roastingFurnace':
      wasmWorld.upsert_roasting_furnace_live(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.temperatureSetpointK, machine.ratedHeaterPowerKw,
        machine.maximumOperatingTemperatureK,
        machine.maximumSolidThroughputKgPerSecond,
        machine.effectiveChamberHoldUpKg,
        machine.heatLossCoefficientWPerK,
        machine.internalZoneCount,
        machine.enabled,
        machine.productTarget.kind, machine.productTarget.id,
        machine.gasVentId,
        preserveRetainedState,
      );
      return;
    default:
      throw new Error(`Unknown packed runtime machine kind '${machine.kind}'`);
  }
}

/**
 * Rebuild graph/configuration in place while Rust keeps physical inventory.
 * Existing runtime IDs are stable across the two setups; new canonical IDs append.
 * This path is intentionally edit-time only. Fixed-step simulation never moves
 * fraction arrays across the Worker boundary.
 */
export function reconfigureWasmPackedWorldRuntime(
  wasmWorld,
  previousSetup,
  nextSetup,
  { resetNodeIds = [] } = {},
) {
  if (!wasmWorld || typeof wasmWorld.begin_live_reconfigure !== 'function') {
    throw new Error('live-reconfigurable WASM world runtime is required');
  }
  const resetRuntimeIds = new Set(resetNodeIds.map(id =>
    runtimeIdForCanonical(nextSetup.runtimeIds.nodes, id)
  ).filter(id => id !== PACKED_NO_RUNTIME_ID));

  const previousSiteIds = ids(previousSetup?.sites, 'siteId');
  const previousHopperIds = ids(previousSetup?.hoppers, 'nodeId');
  const nextHopperIds = ids(nextSetup.hoppers, 'nodeId');
  const previousVentIds = ids(previousSetup?.exhaustVents, 'nodeId');
  const nextVentIds = ids(nextSetup.exhaustVents, 'nodeId');

  wasmWorld.begin_live_reconfigure();

  for (const site of nextSetup.sites) {
    if (previousSiteIds.has(site.siteId)) continue;
    wasmWorld.add_site(site.siteId);
    wasmWorld.import_site_stats(site.siteId, site.elapsedSeconds, site.extractedKg);
  }

  for (const hopper of previousSetup?.hoppers ?? []) {
    if (!nextHopperIds.has(hopper.nodeId)) wasmWorld.remove_hopper_if_empty_live(hopper.nodeId);
  }
  for (const hopper of nextSetup.hoppers) {
    if (!previousHopperIds.has(hopper.nodeId) || resetRuntimeIds.has(hopper.nodeId)) {
      wasmWorld.replace_hopper_state_live(
        hopper.nodeId,
        hopper.capacityKg,
        ...solidBodyArgs(hopper.body),
      );
    }
  }

  for (const vent of previousSetup?.exhaustVents ?? []) {
    if (!nextVentIds.has(vent.nodeId)) wasmWorld.remove_exhaust_vent_live(vent.nodeId);
  }
  for (const vent of nextSetup.exhaustVents) {
    if (!previousVentIds.has(vent.nodeId) || resetRuntimeIds.has(vent.nodeId)) {
      wasmWorld.replace_exhaust_vent_state_live(
        vent.nodeId,
        vent.body.speciesIds,
        vent.body.quantities,
        vent.body.sensibleEnthalpyJ,
      );
    }
  }

  for (const machine of nextSetup.machines) {
    upsertMachine(wasmWorld, machine, !resetRuntimeIds.has(machine.nodeId));
  }
  for (const link of nextSetup.passiveLinks) {
    wasmWorld.add_site_passive_storage_link(
      link.siteId, link.sourceHopperId, link.targetHopperId, link.rateKgPerSecond,
    );
  }
  for (const transfer of nextSetup.boundaryTransfers) {
    wasmWorld.add_boundary_transfer(
      transfer.transferId,
      transfer.sourceHopperId,
      transfer.targetHopperId,
      transfer.capacityKgPerSecond,
      transfer.priority,
      transfer.ordinal,
    );
  }

  wasmWorld.finish_live_reconfigure(
    Uint32Array.from(nextSetup.machines.map(machine => machine.nodeId)),
  );
  return wasmWorld;
}
