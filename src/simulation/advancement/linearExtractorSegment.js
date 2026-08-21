/**
 * First process-specific operating segment.
 *
 * This deliberately supports only worlds whose registered Site sessions contain
 * Feature, Extractor, and Hopper nodes and have no inter-system boundary
 * transfers. In that topology an enabled running Extractor is a constant-rate
 * source into passive storage, so many authoritative 0.1 s steps may be
 * integrated as one interval without changing material physics. The interval is
 * bounded before the earliest Hopper-full event.
 *
 * More complex process families must opt into their own proven interval
 * contracts rather than inheriting this shortcut.
 */

import { hopperFreeCapacityKg } from '../hopperNode.js';
import { totalMaterialStreamMassFlowKgPerSecond } from '../materialStream.js';
import { simulationTick, SIMULATION_STEP_S } from '../simulationEngine.js';
import { findOutboundConnection } from '../apparatus/blueprintHelpers.js';
import { worldAdvancementConfigurationSignature } from './operatingSegments.js';

const FLOW_TOLERANCE_KG_PER_S = 1e-10;
const EVENT_TOLERANCE_S = 1e-9;
const SUPPORTED_NODE_TYPES = new Set(['feature', 'extractor', 'hopper']);

function uniqueSessions(world) {
  return [...new Set(Object.values(world?.simulation?.sessions ?? {}))];
}

function streamForConnection(blueprint, connectionId) {
  return Object.values(blueprint?.streams ?? {}).find(stream => stream.connectionId === connectionId) ?? null;
}

function extractorDescriptor(blueprint, node) {
  if (!node?.enabled || node.operatingState !== 'running') return null;
  const connection = findOutboundConnection(blueprint, node.id, node.outputPortId);
  if (!connection || connection.kind !== 'material') return null;
  const target = blueprint.nodes?.[connection.targetNodeId];
  if (!target || target.nodeType !== 'hopper') return null;
  const stream = streamForConnection(blueprint, connection.id);
  if (!stream) return null;
  const rateKgPerSecond = totalMaterialStreamMassFlowKgPerSecond(stream);
  if (!(rateKgPerSecond > FLOW_TOLERANCE_KG_PER_S)) return null;
  const freeCapacityKg = hopperFreeCapacityKg(target);
  if (!(freeCapacityKg > 0)) return null;
  return {
    blueprint,
    extractorId: node.id,
    connectionId: connection.id,
    targetHopperId: target.id,
    rateKgPerSecond,
    secondsUntilFull: freeCapacityKg / rateKgPerSecond,
  };
}

/**
 * Build a reusable whole-world linear segment from an already-observed running
 * state. Every enabled Extractor must currently be producing a positive rate;
 * otherwise the world falls back to detailed stepping until its regime is known.
 */
export function buildLinearExtractorOperatingSegment(world) {
  if (Object.keys(world?.simulation?.transfers ?? {}).length > 0) return null;
  const sessions = uniqueSessions(world);
  if (!sessions.length) return null;

  const descriptors = [];
  let enabledExtractorCount = 0;
  for (const blueprint of sessions) {
    for (const node of Object.values(blueprint?.nodes ?? {})) {
      if (!SUPPORTED_NODE_TYPES.has(node?.nodeType)) return null;
      if (node?.nodeType !== 'extractor' || !node.enabled) continue;
      enabledExtractorCount += 1;
      const descriptor = extractorDescriptor(blueprint, node);
      if (!descriptor) return null;
      descriptors.push(descriptor);
    }
  }
  if (!enabledExtractorCount || descriptors.length !== enabledExtractorCount) return null;

  const secondsUntilEvent = Math.min(...descriptors.map(item => item.secondsUntilFull));
  if (!(secondsUntilEvent > EVENT_TOLERANCE_S)) return null;

  return {
    kind: 'linear-extractor-storage',
    validity: 'constant extractor configuration until earliest target Hopper-full event',
    configurationSignature: worldAdvancementConfigurationSignature(world),
    secondsUntilEvent,
    extractors: descriptors.map(item => ({
      extractorId: item.extractorId,
      connectionId: item.connectionId,
      targetHopperId: item.targetHopperId,
      rateKgPerSecond: item.rateKgPerSecond,
    })),
  };
}

/**
 * Revalidate a cached segment against current topology/configuration and current
 * stream rates. Inventory levels are intentionally allowed to change; they only
 * shorten the next capacity event.
 */
export function validateLinearExtractorOperatingSegment(world, segment) {
  if (segment?.kind !== 'linear-extractor-storage') return null;
  if (segment.configurationSignature !== worldAdvancementConfigurationSignature(world)) return null;
  const current = buildLinearExtractorOperatingSegment(world);
  if (!current) return null;
  if (current.extractors.length !== segment.extractors.length) return null;

  const previousById = new Map(segment.extractors.map(item => [item.extractorId, item]));
  for (const item of current.extractors) {
    const previous = previousById.get(item.extractorId);
    if (!previous) return null;
    const tolerance = 1e-10 * Math.max(1, Math.abs(previous.rateKgPerSecond));
    if (Math.abs(item.rateKgPerSecond - previous.rateKgPerSecond) > tolerance) return null;
  }
  return current;
}

/**
 * Return a batch interval expressed as an integer number of authoritative
 * 0.1-second steps. Never cross the predicted capacity event; the final partial
 * approach to an event is resolved by the exact fixed-step fallback.
 */
export function linearExtractorBatchIntervalSeconds(segment, remainingSeconds, {
  minimumEquivalentSteps = 4,
} = {}) {
  if (!segment || !(remainingSeconds > 0)) return 0;
  const safeSeconds = Math.min(remainingSeconds, segment.secondsUntilEvent);
  const safeSteps = Math.floor((safeSeconds + EVENT_TOLERANCE_S) / SIMULATION_STEP_S);
  if (safeSteps < minimumEquivalentSteps) return 0;
  return safeSteps * SIMULATION_STEP_S;
}

/**
 * Apply one proven linear interval. This intentionally reuses the canonical
 * simulationTick transaction path with a larger dt only for the restricted
 * linear topology above. No alternate material representation is introduced.
 */
export function applyLinearExtractorOperatingSegment(world, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Linear extractor interval must be finite and positive');
  const steps = seconds / SIMULATION_STEP_S;
  if (Math.abs(steps - Math.round(steps)) > 1e-9) {
    throw new Error(`Linear extractor interval must align to the ${SIMULATION_STEP_S} s authoritative step grid`);
  }

  for (const blueprint of uniqueSessions(world)) simulationTick(blueprint, world, seconds);
  world.simulation.elapsedSeconds += seconds;
  return Math.round(steps);
}
