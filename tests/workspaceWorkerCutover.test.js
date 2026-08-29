import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controllerSource = readFileSync(new URL('../src/workspace/workspaceController.js', import.meta.url), 'utf8');
const presentationSource = readFileSync(new URL('../src/simulation/runtimePresentation.js', import.meta.url), 'utf8');

test('player workspace scheduler advances through the realtime runtime facade rather than direct JS world ticks', () => {
  assert.equal(controllerSource.includes('worldSimulationTick('), false);
  assert.match(controllerSource, /createRealtimeRuntime\(world\)/);
  assert.match(controllerSource, /realtimeRuntime\.stepFixed\(SIMULATION_STEP_S\)/);
  assert.match(controllerSource, /simStepInFlight/);
  assert.match(controllerSource, /runtimeMutationPending === 0/);
});

test('player graph edits are serialized into Rust Worker live reconfiguration', () => {
  assert.match(controllerSource, /function queueRuntimeReconfigure/);
  assert.match(controllerSource, /runtime\.reconfigure\(wsState\.world/);
  assert.match(controllerSource, /runtimeMutationChain/);
  assert.ok((controllerSource.match(/queueRuntimeReconfigure\(/g) ?? []).length >= 8);
});

test('normal Worker presentation deliberately mirrors scalar state instead of packed fraction arrays', () => {
  assert.match(presentationSource, /not reconstruct packed fraction populations/);
  assert.match(presentationSource, /storedMassKg/);
  assert.match(presentationSource, /inputMassFlowKgPerSecond/);
  assert.match(presentationSource, /outputMassFlowKgPerSecond/);
  assert.equal(presentationSource.includes('speciesIds'), false);
  assert.equal(presentationSource.includes('sizeBinIds'), false);
  assert.equal(presentationSource.includes('quantities'), false);
});
