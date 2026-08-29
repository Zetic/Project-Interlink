import { invalidateBlueprintPresentation } from '../simulation/simulationEngine.js';

function runtimeBlueprints(world) {
  return [
    ...Object.values(world?.simulation?.sessions ?? {}),
    ...Object.values(world?.simulation?.workspaces ?? {}),
  ];
}

function nodeIndex(world) {
  const result = new Map();
  for (const blueprint of runtimeBlueprints(world)) {
    for (const node of Object.values(blueprint?.nodes ?? {})) {
      if (node?.id) result.set(node.id, { node, blueprint });
    }
  }
  return result;
}

function streamForConnection(blueprint, connection) {
  if (!connection) return null;
  return Object.values(blueprint?.streams ?? {}).find(stream => stream.connectionId === connection.id) ?? null;
}

function connectionForPort(blueprint, nodeId, portId, direction) {
  return Object.values(blueprint?.connections ?? {}).find(connection => (
    connection.kind === 'material'
    && (direction === 'input'
      ? connection.targetNodeId === nodeId && connection.targetPortId === portId
      : connection.sourceNodeId === nodeId && connection.sourcePortId === portId)
  )) ?? null;
}

function projectMachineStreams(blueprint, machineSetup, machineSnapshot) {
  const inputRates = machineSnapshot.inputMassFlowKgPerSecond ?? [];
  const outputRates = machineSnapshot.outputMassFlowKgPerSecond ?? [];
  (machineSetup?.inputPortIds ?? []).forEach((portId, index) => {
    const stream = streamForConnection(
      blueprint,
      connectionForPort(blueprint, machineSnapshot.id, portId, 'input'),
    );
    if (!stream) return;
    stream.runtimePresentation = {
      totalMassFlowKgPerSecond: inputRates[index] ?? 0,
      summaryOnly: true,
    };
  });
  (machineSetup?.outputPortIds ?? []).forEach((portId, index) => {
    const stream = streamForConnection(
      blueprint,
      connectionForPort(blueprint, machineSnapshot.id, portId, 'output'),
    );
    if (!stream) return;
    stream.runtimePresentation = {
      totalMassFlowKgPerSecond: outputRates[index] ?? 0,
      summaryOnly: true,
    };
  });
}

/**
 * Apply presentation-only scalar state from the authoritative Worker. Canonical
 * graph/config objects remain editable in JavaScript, but physical inventory is
 * not copied back into them on every fixed step.
 */
export function applyRealtimeRuntimeSnapshot(world, snapshot, setup) {
  if (!world?.simulation || !snapshot) return false;
  world.simulation.running = snapshot.running === true;
  world.simulation.elapsedSeconds = snapshot.elapsedSeconds ?? world.simulation.elapsedSeconds ?? 0;

  for (const site of snapshot.sites ?? []) {
    const blueprint = world.simulation.sessions?.[site.id];
    if (!blueprint?.simulationStats) continue;
    blueprint.simulationStats.elapsedSeconds = site.elapsedSeconds ?? 0;
    blueprint.simulationStats.extractedKg = site.extractedKg ?? 0;
  }

  const nodes = nodeIndex(world);
  for (const hopper of snapshot.hoppers ?? []) {
    const entry = nodes.get(hopper.id);
    if (!entry) continue;
    entry.node.runtimePresentation = {
      kind: 'hopper',
      storedMassKg: hopper.storedMassKg ?? 0,
      sensibleEnthalpyJ: hopper.sensibleEnthalpyJ ?? 0,
      summaryOnly: true,
    };
  }

  const machineSetupById = new Map(
    (setup?.machines ?? []).map(machine => [machine.canonicalNodeId, machine]),
  );
  for (const machine of snapshot.machines ?? []) {
    const entry = nodes.get(machine.id);
    if (!entry) continue;
    entry.node.runtimePresentation = {
      kind: 'machine',
      operatingState: machine.operatingState || (entry.node.enabled ? 'idle' : 'off'),
      lastError: machine.lastError || null,
      inputMassFlowKgPerSecond: [...(machine.inputMassFlowKgPerSecond ?? [])],
      outputMassFlowKgPerSecond: [...(machine.outputMassFlowKgPerSecond ?? [])],
      furnace: machine.furnace ? { ...machine.furnace } : null,
      summaryOnly: true,
    };
    // Existing Inspector/render code reads these diagnostic scalars directly.
    entry.node.operatingState = entry.node.runtimePresentation.operatingState;
    entry.node.lastError = entry.node.runtimePresentation.lastError;
    if (machine.furnace) {
      entry.node.actualChargeTemperatureK = machine.furnace.actualChargeTemperatureK;
      entry.node.lastHeaterPowerKw = machine.furnace.lastHeaterPowerKw;
      entry.node.lastReactionPowerKw = machine.furnace.lastReactionPowerKw;
    }
    projectMachineStreams(entry.blueprint, machineSetupById.get(machine.id), machine);
  }

  for (const vent of snapshot.exhaustVents ?? []) {
    const entry = nodes.get(vent.id);
    if (!entry) continue;
    entry.node.runtimePresentation = {
      kind: 'exhaustVent',
      totalEmittedMassKg: vent.ventedGasMassKg ?? 0,
      summaryOnly: true,
    };
  }

  for (const transfer of snapshot.boundaryTransfers ?? []) {
    const canonical = world.simulation.transfers?.[transfer.id];
    if (!canonical) continue;
    canonical.lastMovedKg = transfer.lastMovedKg ?? 0;
    canonical.lastRateKgPerSecond = transfer.lastRateKgPerSecond ?? 0;
  }

  for (const blueprint of Object.values(world.simulation.sessions ?? {})) {
    invalidateBlueprintPresentation(blueprint);
  }
  return true;
}

export function clearRealtimeRuntimeProjection(world) {
  if (!world?.simulation) return;
  for (const blueprint of runtimeBlueprints(world)) {
    for (const node of Object.values(blueprint?.nodes ?? {})) delete node.runtimePresentation;
    for (const stream of Object.values(blueprint?.streams ?? {})) delete stream.runtimePresentation;
    invalidateBlueprintPresentation(blueprint);
  }
}
