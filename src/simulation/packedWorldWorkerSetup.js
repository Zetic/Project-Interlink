import { compilePackedWorldRuntime } from './packedWorldRuntimeCompiler.js';
import { createPackedMaterialIdTablesFromValues } from './packedRuntimeCompiler.js';
import { getNodePortDefinitions } from './simulationEngine.js';

function solidBodyWire(body) {
  const columns = body.solidState.toColumns();
  return {
    speciesIds: columns.speciesIds,
    sizeBinIds: columns.sizeBinIds,
    liberationClassIds: columns.liberationClassIds,
    textureProfileIds: columns.textureProfileIds,
    quantities: columns.quantities,
    sensibleEnthalpyJ: body.sensibleEnthalpyJ,
  };
}

function gasBodyWire(body) {
  const columns = body.gasState.toColumns();
  return {
    speciesIds: columns.speciesIds,
    quantities: columns.quantities,
    sensibleEnthalpyJ: body.sensibleEnthalpyJ,
  };
}

function runtimeValues(table) {
  return Array.from(table?.values ?? []);
}

function cloneRows(rows) {
  return (rows ?? []).map(row => ({ ...row }));
}

/**
 * Convert the richer compiler result into a structured-clone-safe Worker setup.
 * Runtime-local numeric IDs and packed TypedArrays cross the boundary once;
 * canonical strings remain only in compact lookup arrays for presentation.
 */
function canonicalRuntimeNode(world, canonicalNodeId) {
  for (const blueprint of Object.values(world?.simulation?.sessions ?? {})) {
    if (blueprint?.nodes?.[canonicalNodeId]) return blueprint.nodes[canonicalNodeId];
  }
  for (const workspace of Object.values(world?.simulation?.workspaces ?? {})) {
    if (workspace?.nodes?.[canonicalNodeId]) return workspace.nodes[canonicalNodeId];
  }
  return null;
}

function materialPortIds(node, direction) {
  return getNodePortDefinitions(node)
    .filter(port => port.kind === 'material' && port.direction === direction)
    .map(port => port.id);
}

