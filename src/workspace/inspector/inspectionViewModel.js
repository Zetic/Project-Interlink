import {
  hopperCompositionKg,
  hopperFreeCapacityKg,
  hopperLiberationDistributionKg,
  hopperParticleSizeDistributionKg,
  hopperStoredMassKg,
} from '../../simulation/hopperNode.js';
import { totalMaterialStreamMassFlowKgPerSecond } from '../../simulation/materialStream.js';
import {
  createSolidMaterialBody,
  summarizeSolidMaterialByLiberationClass,
  summarizeSolidMaterialBySizeBin,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
} from '../../core/materials/solids/solidMaterialState.js';
import {
  createGasMaterialBody,
  createGasMaterialState,
  totalGasMassKg,
} from '../../core/materials/gas/gasMaterialState.js';
import {
  materialBodyHeatCapacityJPerK,
  materialBodyTemperatureK,
} from '../../core/materials/thermal/thermalMaterial.js';
import { getParticleSizeBin } from '../../core/materials/solids/particleSizeBins.js';
import { getLiberationClass } from '../../core/materials/solids/liberationClasses.js';
import { getMaterialSpecies } from '../../core/materials/species/materialSpecies.js';
import { MATERIAL_FORMS } from '../../core/materials/materialForms.js';
import { getNodeOperatingState } from '../../simulation/simulationEngine.js';
import { apparatusParametersForNode, getApparatusDefinition } from '../../content/apparatus/definitions.js';
import {
  roastingFurnaceChargeMassKg,
  roastingFurnacePendingFeedMassKg,
  roastingFurnaceZoneCapacityKg,
} from '../../simulation/apparatus/roastingFurnace.js';

// The workspace is rendered from requestAnimationFrame while physical state
// advances at a fixed lower rate. These caches prevent unchanged authoritative
// material from being re-summarized and re-validated on every display frame.
// They are presentation caches only; simulation truth remains on the bodies.
const HOPPER_INSPECTION_CACHE = new WeakMap();
const STREAM_INSPECTION_CACHE = new WeakMap();
const FURNACE_ZONE_INSPECTION_CACHE = new WeakMap();
const EXHAUST_BODY_INSPECTION_CACHE = new WeakMap();

function summaryRows(summary, total, labelFor) {
  return Object.entries(summary ?? {})
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, quantity]) => ({
      id,
      label: labelFor(id),
      quantity,
      massKg: quantity,
      componentId: id,
      percentage: total > 0 ? (quantity / total) * 100 : 0,
    }));
}

function summaryObject(summary) {
  return { ...(summary ?? {}) };
}

function speciesLabel(speciesId) {
  return getMaterialSpecies(speciesId)?.name ?? speciesId;
}

function sizeBinLabel(sizeBinId) {
  return getParticleSizeBin(sizeBinId)?.name ?? sizeBinId;
}

function liberationLabel(liberationClassId) {
  return getLiberationClass(liberationClassId)?.name ?? liberationClassId;
}

function thermalDetailsForBody(body, mass) {
  if (!body || mass <= 0) {
    return { temperatureK: null, sensibleEnthalpyJ: body?.thermalState?.sensibleEnthalpyJ ?? 0, thermalError: null };
  }
  try {
    // Deliberately resolve heat capacity even when sensible enthalpy is zero so
    // the Inspector does not present an apparently characterized temperature
    // for species that lack thermal-property coverage.
    materialBodyHeatCapacityJPerK(body);
    return {
      temperatureK: materialBodyTemperatureK(body),
      sensibleEnthalpyJ: body.thermalState?.sensibleEnthalpyJ ?? 0,
      thermalError: null,
    };
  } catch (error) {
    return {
      temperatureK: null,
      sensibleEnthalpyJ: body.thermalState?.sensibleEnthalpyJ ?? 0,
      thermalError: error.message,
    };
  }
}

