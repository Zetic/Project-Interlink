
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REALTIME_RUNTIME_PROTOCOL_VERSION,
  RUNTIME_COMMAND_TYPES,
  RUNTIME_EVENT_TYPES,
  createRuntimeCommand,
  createRuntimeEvent,
  validateRuntimeCommand,
} from '../src/simulation/runtimeProtocol.js';

test('runtime command protocol preserves authoritative fixed-step command semantics', () => {
  const pause = createRuntimeCommand(RUNTIME_COMMAND_TYPES.PAUSE);
  const resume = createRuntimeCommand(RUNTIME_COMMAND_TYPES.RESUME);
  const step = createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED, { dt: 0.1 }, 17);
  assert.equal(pause.protocolVersion, REALTIME_RUNTIME_PROTOCOL_VERSION);
  assert.equal(pause.type, RUNTIME_COMMAND_TYPES.PAUSE);
  assert.equal(resume.type, RUNTIME_COMMAND_TYPES.RESUME);
  assert.equal(step.payload.dt, 0.1);
  assert.equal(step.requestId, 17);

  const event = createRuntimeEvent(
    RUNTIME_EVENT_TYPES.STEPPED,
    { advanced: true, elapsedSeconds: 0.1 },
    17,
  );
  assert.equal(event.protocolVersion, REALTIME_RUNTIME_PROTOCOL_VERSION);
  assert.equal(event.type, RUNTIME_EVENT_TYPES.STEPPED);
  assert.equal(event.payload.advanced, true);
  assert.equal(event.requestId, 17);
});

test('runtime protocol rejects version/request drift and non-authoritative timesteps', () => {
  assert.throws(
    () => createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED, { dt: 0.2 }),
    /authoritative 0.1 s timestep/,
  );
  assert.throws(
    () => validateRuntimeCommand({
      protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION - 1,
      type: RUNTIME_COMMAND_TYPES.PAUSE,
      payload: {},
    }),
    /protocolVersion/,
  );
  assert.throws(
    () => validateRuntimeCommand({
      protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION,
      requestId: 0,
      type: RUNTIME_COMMAND_TYPES.PAUSE,
      payload: {},
    }),
    /positive safe integer/,
  );
});

test('batched fixed-step protocol validates bounded integer work requests', () => {
  assert.equal(createRuntimeCommand(RUNTIME_COMMAND_TYPES.ADVANCE_FIXED, { steps: 10 }).payload.steps, 10);
  assert.throws(() => createRuntimeCommand(RUNTIME_COMMAND_TYPES.ADVANCE_FIXED, { steps: -1 }), /between 0 and 10000/);
  assert.throws(() => createRuntimeCommand(RUNTIME_COMMAND_TYPES.ADVANCE_FIXED, { steps: 1.5 }), /between 0 and 10000/);
  assert.throws(() => createRuntimeCommand(RUNTIME_COMMAND_TYPES.ADVANCE_FIXED, { steps: 10001 }), /between 0 and 10000/);
});

test('init/reconfigure and detail commands validate typed payload contracts', () => {
  assert.throws(() => createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT), /compiled runtime setup object/);
  const init = createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT, { setup: { sites: [] } });
  assert.deepEqual(init.payload.setup, { sites: [] });
  assert.throws(
    () => createRuntimeCommand(RUNTIME_COMMAND_TYPES.RECONFIGURE, { setup: {}, resetNodeIds: [''] }),
    /canonical node IDs/,
  );
  assert.deepEqual(
    createRuntimeCommand(RUNTIME_COMMAND_TYPES.QUERY_DETAIL, { entityType: 'hopper', id: 'hopper-a' }).payload,
    { entityType: 'hopper', id: 'hopper-a' },
  );
  assert.throws(
    () => createRuntimeCommand(RUNTIME_COMMAND_TYPES.QUERY_DETAIL, { entityType: 'stream', id: 'x' }),
    /entityType/,
  );
});