export function compilePackedWorldWorkerSetup(world, { previousSetup = null } = {}) {
  const idTables = previousSetup
    ? createPackedMaterialIdTablesFromValues(previousSetup.materialIds)
    : undefined;
  const compiled = compilePackedWorldRuntime(
    world,
    idTables,
    previousSetup?.runtimeIds ?? {},
  );
  return {
    running: compiled.running,
    elapsedSeconds: compiled.elapsedSeconds,
    sites: cloneRows(compiled.sites),
    hoppers: compiled.hoppers.map(hopper => ({
      nodeId: hopper.nodeId,
      canonicalNodeId: hopper.canonicalNodeId,
      capacityKg: hopper.capacityKg,
      body: solidBodyWire(hopper.packedBody),
    })),
    occurrences: compiled.occurrences.map(occurrence => {
      const columns = occurrence.materialPerKg.toColumns();
      return {
        occurrenceId: occurrence.occurrenceId,
        canonicalOccurrenceId: occurrence.canonicalOccurrenceId,
        speciesIds: columns.speciesIds,
        sizeBinIds: columns.sizeBinIds,
        liberationClassIds: columns.liberationClassIds,
        textureProfileIds: columns.textureProfileIds,
        quantitiesPerKg: columns.quantities,
        reserveMassKg: occurrence.reserveMassKg ?? null,
      };
    }),
    exhaustVents: compiled.exhaustVents.map(vent => ({
      nodeId: vent.nodeId,
      canonicalNodeId: vent.canonicalNodeId,
      body: gasBodyWire(vent.packedGasBody),
    })),
    machines: cloneRows(compiled.machines).map(machine => {
      const canonicalNodeId = compiled.runtimeIds.nodeIds.valueFor(machine.nodeId);
      const node = canonicalRuntimeNode(world, canonicalNodeId);
      return {
        ...machine,
        canonicalNodeId,
        inputPortIds: materialPortIds(node, 'input'),
        outputPortIds: materialPortIds(node, 'output'),
        outputTarget: machine.outputTarget ? { ...machine.outputTarget } : undefined,
        productTarget: machine.productTarget ? { ...machine.productTarget } : undefined,
      };
    }),
    passiveLinks: cloneRows(compiled.passiveLinks),
    boundaryTransfers: cloneRows(compiled.boundaryTransfers),
    thermalProperties: cloneRows(compiled.thermalProperties),
    comminution: {
      sizeBins: cloneRows(compiled.comminution.sizeBins),
      liberationClasses: cloneRows(compiled.comminution.liberationClasses),
      textures: cloneRows(compiled.comminution.textures),
      properties: cloneRows(compiled.comminution.properties),
      legacyLtOneMmId: compiled.comminution.legacyLtOneMmId,
    },
    separation: {
      sizeBins: cloneRows(compiled.separation.sizeBins),
      liberationClasses: cloneRows(compiled.separation.liberationClasses),
      magneticResponses: cloneRows(compiled.separation.magneticResponses),
    },
    reaction: {
      sourceSpeciesId: compiled.reaction.sourceSpeciesId,
      solidProductSpeciesId: compiled.reaction.solidProductSpeciesId,
      gasProductSpeciesId: compiled.reaction.gasProductSpeciesId,
      sourceMassPerExtentKg: compiled.reaction.sourceMassPerExtentKg,
      solidProductMassPerExtentKg: compiled.reaction.solidProductMassPerExtentKg,
      gasProductMassPerExtentKg: compiled.reaction.gasProductMassPerExtentKg,
      reactionEnthalpyJPerMolExtent: compiled.reaction.reactionEnthalpyJPerMolExtent,
      activationEnergyJPerMol: compiled.reaction.activationEnergyJPerMol,
      preExponentialFactorPerSecond: compiled.reaction.preExponentialFactorPerSecond,
      sizeFactors: cloneRows(compiled.reaction.sizeFactors),
      textureMappings: cloneRows(compiled.reaction.textureMappings),
    },
    furnaceStateSnapshots: compiled.furnaceStateSnapshots.map(snapshot => ({
      siteId: snapshot.siteId,
      nodeId: snapshot.nodeId,
      canonicalNodeId: snapshot.canonicalNodeId,
      zones: snapshot.packedZones.map(solidBodyWire),
      pendingFeed: solidBodyWire(snapshot.packedPendingFeed),
      gasInventory: gasBodyWire(snapshot.packedGasInventory),
    })),
    runtimeIds: {
      nodes: runtimeValues(compiled.runtimeIds.nodeIds),
      sites: runtimeValues(compiled.runtimeIds.siteIds),
      occurrences: runtimeValues(compiled.runtimeIds.occurrenceIds),
      transfers: runtimeValues(compiled.runtimeIds.transferIds),
    },
    materialIds: {
      species: runtimeValues(compiled.idTables.species),
      sizeBins: runtimeValues(compiled.idTables.sizeBin),
      liberationClasses: runtimeValues(compiled.idTables.liberationClass),
      textureProfiles: runtimeValues(compiled.idTables.textureProfile),
    },
  };
}