function streamThermalDetails(stream, totalFlowKgPerSecond) {
  if (!stream || totalFlowKgPerSecond <= 0) {
    return { temperatureK: null, specificSensibleEnthalpyJPerKg: stream?.specificSensibleEnthalpyJPerKg ?? 0, thermalError: null };
  }
  const sensibleEnthalpyFlowJPerSecond = totalFlowKgPerSecond * (stream.specificSensibleEnthalpyJPerKg ?? 0);
  const body = stream.physicalForm === MATERIAL_FORMS.GAS
    ? createGasMaterialBody(
      createGasMaterialState(stream.gasState?.speciesMassKg ?? {}),
      { sensibleEnthalpyJ: sensibleEnthalpyFlowJPerSecond },
    )
    : createSolidMaterialBody(
      stream.solidState,
      { sensibleEnthalpyJ: sensibleEnthalpyFlowJPerSecond },
    );
  const details = thermalDetailsForBody(body, totalFlowKgPerSecond);
  return {
    temperatureK: details.temperatureK,
    specificSensibleEnthalpyJPerKg: stream.specificSensibleEnthalpyJPerKg ?? 0,
    thermalError: details.thermalError,
  };
}

function occurrenceMineralDensityKgPerM3(occurrence) {
  const entries = Object.entries(occurrence?.composition ?? {});
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  if (total <= 0) return null;
  let specificVolume = 0;
  for (const [speciesId, amount] of entries) {
    const density = getMaterialSpecies(speciesId)?.physicalProperties?.densityKgPerM3;
    if (!density) return null;
    specificVolume += (amount / total) / density;
  }
  return specificVolume > 0 ? 1 / specificVolume : null;
}

function occurrencePropertyDetails(occurrence) {
  const properties = [];
  const comminution = occurrence?.comminutionProperties;
  if (comminution) {
    properties.push(
      { id: 'bond-cwi', label: 'Bond Crushing Work Index', value: comminution.bondCrushingWorkIndexKWhPerT, unit: 'kWh/t' },
      { id: 'bond-bwi', label: 'Bond Ball Mill Work Index', value: comminution.bondBallMillWorkIndexKWhPerT, unit: 'kWh/t' },
      { id: 'bond-ai', label: 'Bond Abrasion Index', value: comminution.bondAbrasionIndex, unit: '' },
    );
  }
  const density = occurrenceMineralDensityKgPerM3(occurrence);
  if (density) properties.push({ id: 'mineral-density', label: 'Mineral mixture density', value: density, unit: 'kg/m³' });

  const mineralTextures = Object.entries(occurrence?.mineralTexture?.speciesTextures ?? {}).map(([speciesId, texture]) => ({
    speciesId,
    label: speciesLabel(speciesId),
    grainSizeUm: { ...texture.grainSizeUm },
    occurrenceModes: { ...texture.occurrenceModes },
  }));
  return { properties, mineralTextures };
}

export function hopperInspection(hopper) {
  const revision = hopper?.materialRevision ?? 0;
  const materialBody = hopper?.materialBody ?? null;
  const runtimePresentation = hopper?.runtimePresentation ?? null;
  const workerProjected = runtimePresentation?.authority === 'rust-wasm-worker';
  const cached = HOPPER_INSPECTION_CACHE.get(hopper);
  if (
    cached
    && cached.revision === revision
    && cached.materialBody === materialBody
    && cached.runtimePresentation === runtimePresentation
    && cached.capacityKg === hopper?.capacityKg
    && cached.nominalParticleSizeMm === hopper?.nominalParticleSizeMm
  ) {
    return cached.value;
  }

  const storedMassKg = hopperStoredMassKg(hopper);
  const thermal = workerProjected
    ? {
      temperatureK: null,
      sensibleEnthalpyJ: runtimePresentation.sensibleEnthalpyJ ?? 0,
      thermalError: storedMassKg > 0 ? 'Detailed material state is retained in the Rust/WASM Worker.' : null,
    }
    : thermalDetailsForBody(materialBody, storedMassKg);
  const compositionSummary = workerProjected ? {} : hopperCompositionKg(hopper);
  const compositionRows = summaryRows(compositionSummary, storedMassKg, speciesLabel);
  const value = {
    kind: hopper?.systemType === 'boundary-buffer' ? 'boundaryBuffer' : 'hopper',
    id: hopper?.id ?? null,
    storedMassKg,
    capacityKg: hopper?.capacityKg ?? 0,
    freeCapacityKg: Math.max(0, (hopper?.capacityKg ?? 0) - storedMassKg),
    physicalForm: materialBody?.physicalForm ?? null,
    particleSizeMm: hopper?.nominalParticleSizeMm ?? null,
    temperatureK: thermal.temperatureK,
    sensibleEnthalpyJ: thermal.sensibleEnthalpyJ,
    thermalError: thermal.thermalError,
    // Historical components and current composition intentionally expose the
    // same summary rows; compute them once rather than traversing twice.
    components: compositionRows,
    composition: compositionRows,
    particleSizeDistribution: workerProjected ? [] : summaryRows(hopperParticleSizeDistributionKg(hopper), storedMassKg, sizeBinLabel),
    liberationDistribution: workerProjected ? [] : summaryRows(hopperLiberationDistributionKg(hopper), storedMassKg, liberationLabel),
    detailsUnavailable: workerProjected,
  };
  HOPPER_INSPECTION_CACHE.set(hopper, {
    revision,
    materialBody,
    runtimePresentation,
    capacityKg: hopper?.capacityKg,
    nominalParticleSizeMm: hopper?.nominalParticleSizeMm,
    value,
  });
  return value;
}

