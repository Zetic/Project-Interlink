import { SIMULATION_STEP_S } from './simulationEngine.js';

export const REALTIME_RUNTIME_PROTOCOL_VERSION = 4;

export const RUNTIME_COMMAND_TYPES = Object.freeze({
  INIT: 'init',
  RECONFIGURE: 'reconfigure',
  PAUSE: 'pause',
  RESUME: 'resume',
  STEP_FIXED: 'step-fixed',
  ADVANCE_FIXED: 'advance-fixed',
});

export const RUNTIME_EVENT_TYPES = Object.freeze({
  READY: 'ready',
  RECONFIGURED: 'reconfigured',
  STEPPED: 'stepped',
  RUN_STATE: 'run-state',
  ERROR: 'error',
});

export function createRuntimeCommand(type, payload = {}) {
  const command = {
    protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION,
    type,
    payload,
  };
  validateRuntimeCommand(command);
  return command;
}

export function validateRuntimeCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw new Error('runtime command must be an object');
  }
  if (command.protocolVersion !== REALTIME_RUNTIME_PROTOCOL_VERSION) {
    throw new Error(`runtime command protocolVersion must be ${REALTIME_RUNTIME_PROTOCOL_VERSION}`);
  }
  if (!Object.values(RUNTIME_COMMAND_TYPES).includes(command.type)) {
    throw new Error(`unknown runtime command '${command.type}'`);
  }
  if (!command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) {
    throw new Error('runtime command payload must be an object');
  }
  if (command.type === RUNTIME_COMMAND_TYPES.INIT || command.type === RUNTIME_COMMAND_TYPES.RECONFIGURE) {
    if (!command.payload.setup || typeof command.payload.setup !== 'object' || Array.isArray(command.payload.setup)) {
      throw new Error(`${command.type} requires a compiled runtime setup object`);
    }
  }
  if (command.type === RUNTIME_COMMAND_TYPES.RECONFIGURE) {
    const resetNodeIds = command.payload.resetNodeIds ?? [];
    if (!Array.isArray(resetNodeIds) || resetNodeIds.some(id => typeof id !== 'string' || id.length === 0)) {
      throw new Error('reconfigure resetNodeIds must be an array of canonical node IDs');
    }
  }
  if (command.type === RUNTIME_COMMAND_TYPES.STEP_FIXED) {
    const dt = command.payload.dt ?? SIMULATION_STEP_S;
    if (dt !== SIMULATION_STEP_S) {
      throw new Error(`step-fixed requires the authoritative ${SIMULATION_STEP_S} s timestep`);
    }
  }
  if (command.type === RUNTIME_COMMAND_TYPES.ADVANCE_FIXED) {
    const steps = command.payload.steps;
    if (!Number.isInteger(steps) || steps < 0 || steps > 10_000) {
      throw new Error('advance-fixed requires an integer steps value between 0 and 10000');
    }
  }
  return command;
}

export function createRuntimeEvent(type, payload = {}) {
  if (!Object.values(RUNTIME_EVENT_TYPES).includes(type)) {
    throw new Error(`unknown runtime event '${type}'`);
  }
  return {
    protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION,
    type,
    payload,
  };
}
