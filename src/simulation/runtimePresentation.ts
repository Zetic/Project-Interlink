
/**
 * Read-only presentation projection for the authoritative Rust/WASM Worker.
 *
 * The Worker owns physical truth. Compact fixed-step snapshots mirror scalar
 * state needed by normal rendering; selected-entity detail is attached only on
 * demand and never becomes a second simulation state.
 */

import { invalidateBlueprintPresentation } from './simulationEngine.js';

export const RUST_WORKER_PRESENTATION_AUTHORITY = 'rust-wasm-worker';

function setHidden(target, key, value) {
  if (!target) return;
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    target[key] = value;
    return;
  }
  Object.defineProperty(target, key, {
    enumerable: false,
    configurable: true,
    writable: true,
    value,
  });
}

function deleteHidden(target, key) {
  if (target && Object.prototype.hasOwnProperty.call(target, key)) delete target[key];
}

function uniqueBlueprints(world) {
  const values = [
    ...Object.values(world?.simulation?.sessions ?? {}),
    ...Object.values(world?.simulation?.workspaces ?? {}),
  ];
  return [...new Set(values.filter(value => value?.nodes))];
}

function portKey(nodeId, portId) {
  return `${nodeId}\u0000${portId}`;
}

function passiveLinkKey(siteId, connectionId) {
  return `${siteId}\u0000${connectionId}`;
}

function addNodeInstance(nodesById, node) {
  if (!node?.id) return;
  let values = nodesById.get(node.id);
  if (!values) {
    values = new Set();
    nodesById.set(node.id, values);
  }
  values.add(node);
}

/**
 * Build every lookup needed by one Worker projection in a single pass. Node IDs
 * may legitimately be represented by multiple browser object instances across
 * recursive workspace registries, so every instance is retained and receives
 * the same projection object.
 */
function buildPresentationIndex(world) {
  const blueprints = uniqueBlueprints(world);
  const nodesById = new Map();
  const inputStreamByPort = new Map();
  const outputStreamByPort = new Map();
  const passiveStreamBySiteConnection = new Map();
  const streams = [];
  const canonicalSiteByBlueprint = new Map(
    Object.entries(world?.simulation?.sessions ?? {}).map(([siteId, blueprint]) => [blueprint, siteId]),
  );

  for (const blueprint of blueprints) {
    for (const node of Object.values(blueprint.nodes ?? {})) addNodeInstance(nodesById, node);

    const streamByConnectionId = new Map();
    for (const stream of Object.values(blueprint.streams ?? {})) {
      streams.push(stream);
      if (stream?.connectionId) streamByConnectionId.set(stream.connectionId, stream);
    }

    const canonicalSiteId = canonicalSiteByBlueprint.get(blueprint) ?? null;
    for (const connection of Object.values(blueprint.connections ?? {})) {
      if (connection?.kind !== 'material') continue;
      const stream = streamByConnectionId.get(connection.id);
      if (!stream) continue;
      inputStreamByPort.set(portKey(connection.targetNodeId, connection.targetPortId), stream);
      outputStreamByPort.set(portKey(connection.sourceNodeId, connection.sourcePortId), stream);
      if (canonicalSiteId != null) {
        passiveStreamBySiteConnection.set(
          passiveLinkKey(canonicalSiteId, connection.id),
          stream,
        );
      }
    }
  }

  // Composite/system workspaces can hold material owners that are not members of
  // an active Site blueprint. Include them so one canonical runtime ID projects
  // consistently into every browser view.
  for (const node of Object.values(world?.systemNodes ?? {})) addNodeInstance(nodesById, node);

  return {
    blueprints,
    nodesById,
    inputStreamByPort,
    outputStreamByPort,
    passiveStreamBySiteConnection,
    streams,
  };
}

function setOnNodeInstances(index, id, key, value) {
  for (const node of index.nodesById.get(id) ?? []) setHidden(node, key, value);
}

function setStreamFlow(stream, value) {
  setHidden(stream, '_runtimePresentationMassFlowKgPerSecond', Number.isFinite(value) ? Math.max(0, value) : 0);
}

