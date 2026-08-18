/** World-owned fixed-step simulation clock and recursive boundary transfers. */
import { simulationTick, SIMULATION_STEP_S } from './simulationEngine.js';
import { createBoundaryBuffer } from './hopperNode.js';
import { transferBoundaryMaterial, validateBoundaryTransfer } from './boundaryTransfer.js';
import { createCompositeNode, createSystemPort, getSystemNodePort } from './systemNode.js';

export const DEFAULT_BOUNDARY_TRANSFER_RATE_KG_PER_SECOND = 10;
export const DEFAULT_REGIONAL_BUFFER_CAPACITY_KG = 1000;

function ensureSimulationShape(world) {
  world.simulation ??= {};
  const simulation = world.simulation;
  if (typeof simulation.running !== 'boolean') simulation.running = true;
  if (!Number.isFinite(simulation.elapsedSeconds)) simulation.elapsedSeconds = 0;
  simulation.sessions ??= {}; simulation.workspaces ??= {}; simulation.transfers ??= {};
  if (!Number.isInteger(simulation.nextTransferOrdinal) || simulation.nextTransferOrdinal < 1) simulation.nextTransferOrdinal = 1;
  return simulation;
}
function replacePorts(node, ports) { if (!Array.isArray(node.ports)) node.ports = []; node.ports.splice(0, node.ports.length, ...ports); }
function existingMapping(node, id) { const p = node.ports?.find(port => port.id === id); return { childNodeId: p?.childNodeId ?? null, childPortId: p?.childPortId ?? null }; }

function normalizeRecursiveContracts(world) {
  for (const [siteId, site] of Object.entries(world.sites ?? {})) {
    const node = world.systemNodes?.[siteId]; if (!node) continue;
    const input = existingMapping(node, 'material-input'); const output = existingMapping(node, 'material-output');
    replacePorts(node, [
      createSystemPort({ id: 'material-input', direction: 'input', kind: 'material', label: 'material in', ...input }),
      createSystemPort({ id: 'material-output', direction: 'output', kind: 'material', label: 'material out', ...output }),
    ]);
    site.boundaryPorts = node.ports;
  }

  for (const [regionId, region] of Object.entries(world.regions ?? {})) {
    const node = world.systemNodes?.[regionId]; if (!node) continue;
    const importHopperId = `${regionId}-import-hopper`, exportHopperId = `${regionId}-export-hopper`;
    replacePorts(node, [
      createSystemPort({ id: 'material-input', direction: 'input', kind: 'material', label: 'material in', childNodeId: importHopperId, childPortId: 'input' }),
      createSystemPort({ id: 'material-output', direction: 'output', kind: 'material', label: 'material out', childNodeId: exportHopperId, childPortId: 'output' }),
    ]);
    region.boundaryPorts = node.ports;
    const terminalId = `${regionId}-export-terminal`;
    if (!world.systemNodes[terminalId]) world.systemNodes[terminalId] = createCompositeNode({
      id: terminalId, nodeType: 'transfer-terminal', systemType: 'regional-export-terminal', childWorkspaceId: node.childWorkspaceId,
      ports: [createSystemPort({ id: 'material-input', direction: 'input', kind: 'material', label: 'regional export in', childNodeId: exportHopperId, childPortId: 'input' })],
      inspectableState: { regionId },
    });
  }
}

function ensureSiteRuntimeWorkspace(world, siteId) {
  const simulation = ensureSimulationShape(world);
  const siteNode = world.systemNodes?.[siteId];
  if (!siteNode?.childWorkspaceId) return null;
  let workspace = simulation.workspaces[siteNode.childWorkspaceId];
  if (!workspace) {
    workspace = { id: siteNode.childWorkspaceId, nodes: {} };
    simulation.workspaces[siteNode.childWorkspaceId] = workspace;
  }
  const importId = `${siteId}-import-boundary`;
  const exportId = `${siteId}-export-boundary`;
  workspace.nodes[importId] ??= createBoundaryBuffer({
    id: importId,
    capacityKg: DEFAULT_REGIONAL_BUFFER_CAPACITY_KG,
    role: 'import',
  });
  workspace.nodes[exportId] ??= createBoundaryBuffer({
    id: exportId,
    capacityKg: DEFAULT_REGIONAL_BUFFER_CAPACITY_KG,
    role: 'export',
  });
  const input = getSystemNodePort(siteNode, 'material-input');
  const output = getSystemNodePort(siteNode, 'material-output');
  input.childNodeId = importId;
  input.childPortId = 'input';
  output.childNodeId = exportId;
  output.childPortId = 'output';
  world.sites[siteId].boundaryPorts = siteNode.ports;
  return workspace;
}

function ensureRegionRuntimeWorkspace(world, regionId) {
  const simulation = ensureSimulationShape(world), regionNode = world.systemNodes?.[regionId]; if (!regionNode?.childWorkspaceId) return null;
  let workspace = simulation.workspaces[regionNode.childWorkspaceId]; if (!workspace) { workspace = { id: regionNode.childWorkspaceId, nodes: {} }; simulation.workspaces[regionNode.childWorkspaceId] = workspace; }
  const exportHopperId = `${regionId}-export-hopper`, importHopperId = `${regionId}-import-hopper`;
  workspace.nodes[exportHopperId] ??= createBoundaryBuffer({ id: exportHopperId, capacityKg: DEFAULT_REGIONAL_BUFFER_CAPACITY_KG, role: 'export' });
  workspace.nodes[importHopperId] ??= createBoundaryBuffer({ id: importHopperId, capacityKg: DEFAULT_REGIONAL_BUFFER_CAPACITY_KG, role: 'import' });
  for (const siteId of world.regions?.[regionId]?.siteIds ?? []) if (world.systemNodes?.[siteId]) workspace.nodes[siteId] = world.systemNodes[siteId];
  const terminalId = `${regionId}-export-terminal`; if (world.systemNodes?.[terminalId]) workspace.nodes[terminalId] = world.systemNodes[terminalId];
  return workspace;
}

