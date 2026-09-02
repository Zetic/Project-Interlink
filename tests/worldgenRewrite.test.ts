import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  WORLDGEN_BOUNDARY_CONVERGENT,
  WORLDGEN_BOUNDARY_DIVERGENT,
  WORLDGEN_BOUNDARY_TRANSFORM,
  WORLDGEN_PROTOCOL_VERSION,
  WORLDGEN_SYNTHETIC_MAX_SAMPLES,
  WORLDGEN_TECTONICS_MAX_LEVEL,
  WORLDGEN_TECTONICS_MAX_PLATES,
  WORLDGEN_TECTONICS_MIN_PLATES,
  WORLDGEN_TOPOLOGY_MAX_LEVEL,
  validateSyntheticRequest,
  validateTectonicsRequest,
  validateTopologyRequest,
  worldgenSyntheticCommand,
  worldgenTectonicsCommand,
  worldgenTopologyCommand,
} from '../dist/worldgen/protocol.js';

test('Planet Engine browser protocol v3 preserves earlier diagnostics and adds bounded WG-2 tectonics', () => {
  assert.equal(WORLDGEN_PROTOCOL_VERSION, 3);
  assert.equal(WORLDGEN_SYNTHETIC_MAX_SAMPLES, 4_194_304);
  assert.equal(WORLDGEN_TOPOLOGY_MAX_LEVEL, 7);
  assert.equal(WORLDGEN_TECTONICS_MAX_LEVEL, 6);
  assert.equal(WORLDGEN_TECTONICS_MIN_PLATES, 4);
  assert.equal(WORLDGEN_TECTONICS_MAX_PLATES, 48);
  assert.deepEqual([WORLDGEN_BOUNDARY_CONVERGENT, WORLDGEN_BOUNDARY_DIVERGENT, WORLDGEN_BOUNDARY_TRANSFORM], [1, 2, 3]);

  const synthetic = worldgenSyntheticCommand(7, { seed: 'wg0', width: 512, height: 256 });
  assert.deepEqual(synthetic, {
    protocolVersion: 3,
    requestId: 7,
    type: 'generate-synthetic',
    payload: { seed: 'wg0', width: 512, height: 256 },
  });

  const topology = worldgenTopologyCommand(8, { level: 4 });
  assert.deepEqual(topology, {
    protocolVersion: 3,
    requestId: 8,
    type: 'generate-topology',
    payload: { level: 4 },
  });

  const tectonics = worldgenTectonicsCommand(9, { seed: 'wg2', level: 5, plateCount: 16 });
  assert.deepEqual(tectonics, {
    protocolVersion: 3,
    requestId: 9,
    type: 'generate-tectonics',
    payload: { seed: 'wg2', level: 5, plateCount: 16 },
  });

  assert.throws(() => validateSyntheticRequest({ seed: '', width: 1, height: 1 }), /seed/i);
  assert.throws(() => validateSyntheticRequest({ seed: 'x', width: 4096, height: 4096 }), /limited/i);
  assert.doesNotThrow(() => validateTopologyRequest({ level: 7 }));
  assert.throws(() => validateTopologyRequest({ level: 8 }), /0 through 7/i);
  assert.throws(() => validateTopologyRequest({ level: 1.5 }), /integer/i);
  assert.doesNotThrow(() => validateTectonicsRequest({ seed: 'x', level: 6, plateCount: 24 }));
  assert.throws(() => validateTectonicsRequest({ seed: '', level: 5, plateCount: 16 }), /seed/i);
  assert.throws(() => validateTectonicsRequest({ seed: 'x', level: 7, plateCount: 16 }), /0 through 6/i);
  assert.throws(() => validateTectonicsRequest({ seed: 'x', level: 5, plateCount: 3 }), /4 through 48/i);
  assert.throws(() => validateTectonicsRequest({ seed: 'x', level: 0, plateCount: 13 }), /sample count/i);
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
  assert.ok(fs.existsSync('rust/interlink-worldgen/src/tectonics.rs'));
  assert.ok(fs.existsSync('rust/interlink-worldgen-wasm/Cargo.toml'));
  assert.ok(fs.existsSync('rust/interlink-worldgen-cli/Cargo.toml'));
});

test('WG-2 lab renders physical plate diagnostics rather than gameplay geography', () => {
  const html = fs.readFileSync('worldgen-lab.html', 'utf8');
  assert.match(html, /WORLDGEN REWRITE · WG-2/);
  assert.match(html, /Orthographic globe/);
  assert.match(html, /Plate ownership/);
  assert.match(html, /Boundary type/);
  assert.match(html, /Plate motion/);
  assert.match(html, /No continental\/oceanic crust/);
  assert.doesNotMatch(html, /Region Inspector|resource node|NAV/i);
});
