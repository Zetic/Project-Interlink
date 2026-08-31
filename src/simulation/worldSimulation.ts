/** Browser-side world/session topology compiled into the Rust/WASM runtime. */
import { createBoundaryBuffer } from './hopperNode.js';
import { validateBoundaryTransfer } from './boundaryTransfer.js';
import { createCompositeNode, createSystemPort, getSystemNodePort } from '../core/systems/systemNode.js';
import { PORT_CAPABILITIES } from '../core/systems/ports.js';
import type { SystemNode, SystemPort } from '../core/systems/types.js';
import type {
  BoundaryTransfer,
  SimulationWorkspace,
  World,
  WorldSimulationState,
} from '../core/world/types.js';
import type { Blueprint, BlueprintNode } from './types.js';

export const DEFAULT_BOUNDARY_TRANSFER_RATE_KG_PER_SECOND = 10;
export const DEFAULT_REGIONAL_BUFFER_CAPACITY_KG = 1000;

type NormalizedSimulationState = WorldSimulationState & {
  workspaces: Record<string, SimulationWorkspace>;
  transfers: Record<string, BoundaryTransfer>;
  nextTransferOrdinal: number;
};

interface WorldRuntimeCache {
  initialized: boolean;
  sessions: Blueprint[] | null;
  orderedTransfers: BoundaryTransfer[] | null;
}

interface BoundaryTransferRegistration {
  id?: string | null;
  sourceCompositeId?: string;
  sourcePortId?: string;
  targetCompositeId?: string;
  targetPortId?: string;
  capacityKgPerSecond?: number;
  priority?: number;
  scopeId?: string | null;
}

// Runtime-only execution data must not become serialized world truth. Generated
// world topology is stable during play, so expensive recursive normalization,
// session enumeration, and transfer ordering can be reused until an explicit
// simulation mutation invalidates the affected projection.
const worldRuntimeCache = new WeakMap<World, WorldRuntimeCache>();

function runtimeCacheFor(world: World): WorldRuntimeCache {
  let cache = worldRuntimeCache.get(world);
  if (!cache) {
    cache = {
      initialized: false,
      sessions: null,
      orderedTransfers: null,
    };
    worldRuntimeCache.set(world, cache);
  }
  return cache;
}

function ensureSimulationShape(world: World): NormalizedSimulationState {
  const simulation = world.simulation;
  if (typeof simulation.running !== 'boolean') simulation.running = true;
  if (!Number.isFinite(simulation.elapsedSeconds)) simulation.elapsedSeconds = 0;
  simulation.sessions ??= {};
  simulation.workspaces ??= {};
  simulation.transfers ??= {};
  if (!Number.isInteger(simulation.nextTransferOrdinal) || (simulation.nextTransferOrdinal ?? 0) < 1) {
    simulation.nextTransferOrdinal = 1;
  }
  return simulation as NormalizedSimulationState;
}

function replacePorts(node: SystemNode, ports: SystemPort[]): void {
  if (!Array.isArray(node.ports)) node.ports = [];
  node.ports.splice(0, node.ports.length, ...ports);
}

function existingMapping(node: SystemNode, id: string): { childNodeId: string | null; childPortId: string | null } {
  const port = node.ports?.find(item => item.id === id);
  return {
    childNodeId: port?.childNodeId ?? null,
    childPortId: port?.childPortId ?? null,
  };
}

function ensureRegionBoundaryAdapters(
  world: World,
  regionId: string,
  regionNode: SystemNode,
  importHopperId: string,
  exportHopperId: string,
): void {
  const importTerminalId = `${regionId}-import-terminal`;
  const exportTerminalId = `${regionId}-export-terminal`;

  if (!world.systemNodes[importTerminalId]) {
    world.systemNodes[importTerminalId] = createCompositeNode({
      id: importTerminalId,
      nodeType: 'transfer-terminal',
      systemType: 'regional-import-terminal',
      childWorkspaceId: regionNode.childWorkspaceId,
      ports: [createSystemPort({
        id: 'material-output',
        direction: 'output',
        kind: 'material',
        label: 'regional import out',
        provides: [
          PORT_CAPABILITIES.SOLID_PARTICULATE,
          PORT_CAPABILITIES.STORED_SOLID_PARTICULATE,
        ],
        childNodeId: importHopperId,
        childPortId: 'output',
      })],
      inspectableState: { regionId, boundaryRole: 'import' },
    });
  }

  if (!world.systemNodes[exportTerminalId]) {
    world.systemNodes[exportTerminalId] = createCompositeNode({
      id: exportTerminalId,
      nodeType: 'transfer-terminal',
      systemType: 'regional-export-terminal',
      childWorkspaceId: regionNode.childWorkspaceId,
      ports: [createSystemPort({
        id: 'material-input',
        direction: 'input',
        kind: 'material',
        label: 'regional export in',
        accepts: [PORT_CAPABILITIES.SOLID_PARTICULATE],
        childNodeId: exportHopperId,
        childPortId: 'input',
      })],
      inspectableState: { regionId, boundaryRole: 'export' },
    });
  }
}

