import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { AppStore } from '../dist/state/appState.js';

test('runtime and telemetry updates do not wake structural map/application subscribers', () => {
  const store = new AppStore();
  let structuralCalls = 0;
  let runtimeCalls = 0;
  let telemetryCalls = 0;

  const unsubscribeStructural = store.subscribe(() => { structuralCalls += 1; });
  const unsubscribeRuntime = store.subscribeDomains(['runtime'], () => { runtimeCalls += 1; });
  const unsubscribeTelemetry = store.subscribeDomains(['telemetry'], () => { telemetryCalls += 1; });

  assert.deepEqual({ structuralCalls, runtimeCalls, telemetryCalls }, {
    structuralCalls: 1,
    runtimeCalls: 1,
    telemetryCalls: 1,
  });

  store.updateRuntime({ running: true });
  assert.deepEqual({ structuralCalls, runtimeCalls, telemetryCalls }, {
    structuralCalls: 1,
    runtimeCalls: 2,
    telemetryCalls: 1,
  });

  store.updateRuntime({ telemetry: { workerRoundTripMs: 3.5 } });
  assert.deepEqual({ structuralCalls, runtimeCalls, telemetryCalls }, {
    structuralCalls: 1,
    runtimeCalls: 2,
    telemetryCalls: 2,
  });

  store.setCamera({ centerX: 4, centerY: 7, zoom: 2 });
  assert.deepEqual({ structuralCalls, runtimeCalls, telemetryCalls }, {
    structuralCalls: 2,
    runtimeCalls: 2,
    telemetryCalls: 2,
  });

  unsubscribeStructural();
  unsubscribeRuntime();
  unsubscribeTelemetry();
});

test('player-facing runtime presentation is live while profiling remains opt-in', () => {
  const app = fs.readFileSync('src/app.ts', 'utf8');
  const store = fs.readFileSync('src/state/appState.ts', 'utf8');
  const runtime = fs.readFileSync('src/runtime/runtimeController.ts', 'utf8');
  const mapPresentation = fs.readFileSync('src/map/mapRuntimePresentation.ts', 'utf8');
  const mechanical = fs.readFileSync('src/map/rendering/mechanicalRenderer.ts', 'utf8');
  const resources = fs.readFileSync('src/map/rendering/resourceRenderer.ts', 'utf8');
  const inspector = fs.readFileSync('src/ui/inspectorPanel.ts', 'utf8');
  const debug = fs.readFileSync('src/ui/debugPanel.ts', 'utf8');

  assert.match(app, /installMapRuntimePresentation\(root, store\)/);
  assert.match(store, /STRUCTURAL_APP_DOMAINS/);
  assert.match(store, /subscribeDomains\(STRUCTURAL_APP_DOMAINS, listener\)/);

  assert.match(runtime, /queueSelectedDetailRefresh\(\)/);
  assert.match(runtime, /subscribeDomains\(\['selection'\]/);
  assert.match(runtime, /send\('query-detail'/);
  assert.match(runtime, /runtimePatch\(patch\);\s*queueSelectedDetailRefresh\(\)/);

  assert.match(mapPresentation, /subscribeDomains\(\['world', 'graph', 'runtime'\]/);
  assert.match(mapPresentation, /updateMechanicalRuntimePresentation/);
  assert.match(mapPresentation, /updateResourceRuntimePresentation/);
  assert.match(mechanical, /data-runtime-node-text/);
  assert.match(mechanical, /actualRateKgPerSecond/);
  assert.match(mechanical, /storedMassKg/);
  assert.match(resources, /data-runtime-resource-text/);
  assert.match(resources, /remainingMassKg/);

  assert.match(inspector, /subscribeDomains\(\['world', 'graph', 'selection', 'camera', 'runtime'\]/);
  assert.doesNotMatch(inspector, /Refresh Material Detail/);
  assert.match(inspector, /geographicLocationKey/);

  assert.match(debug, /setProfiling/);
  assert.match(debug, /#ws-debug-deep-profiling/);
});

test('node progress and composite Inspector quantities retain the stable UI grammar', () => {
  const mechanical = fs.readFileSync('src/map/rendering/mechanicalRenderer.ts', 'utf8');
  const inspector = fs.readFileSync('src/ui/inspectorPanel.ts', 'utf8');
  const css = fs.readFileSync('styles/map.css', 'utf8');

  assert.match(mechanical, /data-runtime-hopper-fill/);
  assert.match(mechanical, /data-runtime-hopper-percent/);
  assert.match(mechanical, /NODE_CARD_LOCAL_HEIGHT \* \(percent \/ 100\)/);
  assert.match(mechanical, /Math\.round\(percent\).*%/);
  assert.match(css, /\.ws-map-mechanical-label,\s*\.ws-map-mechanical-runtime \{ fill: #d6e4ed; text-anchor: middle; \}/);
  assert.match(css, /\.ws-map-hopper-fill \{[\s\S]*fill-opacity: 0\.27/);
  assert.match(inspector, /const total = entries\.reduce/);
  assert.match(inspector, /\$\{percentage\.toFixed\(1\)\}%/);
});
