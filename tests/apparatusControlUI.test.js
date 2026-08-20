import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  apparatusChoiceParameterDefinition,
  apparatusParameterSelectionOptions,
  installCompositionDisclosureUI,
} from '../src/workspace/apparatusControlUI.js';

test('choice-backed apparatus parameters expose canonical dropdown options from process definitions', () => {
  const definition = apparatusChoiceParameterDefinition('targetParticleSizeMm');
  assert.ok(definition);

  const options = apparatusParameterSelectionOptions('targetParticleSizeMm', 25);
  assert.deepEqual(options.map(option => option.value), [1, 5, 15, 25, 60, 120]);
  assert.deepEqual(options.map(option => option.label), ['1', '5', '15', '25', '60', '120']);
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

test('live composition disclosure toggles on pointer-down before a simulation DOM refresh can interrupt the click', () => {
  const listeners = new Map();
  const removed = [];
  const root = {
    addEventListener(type, listener, capture) {
      listeners.set(type, { listener, capture });
    },
    removeEventListener(type, listener, capture) {
      removed.push({ type, listener, capture });
    },
  };
  const details = { open: false };
  let focusCount = 0;
  const summary = {
    parentElement: details,
    closest(selector) {
      return selector === '.ws-ins-comp-details > summary' ? this : null;
    },
    focus() { focusCount += 1; },
  };
  const documentRef = { body: root };
  const stop = installCompositionDisclosureUI(documentRef);

  assert.equal(listeners.get('pointerdown')?.capture, true);
  assert.equal(listeners.get('click')?.capture, true);

  let pointerPrevented = false;
  listeners.get('pointerdown').listener({
    button: 0,
    target: summary,
    preventDefault() { pointerPrevented = true; },
  });
  assert.equal(details.open, true);
  assert.equal(pointerPrevented, true);
  assert.equal(focusCount, 1);

  // A live update may replace the summary after pointer-down. The replacement
  // inherits the already-open state, and the later mouse click must not toggle
  // it closed again.
  const replacementDetails = { open: true };
  const replacementSummary = {
    parentElement: replacementDetails,
    closest(selector) {
      return selector === '.ws-ins-comp-details > summary' ? this : null;
    },
  };
  let clickPrevented = false;
  listeners.get('click').listener({
    detail: 1,
    target: replacementSummary,
    preventDefault() { clickPrevented = true; },
  });
  assert.equal(replacementDetails.open, true);
  assert.equal(clickPrevented, true);

  // Keyboard activation has no pointer-down and still toggles normally.
  listeners.get('click').listener({
    detail: 0,
    target: replacementSummary,
    preventDefault() {},
  });
  assert.equal(replacementDetails.open, false);

  stop();
  assert.deepEqual(removed.map(item => item.type).sort(), ['click', 'pointerdown']);
});