function normalizeRecursiveContracts(world: World): void {
  for (const [siteId, site] of Object.entries(world.sites ?? {})) {
    const node = world.systemNodes?.[siteId];
    if (!node) continue;
    const input = existingMapping(node, 'material-input');
    const output = existingMapping(node, 'material-output');
    replacePorts(node, [
      createSystemPort({
        id: 'material-input',
        direction: 'input',
        kind: 'material',
        label: 'material in',
        accepts: [PORT_CAPABILITIES.SOLID_PARTICULATE],
        ...input,
      }),
      createSystemPort({
        id: 'material-output',
        direction: 'output',
        kind: 'material',
        label: 'material out',
        provides: [
          PORT_CAPABILITIES.SOLID_PARTICULATE,
          PORT_CAPABILITIES.STORED_SOLID_PARTICULATE,
        ],
        ...output,
      }),
    ]);
    site.boundaryPorts = node.ports;
  }

  for (const [regionId, region] of Object.entries(world.regions ?? {})) {
    const node = world.systemNodes?.[regionId];
    if (!node) continue;
    const importHopperId = `${regionId}-import-hopper`;
    const exportHopperId = `${regionId}-export-hopper`;
    replacePorts(node, [
      createSystemPort({
        id: 'material-input',
        direction: 'input',
        kind: 'material',
        label: 'material in',
        accepts: [PORT_CAPABILITIES.SOLID_PARTICULATE],
        childNodeId: importHopperId,
        childPortId: 'input',
      }),
      createSystemPort({
        id: 'material-output',
        direction: 'output',
        kind: 'material',
        label: 'material out',
        provides: [
          PORT_CAPABILITIES.SOLID_PARTICULATE,
          PORT_CAPABILITIES.STORED_SOLID_PARTICULATE,
        ],
        childNodeId: exportHopperId,
        childPortId: 'output',
      }),
    ]);
    region.boundaryPorts = node.ports;
    ensureRegionBoundaryAdapters(world, regionId, node, importHopperId, exportHopperId);
  }
}

function ensureSiteRuntimeWorkspace(world: World, siteId: string): SimulationWorkspace | null {
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
  }) as BlueprintNode;
  workspace.nodes[exportId] ??= createBoundaryBuffer({
    id: exportId,
    capacityKg: DEFAULT_REGIONAL_BUFFER_CAPACITY_KG,
    role: 'export',
  }) as BlueprintNode;

  const input = getSystemNodePort(siteNode, 'material-input');
  const output = getSystemNodePort(siteNode, 'material-output');
  input!.childNodeId = importId;
  input!.childPortId = 'input';
  output!.childNodeId = exportId;
  output!.childPortId = 'output';
  world.sites[siteId]!.boundaryPorts = siteNode.ports;
  return workspace;
}

function ensureRegionRuntimeWorkspace(world: World, regionId: string): SimulationWorkspace | null {
  const simulation = ensureSimulationShape(world);
  const regionNode = world.systemNodes?.[regionId];
  if (!regionNode?.childWorkspaceId) return null;

  let workspace = simulation.workspaces[regionNode.childWorkspaceId];
  if (!workspace) {
    workspace = { id: regionNode.childWorkspaceId, nodes: {} };
    simulation.workspaces[regionNode.childWorkspaceId] = workspace;
  }

  const exportHopperId = `${regionId}-export-hopper`;
  const importHopperId = `${regionId}-import-hopper`;
  workspace.nodes[exportHopperId] ??= createBoundaryBuffer({
    id: exportHopperId,
    capacityKg: DEFAULT_REGIONAL_BUFFER_CAPACITY_KG,
    role: 'export',
  }) as BlueprintNode;
  workspace.nodes[importHopperId] ??= createBoundaryBuffer({
    id: importHopperId,
    capacityKg: DEFAULT_REGIONAL_BUFFER_CAPACITY_KG,
    role: 'import',
  }) as BlueprintNode;

  for (const siteId of world.regions?.[regionId]?.siteIds ?? []) {
    if (world.systemNodes?.[siteId]) workspace.nodes[siteId] = world.systemNodes[siteId];
  }

  for (const terminalId of [`${regionId}-import-terminal`, `${regionId}-export-terminal`]) {
    if (world.systemNodes?.[terminalId]) workspace.nodes[terminalId] = world.systemNodes[terminalId];
  }
  return workspace;
}

