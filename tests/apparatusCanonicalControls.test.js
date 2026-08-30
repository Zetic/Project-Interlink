
import test from 'node:test';
import assert from 'node:assert/strict';
import { APPARATUS_DEFINITIONS } from '../src/content/apparatus/definitions.js';
import { getProcessDefinition } from '../src/core/processes/definitions/index.js';

test('canonical apparatus defaults are process-definition values, not duplicated UI physics constants', () => {
  for (const definition of Object.values(APPARATUS_DEFINITIONS)) {
    if (!definition.processId) continue;
    const process = getProcessDefinition(definition.processId);
    for (const parameter of process.parameters ?? []) {
      assert.equal(definition.defaults[parameter.id], parameter.defaultValue, `${definition.nodeType}.${parameter.id}`);
    }
  }
});