function clearProjectedStreamFlows(index) {
  for (const stream of index.streams) setStreamFlow(stream, 0);
}

function projectMachineFlows(index, setupMachine, machineSnapshot) {
  const nodeId = setupMachine?.canonicalNodeId ?? machineSnapshot?.id;
  if (!nodeId) return;

  (setupMachine?.inputPortIds ?? []).forEach((portId, flowIndex) => {
    setStreamFlow(
      index.inputStreamByPort.get(portKey(nodeId, portId)),
      machineSnapshot.inputMassFlowKgPerSecond?.[flowIndex] ?? 0,
    );
  });
  (setupMachine?.outputPortIds ?? []).forEach((portId, flowIndex) => {
    setStreamFlow(
      index.outputStreamByPort.get(portKey(nodeId, portId)),
      machineSnapshot.outputMassFlowKgPerSecond?.[flowIndex] ?? 0,
    );
  });
}

function invalidateProjectedBlueprints(index) {
  for (const blueprint of index.blueprints) invalidateBlueprintPresentation(blueprint);
}

/** Return true when browser-visible physical state is a Worker projection. */
export function rustWorkerPresentationIsAuthoritative(world) {
  return world?.simulation?.runtimePresentationAuthority === RUST_WORKER_PRESENTATION_AUTHORITY;
}

/**
 * Attach one selected-entity detail result/status to every browser object that
 * represents the same canonical runtime node. The property is non-enumerable so
 * saves/serialization cannot accidentally persist transient physical truth.
 */
export function applyRustWorkerRuntimeDetail(world, detail) {
  if (!world?.simulation || !detail?.id) return detail;
  const index = buildPresentationIndex(world);
  const normalized = {
    authority: RUST_WORKER_PRESENTATION_AUTHORITY,
    status: detail.status ?? 'ready',
    ...detail,
  };
  setOnNodeInstances(index, detail.id, 'runtimeDetail', normalized);
  invalidateProjectedBlueprints(index);
  return normalized;
}

/**
 * Apply one compact scalar snapshot. Packed material populations remain in Rust;
 * node-card and edge render caches are explicitly invalidated so non-enumerable
 * Worker projections cannot be skipped as "unchanged" DOM.
 */
