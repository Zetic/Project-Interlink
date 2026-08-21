/**
 * Transient operating-segment cache for explicit world advancement.
 *
 * A segment is a proven local description of how the current world may advance
 * without replaying every fixed 0.1 s step. Segment metadata is never physical
 * world truth and is intentionally not serialized. Configuration signatures
 * invalidate cached segments when topology, apparatus settings, enabled state,
 * source truth, or boundary-transfer configuration changes.
 */

import { totalMaterialStreamMassFlowKgPerSecond } from '../materialStream.js';
import {
  roastingFurnaceChargeMassKg,
  roastingFurnacePendingFeedMassKg,
} from '../apparatus/roastingFurnace.js';

const FLOW_TOLERANCE_KG_PER_S = 1e-10;
const MASS_TOLERANCE_KG = 1e-9;
const QUIESCENT_CONFIRMATION_STEPS = 2;

const cacheByWorld = new WeakMap();

const DYNAMIC_NODE_KEYS = new Set([
  'materialBody',
  'zones',
  'pendingFeed',
  'gasInventory',
  'emittedGasBody',
  'solidCharge',
  'operatingState',
  'lastError',
  'incomingMassSinceLastSimulationKg',
  'ports',
]);

function isDynamicNodeKey(key) {
  return DYNAMIC_NODE_KEYS.has(key)
    || key.startsWith('last')
    || key.startsWith('actual');
}

function canonicalize(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])]),
  );
}

function nodeConfiguration(node) {
  return Object.fromEntries(
    Object.entries(node ?? {})
      .filter(([key]) => !isDynamicNodeKey(key))
      .map(([key, value]) => [key, canonicalize(value)]),
  );
}

function transferConfiguration(transfer) {
  const { lastMovedKg: _lastMovedKg, lastRateKgPerSecond: _lastRateKgPerSecond, ...configuration } = transfer;
  return canonicalize(configuration);
}

function referencedOccurrenceIds(world) {
  const ids = new Set();
  for (const blueprint of new Set(Object.values(world?.simulation?.sessions ?? {}))) {
    for (const node of Object.values(blueprint?.nodes ?? {})) {
      if (typeof node?.occurrenceId === 'string' && node.occurrenceId) ids.add(node.occurrenceId);
      for (const occurrenceId of node?.resourceOccurrenceIds ?? []) ids.add(occurrenceId);
    }
    for (const connection of Object.values(blueprint?.connections ?? {})) {
      if (typeof connection?.occurrenceId === 'string' && connection.occurrenceId) ids.add(connection.occurrenceId);
    }
  }
  return [...ids].sort();
}

/**
 * Signature of every input that can invalidate an operating segment in the
 * currently implemented simulation. Dynamic inventories/diagnostics are
 * deliberately excluded; they are the state being advanced by the segment.
 */
export function worldAdvancementConfigurationSignature(world) {
  const sessions = Object.entries(world?.simulation?.sessions ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sessionId, blueprint]) => ({
      sessionId,
      nodes: Object.fromEntries(
        Object.entries(blueprint?.nodes ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([nodeId, node]) => [nodeId, nodeConfiguration(node)]),
      ),
      connections: canonicalize(blueprint?.connections ?? {}),
    }));

  const transfers = Object.fromEntries(
    Object.entries(world?.simulation?.transfers ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, transfer]) => [id, transferConfiguration(transfer)]),
  );

  const occurrences = Object.fromEntries(
    referencedOccurrenceIds(world).map(id => [id, canonicalize(world?.resourceOccurrences?.[id] ?? null)]),
  );

  return JSON.stringify({ sessions, transfers, occurrences });
}

function stateFor(world) {
  let state = cacheByWorld.get(world);
  if (!state) {
    state = {
      segment: null,
      quiescentSignature: null,
      quiescentConfirmationSteps: 0,
      stats: {
        segmentsCreated: 0,
        segmentReuses: 0,
        invalidations: 0,
        fastForwardedSeconds: 0,
      },
    };
    cacheByWorld.set(world, state);
  }
  return state;
}

export function invalidateOperatingSegment(world, reason = 'invalidated') {
  if (!world || typeof world !== 'object') return;
  const state = stateFor(world);
  if (state.segment) state.stats.invalidations += 1;
  state.segment = null;
  state.quiescentSignature = null;
  state.quiescentConfirmationSteps = 0;
  state.lastInvalidationReason = reason;
}

export function cacheOperatingSegment(world, segment) {
  if (!world || typeof world !== 'object') throw new Error('Operating segment requires a world');
  if (!segment?.kind) throw new Error('Operating segment requires a kind');
  const state = stateFor(world);
  const signature = worldAdvancementConfigurationSignature(world);
  state.segment = Object.freeze({
    ...segment,
    configurationSignature: signature,
    createdAtSimulationSeconds: world?.simulation?.elapsedSeconds ?? 0,
  });
  state.stats.segmentsCreated += 1;
  return state.segment;
}