export function createWorldSimulation(world) {
  if (!world || typeof world !== 'object') throw new Error('World simulation requires a world object');
  const simulation = ensureSimulationShape(world);
  for (const siteId of Object.keys(world.sites ?? {})) ensureSiteRuntimeWorkspace(world, siteId);
  normalizeRecursiveContracts(world);
  for (const regionId of Object.keys(world.regions ?? {})) ensureRegionRuntimeWorkspace(world, regionId);
  return simulation;
}
export function registerSimulationWorkspace(world, workspaceId, workspace) { if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('workspaceId must be a non-empty string'); if (!workspace?.nodes) throw new Error('Simulation workspace must expose a nodes map'); const simulation = createWorldSimulation(world); simulation.workspaces[workspaceId] = workspace; return workspace; }
export function registerSimulationSession(world, sessionId, blueprint, workspaceId = null) { if (typeof sessionId !== 'string' || !sessionId) throw new Error('Simulation sessionId must be a non-empty string'); const simulation = createWorldSimulation(world); simulation.sessions[sessionId] = blueprint; if (workspaceId) registerSimulationWorkspace(world, workspaceId, blueprint); return blueprint; }
export function getSimulationWorkspace(world, workspaceId) { return createWorldSimulation(world).workspaces[workspaceId] ?? null; }

export function registerBoundaryTransfer(world, { id = null, sourceCompositeId, sourcePortId, targetCompositeId, targetPortId, capacityKgPerSecond = DEFAULT_BOUNDARY_TRANSFER_RATE_KG_PER_SECOND, priority = 0, scopeId = null } = {}) {
  const simulation = createWorldSimulation(world), sourceComposite = world.systemNodes?.[sourceCompositeId], targetComposite = world.systemNodes?.[targetCompositeId];
  validateBoundaryTransfer({ sourceComposite, sourcePortId, targetComposite, targetPortId });
  if (sourceCompositeId === targetCompositeId) throw new Error('Boundary transfer cannot connect a system to itself');
  if (typeof capacityKgPerSecond !== 'number' || !Number.isFinite(capacityKgPerSecond) || capacityKgPerSecond <= 0) throw new Error('Boundary transfer capacityKgPerSecond must be a finite positive number');
  for (const existing of Object.values(simulation.transfers)) {
    if (existing.sourceCompositeId === sourceCompositeId && existing.sourcePortId === sourcePortId) throw new Error(`Source boundary '${sourceCompositeId}:${sourcePortId}' is already connected`);
    if (existing.targetCompositeId === targetCompositeId && existing.targetPortId === targetPortId) throw new Error(`Target boundary '${targetCompositeId}:${targetPortId}' is already connected`);
  }
  const transferId = id ?? `boundary-transfer-${simulation.nextTransferOrdinal++}`; if (simulation.transfers[transferId]) throw new Error(`Boundary transfer '${transferId}' already exists`);
  return simulation.transfers[transferId] = { id: transferId, sourceCompositeId, sourcePortId, targetCompositeId, targetPortId, capacityKgPerSecond, priority, scopeId, lastMovedKg: 0, lastRateKgPerSecond: 0 };
}
export function removeBoundaryTransfer(world, transferId) { const simulation = createWorldSimulation(world), existed = Boolean(simulation.transfers[transferId]); delete simulation.transfers[transferId]; return existed; }
export function pauseWorldSimulation(world) { createWorldSimulation(world).running = false; }
export function resumeWorldSimulation(world) { createWorldSimulation(world).running = true; }

function runBoundaryTransfers(world, dt) {
  const simulation = createWorldSimulation(world), ordered = Object.values(simulation.transfers).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const transfer of ordered) {
    const result = transferBoundaryMaterial({ sourceComposite: world.systemNodes?.[transfer.sourceCompositeId], sourcePortId: transfer.sourcePortId, targetComposite: world.systemNodes?.[transfer.targetCompositeId], targetPortId: transfer.targetPortId, workspaces: simulation.workspaces, dt, requestedRateKgPerSecond: transfer.capacityKgPerSecond });
    transfer.lastMovedKg = result.movedKg; transfer.lastRateKgPerSecond = result.movedKg / dt;
  }
}
export function worldSimulationTick(world, dt = SIMULATION_STEP_S) { if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) throw new Error('World simulation dt must be a finite positive number'); const simulation = createWorldSimulation(world); if (!simulation.running) return { advanced: false, ticks: 0 }; for (const blueprint of Object.values(simulation.sessions)) simulationTick(blueprint, world, dt); runBoundaryTransfers(world, dt); simulation.elapsedSeconds += dt; return { advanced: true, ticks: 1 }; }
export function worldSimulationAdvance(world, elapsedSeconds, dt = SIMULATION_STEP_S) { if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('elapsedSeconds must be a finite non-negative number'); if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) throw new Error('World simulation dt must be a finite positive number'); const ticks = Math.floor((elapsedSeconds + 1e-12) / dt); for (let i = 0; i < ticks; i++) worldSimulationTick(world, dt); return ticks; }
