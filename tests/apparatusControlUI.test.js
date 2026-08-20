import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  apparatusChoiceParameterDefinition,
  apparatusParameterSelectionOptions,
} from '../src/workspace/apparatusControlUI.js';

test('choice-backed apparatus parameters expose canonical dropdown options from process definitions', () => {
  const definition = apparatusChoiceParameterDefinition('targetParticleSizeMm');
  assert.ok(definition);

  const options = apparatusParameterSelectionOptions('targetParticleSizeMm', 25);
  assert.deepEqual(options.map(option => option.value), [1, 5, 15, 25, 60, 120]);
  assert.deepEqual(options.map(option => option.label), ['≤1', '≤5', '≤15', '≤25', '≤60', '≤120']);
  assert.equal(options.find(option => option.value === 25)?.selected, true);
});

test('continuous apparatus parameters remain numeric rather than receiving selection options', () => {
  assert.equal(apparatusChoiceParameterDefinition('fieldStrength'), null);
  assert.equal(apparatusParameterSelectionOptions('fieldStrength', 0.6), null);
});

test('legacy noncanonical values remain visible but disabled until a canonical selection is chosen', () => {
  const options = apparatusParameterSelectionOptions('targetParticleSizeMm', 10);
  assert.deepEqual(options[0], {
    value: 10,
    label: '10 (legacy)',
    selected: true,
    disabled: true,
    legacy: true,
  });
  assert.deepEqual(options.slice(1).map(option => option.value), [1, 5, 15, 25, 60, 120]);
});

test('application installs the apparatus control upgrader and loads matching control styles', () => {
  const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(appSource, /import \{ installApparatusControlUI \} from '\.\/workspace\/apparatusControlUI\.js'/);
  assert.match(appSource, /installApparatusControlUI\(\)/);
  assert.match(indexSource, /href="apparatus-controls\.css"/);
});
