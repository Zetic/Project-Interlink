import {
  hopperCompositionKg,
  hopperFreeCapacityKg,
  hopperLiberationDistributionKg,
  hopperParticleSizeDistributionKg,
  hopperStoredMassKg,
} from '../../simulation/hopperNode.js';
import { totalMassFlowKgPerSecond } from '../../simulation/materialStream.js';
import { summarizeSolidMaterialByLiberationClass, summarizeSolidMaterialBySizeBin, summarizeSolidMaterialBySpecies } from '../../core/materials/solids/solidMaterialState.js';
import { getParticleSizeBin } from '../../core/materials/solids/particleSizeBins.js';
import { getLiberationClass } from '../../core/materials/solids/liberationClasses.js';
import { getMaterialSpecies } from '../../core/materials/species/materialSpecies.js';
import { getNodeOperatingState } from '../../simulation/simulationEngine.js';
import { apparatusParametersForNode, getApparatusDefinition } from '../../content/apparatus/definitions.js';

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

export function hopperInspection(hopper) {
  const storedMassKg = hopperStoredMassKg(hopper);
  return {
    kind: hopper?.systemType === 'boundary-buffer' ? 'boundaryBuffer' : 'hopper',
    id: hopper?.id ?? null,
    storedMassKg,
    capacityKg: hopper?.capacityKg ?? 0,
    freeCapacityKg: hopperFreeCapacityKg(hopper),
    physicalForm: hopper?.materialBody?.physicalForm ?? null,
    particleSizeMm: hopper?.nominalParticleSizeMm ?? null,
    components: summaryRows(hopperCompositionKg(hopper), storedMassKg, speciesLabel),
    composition: summaryRows(hopperCompositionKg(hopper), storedMassKg, speciesLabel),
    particleSizeDistribution: summaryRows(hopperParticleSizeDistributionKg(hopper), storedMassKg, sizeBinLabel),
    liberationDistribution: summaryRows(hopperLiberationDistributionKg(hopper), storedMassKg, liberationLabel),
  };
}

export function streamInspection(stream) {
  const totalFlowKgPerSecond = totalMassFlowKgPerSecond(stream?.solidState ?? { fractions: {} });
  return {
    kind: 'stream',
    id: stream?.id ?? null,
    sourceNodeId: stream?.sourceNodeId ?? null,
    sourcePortId: stream?.sourcePortId ?? null,
    targetNodeId: stream?.targetNodeId ?? null,
    targetPortId: stream?.targetPortId ?? null,
    totalFlowKgPerSecond,
    physicalForm: stream?.physicalForm ?? null,
    particleSizeMm: stream?.nominalParticleSizeMm ?? null,
    componentMassFlowKgPerSecond: summaryObject(summarizeSolidMaterialBySpecies(stream?.solidState ?? { fractions: {} })),
    composition: summaryRows(summarizeSolidMaterialBySpecies(stream?.solidState ?? { fractions: {} }), totalFlowKgPerSecond, speciesLabel),
    particleSizeDistribution: summaryRows(summarizeSolidMaterialBySizeBin(stream?.solidState ?? { fractions: {} }), totalFlowKgPerSecond, sizeBinLabel),
    liberationDistribution: summaryRows(summarizeSolidMaterialByLiberationClass(stream?.solidState ?? { fractions: {} }), totalFlowKgPerSecond, liberationLabel),
  };
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
  };
}

export function featureInspection(world, blueprint, node) {
  const feature = world?.features?.[node?.featureId];
  const resources = (feature?.resourceOccurrences ?? []).map(occurrenceId => {
    const occurrence = world?.resourceOccurrences?.[occurrenceId];
    return {
      id: occurrenceId,
      name: occurrence?.name ?? occurrence?.resourceId ?? occurrenceId,
      resourceId: occurrence?.resourceId ?? null,
      availabilityClass: occurrence?.availabilityClass ?? occurrence?.quantityClass ?? 'Available',
      descriptor: occurrence?.descriptor ?? null,
      accessScope: occurrence?.accessScope ?? 'localized',
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
    lastError: node?.lastError ?? null,
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

  // Compatibility fields used by the richer current-machine Inspector views.
  // Product/feed totals above are deliberately port-generic so future multi-output
  // apparatus (for example Screen undersize/oversize) need no type-specific math.
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
