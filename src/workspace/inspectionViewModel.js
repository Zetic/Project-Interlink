import { hopperFreeCapacityKg, hopperStoredMassKg } from '../simulation/hopperNode.js';
import { totalMassFlowKgPerSecond } from '../simulation/materialStream.js';
import { getNodeOperatingState } from '../simulation/simulationEngine.js';

function componentRows(components, total) {
  return Object.entries(components ?? {})
    .filter(([, value]) => value > 0)
    .map(([componentId, massKg]) => ({
      componentId,
      massKg,
      percentage: total > 0 ? (massKg / total) * 100 : 0,
    }));
}

export function hopperInspection(hopper) {
  const storedMassKg = hopperStoredMassKg(hopper);
  return {
    kind: hopper?.systemType === 'boundary-buffer' ? 'boundaryBuffer' : 'hopper',
    id: hopper?.id ?? null,
    storedMassKg,
    capacityKg: hopper?.capacityKg ?? 0,
    freeCapacityKg: hopperFreeCapacityKg(hopper),
    particleSizeMm: hopper?.particleSizeMm ?? null,
    components: componentRows(hopper?.storedComponentsKg, storedMassKg),
  };
}

export function streamInspection(stream) {
  const componentMassFlowKgPerSecond = { ...(stream?.componentMassFlowKgPerSecond ?? {}) };
  return {
    kind: 'stream',
    id: stream?.id ?? null,
    sourceNodeId: stream?.sourceNodeId ?? null,
    sourcePortId: stream?.sourcePortId ?? null,
    targetNodeId: stream?.targetNodeId ?? null,
    targetPortId: stream?.targetPortId ?? null,
    totalFlowKgPerSecond: totalMassFlowKgPerSecond(componentMassFlowKgPerSecond),
    particleSizeMm: stream?.particleSizeMm ?? null,
    componentMassFlowKgPerSecond,
  };
}

function connectionInspection(blueprint, connection) {
  if (!connection) return null;
  const stream = Object.values(blueprint?.streams ?? {}).find(item => item.connectionId === connection.id);
  return streamInspection(stream);
}

export function machineInspection(blueprint, node) {
  const connections = Object.values(blueprint?.connections ?? {});
  const input = connections.find(connection => connection.targetNodeId === node?.id);
  const outputs = connections.filter(connection => connection.sourceNodeId === node?.id);
  const outputByPort = Object.fromEntries(outputs.map(connection => [
    connection.sourcePortId,
    connectionInspection(blueprint, connection),
  ]));
  const inputInspection = connectionInspection(blueprint, input);
  const configuredThroughputKgPerSecond = node?.throughputKgPerSecond ?? node?.prototypeRateKgPerSecond ?? 0;
  const result = {
    kind: node?.nodeType ?? 'machine',
    id: node?.id ?? null,
    enabled: node?.enabled ?? false,
    operatingState: getNodeOperatingState(node) ?? 'off',
    configuredThroughputKgPerSecond,
    actualFeedKgPerSecond: inputInspection?.totalFlowKgPerSecond ?? 0,
    actualProductKgPerSecond: outputByPort[node?.outputPortId]?.totalFlowKgPerSecond ?? 0,
    lastError: node?.lastError ?? null,
    input: inputInspection,
    outputs: outputByPort,
  };
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
