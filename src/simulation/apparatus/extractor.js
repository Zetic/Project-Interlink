import {
  createExtractor,
  extractorOccurrenceEligibility,
  extractorOutputRates,
} from '../extractorNode.js';
import { hopperFreeCapacityKg, hopperReceiveInflow } from '../hopperNode.js';
import { scaleFlowRates, totalMassFlowKgPerSecond } from '../materialStream.js';
import {
  findInboundConnection,
  findOutboundConnection,
  updateConnectionStream,
} from './blueprintHelpers.js';

const TRANSFER_TOLERANCE_KG = 1e-8;

export { createExtractor, extractorOccurrenceEligibility, extractorOutputRates };

export function simulateExtractorNode(blueprint, world, node, dt) {
  if (!node.enabled) {
    node.operatingState = 'off';
    node.lastError = null;
    return 0;
  }
  const accessConnection = findInboundConnection(blueprint, node.id, node.sourceInputPortId);
  if (!accessConnection || accessConnection.kind !== 'resource-access') {
    node.lastError = 'Extractor requires a connected Feature resource source';
    node.operatingState = 'blocked';
    return 0;
  }
  const sourceFeature = blueprint.nodes[accessConnection.sourceNodeId];
  const occurrenceId = accessConnection.occurrenceId;
  const occurrence = world?.resourceOccurrences?.[occurrenceId];
  if (
    sourceFeature?.nodeType !== 'feature'
    || !sourceFeature.resourceOccurrenceIds?.includes(occurrenceId)
    || !occurrence
    || occurrence.sourceType !== 'feature'
    || occurrence.sourceId !== sourceFeature.featureId
  ) {
    node.lastError = 'Connected Feature does not own the selected ResourceOccurrence';
    node.operatingState = 'blocked';
    return 0;
  }
  const eligibility = extractorOccurrenceEligibility(occurrence);
  if (!eligibility.ok) {
    node.lastError = eligibility.reason;
    node.operatingState = 'blocked';
    return 0;
  }
  const outputConnection = findOutboundConnection(blueprint, node.id, node.outputPortId);
  if (!outputConnection || outputConnection.kind !== 'material') {
    node.lastError = 'Extractor requires a connected material output';
    node.operatingState = 'blocked';
    return 0;
  }
  const targetHopper = blueprint.nodes[outputConnection.targetNodeId];
  if (!targetHopper || targetHopper.nodeType !== 'hopper') {
    node.lastError = 'Extractor material output must feed storage';
    node.operatingState = 'blocked';
    return 0;
  }
  let baseOutput;
  try {
    baseOutput = extractorOutputRates(node, occurrence, 1);
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return 0;
  }
  const baseTotalRate = totalMassFlowKgPerSecond(baseOutput);
  const requestedKg = baseTotalRate * dt;
  const freeKg = hopperFreeCapacityKg(targetHopper);
  const throttle = requestedKg > 0 ? Math.max(0, Math.min(1, freeKg / requestedKg)) : 0;
  const plannedRates = scaleFlowRates(baseOutput, throttle);
  const plannedKg = totalMassFlowKgPerSecond(plannedRates) * dt;
  if (plannedKg <= TRANSFER_TOLERANCE_KG) {
    node.lastError = 'Extractor output storage is full';
    node.operatingState = 'blocked';
    return 0;
  }
  const acceptedKg = hopperReceiveInflow(targetHopper, plannedRates, dt);
  const acceptanceFactor = plannedKg > 0 ? Math.max(0, Math.min(1, acceptedKg / plannedKg)) : 0;
  const actualRates = scaleFlowRates(plannedRates, acceptanceFactor);
  updateConnectionStream(blueprint, outputConnection, actualRates);
  node.lastError = acceptedKg > TRANSFER_TOLERANCE_KG ? null : 'Extractor output storage is full';
  node.operatingState = acceptedKg > TRANSFER_TOLERANCE_KG ? 'running' : 'blocked';
  return acceptedKg;
}