/** Return a cached segment only while its configuration dependencies still match. */
export function cachedOperatingSegment(world) {
  const state = stateFor(world);
  const segment = state.segment;
  if (!segment) return null;
  const signature = worldAdvancementConfigurationSignature(world);
  if (segment.configurationSignature !== signature) {
    invalidateOperatingSegment(world, 'configuration changed');
    return null;
  }
  return segment;
}

export function markOperatingSegmentReuse(world, advancedSeconds) {
  const state = stateFor(world);
  state.stats.segmentReuses += 1;
  state.stats.fastForwardedSeconds += Math.max(0, advancedSeconds ?? 0);
}

/**
 * Conservative quiescence test. A quiescent world has no material flow, no
 * boundary flow, no machine reporting active operation, and no enabled furnace
 * retaining material that may still heat/react internally while externally
 * blocked. Such a world cannot evolve until a configuration/external input
 * changes under the currently implemented process set.
 */
export function worldIsQuiescent(world) {
  for (const transfer of Object.values(world?.simulation?.transfers ?? {})) {
    if (Math.abs(transfer?.lastRateKgPerSecond ?? 0) > FLOW_TOLERANCE_KG_PER_S) return false;
  }

  for (const blueprint of new Set(Object.values(world?.simulation?.sessions ?? {}))) {
    for (const stream of Object.values(blueprint?.streams ?? {})) {
      if (totalMaterialStreamMassFlowKgPerSecond(stream) > FLOW_TOLERANCE_KG_PER_S) return false;
    }

    for (const node of Object.values(blueprint?.nodes ?? {})) {
      if (node?.enabled === true && node?.operatingState === 'running') return false;
      if (node?.nodeType === 'roastingFurnace' && node?.enabled === true) {
        const retainedKg = roastingFurnaceChargeMassKg(node) + roastingFurnacePendingFeedMassKg(node);
        if (retainedKg > MASS_TOLERANCE_KG) return false;
      }
    }
  }
  return true;
}

/**
 * Observe exact simulation results. Quiescence is confirmed on consecutive
 * detailed steps before it is cached, avoiding a one-step transient being
 * mistaken for a dormant operating regime.
 */
export function observeWorldForQuiescentSegment(world) {
  const state = stateFor(world);
  if (!worldIsQuiescent(world)) {
    state.quiescentSignature = null;
    state.quiescentConfirmationSteps = 0;
    if (state.segment?.kind === 'quiescent') state.segment = null;
    return null;
  }

  const signature = worldAdvancementConfigurationSignature(world);
  if (state.quiescentSignature === signature) state.quiescentConfirmationSteps += 1;
  else {
    state.quiescentSignature = signature;
    state.quiescentConfirmationSteps = 1;
  }

  if (state.quiescentConfirmationSteps < QUIESCENT_CONFIRMATION_STEPS) return null;
  if (state.segment?.kind === 'quiescent' && state.segment.configurationSignature === signature) {
    return state.segment;
  }
  return cacheOperatingSegment(world, {
    kind: 'quiescent',
    nextEventSimulationSeconds: Number.POSITIVE_INFINITY,
    validity: 'until configuration or external input changes',
  });
}

/**
 * Advance only authoritative clocks for a proven quiescent interval. No physical
 * state changes because the segment is valid precisely while every modeled rate
 * and internal evolution is zero.
 */
export function applyQuiescentOperatingSegment(world, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Quiescent advance seconds must be finite and non-negative');
  if (seconds === 0) return;
  if (!worldIsQuiescent(world)) throw new Error('Cannot apply a quiescent segment to an active world');

  world.simulation.elapsedSeconds += seconds;
  for (const blueprint of new Set(Object.values(world?.simulation?.sessions ?? {}))) {
    blueprint.simulationStats ??= { elapsedSeconds: 0, extractedKg: 0 };
    blueprint.simulationStats.elapsedSeconds += seconds;
  }
  for (const transfer of Object.values(world?.simulation?.transfers ?? {})) {
    transfer.lastMovedKg = 0;
    transfer.lastRateKgPerSecond = 0;
  }
  markOperatingSegmentReuse(world, seconds);
}

export function operatingSegmentTelemetry(world) {
  const state = stateFor(world);
  return {
    activeSegment: state.segment ? { ...state.segment } : null,
    quiescentConfirmationSteps: state.quiescentConfirmationSteps,
    lastInvalidationReason: state.lastInvalidationReason ?? null,
    ...state.stats,
  };
}

export function resetOperatingSegmentCache(world) {
  if (world && typeof world === 'object') cacheByWorld.delete(world);
}