export function applyRustWorkerRuntimeSnapshot(world, runtime, snapshot) {
  if (!world?.simulation || !snapshot) return snapshot;
  const simulation = world.simulation;
  const index = buildPresentationIndex(world);
  const revision = Number.isFinite(snapshot.elapsedSeconds) ? snapshot.elapsedSeconds : 0;
  setHidden(simulation, 'runtimePresentationAuthority', RUST_WORKER_PRESENTATION_AUTHORITY);
  simulation.running = Boolean(snapshot.running);
  if (Number.isFinite(snapshot.elapsedSeconds)) simulation.elapsedSeconds = snapshot.elapsedSeconds;

  for (const siteSnapshot of snapshot.sites ?? []) {
    const blueprint = simulation.sessions?.[siteSnapshot.id];
    if (!blueprint?.simulationStats) continue;
    if (Number.isFinite(siteSnapshot.elapsedSeconds)) blueprint.simulationStats.elapsedSeconds = siteSnapshot.elapsedSeconds;
    if (Number.isFinite(siteSnapshot.extractedKg)) blueprint.simulationStats.extractedKg = siteSnapshot.extractedKg;
  }

  for (const hopperSnapshot of snapshot.hoppers ?? []) {
    const presentation = {
      authority: RUST_WORKER_PRESENTATION_AUTHORITY,
      revision,
      storedMassKg: Math.max(0, hopperSnapshot.storedMassKg ?? 0),
      sensibleEnthalpyJ: hopperSnapshot.sensibleEnthalpyJ ?? 0,
    };
    setOnNodeInstances(index, hopperSnapshot.id, 'runtimePresentation', presentation);
  }

  for (const occurrenceSnapshot of snapshot.occurrences ?? []) {
    const occurrence = world.resourceOccurrences?.[occurrenceSnapshot.id];
    if (!occurrence) continue;
    setHidden(occurrence, 'runtimePresentation', {
      authority: RUST_WORKER_PRESENTATION_AUTHORITY,
      revision,
      extractedMassKg: occurrenceSnapshot.extractedMassKg ?? 0,
      remainingMassKg: occurrenceSnapshot.remainingMassKg ?? null,
    });
  }

  clearProjectedStreamFlows(index);
  const setupMachines = new Map((runtime?.setup?.machines ?? []).map(machine => [machine.canonicalNodeId, machine]));
  for (const machineSnapshot of snapshot.machines ?? []) {
    const presentation = {
      authority: RUST_WORKER_PRESENTATION_AUTHORITY,
      revision,
      operatingState: machineSnapshot.operatingState ?? 'idle',
      lastError: machineSnapshot.lastError ?? null,
      inputMassFlowKgPerSecond: [...(machineSnapshot.inputMassFlowKgPerSecond ?? [])],
      outputMassFlowKgPerSecond: [...(machineSnapshot.outputMassFlowKgPerSecond ?? [])],
      ...(machineSnapshot.furnace ? {
        furnace: { ...machineSnapshot.furnace },
        retainedMassKg: (machineSnapshot.furnace.chargeMassKg ?? 0)
          + (machineSnapshot.furnace.pendingFeedMassKg ?? 0),
      } : {}),
    };
    setOnNodeInstances(index, machineSnapshot.id, 'runtimePresentation', presentation);
    projectMachineFlows(index, setupMachines.get(machineSnapshot.id), machineSnapshot);
  }

  for (const ventSnapshot of snapshot.exhaustVents ?? []) {
    setOnNodeInstances(index, ventSnapshot.id, 'runtimePresentation', {
      authority: RUST_WORKER_PRESENTATION_AUTHORITY,
      revision,
      ventedGasMassKg: ventSnapshot.ventedGasMassKg ?? 0,
    });
  }

  const setupPassiveLinks = runtime?.setup?.passiveLinks ?? [];
  const runtimeSiteIds = runtime?.setup?.runtimeIds?.sites ?? [];
  (snapshot.passiveLinks ?? []).forEach((linkSnapshot, linkIndex) => {
    const setupLink = setupPassiveLinks[linkIndex];
    const canonicalSiteId = setupLink == null ? null : runtimeSiteIds[setupLink.siteId];
    if (canonicalSiteId == null) return;
    const stream = index.passiveStreamBySiteConnection.get(
      passiveLinkKey(canonicalSiteId, linkSnapshot.id),
    );
    setStreamFlow(stream, linkSnapshot.lastRateKgPerSecond ?? 0);
  });

  for (const transferSnapshot of snapshot.boundaryTransfers ?? []) {
    const transfer = simulation.transfers?.[transferSnapshot.id];
    if (!transfer) continue;
    transfer.lastMovedKg = transferSnapshot.lastMovedKg ?? 0;
    transfer.lastRateKgPerSecond = transferSnapshot.lastRateKgPerSecond ?? 0;
  }

  // This is a presentation invalidation, not a topology/runtime rebuild. It is
  // the hard contract that makes every visible card/edge re-evaluate Rust state.
  invalidateProjectedBlueprints(index);
  return snapshot;
}

/** Remove transient Worker projections when replacing the entire canonical world. */
export function clearRustWorkerRuntimePresentation(world) {
  if (!world?.simulation) return;
  const index = buildPresentationIndex(world);
  for (const nodes of index.nodesById.values()) {
    for (const node of nodes) {
      deleteHidden(node, 'runtimePresentation');
      deleteHidden(node, 'runtimeDetail');
    }
  }
  for (const stream of index.streams) deleteHidden(stream, '_runtimePresentationMassFlowKgPerSecond');
  for (const occurrence of Object.values(world.resourceOccurrences ?? {})) deleteHidden(occurrence, 'runtimePresentation');
  deleteHidden(world.simulation, 'runtimePresentationAuthority');
  invalidateProjectedBlueprints(index);
}
