import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  blueprintAddFeatureSource,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintAddExtractor,
  blueprintAddMagSep,
  blueprintConnect,
  createBlueprint,
  createBlueprintLayout,
} from '../src/simulation/simulationEngine.js';
import { HOPPER_TOLERANCE_KG, hopperReceiveInflow } from '../src/simulation/hopperNode.js';
import {
  canRemoveNode,
  nodeOwnedMatterKg,
  nodeRemovalEligibility,
  removeBlueprintNode,
} from '../src/workspace/nodeRemoval.js';

test('empty player-authored node removal clears layout, connections, and material streams', () => {
  const blueprint = createBlueprint();
  const layout = createBlueprintLayout();
  const input = blueprintAddHopper(blueprint);
  const crusher = blueprintAddCrusher(blueprint);
  layout.nodePositions[input.id] = { x: 20, y: 30 };
  layout.nodePositions[crusher.id] = { x: 200, y: 30 };
  const connection = blueprintConnect(blueprint, input.id, input.outputPortId, crusher.id, crusher.inputPortId);
  assert.ok(connection);
  assert.equal(Object.keys(blueprint.streams).length, 1);

  const result = removeBlueprintNode(blueprint, layout, crusher.id);

  assert.equal(result.removed, true);
  assert.equal(blueprint.nodes[crusher.id], undefined);
  assert.equal(blueprint.connections[connection.id], undefined);
  assert.deepEqual(blueprint.streams, {});
  assert.equal(layout.nodePositions[crusher.id], undefined);
  assert.equal(canRemoveNode(blueprint, input.id), true);
});

test('hopper matter blocks removal above the physical tolerance', () => {
  const blueprint = createBlueprint();
  const layout = createBlueprintLayout();
  const hopper = blueprintAddHopper(blueprint);
  hopperReceiveInflow(hopper, { hematite: 2 }, 10, 1);

  assert.equal(nodeOwnedMatterKg(hopper), 2);
  assert.equal(canRemoveNode(blueprint, hopper.id), false);
  assert.equal(nodeRemovalEligibility(blueprint, hopper.id).reason, 'Cannot delete node while it contains material.');
  const result = removeBlueprintNode(blueprint, layout, hopper.id);
  assert.equal(result.removed, false);
  assert.ok(blueprint.nodes[hopper.id]);
  assert.equal(Object.keys(blueprint.connections).length, 0);

  hopper.storedComponentsKg.hematite = HOPPER_TOLERANCE_KG / 2;
  assert.equal(canRemoveNode(blueprint, hopper.id), true);
});

test('Feature and Site boundary nodes are not removable through the player policy', () => {
  const blueprint = createBlueprint();
  const feature = blueprintAddFeatureSource(blueprint, { featureId: 'feature' });
  const boundary = blueprintAddHopper(blueprint);
  boundary.boundaryRole = 'import';
  boundary.systemType = 'boundary-buffer';

  assert.equal(nodeRemovalEligibility(blueprint, feature).removable, false);
  assert.equal(nodeRemovalEligibility(blueprint, boundary).removable, false);
  assert.equal(removeBlueprintNode(blueprint, null, feature.id).removed, false);
  assert.equal(removeBlueprintNode(blueprint, null, boundary.id).removed, false);
  assert.ok(blueprint.nodes[feature.id]);
  assert.ok(blueprint.nodes[boundary.id]);
});

test('all current player-placeable node types are eligible when empty', () => {
  const blueprint = createBlueprint();
  const nodes = [
    blueprintAddHopper(blueprint),
    blueprintAddCrusher(blueprint),
    blueprintAddExtractor(blueprint, 'occurrence'),
    blueprintAddMagSep(blueprint),
  ];
  for (const node of nodes) assert.equal(canRemoveNode(blueprint, node.id), true);
});