function initializeWorldRuntime(
  world: World,
  simulation: NormalizedSimulationState,
  cache: WorldRuntimeCache,
): NormalizedSimulationState {
  for (const siteId of Object.keys(world.sites ?? {})) ensureSiteRuntimeWorkspace(world, siteId);
  normalizeRecursiveContracts(world);
  for (const regionId of Object.keys(world.regions ?? {})) ensureRegionRuntimeWorkspace(world, regionId);
  cache.initialized = true;
  cache.sessions = null;
  cache.orderedTransfers = null;
  return simulation;
}

export function createWorldSimulation(world: World): NormalizedSimulationState {
  if (!world || typeof world !== 'object') throw new Error('World simulation requires a world object');
  const simulation = ensureSimulationShape(world);
  const cache = runtimeCacheFor(world);
  if (!cache.initialized) initializeWorldRuntime(world, simulation, cache);
  return simulation;
}

export function registerSimulationWorkspace(
  world: World,
  workspaceId: string,
  workspace: SimulationWorkspace,
): SimulationWorkspace {
  if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('workspaceId must be a non-empty string');
  if (!workspace?.nodes) throw new Error('Simulation workspace must expose a nodes map');
  const simulation = createWorldSimulation(world);
  simulation.workspaces[workspaceId] = workspace;
  return workspace;
}

export function registerSimulationSession(
  world: World,
  sessionId: string,
  blueprint: Blueprint,
  workspaceId: string | null = null,
): Blueprint {
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('Simulation sessionId must be a non-empty string');
  const simulation = createWorldSimulation(world);
  simulation.sessions[sessionId] = blueprint;
  runtimeCacheFor(world).sessions = null;
  if (workspaceId) registerSimulationWorkspace(world, workspaceId, blueprint);
  return blueprint;
}

export function getSimulationWorkspace(world: World, workspaceId: string): SimulationWorkspace | null {
  return createWorldSimulation(world).workspaces[workspaceId] ?? null;
}

export function registerBoundaryTransfer(
  world: World,
  {
    id = null,
    sourceCompositeId,
    sourcePortId,
    targetCompositeId,
    targetPortId,
    capacityKgPerSecond = DEFAULT_BOUNDARY_TRANSFER_RATE_KG_PER_SECOND,
    priority = 0,
    scopeId = null,
  }: BoundaryTransferRegistration = {},
): BoundaryTransfer {
  const simulation = createWorldSimulation(world);
  const sourceComposite = sourceCompositeId ? world.systemNodes?.[sourceCompositeId] : undefined;
  const targetComposite = targetCompositeId ? world.systemNodes?.[targetCompositeId] : undefined;
  validateBoundaryTransfer({ sourceComposite, sourcePortId, targetComposite, targetPortId });
  if (sourceCompositeId === targetCompositeId) throw new Error('Boundary transfer cannot connect a system to itself');
  if (typeof capacityKgPerSecond !== 'number' || !Number.isFinite(capacityKgPerSecond) || capacityKgPerSecond <= 0) {
    throw new Error('Boundary transfer capacityKgPerSecond must be a finite positive number');
  }
  for (const existing of Object.values(simulation.transfers)) {
    if (existing.sourceCompositeId === sourceCompositeId && existing.sourcePortId === sourcePortId) {
      throw new Error(`Source boundary '${sourceCompositeId}:${sourcePortId}' is already connected`);
    }
    if (existing.targetCompositeId === targetCompositeId && existing.targetPortId === targetPortId) {
      throw new Error(`Target boundary '${targetCompositeId}:${targetPortId}' is already connected`);
    }
  }
  const transferId = id ?? `boundary-transfer-${simulation.nextTransferOrdinal++}`;
  if (simulation.transfers[transferId]) throw new Error(`Boundary transfer '${transferId}' already exists`);
  simulation.transfers[transferId] = {
    id: transferId,
    sourceCompositeId: sourceCompositeId!,
    sourcePortId: sourcePortId!,
    targetCompositeId: targetCompositeId!,
    targetPortId: targetPortId!,
    capacityKgPerSecond,
    priority,
    scopeId,
    lastMovedKg: 0,
    lastRateKgPerSecond: 0,
  };
  runtimeCacheFor(world).orderedTransfers = null;
  return simulation.transfers[transferId];
}

export function removeBoundaryTransfer(world: World, transferId: string): boolean {
  const simulation = createWorldSimulation(world);
  const existed = Boolean(simulation.transfers[transferId]);
  delete simulation.transfers[transferId];
  if (existed) runtimeCacheFor(world).orderedTransfers = null;
  return existed;
}