export function streamInspection(stream) {
  if (!stream) {
    return {
      kind: 'stream', id: null, totalFlowKgPerSecond: 0, physicalForm: null,
      componentMassFlowKgPerSecond: {}, composition: [], particleSizeDistribution: [], liberationDistribution: [],
      temperatureK: null, specificSensibleEnthalpyJPerKg: 0, thermalError: null,
    };
  }

  // setMaterialStreamState/setGasMaterialStreamState replace the physical state
  // object when simulation advances. Object identity is therefore a cheap,
  // deterministic presentation revision between fixed simulation steps.
  const stateRef = stream.physicalForm === MATERIAL_FORMS.GAS ? stream.gasState : stream.solidState;
  const projectedFlow = stream._runtimePresentationMassFlowKgPerSecond;
  const workerProjected = Number.isFinite(projectedFlow) && projectedFlow >= 0;
  const cached = STREAM_INSPECTION_CACHE.get(stream);
  if (
    cached
    && cached.stateRef === stateRef
    && cached.projectedFlow === projectedFlow
    && cached.physicalForm === stream.physicalForm
    && cached.specificSensibleEnthalpyJPerKg === stream.specificSensibleEnthalpyJPerKg
    && cached.nominalParticleSizeMm === stream.nominalParticleSizeMm
  ) {
    return cached.value;
  }

  const totalFlowKgPerSecond = totalMaterialStreamMassFlowKgPerSecond(stream);
  const gas = stream.physicalForm === MATERIAL_FORMS.GAS;
  const compositionSummary = workerProjected
    ? {}
    : (gas
      ? { ...(stream.gasState?.speciesMassKg ?? {}) }
      : summarizeSolidMaterialBySpecies(stream.solidState));
  const thermal = workerProjected
    ? {
      temperatureK: null,
      specificSensibleEnthalpyJPerKg: 0,
      thermalError: totalFlowKgPerSecond > 0 ? 'Detailed stream state is retained in the Rust/WASM Worker.' : null,
    }
    : streamThermalDetails(stream, totalFlowKgPerSecond);
  const value = {
    kind: 'stream',
    id: stream?.id ?? null,
    sourceNodeId: stream?.sourceNodeId ?? null,
    sourcePortId: stream?.sourcePortId ?? null,
    targetNodeId: stream?.targetNodeId ?? null,
    targetPortId: stream?.targetPortId ?? null,
    totalFlowKgPerSecond,
    physicalForm: stream?.physicalForm ?? null,
    particleSizeMm: gas ? null : (stream?.nominalParticleSizeMm ?? null),
    componentMassFlowKgPerSecond: summaryObject(compositionSummary),
    composition: summaryRows(compositionSummary, totalFlowKgPerSecond, speciesLabel),
    particleSizeDistribution: gas || workerProjected
      ? []
      : summaryRows(summarizeSolidMaterialBySizeBin(stream.solidState), totalFlowKgPerSecond, sizeBinLabel),
    liberationDistribution: gas || workerProjected
      ? []
      : summaryRows(summarizeSolidMaterialByLiberationClass(stream.solidState), totalFlowKgPerSecond, liberationLabel),
    temperatureK: thermal.temperatureK,
    specificSensibleEnthalpyJPerKg: thermal.specificSensibleEnthalpyJPerKg,
    thermalError: thermal.thermalError,
    detailsUnavailable: workerProjected,
  };
  STREAM_INSPECTION_CACHE.set(stream, {
    stateRef,
    projectedFlow,
    physicalForm: stream.physicalForm,
    specificSensibleEnthalpyJPerKg: stream.specificSensibleEnthalpyJPerKg,
    nominalParticleSizeMm: stream.nominalParticleSizeMm,
    value,
  });
  return value;
}