function populateMetadata(wasmWorld, setup) {
  for (const row of setup.thermalProperties) {
    wasmWorld.set_specific_heat_capacity_j_per_kg_k(row.runtimeId, row.specificHeatCapacityJPerKgK);
  }
  for (const row of setup.comminution.sizeBins) {
    wasmWorld.add_comminution_size_bin(
      row.runtimeId, row.orderIndex, row.maxMm, row.representativeMm, row.canonical,
    );
  }
  wasmWorld.set_comminution_legacy_lt_one_mm_id(setup.comminution.legacyLtOneMmId);
  for (const row of setup.comminution.liberationClasses) {
    wasmWorld.add_comminution_liberation_class(row.runtimeId, row.orderIndex);
  }
  for (const row of setup.comminution.textures) {
    wasmWorld.set_comminution_species_texture(
      row.textureProfileId, row.speciesId,
      row.d10Um, row.d50Um, row.d90Um,
      row.free, row.boundary, row.intergrown, row.included,
    );
  }
  for (const row of setup.comminution.properties) {
    wasmWorld.set_comminution_texture_properties(
      row.textureProfileId,
      row.bondCrushingWorkIndexKWhPerT,
      row.bondBallMillWorkIndexKWhPerT,
      row.bondAbrasionIndex,
    );
  }
  for (const row of setup.separation.sizeBins) {
    wasmWorld.add_separation_size_bin(row.runtimeId, row.maxMm, row.magneticSuitability);
  }
  for (const row of setup.separation.liberationClasses) {
    wasmWorld.add_separation_liberation_class(row.runtimeId, row.recoveryFactor);
  }
  for (const row of setup.separation.magneticResponses) {
    wasmWorld.set_species_magnetic_response(row.runtimeId, row.normalizedSeparationCoefficient);
  }

  const reaction = setup.reaction;
  wasmWorld.begin_goethite_reaction(
    reaction.sourceSpeciesId,
    reaction.solidProductSpeciesId,
    reaction.gasProductSpeciesId,
    reaction.sourceMassPerExtentKg,
    reaction.solidProductMassPerExtentKg,
    reaction.gasProductMassPerExtentKg,
    reaction.reactionEnthalpyJPerMolExtent,
    reaction.activationEnergyJPerMol,
    reaction.preExponentialFactorPerSecond,
  );
  for (const row of reaction.sizeFactors) {
    wasmWorld.set_reaction_size_factor(row.runtimeId, row.factor);
  }
  for (const row of reaction.textureMappings) {
    wasmWorld.set_reaction_product_texture_mapping(row.sourceRuntimeId, row.productRuntimeId);
  }
  wasmWorld.commit_goethite_reaction();
}

function populateMachine(wasmWorld, machine) {
  switch (machine.kind) {
    case 'extractor':
      wasmWorld.add_extractor(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.rateKgPerSecond, machine.enabled,
        machine.occurrenceId, machine.outputHopperId,
      );
      return;
    case 'merger':
      wasmWorld.add_merger(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.throughputKgPerSecond, machine.enabled,
        machine.inputAHopperId, machine.inputBHopperId, machine.outputHopperId,
      );
      return;
    case 'feeder':
      wasmWorld.add_feeder(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.flowRateKgPerSecond, machine.throughputKgPerSecond, machine.enabled,
        machine.inputHopperId, machine.outputTarget.kind, machine.outputTarget.id,
      );
      return;
    case 'comminution':
      wasmWorld.add_comminution(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.equipmentKind, machine.targetSizeId, machine.targetParticleSizeMm,
        machine.throughputKgPerSecond, machine.ratedPowerKw, machine.enabled,
        machine.inputHopperId, machine.outputHopperId,
      );
      return;
    case 'screen':
      wasmWorld.add_screen(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.apertureSizeMm, machine.throughputKgPerSecond, machine.enabled,
        machine.inputHopperId, machine.undersizeHopperId, machine.oversizeHopperId,
      );
      return;
    case 'splitter':
      wasmWorld.add_splitter(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.splitFractionToA, machine.throughputKgPerSecond, machine.enabled,
        machine.inputHopperId, machine.outputAHopperId, machine.outputBHopperId,
      );
      return;
    case 'magneticSeparator':
      wasmWorld.add_magnetic_separator(
        machine.siteId, machine.nodeId, machine.ordinal,
        machine.fieldStrength, machine.maxFeedParticleSizeMm,
        machine.throughputKgPerSecond, machine.enabled,
        machine.inputHopperId, machine.concentrateHopperId, machine.tailingsHopperId,
      );
      return;
    case 'roastingFurnace':
      wasmWorld.add_roasting_furnace(
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
      );
      return;
    default:
      throw new Error(`Unknown packed runtime machine kind '${machine.kind}'`);
  }
}

