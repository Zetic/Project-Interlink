/**
 * SimulationEngine — fixed-timestep simulation for the Engineering workspace.
 *
 * Advances the blueprint network in discrete steps independent of UI rendering.
 *
 * Blueprint = {
 *   nodes: { [nodeId]: node },         // hoppers, extractors, crushers, magSeps
 *   connections: { [connId]: connection },  // { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId }
 *   streams: { [streamId]: stream },   // MaterialStream instances (rates + state)
 * }
 *
 * Physical node types:
 *   'extractor'  — produces continuous outflow from a ResourceOccurrence
 *   'hopper'     — finite capacity storage (hopperNode.js)
 *   'crusher'    — continuous crushing (continuousProcessing.js)
 *   'magSep'     — continuous magnetic separation (continuousProcessing.js)
 *
 * Simulation tick:
 *   1. Resolve extractor output rates (throttled by downstream free capacity)
 *   2. For each process node: compute available feed from connected input hoppers
 *   3. Apply process transformation to feed rates
 *   4. Deliver output rates to output hoppers
 *   5. Update streams to reflect actual rates
 *
 * Node layout (x, y, width, height) is APPLICATION STATE stored in
 * `blueprintLayout` and is NOT physical simulation state.
 * Moving a node must not mutate any hopper/stream/process state.
 *
 * Fixed timestep: SIMULATION_STEP_S (default 0.1 s = 10 Hz).
 */

import { createExtractor, extractorOutputRates, DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND } from './extractorNode.js';
import { createHopper, hopperFreeCapacityKg, hopperStoredMassKg, hopperReceiveInflow, hopperWithdraw, HOPPER_TOLERANCE_KG } from './hopperNode.js';
import { applyContinuousCrushing, applyContinuousMagneticSeparation } from './continuousProcessing.js';
import { createMaterialStream, totalMassFlowKgPerSecond } from './materialStream.js';
import { getProcessDefinition, CRUSHING_PROCESS_ID, MAGNETIC_SEPARATION_PROCESS_ID } from '../core/processes/processDefinitions.js';

/** Fixed simulation timestep (seconds). */
export const SIMULATION_STEP_S = 0.1;

/** Default hopper capacity (kg). */
export const DEFAULT_HOPPER_CAPACITY_KG = 1000;

/** Default crusher throughput (kg/s). */
export const DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S = 4;

/** Default crusher target particle size (mm). */
export const DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM = 15;

/** Default magnetic separator field strength. */
export const DEFAULT_MAG_SEP_FIELD_STRENGTH = 0.6;

let _nextNodeOrdinal = 1;
let _nextConnectionOrdinal = 1;
let _nextStreamOrdinal = 1;

function nextNodeId() { return `node-${_nextNodeOrdinal++}`; }
function nextConnectionId() { return `conn-${_nextConnectionOrdinal++}`; }
function nextStreamId() { return `stream-${_nextStreamOrdinal++}`; }

// Expose reset for test isolation
export function _resetOrdinals() {
  _nextNodeOrdinal = 1;
  _nextConnectionOrdinal = 1;
  _nextStreamOrdinal = 1;
}

/**
 * Create an empty Blueprint.
 * @returns {object} blueprint
 */
export function createBlueprint() {
  return {
    nodes: {},
    connections: {},
    streams: {},
  };
}

/**
 * Add an extractor node to the blueprint.
 *
 * @param {object} blueprint
 * @param {string} occurrenceId
 * @param {number} [rateKgPerSecond]
 * @returns {object} node
 */
export function blueprintAddExtractor(blueprint, occurrenceId, rateKgPerSecond = DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND) {
  const id = nextNodeId();
  const node = createExtractor({ id, occurrenceId, prototypeRateKgPerSecond: rateKgPerSecond });
  blueprint.nodes[id] = node;
  return node;
}

/**
 * Add a hopper node to the blueprint.
 *
 * @param {object} blueprint
 * @param {number} [capacityKg]
 * @returns {object} node
 */
export function blueprintAddHopper(blueprint, capacityKg = DEFAULT_HOPPER_CAPACITY_KG) {
  const id = nextNodeId();
  const node = createHopper({ id, capacityKg });
  blueprint.nodes[id] = node;
  return node;
}