export function connectionInspection(blueprint, connection) {
  if (!connection) return null;
  const stream = Object.values(blueprint?.streams ?? {}).find(item => item.connectionId === connection.id);
  if (stream) return { ...streamInspection(stream), connectionKind: connection.kind ?? 'material' };
  return {
    kind: 'relationship',
    connectionKind: connection.kind ?? 'unknown',
    id: connection.id,
    sourceNodeId: connection.sourceNodeId,
    sourcePortId: connection.sourcePortId,
    targetNodeId: connection.targetNodeId,
    targetPortId: connection.targetPortId,
    totalFlowKgPerSecond: 0,
    physicalForm: null,
    componentMassFlowKgPerSecond: {},
    composition: [],
    particleSizeDistribution: [],
    liberationDistribution: [],
    temperatureK: null,
    specificSensibleEnthalpyJPerKg: 0,
    thermalError: null,
  };
}

export function featureInspection(world, blueprint, node) {
  const feature = world?.features?.[node?.featureId];
  const resources = (feature?.resourceOccurrences ?? []).map(occurrenceId => {
    const occurrence = world?.resourceOccurrences?.[occurrenceId];
    const propertyDetails = occurrencePropertyDetails(occurrence);
    return {
      id: occurrenceId,
      name: occurrence?.name ?? occurrence?.resourceId ?? occurrenceId,
      resourceId: occurrence?.resourceId ?? null,
      availabilityClass: occurrence?.availabilityClass ?? occurrence?.quantityClass ?? 'Available',
      descriptor: occurrence?.descriptor ?? null,
      accessScope: occurrence?.accessScope ?? 'localized',
      concentrationPercent: occurrence?.concentrationPercent ?? null,
      composition: { ...(occurrence?.composition ?? {}) },
      occurrenceProperties: propertyDetails.properties,
      mineralTextures: propertyDetails.mineralTextures,
    };
  });
  const connections = Object.values(blueprint?.connections ?? {}).filter(connection =>
    connection.kind === 'resource-access' && connection.sourceNodeId === node?.id
  );
  const connectedExtractors = connections.map(connection => blueprint.nodes?.[connection.targetNodeId])
    .filter(target => target?.nodeType === 'extractor')
    .map(target => ({ id: target.id, occurrenceId: target.occurrenceId }));
  return {
    kind: 'feature',
    id: node?.id ?? null,
    featureId: feature?.id ?? node?.featureId ?? null,
    name: feature?.name ?? node?.displayName ?? node?.featureId ?? 'Feature',
    featureType: feature?.type ?? 'Feature',
    resources,
    resourceAccessAvailable: resources.length > 0,
    connectedExtractors,
  };
}

function resolvedDefinitionPortId(node, port) {
  return port?.runtimePortField ? (node?.[port.runtimePortField] ?? port.id) : port?.id;
}

function apparatusPortLabel(definition, node, portId) {
  const port = (definition?.ports ?? []).find(candidate => resolvedDefinitionPortId(node, candidate) === portId);
  return port?.label ?? portId;
}

function inspectedConnectionsByPort(blueprint, connections, portKey) {
  return Object.fromEntries(connections.map(connection => [
    connection[portKey],
    connectionInspection(blueprint, connection),
  ]));
}

