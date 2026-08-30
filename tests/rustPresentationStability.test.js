
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const graphSource = fs.readFileSync(new URL('../src/workspace/graph/workspaceGraph.js', import.meta.url), 'utf8');
const controllerSource = fs.readFileSync(new URL('../src/workspace/workspaceController.js', import.meta.url), 'utf8');
const presentationSource = fs.readFileSync(new URL('../src/simulation/runtimePresentation.js', import.meta.url), 'utf8');

test('Worker scalar projection participates in graph-card cache invalidation', () => {
  assert.match(graphSource, /runtimePresentation\?\.revision/);
  assert.match(presentationSource, /invalidateBlueprintPresentation/);
  assert.match(controllerSource, /const mass = hopperStoredMassKg\(node\)/);
});

test('selected material detail is queried from the Rust Worker and never treated as physical fallback state', () => {
  assert.match(controllerSource, /runtime\.queryDetail\(target\.entityType, target\.id\)/);
  assert.match(controllerSource, /RUNTIME_DETAIL_REFRESH_SECONDS = 0\.5/);
  assert.doesNotMatch(controllerSource, /worldSimulationTick|main-thread-compiled/);
});
