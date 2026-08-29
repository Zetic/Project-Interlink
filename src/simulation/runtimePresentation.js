/**
 * Read-only presentation projection for the authoritative Rust/WASM Worker.
 *
 * The Worker owns physical truth after the player-facing cutover. This module
 * mirrors only compact scalar state required by the existing renderer. It does
 * not reconstruct packed fraction populations on every fixed step.
 */

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

/**
 * Build every lookup needed by one compact Worker snapshot in a single pass.
 * Projection therefore scales with the visible runtime graph rather than doing
 * a workspace scan for every Hopper, machine, vent, and passive link.
 */
function buildPresentationIndex(world) {
  const blueprints = uniqueBlueprints(world);
  const nodeById = new Map();
  const inputStreamByPort = new Map();
  const outputStreamByPort = new Map();
  const passiveStreamBySiteConnection = new Map();
  const streams = [];
  const canonicalSiteByBlueprint = new Map(
    Object.entries(world?.simulation?.sessions ?? {}).map(([siteId, blueprint]) => [blueprint, siteId]),
  );

  for (const blueprint of blueprints) {
    for (const node of Object.values(blueprint.nodes ?? {})) {
      if (node?.id) nodeById.set(node.id, node);
    }

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

  return {
    blueprints,
    nodeById,
    inputStreamByPort,
    outputStreamByPort,
    passiveStreamBySiteConnection,
    streams,
  };
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

/** Return true when browser-visible physical state is a Worker projection. */
export function rustWorkerPresentationIsAuthoritative(world) {
  return world?.simulation?.runtimePresentationAuthority === RUST_WORKER_PRESENTATION_AUTHORITY;
}

/**
 * Apply one compact snapshot to presentation mirrors only. Packed material and
 * thermochemical state remain owned by Rust in the Worker.
 */
export function applyRustWorkerRuntimeSnapshot(world, runtime, snapshot) {
  if (!world?.simulation || !snapshot) return snapshot;
  const simulation = world.simulation;
  const index = buildPresentationIndex(world);
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
    const node = index.nodeById.get(hopperSnapshot.id);
    if (!node) continue;
    setHidden(node, 'runtimePresentation', {
      authority: RUST_WORKER_PRESENTATION_AUTHORITY,
      storedMassKg: Math.max(0, hopperSnapshot.storedMassKg ?? 0),
      sensibleEnthalpyJ: hopperSnapshot.sensibleEnthalpyJ ?? 0,
    });
  }

  for (const occurrenceSnapshot of snapshot.occurrences ?? []) {
    const occurrence = world.resourceOccurrences?.[occurrenceSnapshot.id];
    if (!occurrence) continue;
    setHidden(occurrence, 'runtimePresentation', {
      authority: RUST_WORKER_PRESENTATION_AUTHORITY,
      extractedMassKg: occurrenceSnapshot.extractedMassKg ?? 0,
      remainingMassKg: occurrenceSnapshot.remainingMassKg ?? null,
    });
  }

  clearProjectedStreamFlows(index);
  const setupMachines = new Map((runtime?.setup?.machines ?? []).map(machine => [machine.canonicalNodeId, machine]));
  for (const machineSnapshot of snapshot.machines ?? []) {
    const node = index.nodeById.get(machineSnapshot.id);
    if (!node) continue;
    const presentation = {
      authority: RUST_WORKER_PRESENTATION_AUTHORITY,
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
    setHidden(node, 'runtimePresentation', presentation);
    projectMachineFlows(index, setupMachines.get(machineSnapshot.id), machineSnapshot);
  }

  for (const ventSnapshot of snapshot.exhaustVents ?? []) {
    const node = index.nodeById.get(ventSnapshot.id);
    if (!node) continue;
    setHidden(node, 'runtimePresentation', {
      authority: RUST_WORKER_PRESENTATION_AUTHORITY,
      ventedGasMassKg: ventSnapshot.ventedGasMassKg ?? 0,
    });
  }

  // Snapshot passive-link rows deliberately stay compact. They retain the same
  // ordering as setup.passiveLinks, whose numeric Site ID resolves through the
  // stable runtime Site table. Connection IDs are only blueprint-local, so the
  // Site component is required to avoid projecting one Site's flow into another.
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
  return snapshot;
}

/** Drop presentation authority when falling back to the synchronous JS runtime. */
export function clearRustWorkerRuntimePresentation(world) {
  if (!world?.simulation) return;
  if (Object.prototype.hasOwnProperty.call(world.simulation, 'runtimePresentationAuthority')) {
    world.simulation.runtimePresentationAuthority = null;
  }
  const index = buildPresentationIndex(world);
  for (const node of index.nodeById.values()) {
    if (node?.runtimePresentation?.authority === RUST_WORKER_PRESENTATION_AUTHORITY) node.runtimePresentation = null;
  }
  for (const stream of index.streams) {
    if (Object.prototype.hasOwnProperty.call(stream, '_runtimePresentationMassFlowKgPerSecond')) {
      stream._runtimePresentationMassFlowKgPerSecond = null;
    }
  }
}
