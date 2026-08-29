import { specificHeatCapacityJPerKgKForSpecies } from '../core/materials/properties/thermalProperties.js';
import { getMaterialSpecies } from '../core/materials/species/materialSpecies.js';
import { resolveBoundaryChain } from '../core/systems/systemNode.js';
import { compileComminutionTablesForRuntime } from './packedComminutionCompiler.js';
import { compileExtractableWorldOccurrencesForRuntime } from './packedExtractionCompiler.js';
import { extractorOutputRates } from './extractorNode.js';
import {
  compileGasMaterialBodyForRuntime,
} from './packedThermalGasCompiler.js';
import {
  compileGoethiteReactionTablesForRuntime,
  compileRoastingFurnaceForRuntime,
} from './packedRoastingCompiler.js';
import {
  compileHopperForRuntime,
  createPackedMaterialIdTables,
} from './packedRuntimeCompiler.js';
import { compileSeparationTablesForRuntime } from './packedSeparationCompiler.js';
import {
  createWorldSimulation,
  DEFAULT_BOUNDARY_TRANSFER_RATE_KG_PER_SECOND,
} from './worldSimulation.js';

export const PACKED_NO_RUNTIME_ID = 0xffffffff;
export const PACKED_SOLID_TARGET_NONE = 0;
export const PACKED_SOLID_TARGET_HOPPER = 1;
export const PACKED_SOLID_TARGET_FURNACE = 2;

const DEFAULT_PASSIVE_STORAGE_TRANSFER_KG_PER_SECOND = 10;

const COMMINUTION_KIND = Object.freeze({
  crusher: 0,
  jawCrusher: 1,
  coneCrusher: 2,
  ballMill: 3,
});

class RuntimeObjectIdTable {
  constructor(label) {
    this.label = label;
    this.ids = new Map();
    this.values = [];
    this.sealed = false;
  }

