/**
 * World-owned fixed-step simulation clock.
 *
 * Workspaces register physical runtime sessions here; rendering and navigation
 * do not own or stop the clock.
 */

import { simulationTick, SIMULATION_STEP_S } from './simulationEngine.js';

export function createWorldSimulation(world) {
  if (!world || typeof world !== 'object') throw new Error('World simulation requires a world object');
  if (!world.simulation) {
    world.simulation = {
      running: true,
      elapsedSeconds: 0,
      sessions: {},
    };
  } else {
    world.simulation.sessions ??= {};
    if (typeof world.simulation.running !== 'boolean') world.simulation.running = true;
    if (!Number.isFinite(world.simulation.elapsedSeconds)) world.simulation.elapsedSeconds = 0;
  }
  return world.simulation;
}

export function registerSimulationSession(world, sessionId, blueprint) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('Simulation sessionId must be a non-empty string');
  }
  const simulation = createWorldSimulation(world);
  simulation.sessions[sessionId] = blueprint;
  return blueprint;
}

export function pauseWorldSimulation(world) {
  createWorldSimulation(world).running = false;
}

export function resumeWorldSimulation(world) {
  createWorldSimulation(world).running = true;
}

export function worldSimulationTick(world, dt = SIMULATION_STEP_S) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('World simulation dt must be a finite positive number');
  }
  const simulation = createWorldSimulation(world);
  if (!simulation.running) return { advanced: false, ticks: 0 };

  for (const blueprint of Object.values(simulation.sessions)) {
    simulationTick(blueprint, world, dt);
  }
  simulation.elapsedSeconds += dt;
  return { advanced: true, ticks: 1 };
}

export function worldSimulationAdvance(world, elapsedSeconds, dt = SIMULATION_STEP_S) {
  if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error('elapsedSeconds must be a finite non-negative number');
  }
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('World simulation dt must be a finite positive number');
  }
  const ticks = Math.floor((elapsedSeconds + 1e-12) / dt);
  for (let i = 0; i < ticks; i++) worldSimulationTick(world, dt);
  return ticks;
}
