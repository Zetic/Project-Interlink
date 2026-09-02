import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  WORLDGEN_PROTOCOL_VERSION,
  WORLDGEN_SYNTHETIC_MAX_SAMPLES,
  WORLDGEN_TOPOLOGY_MAX_LEVEL,
  validateSyntheticRequest,
  validateTopologyRequest,
  worldgenSyntheticCommand,
  worldgenTopologyCommand,
} from '../dist/worldgen/protocol.js';

test('Planet Engine browser protocol v2 preserves WG-0 diagnostics and adds bounded WG-1 topology', () => {
  assert.equal(WORLDGEN_PROTOCOL_VERSION, 2);
  assert.equal(WORLDGEN_SYNTHETIC_MAX_SAMPLES, 4_194_304);
  assert.equal(WORLDGEN_TOPOLOGY_MAX_LEVEL, 7);

  const synthetic = worldgenSyntheticCommand(7, { seed: 'wg0', width: 512, height: 256 });
  assert.deepEqual(synthetic, {
    protocolVersion: 2,
    requestId: 7,
    type: 'generate-synthetic',
    payload: { seed: 'wg0', width: 512, height: 256 },
  });

  const topology = worldgenTopologyCommand(8, { level: 4 });
  assert.deepEqual(topology, {
    protocolVersion: 2,
    requestId: 8,
    type: 'generate-topology',
    payload: { level: 4 },
  });

  assert.throws(() => validateSyntheticRequest({ seed: '', width: 1, height: 1 }), /seed/i);
  assert.throws(() => validateSyntheticRequest({ seed: 'x', width: 4096, height: 4096 }), /limited/i);
  assert.doesNotThrow(() => validateTopologyRequest({ level: 7 }));
  assert.throws(() => validateTopologyRequest({ level: 8 }), /0 through 7/i);
  assert.throws(() => validateTopologyRequest({ level: 1.5 }), /integer/i);
});

test('new Planet Engine source stays independent from legacy gameplay world objects', () => {
  const files = [
    'src/worldgen/protocol.ts',
    'src/worldgen/worldgenClient.ts',
    'src/worldgen/worldgenWorker.ts',
    'src/worldgen/diagnostics/worldgenLabStandalone.ts',
  ];
  const forbidden = [/\.\.\/world\//, /Region\b/, /MapSelection\b/, /GeographyPatch\b/, /resourceNode/i];
  for (const path of files) {
    const source = fs.readFileSync(path, 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${path} must not depend on ${pattern}`);
  }
  assert.ok(fs.existsSync('rust/interlink-worldgen/src/topology.rs'));
  assert.ok(fs.existsSync('rust/interlink-worldgen/src/coordinates.rs'));
  assert.ok(fs.existsSync('rust/interlink-worldgen-wasm/Cargo.toml'));
  assert.ok(fs.existsSync('rust/interlink-worldgen-cli/Cargo.toml'));
});

test('WG-1 lab is topology diagnostics rather than gameplay geography', () => {
  const html = fs.readFileSync('worldgen-lab.html', 'utf8');
  assert.match(html, /WORLDGEN REWRITE · WG-1/);
  assert.match(html, /Orthographic globe/);
  assert.match(html, /Dual-cell area/);
  assert.doesNotMatch(html, /Region Inspector|resource node|NAV/i);
});
