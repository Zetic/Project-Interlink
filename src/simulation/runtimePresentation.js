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

function blueprintContainingNode(world, nodeId) {
  return uniqueBlueprints(world).find(blueprint => blueprint.nodes?.[nodeId]) ?? null;
}

function runtimeNode(world, nodeId) {
  if (!nodeId) return null;
  for (const blueprint of uniqueBlueprints(world)) {
    if (blueprint.nodes?.[nodeId]) return blueprint.nodes[nodeId];
  }
  return null;
}

function streamForConnection(blueprint, connectionId) {
  return Object.values(blueprint?.streams ?? {}).find(stream => stream.connectionId === connectionId) ?? null;
}

function streamForConnectionAcrossWorld(world, connectionId) {
  for (const blueprint of uniqueBlueprints(world)) {
    const stream = streamForConnection(blueprint, connectionId);
    if (stream) return stream;
  }
  return null;
}

function connectionForPort(blueprint, nodeId, portId, direction) {
  return Object.values(blueprint?.connections ?? {}).find(connection =>
    connection.kind === 'material'
      && (direction === 'input'
        ? connection.targetNodeId === nodeId && connection.targetPortId === portId
        : connection.sourceNodeId === nodeId && connection.sourcePortId === portId)
  ) ?? null;
}

function setStreamFlow(stream, value) {
  setHidden(stream, '_runtimePresentationMassFlowKgPerSecond', Number.isFinite(value) ? Math.max(0, value) : 0);
}

function clearProjectedStreamFlows(world) {
  for (const blueprint of uniqueBlueprints(world)) {
    for (const stream of Object.values(blueprint.streams ?? {})) setStreamFlow(stream, 0);
  }
}

function projectMachineFlows(world, setupMachine, machineSnapshot) {
  const nodeId = setupMachine?.canonicalNodeId ?? machineSnapshot?.id;
  const blueprint = blueprintContainingNode(world, nodeId);
  if (!blueprint) return;

  (setupMachine?.inputPortIds ?? []).forEach((portId, index) => {
    const connection = connectionForPort(blueprint, nodeId, portId, 'input');
    setStreamFlow(streamForConnection(blueprint, connection?.id), machineSnapshot.inputMassFlowKgPerSecond?.[index] ?? 0);
  });
  (setupMachine?.outputPortIds ?? []).forEach((portId, index) => {
    const connection = connectionForPort(blueprint, nodeId, portId, 'output');
    setStreamFlow(streamForConnection(blueprint, connection?.id), machineSnapshot.outputMassFlowKgPerSecond?.[index] ?? 0);
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
    const node = runtimeNode(world, hopperSnapshot.id);
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

  clearProjectedStreamFlows(world);
  const setupMachines = new Map((runtime?.setup?.machines ?? []).map(machine => [machine.canonicalNodeId, machine]));
  for (const machineSnapshot of snapshot.machines ?? []) {
    const node = runtimeNode(world, machineSnapshot.id);
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
    projectMachineFlows(world, setupMachines.get(machineSnapshot.id), machineSnapshot);
  }

  for (const ventSnapshot of snapshot.exhaustVents ?? []) {
    const node = runtimeNode(world, ventSnapshot.id);
    if (!node) continue;
    setHidden(node, 'runtimePresentation', {
      authority: RUST_WORKER_PRESENTATION_AUTHORITY,
      ventedGasMassKg: ventSnapshot.ventedGasMassKg ?? 0,
    });
  }

  for (const linkSnapshot of snapshot.passiveLinks ?? []) {
    const stream = streamForConnectionAcrossWorld(world, linkSnapshot.id);
    setStreamFlow(stream, linkSnapshot.lastRateKgPerSecond ?? 0);
  }

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
  for (const blueprint of uniqueBlueprints(world)) {
    for (const node of Object.values(blueprint.nodes ?? {})) {
      if (node?.runtimePresentation?.authority === RUST_WORKER_PRESENTATION_AUTHORITY) node.runtimePresentation = null;
    }
    for (const stream of Object.values(blueprint.streams ?? {})) {
      if (Object.prototype.hasOwnProperty.call(stream, '_runtimePresentationMassFlowKgPerSecond')) {
        stream._runtimePresentationMassFlowKgPerSecond = null;
      }
    }
  }
}