function furnaceZoneInspection(zone, index, zoneCapacityKg) {
  const cached = FURNACE_ZONE_INSPECTION_CACHE.get(zone);
  if (cached && cached.index === index && cached.zoneCapacityKg === zoneCapacityKg) return cached.value;

  const massKg = totalSolidQuantity(zone.solidState);
  const thermal = thermalDetailsForBody(zone, massKg);
  const composition = summarizeSolidMaterialBySpecies(zone.solidState);
  const value = {
    index: index + 1,
    massKg,
    capacityKg: zoneCapacityKg,
    temperatureK: thermal.temperatureK,
    thermalError: thermal.thermalError,
    goethiteKg: composition.goethite ?? 0,
    hematiteKg: composition.hematite ?? 0,
  };
  FURNACE_ZONE_INSPECTION_CACHE.set(zone, { index, zoneCapacityKg, value });
  return value;
}

function exhaustBodyInspection(gasBody) {
  const cached = EXHAUST_BODY_INSPECTION_CACHE.get(gasBody);
  if (cached) return cached;
  const totalEmittedMassKg = totalGasMassKg(gasBody.gasState);
  const thermal = thermalDetailsForBody(gasBody, totalEmittedMassKg);
  const value = {
    totalEmittedMassKg,
    composition: summaryRows(gasBody.gasState.speciesMassKg, totalEmittedMassKg, speciesLabel),
    temperatureK: thermal.temperatureK,
    sensibleEnthalpyJ: thermal.sensibleEnthalpyJ,
    thermalError: thermal.thermalError,
  };
  EXHAUST_BODY_INSPECTION_CACHE.set(gasBody, value);
  return value;
}

export function exhaustVentInspection(blueprint, vent) {
  const gasBody = vent?.emittedGasBody ?? createGasMaterialBody(createGasMaterialState());
  const bodyDetails = exhaustBodyInspection(gasBody);
  const inputConnection = Object.values(blueprint?.connections ?? {}).find(connection =>
    connection.kind === 'material'
      && connection.targetNodeId === vent?.id
      && connection.targetPortId === vent?.gasInputPortId
  );
  return {
    kind: 'exhaustVent',
    id: vent?.id ?? null,
    ...bodyDetails,
    input: inputConnection ? connectionInspection(blueprint, inputConnection) : null,
  };
}