  idFor(value) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${this.label} runtime identity requires a non-empty canonical string`);
    }
    const existing = this.ids.get(value);
    if (existing != null) return existing;
    if (this.sealed) return PACKED_NO_RUNTIME_ID;
    const id = this.values.length;
    if (id >= PACKED_NO_RUNTIME_ID) throw new Error(`${this.label} runtime ID table capacity exceeded`);
    this.ids.set(value, id);
    this.values.push(value);
    return id;
  }

  valueFor(id) {
    return this.values[id] ?? null;
  }

  seal() {
    this.sealed = true;
  }
}

function connectionValues(blueprint) {
  return Object.values(blueprint?.connections ?? {});
}

function inboundConnection(blueprint, nodeId, portId) {
  return connectionValues(blueprint).find(connection => (
    connection.targetNodeId === nodeId && connection.targetPortId === portId
  )) ?? null;
}

function outboundConnection(blueprint, nodeId, portId) {
  return connectionValues(blueprint).find(connection => (
    connection.sourceNodeId === nodeId && connection.sourcePortId === portId
  )) ?? null;
}

function nodeForConnection(blueprint, connection, side) {
  if (!connection) return null;
  const id = side === 'source' ? connection.sourceNodeId : connection.targetNodeId;
  return blueprint.nodes?.[id] ?? null;
}

function endpointIdForNode(node, nodeIds, expectedType = null) {
  if (!node || (expectedType && node.nodeType !== expectedType)) return PACKED_NO_RUNTIME_ID;
  return nodeIds.idFor(node.id);
}

function solidTargetForNode(node, nodeIds) {
  if (!node) return { kind: PACKED_SOLID_TARGET_NONE, id: PACKED_NO_RUNTIME_ID };
  if (node.nodeType === 'hopper') {
    return { kind: PACKED_SOLID_TARGET_HOPPER, id: nodeIds.idFor(node.id) };
  }
  if (node.nodeType === 'roastingFurnace') {
    return { kind: PACKED_SOLID_TARGET_FURNACE, id: nodeIds.idFor(node.id) };
  }
  return { kind: PACKED_SOLID_TARGET_NONE, id: PACKED_NO_RUNTIME_ID };
}

function collectRuntimeNodes(simulation) {
  const byCanonicalId = new Map();
  const addWorkspace = workspace => {
    for (const node of Object.values(workspace?.nodes ?? {})) {
      if (!node?.id) continue;
      const existing = byCanonicalId.get(node.id);
      if (existing && existing !== node && existing.nodeType !== node.nodeType) {
        throw new Error(`canonical runtime node '${node.id}' has conflicting definitions`);
      }
      byCanonicalId.set(node.id, node);
    }
  };
  for (const blueprint of Object.values(simulation.sessions ?? {})) addWorkspace(blueprint);
  for (const workspace of Object.values(simulation.workspaces ?? {})) addWorkspace(workspace);
  return [...byCanonicalId.values()];
}

function collectCanonicalSolidStates(world, runtimeNodes) {
  const states = [];
  for (const node of runtimeNodes) {
    if (node.nodeType === 'hopper' && node.materialBody?.solidState) {
      states.push(node.materialBody.solidState);
    }
    if (node.nodeType === 'roastingFurnace') {
      for (const zone of node.zones ?? []) if (zone?.solidState) states.push(zone.solidState);
      if (node.pendingFeed?.solidState) states.push(node.pendingFeed.solidState);
    }
  }
  for (const occurrence of Object.values(world.resourceOccurrences ?? {})) {
    try {
      states.push(extractorOutputRates({ prototypeRateKgPerSecond: 1 }, occurrence, 1));
    } catch {
      // Unsupported physical forms are intentionally outside the solid runtime.
    }
  }
  return states;
}

function combinedTextureState(states, derivedTextureProfiles = {}) {
  const textureProfiles = {};
  for (const state of states) {
    for (const [profileId, profile] of Object.entries(state?.textureProfiles ?? {})) {
      textureProfiles[profileId] ??= profile;
    }
  }
  for (const [profileId, profile] of Object.entries(derivedTextureProfiles)) {
    textureProfiles[profileId] ??= profile;
  }
  return { fractions: {}, textureProfiles };
}

function compiledThermalProperties(idTables) {
  const rows = [];
  for (let runtimeId = 0; runtimeId < idTables.species.values.length; runtimeId += 1) {
    const canonicalId = idTables.species.valueFor(runtimeId);
    if (canonicalId == null) continue;
    const cp = specificHeatCapacityJPerKgKForSpecies(getMaterialSpecies(canonicalId));
    if (cp == null) continue;
    rows.push({ runtimeId, canonicalId, specificHeatCapacityJPerKgK: cp });
  }
  return rows;
}

function compileStoredState(runtimeNodes, nodeIds, idTables) {
  const hoppers = [];
  const exhaustVents = [];
  for (const node of runtimeNodes) {
    if (node.nodeType === 'hopper') {
      const { packedHopper } = compileHopperForRuntime(node, idTables);
      hoppers.push({
        nodeId: nodeIds.idFor(node.id),
        canonicalNodeId: node.id,
        capacityKg: packedHopper.capacityKg,
        packedBody: packedHopper.body,
      });
    } else if (node.nodeType === 'exhaustVent') {
      const { packedGasBody } = compileGasMaterialBodyForRuntime(node.emittedGasBody, idTables);
      exhaustVents.push({
        nodeId: nodeIds.idFor(node.id),
        canonicalNodeId: node.id,
        packedGasBody,
      });
    }
  }
  return { hoppers, exhaustVents };
}

function compileSiteMachines(blueprint, siteId, nodeIds, occurrenceIds, comminutionMetadata) {
  const machines = [];
  const passiveLinks = [];
  const nodes = Object.values(blueprint.nodes ?? {});

  nodes.forEach((node, ordinal) => {
    const nodeId = nodeIds.idFor(node.id);
    switch (node.nodeType) {
      case 'extractor': {
        const sourceConnection = inboundConnection(blueprint, node.id, node.sourceInputPortId ?? 'resource-source');
        const outputConnection = outboundConnection(blueprint, node.id, node.outputPortId ?? 'output');
        const outputNode = nodeForConnection(blueprint, outputConnection, 'target');
        machines.push({
          kind: 'extractor', siteId, nodeId, ordinal,
          rateKgPerSecond: node.prototypeRateKgPerSecond ?? node.rateKgPerSecond ?? 5,
          enabled: Boolean(node.enabled),
          occurrenceId: sourceConnection?.occurrenceId
            ? occurrenceIds.idFor(sourceConnection.occurrenceId)
            : PACKED_NO_RUNTIME_ID,
          outputHopperId: endpointIdForNode(outputNode, nodeIds, 'hopper'),
        });
        break;
      }
      case 'merger': {
        const a = nodeForConnection(blueprint, inboundConnection(blueprint, node.id, node.inputAPortId ?? 'input-a'), 'source');
        const b = nodeForConnection(blueprint, inboundConnection(blueprint, node.id, node.inputBPortId ?? 'input-b'), 'source');
        const out = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.outputPortId ?? 'product'), 'target');
        machines.push({
          kind: 'merger', siteId, nodeId, ordinal,
          throughputKgPerSecond: node.throughputKgPerSecond,
          enabled: Boolean(node.enabled),
          inputAHopperId: endpointIdForNode(a, nodeIds, 'hopper'),
          inputBHopperId: endpointIdForNode(b, nodeIds, 'hopper'),
          outputHopperId: endpointIdForNode(out, nodeIds, 'hopper'),
        });
        break;
      }
      case 'feeder': {
        const input = nodeForConnection(blueprint, inboundConnection(blueprint, node.id, node.inputPortId ?? 'feed'), 'source');
        const output = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.outputPortId ?? 'product'), 'target');
        machines.push({
          kind: 'feeder', siteId, nodeId, ordinal,
          flowRateKgPerSecond: node.flowRateKgPerSecond ?? 0,
          throughputKgPerSecond: node.throughputKgPerSecond,
          enabled: Boolean(node.enabled),
          inputHopperId: endpointIdForNode(input, nodeIds, 'hopper'),
          outputTarget: solidTargetForNode(output, nodeIds),
        });
        break;
      }
      case 'crusher':
      case 'jawCrusher':
      case 'coneCrusher':
      case 'ballMill': {
        const input = nodeForConnection(blueprint, inboundConnection(blueprint, node.id, node.inputPortId ?? 'feed'), 'source');
        const output = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.outputPortId ?? 'product'), 'target');
        const targetParticleSizeMm = node.targetParticleSizeMm;
        machines.push({
          kind: 'comminution', siteId, nodeId, ordinal,
          equipmentKind: COMMINUTION_KIND[node.nodeType],
          targetSizeId: comminutionMetadata.runtimeSizeBinIdForMm(targetParticleSizeMm),
          targetParticleSizeMm,
          throughputKgPerSecond: node.throughputKgPerSecond,
          ratedPowerKw: node.ratedPowerKw ?? 0,
          enabled: Boolean(node.enabled),
          inputHopperId: endpointIdForNode(input, nodeIds, 'hopper'),
          outputHopperId: endpointIdForNode(output, nodeIds, 'hopper'),
        });
        break;
      }
      case 'screen': {
        const input = nodeForConnection(blueprint, inboundConnection(blueprint, node.id, node.inputPortId ?? 'feed'), 'source');
        const under = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.undersizePortId ?? 'undersize'), 'target');
        const over = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.oversizePortId ?? 'oversize'), 'target');
        machines.push({
          kind: 'screen', siteId, nodeId, ordinal,
          apertureSizeMm: node.apertureSizeMm,
          throughputKgPerSecond: node.throughputKgPerSecond,
          enabled: Boolean(node.enabled),
          inputHopperId: endpointIdForNode(input, nodeIds, 'hopper'),
          undersizeHopperId: endpointIdForNode(under, nodeIds, 'hopper'),
          oversizeHopperId: endpointIdForNode(over, nodeIds, 'hopper'),
        });
        break;
      }
      case 'splitter': {
        const input = nodeForConnection(blueprint, inboundConnection(blueprint, node.id, node.inputPortId ?? 'feed'), 'source');
        const a = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.outputAPortId ?? 'output-a'), 'target');
        const b = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.outputBPortId ?? 'output-b'), 'target');
        machines.push({
          kind: 'splitter', siteId, nodeId, ordinal,
          splitFractionToA: node.splitFractionToA,
          throughputKgPerSecond: node.throughputKgPerSecond,
          enabled: Boolean(node.enabled),
          inputHopperId: endpointIdForNode(input, nodeIds, 'hopper'),
          outputAHopperId: endpointIdForNode(a, nodeIds, 'hopper'),
          outputBHopperId: endpointIdForNode(b, nodeIds, 'hopper'),
        });
        break;
      }
      case 'magSep': {
        const input = nodeForConnection(blueprint, inboundConnection(blueprint, node.id, node.inputPortId ?? 'feed'), 'source');
        const concentrate = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.concentratePortId ?? 'concentrate'), 'target');
        const tailings = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.tailingsPortId ?? 'tailings'), 'target');
        machines.push({
          kind: 'magneticSeparator', siteId, nodeId, ordinal,
          fieldStrength: node.fieldStrength,
          maxFeedParticleSizeMm: node.maxFeedParticleSizeMm,
          throughputKgPerSecond: node.throughputKgPerSecond,
          enabled: Boolean(node.enabled),
          inputHopperId: endpointIdForNode(input, nodeIds, 'hopper'),
          concentrateHopperId: endpointIdForNode(concentrate, nodeIds, 'hopper'),
          tailingsHopperId: endpointIdForNode(tailings, nodeIds, 'hopper'),
        });
        break;
      }
      case 'roastingFurnace': {
        const product = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.solidProductPortId ?? 'solid-product'), 'target');
        const gas = nodeForConnection(blueprint, outboundConnection(blueprint, node.id, node.gasExhaustPortId ?? 'gas-exhaust'), 'target');
        machines.push({
          kind: 'roastingFurnace', siteId, nodeId, ordinal,
          temperatureSetpointK: node.temperatureSetpointK,
          ratedHeaterPowerKw: node.ratedHeaterPowerKw,
          maximumOperatingTemperatureK: node.maximumOperatingTemperatureK,
          maximumSolidThroughputKgPerSecond: node.maximumSolidThroughputKgPerSecond,
          effectiveChamberHoldUpKg: node.effectiveChamberHoldUpKg,
          heatLossCoefficientWPerK: node.heatLossCoefficientWPerK,
          internalZoneCount: node.internalZoneCount,
          enabled: Boolean(node.enabled),
          productTarget: solidTargetForNode(product, nodeIds),
          gasVentId: endpointIdForNode(gas, nodeIds, 'exhaustVent'),
        });
        break;
      }
      default:
        break;
    }
  });

  for (const connection of connectionValues(blueprint)) {
    if (connection.kind !== 'material') continue;
    const source = blueprint.nodes?.[connection.sourceNodeId];
    const target = blueprint.nodes?.[connection.targetNodeId];
    if (source?.nodeType !== 'hopper' || target?.nodeType !== 'hopper') continue;
    if (source.boundaryRole !== 'import' && target.boundaryRole !== 'export') continue;
    passiveLinks.push({
      siteId,
      sourceHopperId: nodeIds.idFor(source.id),
      targetHopperId: nodeIds.idFor(target.id),
      rateKgPerSecond: DEFAULT_PASSIVE_STORAGE_TRANSFER_KG_PER_SECOND,
    });
  }

  return { machines, passiveLinks };
}

function resolveBoundaryHopper(world, simulation, compositeId, portId, direction) {
  const composite = world.systemNodes?.[compositeId];
  if (!composite) return null;
  const resolved = resolveBoundaryChain(composite, portId, simulation.workspaces);
  if (!resolved.boundaryPort || resolved.boundaryPort.direction !== direction) return null;
  return resolved.node?.nodeType === 'hopper' ? resolved.node : null;
}

/**
 * Compile the currently registered world/Site simulation into one numeric setup
 * snapshot for `WasmPackedWorldRuntime`. This is deliberately a setup boundary:
 * the returned runtime uses numeric IDs, packed material state, and precompiled
 * physical-property tables, while canonical strings stay here for diagnostics.
 */
export function compilePackedWorldRuntime(
  world,
  idTables = createPackedMaterialIdTables(),
) {
  const simulation = createWorldSimulation(world);
  const nodeIds = new RuntimeObjectIdTable('node');
  const siteIds = new RuntimeObjectIdTable('Site');
  const occurrenceIds = new RuntimeObjectIdTable('ResourceOccurrence');
  const transferIds = new RuntimeObjectIdTable('boundary transfer');

  const occurrenceCompilation = compileExtractableWorldOccurrencesForRuntime(world, idTables);
  const compiledOccurrences = [];
  for (const [canonicalId, occurrence] of Object.entries(occurrenceCompilation.occurrences)) {
    compiledOccurrences.push({
      occurrenceId: occurrenceIds.idFor(canonicalId),
      canonicalOccurrenceId: canonicalId,
      ...occurrence,
    });
  }
  // Only solid occurrences supported by the current Extractor are executable
  // runtime identities. Once sealed, liquid/gas or otherwise unsupported sources
  // resolve to PACKED_NO_RUNTIME_ID and therefore keep the Extractor blocked.
  occurrenceIds.seal();

  const runtimeNodes = collectRuntimeNodes(simulation);
  const stored = compileStoredState(runtimeNodes, nodeIds, idTables);
  const solidStates = collectCanonicalSolidStates(world, runtimeNodes);
  const reaction = compileGoethiteReactionTablesForRuntime(solidStates, idTables);
  const textureState = combinedTextureState(solidStates, reaction.derivedTextureProfiles);
  const comminution = compileComminutionTablesForRuntime(textureState, idTables);
  const separation = compileSeparationTablesForRuntime(idTables);
  const thermalProperties = compiledThermalProperties(idTables);

  const sites = [];
  const machines = [];
  const passiveLinks = [];
  for (const [canonicalSiteId, blueprint] of Object.entries(simulation.sessions ?? {})) {
    const siteId = siteIds.idFor(canonicalSiteId);
    sites.push({
      siteId,
      canonicalSiteId,
      elapsedSeconds: blueprint?.simulationStats?.elapsedSeconds ?? 0,
      extractedKg: blueprint?.simulationStats?.extractedKg ?? 0,
    });
    const compiled = compileSiteMachines(blueprint, siteId, nodeIds, occurrenceIds, comminution);
    machines.push(...compiled.machines);
    passiveLinks.push(...compiled.passiveLinks);
  }

  const boundaryTransfers = Object.values(simulation.transfers ?? {})
    .slice()
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .map((transfer, ordinal) => {
      const source = resolveBoundaryHopper(
        world,
        simulation,
        transfer.sourceCompositeId,
        transfer.sourcePortId,
        'output',
      );
      const target = resolveBoundaryHopper(
        world,
        simulation,
        transfer.targetCompositeId,
        transfer.targetPortId,
        'input',
      );
      if (!source || !target) {
        throw new Error(`Boundary transfer '${transfer.id}' does not resolve to Hopper endpoints`);
      }
      return {
        transferId: transferIds.idFor(transfer.id),
        canonicalTransferId: transfer.id,
        sourceHopperId: nodeIds.idFor(source.id),
        targetHopperId: nodeIds.idFor(target.id),
        capacityKgPerSecond: transfer.capacityKgPerSecond
          ?? DEFAULT_BOUNDARY_TRANSFER_RATE_KG_PER_SECOND,
        priority: transfer.priority ?? 0,
        ordinal,
      };
    });

  // Furnace retained-zone state is compiled and retained in the setup snapshot,
  // but is intentionally not applied by this PR's WASM adapter yet. The next
  // Worker cutover will import the entire world atomically rather than introducing
  // a per-zone/per-fraction live synchronization protocol.
  const furnaceStateSnapshots = [];
  for (const [canonicalSiteId, blueprint] of Object.entries(simulation.sessions ?? {})) {
    for (const node of Object.values(blueprint.nodes ?? {})) {
      if (node.nodeType !== 'roastingFurnace') continue;
      const snapshot = compileRoastingFurnaceForRuntime(node, idTables);
      furnaceStateSnapshots.push({
        siteId: siteIds.idFor(canonicalSiteId),
        nodeId: nodeIds.idFor(node.id),
        canonicalNodeId: node.id,
        packedZones: snapshot.packedZones,
        packedPendingFeed: snapshot.packedPendingFeed,
        packedGasInventory: snapshot.packedGasInventory,
      });
    }
  }

  return {
    running: Boolean(simulation.running),
    elapsedSeconds: simulation.elapsedSeconds ?? 0,
    sites,
    hoppers: stored.hoppers,
    occurrences: compiledOccurrences,
    unsupportedOccurrences: occurrenceCompilation.unsupported,
    exhaustVents: stored.exhaustVents,
    machines,
    passiveLinks,
    boundaryTransfers,
    thermalProperties,
    comminution,
    separation,
    reaction,
    furnaceStateSnapshots,
    deferredStateImport: {
      worldElapsedSeconds: simulation.elapsedSeconds ?? 0,
      siteStats: sites.map(site => ({
        siteId: site.siteId,
        elapsedSeconds: site.elapsedSeconds,
        extractedKg: site.extractedKg,
      })),
      furnaceStateSnapshots,
    },
    runtimeIds: { nodeIds, siteIds, occurrenceIds, transferIds },
    idTables,
  };
}

function solidColumns(body) {
  return body.solidState.toColumns();
}

function gasColumns(body) {
  return body.gasState.toColumns();
}

function populateMetadata(wasmWorld, compiled) {
  for (const row of compiled.thermalProperties) {
    wasmWorld.set_specific_heat_capacity_j_per_kg_k(
      row.runtimeId,
      row.specificHeatCapacityJPerKgK,
    );
  }
  for (const row of compiled.comminution.sizeBins) {
    wasmWorld.add_comminution_size_bin(
      row.runtimeId, row.orderIndex, row.maxMm, row.representativeMm, row.canonical,
    );
  }
  wasmWorld.set_comminution_legacy_lt_one_mm_id(compiled.comminution.legacyLtOneMmId);
  for (const row of compiled.comminution.liberationClasses) {
    wasmWorld.add_comminution_liberation_class(row.runtimeId, row.orderIndex);
  }
  for (const row of compiled.comminution.textures) {
    wasmWorld.set_comminution_species_texture(
      row.textureProfileId, row.speciesId,
      row.d10Um, row.d50Um, row.d90Um,
      row.free, row.boundary, row.intergrown, row.included,
    );
  }
  for (const row of compiled.comminution.properties) {
    wasmWorld.set_comminution_texture_properties(
      row.textureProfileId,
      row.bondCrushingWorkIndexKWhPerT,
      row.bondBallMillWorkIndexKWhPerT,
      row.bondAbrasionIndex,
    );
  }
  for (const row of compiled.separation.sizeBins) {
    wasmWorld.add_separation_size_bin(row.runtimeId, row.maxMm, row.magneticSuitability);
  }
  for (const row of compiled.separation.liberationClasses) {
    wasmWorld.add_separation_liberation_class(row.runtimeId, row.recoveryFactor);
  }
  for (const row of compiled.separation.magneticResponses) {
    wasmWorld.set_species_magnetic_response(row.runtimeId, row.normalizedSeparationCoefficient);
  }

  const reaction = compiled.reaction;
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

/**
 * Populate one newly-created `WasmPackedWorldRuntime`. Normal fixed-step play is
 * one WASM call after this setup pass. Clock/furnace retained-state import is
 * intentionally deferred to the Worker cutover so the transition can be atomic.
 */
export function populateWasmPackedWorldRuntime(wasmWorld, compiled) {
  if (!wasmWorld || typeof wasmWorld.add_site !== 'function') {
    throw new Error('WASM packed world runtime is required');
  }

  for (const site of compiled.sites) wasmWorld.add_site(site.siteId);

  for (const hopper of compiled.hoppers) {
    const columns = solidColumns(hopper.packedBody);
    wasmWorld.add_hopper_state(
      hopper.nodeId,
      hopper.capacityKg,
      columns.speciesIds,
      columns.sizeBinIds,
      columns.liberationClassIds,
      columns.textureProfileIds,
      columns.quantities,
      hopper.packedBody.sensibleEnthalpyJ,
    );
  }

  for (const occurrence of compiled.occurrences) {
    const columns = occurrence.materialPerKg.toColumns();
    wasmWorld.add_occurrence_state(
      occurrence.occurrenceId,
      columns.speciesIds,
      columns.sizeBinIds,
      columns.liberationClassIds,
      columns.textureProfileIds,
      columns.quantities,
      occurrence.reserveMassKg != null,
      occurrence.reserveMassKg ?? 0,
    );
  }

  for (const vent of compiled.exhaustVents) {
    const columns = gasColumns(vent.packedGasBody);
    wasmWorld.add_exhaust_vent_state(
      vent.nodeId,
      columns.speciesIds,
      columns.quantities,
      vent.packedGasBody.sensibleEnthalpyJ,
    );
  }

  populateMetadata(wasmWorld, compiled);
  for (const machine of compiled.machines) populateMachine(wasmWorld, machine);
  for (const link of compiled.passiveLinks) {
    wasmWorld.add_site_passive_storage_link(
      link.siteId, link.sourceHopperId, link.targetHopperId, link.rateKgPerSecond,
    );
  }
  for (const transfer of compiled.boundaryTransfers) {
    wasmWorld.add_boundary_transfer(
      transfer.transferId,
      transfer.sourceHopperId,
      transfer.targetHopperId,
      transfer.capacityKgPerSecond,
      transfer.priority,
      transfer.ordinal,
    );
  }
  if (!compiled.running) wasmWorld.pause();
  wasmWorld.seal();
  return {
    runtime: wasmWorld,
    deferredStateImport: compiled.deferredStateImport,
  };
}