/**
 * Add a crusher node to the blueprint.
 *
 * @param {object} blueprint
 * @param {object} [params]
 * @param {number} [params.throughputKgPerSecond]
 * @param {number} [params.targetParticleSizeMm]
 * @returns {object} node
 */
export function blueprintAddCrusher(blueprint, {
  throughputKgPerSecond = DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
  targetParticleSizeMm = DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
} = {}) {
  const id = nextNodeId();
  const processDef = getProcessDefinition(CRUSHING_PROCESS_ID);
  const node = {
    id,
    nodeType: 'crusher',
    processId: CRUSHING_PROCESS_ID,
    processDef,
    throughputKgPerSecond,
    targetParticleSizeMm,
    inputPortId: 'feed',
    outputPortId: 'product',
  };
  blueprint.nodes[id] = node;
  return node;
}

/**
 * Add a magnetic separator node to the blueprint.
 *
 * @param {object} blueprint
 * @param {object} [params]
 * @param {number} [params.fieldStrength]
 * @returns {object} node
 */
export function blueprintAddMagSep(blueprint, { fieldStrength = DEFAULT_MAG_SEP_FIELD_STRENGTH } = {}) {
  const id = nextNodeId();
  const processDef = getProcessDefinition(MAGNETIC_SEPARATION_PROCESS_ID);
  const node = {
    id,
    nodeType: 'magSep',
    processId: MAGNETIC_SEPARATION_PROCESS_ID,
    processDef,
    fieldStrength,
    inputPortId: 'feed',
    concentratePortId: 'concentrate',
    tailingsPortId: 'tailings',
    maxFeedParticleSizeMm: processDef?.maxFeedParticleSizeMm ?? 25,
  };
  blueprint.nodes[id] = node;
  return node;
}

/**
 * Connect two ports in the blueprint.
 * Returns the new connection or null if it would be a duplicate.
 *
 * @param {object} blueprint
 * @param {string} sourceNodeId
 * @param {string} sourcePortId
 * @param {string} targetNodeId
 * @param {string} targetPortId
 * @returns {object|null} connection
 */
export function blueprintConnect(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
  // Prevent duplicate connections on the same port pair
  for (const conn of Object.values(blueprint.connections)) {
    if (conn.targetNodeId === targetNodeId && conn.targetPortId === targetPortId) {
      return null; // target port already occupied
    }
  }

  const id = nextConnectionId();
  const connection = { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId };
  blueprint.connections[id] = connection;

  // Create an initial zero-flow stream for this connection
  const streamId = nextStreamId();
  blueprint.streams[streamId] = {
    id: streamId,
    connectionId: id,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    componentMassFlowKgPerSecond: {},
    particleSizeMm: 1,
    totalMassFlowKgPerSecond: 0,
  };

  return connection;
}

/**
 * Remove a connection (and its stream) from the blueprint.
 *
 * @param {object} blueprint
 * @param {string} connectionId
 */
export function blueprintDisconnect(blueprint, connectionId) {
  delete blueprint.connections[connectionId];
  for (const [streamId, stream] of Object.entries(blueprint.streams)) {
    if (stream.connectionId === connectionId) {
      delete blueprint.streams[streamId];
    }
  }
}

/**
 * Get the stream for a given connection id.
 *
 * @param {object} blueprint
 * @param {string} connectionId
 * @returns {object|null}
 */
export function getStreamForConnection(blueprint, connectionId) {
  return Object.values(blueprint.streams).find(s => s.connectionId === connectionId) ?? null;
}

/**
 * Helper: find the connection (and stream) feeding into a given node+port.
 */
function findInboundConnection(blueprint, targetNodeId, targetPortId) {
  for (const conn of Object.values(blueprint.connections)) {
    if (conn.targetNodeId === targetNodeId && conn.targetPortId === targetPortId) {
      return conn;
    }
  }
  return null;
}

/**
 * Helper: find all connections leaving a given node+port.
 */
function findOutboundConnections(blueprint, sourceNodeId, sourcePortId) {
  return Object.values(blueprint.connections).filter(
    c => c.sourceNodeId === sourceNodeId && c.sourcePortId === sourcePortId
  );
}

/**
 * Update a stream's rates in the blueprint.streams map.
 */