function flattenZones(zones) {
  const lengths = new Uint32Array(zones.length);
  let total = 0;
  for (let index = 0; index < zones.length; index++) {
    lengths[index] = zones[index].quantities.length;
    total += lengths[index];
  }
  const speciesIds = new Uint16Array(total);
  const sizeBinIds = new Uint8Array(total);
  const liberationClassIds = new Uint8Array(total);
  const textureProfileIds = new Uint32Array(total);
  const quantities = new Float64Array(total);
  const sensibleEnthalpiesJ = new Float64Array(zones.length);
  let offset = 0;
  zones.forEach((zone, zoneIndex) => {
    speciesIds.set(zone.speciesIds, offset);
    sizeBinIds.set(zone.sizeBinIds, offset);
    liberationClassIds.set(zone.liberationClassIds, offset);
    textureProfileIds.set(zone.textureProfileIds, offset);
    quantities.set(zone.quantities, offset);
    sensibleEnthalpiesJ[zoneIndex] = zone.sensibleEnthalpyJ;
    offset += zone.quantities.length;
  });
  return {
    lengths,
    speciesIds,
    sizeBinIds,
    liberationClassIds,
    textureProfileIds,
    quantities,
    sensibleEnthalpiesJ,
  };
}

/** Populate and atomically restore one Rust-owned world inside a Worker. */
export function populateWasmPackedWorldRuntimeFromWorkerSetup(wasmWorld, setup) {
  if (!wasmWorld || typeof wasmWorld.add_site !== 'function') {
    throw new Error('WASM packed world runtime is required');
  }

  for (const site of setup.sites) wasmWorld.add_site(site.siteId);
  for (const hopper of setup.hoppers) {
    wasmWorld.add_hopper_state(
      hopper.nodeId, hopper.capacityKg,
      hopper.body.speciesIds, hopper.body.sizeBinIds,
      hopper.body.liberationClassIds, hopper.body.textureProfileIds,
      hopper.body.quantities, hopper.body.sensibleEnthalpyJ,
    );
  }
  for (const occurrence of setup.occurrences) {
    wasmWorld.add_occurrence_state(
      occurrence.occurrenceId,
      occurrence.speciesIds, occurrence.sizeBinIds,
      occurrence.liberationClassIds, occurrence.textureProfileIds,
      occurrence.quantitiesPerKg,
      occurrence.reserveMassKg != null,
      occurrence.reserveMassKg ?? 0,
    );
  }
  for (const vent of setup.exhaustVents) {
    wasmWorld.add_exhaust_vent_state(
      vent.nodeId, vent.body.speciesIds, vent.body.quantities, vent.body.sensibleEnthalpyJ,
    );
  }

  populateMetadata(wasmWorld, setup);
  for (const machine of setup.machines) populateMachine(wasmWorld, machine);
  for (const link of setup.passiveLinks) {
    wasmWorld.add_site_passive_storage_link(
      link.siteId, link.sourceHopperId, link.targetHopperId, link.rateKgPerSecond,
    );
  }
  for (const transfer of setup.boundaryTransfers) {
    wasmWorld.add_boundary_transfer(
      transfer.transferId,
      transfer.sourceHopperId,
      transfer.targetHopperId,
      transfer.capacityKgPerSecond,
      transfer.priority,
      transfer.ordinal,
    );
  }

  wasmWorld.import_world_elapsed_seconds(setup.elapsedSeconds);
  for (const site of setup.sites) {
    wasmWorld.import_site_stats(site.siteId, site.elapsedSeconds, site.extractedKg);
  }
  for (const furnace of setup.furnaceStateSnapshots) {
    const zones = flattenZones(furnace.zones);
    wasmWorld.import_roasting_furnace_state(
      furnace.nodeId,
      zones.lengths,
      zones.speciesIds,
      zones.sizeBinIds,
      zones.liberationClassIds,
      zones.textureProfileIds,
      zones.quantities,
      zones.sensibleEnthalpiesJ,
      furnace.pendingFeed.speciesIds,
      furnace.pendingFeed.sizeBinIds,
      furnace.pendingFeed.liberationClassIds,
      furnace.pendingFeed.textureProfileIds,
      furnace.pendingFeed.quantities,
      furnace.pendingFeed.sensibleEnthalpyJ,
      furnace.gasInventory.speciesIds,
      furnace.gasInventory.quantities,
      furnace.gasInventory.sensibleEnthalpyJ,
    );
  }

  if (!setup.running) wasmWorld.pause();
  wasmWorld.seal();
  return wasmWorld;
}

