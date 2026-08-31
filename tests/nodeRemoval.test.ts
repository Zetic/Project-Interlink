
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blueprintAddFeatureSource, blueprintAddHopper, blueprintAddCrusher, blueprintAddExtractor,
  blueprintAddMagSep, blueprintConnect, createBlueprint, createBlueprintLayout,
} from '../src/simulation/simulationEngine.js';
import { HOPPER_TOLERANCE_KG } from '../src/simulation/hopperNode.js';
import { canRemoveNode, nodeOwnedMatterKg, nodeRemovalEligibility, removeBlueprintNode } from '../src/workspace/graph/nodeRemoval.js';

test('empty player-authored node removal clears layout, connections, and material streams', () => {
  const blueprint = createBlueprint(); const layout = createBlueprintLayout();
  const input = blueprintAddHopper(blueprint); const crusher = blueprintAddCrusher(blueprint);
  layout.nodePositions[crusher.id] = { x: 1, y: 1 };
  const connection = blueprintConnect(blueprint, input.id, input.outputPortId, crusher.id, crusher.inputPortId);
  assert.equal(removeBlueprintNode(blueprint, layout, crusher.id).removed, true);
  assert.equal(blueprint.connections[connection.id], undefined);
});

test('Rust-owned Hopper matter blocks removal above the physical tolerance', () => {
  const blueprint = createBlueprint(); const layout = createBlueprintLayout(); const hopper = blueprintAddHopper(blueprint);
  hopper.runtimePresentation = { authority: 'rust-wasm-worker', storedMassKg: 2 };
  assert.equal(nodeOwnedMatterKg(hopper), 2);
  assert.equal(canRemoveNode(blueprint, hopper.id), false);
  assert.equal(removeBlueprintNode(blueprint, layout, hopper.id).removed, false);
  hopper.runtimePresentation.storedMassKg = HOPPER_TOLERANCE_KG / 2;
  assert.equal(canRemoveNode(blueprint, hopper.id), true);
});

test('Feature and Site boundary nodes are not removable through player policy', () => {
  const blueprint = createBlueprint(); const feature = blueprintAddFeatureSource(blueprint, { featureId: 'feature' }); const boundary = blueprintAddHopper(blueprint);
  boundary.boundaryRole = 'import'; boundary.systemType = 'boundary-buffer';
  assert.equal(nodeRemovalEligibility(blueprint, feature).removable, false);
  assert.equal(nodeRemovalEligibility(blueprint, boundary).removable, false);
});

test('current player-placeable apparatus are removable when Rust reports them empty', () => {
  const blueprint = createBlueprint();
  for (const node of [blueprintAddHopper(blueprint), blueprintAddCrusher(blueprint), blueprintAddExtractor(blueprint, 'occ'), blueprintAddMagSep(blueprint)]) {
    assert.equal(canRemoveNode(blueprint, node.id), true);
  }
});
