import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  WORLDGEN_PROTOCOL_VERSION,
  WORLDGEN_SYNTHETIC_MAX_SAMPLES,
  validateSyntheticRequest,
  worldgenCommand,
} from '../dist/worldgen/protocol.js';

test('WG-0 browser protocol has an explicit isolated version and bounded dense field contract', () => {
  assert.equal(WORLDGEN_PROTOCOL_VERSION, 1);
  assert.equal(WORLDGEN_SYNTHETIC_MAX_SAMPLES, 4_194_304);
  const command = worldgenCommand(7, { seed: 'wg0', width: 512, height: 256 });
  assert.deepEqual(command, {
    protocolVersion: 1,
    requestId: 7,
    type: 'generate-synthetic',
    payload: { seed: 'wg0', width: 512, height: 256 },
  });
  assert.throws(() => validateSyntheticRequest({ seed: '', width: 1, height: 1 }), /seed/i);
  assert.throws(() => validateSyntheticRequest({ seed: 'x', width: 4096, height: 4096 }), /limited/i);
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
  assert.ok(fs.existsSync('rust/interlink-worldgen/Cargo.toml'));
  assert.ok(fs.existsSync('rust/interlink-worldgen-wasm/Cargo.toml'));
  assert.ok(fs.existsSync('rust/interlink-worldgen-cli/Cargo.toml'));
});