function outputCount(machine) {
  return ['screen', 'splitter', 'magneticSeparator', 'roastingFurnace'].includes(machine.kind) ? 2 : 1;
}

/** Compact presentation/debug snapshot; packed physical truth stays in WASM. */
export function snapshotWasmPackedWorldRuntime(wasmWorld, setup) {
  return {
    running: wasmWorld.running(),
    elapsedSeconds: wasmWorld.elapsed_seconds(),
    sites: setup.sites.map(site => ({
      id: site.canonicalSiteId,
      elapsedSeconds: wasmWorld.site_elapsed_seconds(site.siteId),
      extractedKg: wasmWorld.site_extracted_kg(site.siteId),
    })),
    hoppers: setup.hoppers.map(hopper => ({
      id: hopper.canonicalNodeId,
      storedMassKg: wasmWorld.hopper_stored_mass_kg(hopper.nodeId),
      sensibleEnthalpyJ: wasmWorld.hopper_sensible_enthalpy_j(hopper.nodeId),
    })),
    occurrences: setup.occurrences.map(occurrence => ({
      id: occurrence.canonicalOccurrenceId,
      extractedMassKg: wasmWorld.occurrence_extracted_mass_kg(occurrence.occurrenceId),
      remainingMassKg: wasmWorld.occurrence_remaining_mass_kg(occurrence.occurrenceId),
    })),
    exhaustVents: setup.exhaustVents.map(vent => ({
      id: vent.canonicalNodeId,
      ventedGasMassKg: wasmWorld.vented_gas_mass_kg(vent.nodeId),
    })),
    machines: setup.machines.map(machine => {
      const snapshot = {
        id: setup.runtimeIds.nodes[machine.nodeId] ?? null,
        operatingState: wasmWorld.node_operating_state(machine.nodeId),
        lastError: wasmWorld.node_last_error(machine.nodeId),
        inputMassFlowKgPerSecond: machine.inputPortIds.map(
          (_, index) => wasmWorld.node_input_mass_flow_kg_per_second(machine.nodeId, index),
        ),
        outputMassFlowKgPerSecond: Array.from(
          { length: outputCount(machine) },
          (_, index) => wasmWorld.node_output_mass_flow_kg_per_second(machine.nodeId, index),
        ),
      };
      if (machine.kind === 'roastingFurnace') {
        snapshot.furnace = {
          actualChargeTemperatureK: wasmWorld.furnace_actual_charge_temperature_k(machine.nodeId),
          lastHeaterPowerKw: wasmWorld.furnace_last_heater_power_kw(machine.nodeId),
          lastReactionPowerKw: wasmWorld.furnace_last_reaction_power_kw(machine.nodeId),
          chargeMassKg: wasmWorld.furnace_charge_mass_kg(machine.nodeId),
          pendingFeedMassKg: wasmWorld.furnace_pending_feed_mass_kg(machine.nodeId),
        };
      }
      return snapshot;
    }),
    boundaryTransfers: setup.boundaryTransfers.map(transfer => ({
      id: transfer.canonicalTransferId,
      lastMovedKg: wasmWorld.boundary_last_moved_kg(transfer.transferId),
      lastRateKgPerSecond: wasmWorld.boundary_last_rate_kg_per_second(transfer.transferId),
    })),
  };
}