function updateStream(blueprint, connectionId, componentRates, particleSizeMm) {
  const stream = getStreamForConnection(blueprint, connectionId);
  if (!stream) return;
  stream.componentMassFlowKgPerSecond = { ...componentRates };
  stream.particleSizeMm = particleSizeMm;
  stream.totalMassFlowKgPerSecond = Object.values(componentRates).reduce((s, r) => s + r, 0);
}

/**
 * Advance the blueprint simulation by one fixed timestep.
 *
 * @param {object} blueprint
 * @param {object} world - world state (for ResourceOccurrence access)
 * @param {number} [dt=SIMULATION_STEP_S]
 */
export function simulationTick(blueprint, world, dt = SIMULATION_STEP_S) {
  const nodes = blueprint.nodes;

  // Process nodes in topological order:
  // extractors → hoppers (receiving from extractors) → process nodes → output hoppers

  for (const node of Object.values(nodes)) {
    if (node.nodeType === 'extractor') {
      const occurrence = world?.resourceOccurrences?.[node.occurrenceId];
      if (!occurrence) continue;

      // Find downstream connection from extractor output port
      const outConns = findOutboundConnections(blueprint, node.id, node.outputPortId);
      for (const conn of outConns) {
        const targetNode = nodes[conn.targetNodeId];
        if (!targetNode || targetNode.nodeType !== 'hopper') continue;

        // Throttle extractor by downstream hopper free capacity
        const freeKg = hopperFreeCapacityKg(targetNode);
        const { componentMassFlowKgPerSecond, particleSizeMm } = extractorOutputRates(node, occurrence, 1);
        const requestedTotalKg = Object.values(componentMassFlowKgPerSecond).reduce((s, r) => s + r, 0) * dt;
        const throttle = requestedTotalKg > 0 ? Math.min(1, freeKg / requestedTotalKg) : 0;

        const throttledRates = {};
        for (const [cid, rate] of Object.entries(componentMassFlowKgPerSecond)) {
          throttledRates[cid] = rate * throttle;
        }

        // Push to hopper
        hopperReceiveInflow(targetNode, throttledRates, particleSizeMm, dt);

        // Update stream
        updateStream(blueprint, conn.id, throttledRates, particleSizeMm);
      }
    }

    else if (node.nodeType === 'crusher') {
      const feedConn = findInboundConnection(blueprint, node.id, node.inputPortId);
      if (!feedConn) continue;
      const feedHopper = nodes[feedConn.sourceNodeId];
      if (!feedHopper || feedHopper.nodeType !== 'hopper') continue;

      const storedMass = hopperStoredMassKg(feedHopper);
      if (storedMass <= HOPPER_TOLERANCE_KG) {
        // Empty — zero out streams
        updateStream(blueprint, feedConn.id, {}, feedHopper.particleSizeMm ?? 1);
        for (const outConn of findOutboundConnections(blueprint, node.id, node.outputPortId)) {
          updateStream(blueprint, outConn.id, {}, node.targetParticleSizeMm ?? 1);
        }
        continue;
      }

      // Build feed rates proportionally from hopper composition
      const feedComponents = {};
      for (const [cid, kg] of Object.entries(feedHopper.storedComponentsKg)) {
        feedComponents[cid] = (kg / storedMass) * node.throughputKgPerSecond;
      }
      const feedRates = { componentMassFlowKgPerSecond: feedComponents, particleSizeMm: feedHopper.particleSizeMm ?? 80 };

      let result;
      try {
        result = applyContinuousCrushing(feedRates, node.targetParticleSizeMm, node.throughputKgPerSecond);
      } catch {
        continue;
      }

      // Withdraw actual feed from input hopper
      hopperWithdraw(feedHopper, result.actualFeedRates.componentMassFlowKgPerSecond, dt);
      updateStream(blueprint, feedConn.id, result.actualFeedRates.componentMassFlowKgPerSecond, feedRates.particleSizeMm);

      // Push product to output hopper
      for (const outConn of findOutboundConnections(blueprint, node.id, node.outputPortId)) {
        const outHopper = nodes[outConn.targetNodeId];
        if (!outHopper || outHopper.nodeType !== 'hopper') continue;
        hopperReceiveInflow(outHopper, result.productRates.componentMassFlowKgPerSecond, result.productRates.particleSizeMm, dt);
        updateStream(blueprint, outConn.id, result.productRates.componentMassFlowKgPerSecond, result.productRates.particleSizeMm);
      }
    }

    else if (node.nodeType === 'magSep') {
      const feedConn = findInboundConnection(blueprint, node.id, node.inputPortId);
      if (!feedConn) continue;
      const feedHopper = nodes[feedConn.sourceNodeId];
      if (!feedHopper || feedHopper.nodeType !== 'hopper') continue;

      const storedMass = hopperStoredMassKg(feedHopper);
      if (storedMass <= HOPPER_TOLERANCE_KG) {
        updateStream(blueprint, feedConn.id, {}, feedHopper.particleSizeMm ?? 1);
        continue;
      }

      const particleSizeMm = feedHopper.particleSizeMm ?? 1;
      if (particleSizeMm > node.maxFeedParticleSizeMm) {
        // Feed too coarse — cannot separate
        continue;
      }

      // Build feed rates from hopper composition
      const feedComponents = {};
      const maxThroughputRateKgPerS = node.processDef?.throughputCapacityKgPerSecond
        ?? DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S;

      for (const [cid, kg] of Object.entries(feedHopper.storedComponentsKg)) {
        feedComponents[cid] = (kg / storedMass) * maxThroughputRateKgPerS;
      }
      const feedRates = { componentMassFlowKgPerSecond: feedComponents, particleSizeMm };

      let result;
      try {
        result = applyContinuousMagneticSeparation(feedRates, node.fieldStrength, node.maxFeedParticleSizeMm);
      } catch {
        continue;
      }

      // Withdraw feed
      hopperWithdraw(feedHopper, result.actualFeedRates.componentMassFlowKgPerSecond, dt);
      updateStream(blueprint, feedConn.id, result.actualFeedRates.componentMassFlowKgPerSecond, particleSizeMm);

      // Push concentrate
      for (const concConn of findOutboundConnections(blueprint, node.id, node.concentratePortId)) {
        const outHopper = nodes[concConn.targetNodeId];
        if (!outHopper || outHopper.nodeType !== 'hopper') continue;
        hopperReceiveInflow(outHopper, result.concentrateRates.componentMassFlowKgPerSecond, result.concentrateRates.particleSizeMm, dt);
        updateStream(blueprint, concConn.id, result.concentrateRates.componentMassFlowKgPerSecond, result.concentrateRates.particleSizeMm);
      }

      // Push tailings
      for (const tailConn of findOutboundConnections(blueprint, node.id, node.tailingsPortId)) {
        const outHopper = nodes[tailConn.targetNodeId];
        if (!outHopper || outHopper.nodeType !== 'hopper') continue;
        hopperReceiveInflow(outHopper, result.tailingsRates.componentMassFlowKgPerSecond, result.tailingsRates.particleSizeMm, dt);
        updateStream(blueprint, tailConn.id, result.tailingsRates.componentMassFlowKgPerSecond, result.tailingsRates.particleSizeMm);
      }
    }
  }
}

/**
 * Run the simulation for a given real-world elapsed time, using fixed timesteps.
 *
 * @param {object} blueprint
 * @param {object} world
 * @param {number} elapsedSeconds
 * @param {number} [dt=SIMULATION_STEP_S]
 * @returns {number} ticksExecuted
 */
export function simulationAdvance(blueprint, world, elapsedSeconds, dt = SIMULATION_STEP_S) {
  const ticks = Math.floor(elapsedSeconds / dt);
  for (let i = 0; i < ticks; i++) {
    simulationTick(blueprint, world, dt);
  }
  return ticks;
}

/**
 * Create a Blueprint layout state object (application state, NOT physical state).
 * Node positions here must not mutate any physical simulation data.
 *
 * @returns {object} layout
 */
export function createBlueprintLayout() {
  return { nodePositions: {} };
}

/**
 * Update a node's visual layout position.
 * This operates ONLY on the layout object and does NOT touch the blueprint's
 * physical node/stream/hopper state.
 *
 * @param {object} layout
 * @param {string} nodeId
 * @param {number} x
 * @param {number} y
 */
export function layoutMoveNode(layout, nodeId, x, y) {
  layout.nodePositions[nodeId] = { x, y };
}