export function machineInspection(blueprint, node) {
  const connections = Object.values(blueprint?.connections ?? {});
  const definition = getApparatusDefinition(node?.nodeType);
  const materialInputs = connections.filter(connection =>
    connection.kind === 'material' && connection.targetNodeId === node?.id
  );
  const resourceAccessInputs = connections.filter(connection =>
    connection.kind === 'resource-access' && connection.targetNodeId === node?.id
  );
  const materialOutputs = connections.filter(connection =>
    connection.kind === 'material' && connection.sourceNodeId === node?.id
  );
  const inputByPort = inspectedConnectionsByPort(blueprint, materialInputs, 'targetPortId');
  const outputByPort = inspectedConnectionsByPort(blueprint, materialOutputs, 'sourcePortId');
  const inputInspection = materialInputs.length ? connectionInspection(blueprint, materialInputs[0]) : null;
  const resourceAccessInput = resourceAccessInputs.length ? resourceAccessInputs[0] : null;
  const configuredThroughputKgPerSecond = node?.throughputKgPerSecond ?? node?.prototypeRateKgPerSecond ?? 0;
  const actualFeedKgPerSecond = Object.values(inputByPort)
    .reduce((sum, inspection) => sum + (inspection?.totalFlowKgPerSecond ?? 0), 0);
  const actualProductKgPerSecond = Object.values(outputByPort)
    .reduce((sum, inspection) => sum + (inspection?.totalFlowKgPerSecond ?? 0), 0);
  const inputStreams = Object.entries(inputByPort).map(([portId, inspection]) => ({
    portId,
    label: apparatusPortLabel(definition, node, portId),
    ...inspection,
  }));
  const outputStreams = Object.entries(outputByPort).map(([portId, inspection]) => ({
    portId,
    label: apparatusPortLabel(definition, node, portId),
    ...inspection,
  }));

  const result = {
    kind: node?.nodeType ?? 'machine',
    id: node?.id ?? null,
    enabled: node?.enabled ?? false,
    operatingState: getNodeOperatingState(node) ?? 'off',
    configuredThroughputKgPerSecond,
    actualFeedKgPerSecond,
    actualProductKgPerSecond,
    lastError: node?.runtimePresentation?.lastError ?? node?.lastError ?? null,
    input: inputInspection,
    inputs: inputByPort,
    inputStreams,
    resourceAccess: connectionInspection(blueprint, resourceAccessInput),
    outputs: outputByPort,
    outputStreams,
    parameters: apparatusParametersForNode(node).map(parameter => ({
      ...parameter,
      value: node?.[parameter.id],
    })),
    capabilities: (definition?.capabilities ?? []).map(capability => ({
      ...capability,
      value: node?.[capability.id],
    })),
  };

  if (['jawCrusher', 'coneCrusher', 'ballMill'].includes(node?.nodeType)) {
    result.comminution = {
      specificEnergyKWhPerT: node.lastSpecificEnergyKWhPerT ?? 0,
      actualPowerKw: node.lastPowerKw ?? 0,
      bondAbrasionIndex: node.lastBondAbrasionIndex ?? 0,
      abrasionExposureTonneAi: node.abrasionExposureTonneAi ?? 0,
    };
  }

  if (node?.nodeType === 'roastingFurnace') {
    const projectedFurnace = node.runtimePresentation?.furnace ?? null;
    const chargeMassKg = projectedFurnace?.chargeMassKg ?? roastingFurnaceChargeMassKg(node);
    const pendingFeedMassKg = projectedFurnace?.pendingFeedMassKg ?? roastingFurnacePendingFeedMassKg(node);
    const feedRateKgPerSecond = actualFeedKgPerSecond > 0
      ? actualFeedKgPerSecond
      : (node.lastFeedRateKgPerSecond ?? 0);
    const zoneCapacityKg = roastingFurnaceZoneCapacityKg(node);
    result.thermochemical = {
      chargeMassKg,
      pendingFeedMassKg,
      chargeTemperatureK: chargeMassKg > 0
        ? (projectedFurnace?.actualChargeTemperatureK ?? node.actualChargeTemperatureK ?? null)
        : null,
      temperatureSetpointK: node.temperatureSetpointK,
      ratedHeaterPowerKw: node.ratedHeaterPowerKw,
      actualHeaterPowerKw: projectedFurnace?.lastHeaterPowerKw ?? node.lastHeaterPowerKw ?? 0,
      heatLossPowerKw: projectedFurnace ? 0 : (node.lastHeatLossPowerKw ?? 0),
      reactionPowerKw: projectedFurnace?.lastReactionPowerKw ?? node.lastReactionPowerKw ?? 0,
      goethiteConversionPercent: (node.lastGoethiteConversionFraction ?? 0) * 100,
      meanResidenceTimeSeconds: feedRateKgPerSecond > 0
        ? node.effectiveChamberHoldUpKg / feedRateKgPerSecond
        : null,
      solidProductRateKgPerSecond: outputByPort[node.solidProductPortId]?.totalFlowKgPerSecond ?? 0,
      exhaustRateKgPerSecond: outputByPort[node.gasExhaustPortId]?.totalFlowKgPerSecond ?? 0,
      solverEvaluationCount: node.lastSolverEvaluationCount ?? 0,
      zones: projectedFurnace ? [] : (node.zones ?? []).map((zone, index) => furnaceZoneInspection(zone, index, zoneCapacityKg)),
      detailsUnavailable: Boolean(projectedFurnace),
    };
  }

  // Compatibility fields used by the richer current-machine Inspector views.
  if (node?.nodeType === 'crusher') result.targetParticleSizeMm = node.targetParticleSizeMm;
  if (node?.nodeType === 'magSep') {
    result.fieldStrength = node.fieldStrength;
    result.maxFeedParticleSizeMm = node.maxFeedParticleSizeMm;
    result.feed = inputInspection;
    result.concentrate = outputByPort[node.concentratePortId] ?? null;
    result.tailings = outputByPort[node.tailingsPortId] ?? null;
  }
  return result;
}
