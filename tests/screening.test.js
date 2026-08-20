import test from 'node:test';
import assert from 'node:assert/strict';

import { APPARATUS_DEFINITIONS } from '../src/content/apparatus/definitions.js';
import {
  CRUSHING_PROCESS_ID,
  SCREENING_PROCESS_ID,
  getProcessDefinition,
} from '../src/core/processes/definitions/index.js';
import { executeProcess } from '../src/core/processes/processExecution.js';
import { splitScreenedSolidState } from '../src/core/processes/physics/screening.js';
import {
  createSolidMaterialBody,
  createSolidMaterialState,
  summarizeSolidMaterialBySizeBin,
  totalSolidQuantity,
} from '../src/core/materials/solids/solidMaterialState.js';
import {
  blueprintAddApparatus,
  blueprintConnect,
  checkBlueprintConnection,
  createBlueprint,
  setApparatusParameter,
  simulationTick,
} from '../src/simulation/simulationEngine.js';
import { hopperStoredMassKg } from '../src/simulation/hopperNode.js';
import { NODE_DEFINITIONS } from '../src/workspace/catalog/nodeCatalog.js';

function mixedScreenFeed() {
  return createSolidMaterialState([
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'locked', quantity: 30 },
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'partial', quantity: 20 },
    { speciesId: 'magnetite', sizeBinId: '25-60mm', liberationClassId: 'mostly-liberated', quantity: 40 },
    { speciesId: 'quartz', sizeBinId: '60-120mm', liberationClassId: 'liberated', quantity: 10 },
  ]);
}

function buildScreenLine({
  feedMaterialBody = createSolidMaterialBody(mixedScreenFeed()),
  undersizeCapacityKg = 1000,
  oversizeCapacityKg = 1000,
  connectUndersize = true,
  connectOversize = true,
} = {}) {
  const blueprint = createBlueprint();
  const feed = blueprintAddApparatus(blueprint, 'hopper', {
    capacityKg: 1000,
    initialMaterialBody: feedMaterialBody,
  });
  const screen = blueprintAddApparatus(blueprint, 'screen', {
    throughputKgPerSecond: 40,
    apertureSizeMm: 25,
    enabled: true,
  });
  const undersize = blueprintAddApparatus(blueprint, 'hopper', { capacityKg: undersizeCapacityKg });
  const oversize = blueprintAddApparatus(blueprint, 'hopper', { capacityKg: oversizeCapacityKg });

  assert.ok(blueprintConnect(blueprint, feed.id, 'output', screen.id, 'feed'));
  if (connectUndersize) assert.ok(blueprintConnect(blueprint, screen.id, 'undersize', undersize.id, 'input'));
  if (connectOversize) assert.ok(blueprintConnect(blueprint, screen.id, 'oversize', oversize.id, 'input'));

  return { blueprint, feed, screen, undersize, oversize };
}

test('Screen is definition-driven and uses the canonical particle-size cuts', () => {
  const screenDefinition = APPARATUS_DEFINITIONS.screen;
  assert.ok(screenDefinition);
  assert.equal(screenDefinition.processId, SCREENING_PROCESS_ID);
  assert.deepEqual(screenDefinition.ports.map(port => port.id), ['feed', 'undersize', 'oversize']);
  assert.ok(NODE_DEFINITIONS.some(definition => definition.id === 'screen' && definition.label === 'Screen'));

  const screenChoices = screenDefinition.parameters[0].choices.map(choice => choice.value);
  const crusherChoices = getProcessDefinition(CRUSHING_PROCESS_ID).parameters[0].choices.map(choice => choice.value);
  assert.deepEqual(screenChoices, [1, 5, 15, 25, 60, 120]);
  assert.deepEqual(screenChoices, crusherChoices);
});

test('ideal screening routes whole existing fractions at a sharp cut without changing state', () => {
  const input = mixedScreenFeed();
  const before = structuredClone(input);
  const { undersize, oversize } = splitScreenedSolidState(input, 25);

  assert.deepEqual(input, before, 'screening must not mutate feed state');
  assert.equal(totalSolidQuantity(input), 100);
  assert.equal(totalSolidQuantity(undersize), 50);
  assert.equal(totalSolidQuantity(oversize), 50);
  assert.deepEqual(summarizeSolidMaterialBySizeBin(undersize), {
    '5-15mm': 30,
    '15-25mm': 20,
  });
  assert.deepEqual(summarizeSolidMaterialBySizeBin(oversize), {
    '25-60mm': 40,
    '60-120mm': 10,
  });
  assert.equal(undersize.fractions['quartz|5-15mm|locked'], 30);
  assert.equal(oversize.fractions['quartz|60-120mm|liberated'], 10);
});

test('screening batch execution produces two conserved output batches', () => {
  const process = getProcessDefinition(SCREENING_PROCESS_ID);
  const result = executeProcess(process, {
    feed: { id: 'batch-feed', materialBody: createSolidMaterialBody(mixedScreenFeed()) },
  }, { apertureSizeMm: 25 });

  assert.deepEqual(result.outputPortBatches.map(output => output.outputId), ['undersize', 'oversize']);
  assert.equal(totalSolidQuantity(result.outputPortBatches[0].materialBody.solidState), 50);
  assert.equal(totalSolidQuantity(result.outputPortBatches[1].materialBody.solidState), 50);
  assert.equal(result.metrics.balanceErrorKg, 0);
});

test('Screen continuously routes undersize and oversize at configured throughput', () => {
  const { blueprint, feed, screen, undersize, oversize } = buildScreenLine();

  simulationTick(blueprint, null, 1);

  assert.equal(screen.operatingState, 'running');
  assert.equal(screen.lastError, null);
  assert.equal(hopperStoredMassKg(feed), 60);
  assert.equal(hopperStoredMassKg(undersize), 20);
  assert.equal(hopperStoredMassKg(oversize), 20);
  assert.deepEqual(summarizeSolidMaterialBySizeBin(undersize.materialBody.solidState), {
    '5-15mm': 12,
    '15-25mm': 8,
  });
  assert.deepEqual(summarizeSolidMaterialBySizeBin(oversize.materialBody.solidState), {
    '25-60mm': 16,
    '60-120mm': 4,
  });
});

test('Screen requires both outputs before consuming feed', () => {
  const { blueprint, feed, screen, undersize } = buildScreenLine({ connectOversize: false });
  const beforeFeed = hopperStoredMassKg(feed);

  simulationTick(blueprint, null, 1);

  assert.equal(screen.operatingState, 'blocked');
  assert.match(screen.lastError, /requires feed, undersize, and oversize connections/);
  assert.equal(hopperStoredMassKg(feed), beforeFeed);
  assert.equal(hopperStoredMassKg(undersize), 0);
});

test('Screen applies output backpressure transactionally when a required product has no capacity', () => {
  const { blueprint, feed, screen, undersize, oversize } = buildScreenLine({ undersizeCapacityKg: 1 });
  undersize.materialBody = createSolidMaterialBody(createSolidMaterialState([
    { speciesId: 'quartz', sizeBinId: 'lt-1mm', liberationClassId: 'liberated', quantity: 1 },
  ]));
  const beforeFeed = hopperStoredMassKg(feed);
  const beforeOversize = hopperStoredMassKg(oversize);

  simulationTick(blueprint, null, 1);

  assert.equal(screen.operatingState, 'blocked');
  assert.match(screen.lastError, /outputs are full/);
  assert.equal(hopperStoredMassKg(feed), beforeFeed);
  assert.equal(hopperStoredMassKg(undersize), 1);
  assert.equal(hopperStoredMassKg(oversize), beforeOversize);
});

test('Screen aperture parameter accepts canonical choices and rejects arbitrary cuts', () => {
  const blueprint = createBlueprint();
  const screen = blueprintAddApparatus(blueprint, 'screen');

  setApparatusParameter(blueprint, screen.id, 'apertureSizeMm', 15);
  assert.equal(screen.apertureSizeMm, 15);
  assert.throws(
    () => setApparatusParameter(blueprint, screen.id, 'apertureSizeMm', 10),
    /canonical value/,
  );
});

test('Screen feed compatibility remains capability-driven rather than machine-pair driven', () => {
  const blueprint = createBlueprint();
  const crusher = blueprintAddApparatus(blueprint, 'crusher');
  const hopper = blueprintAddApparatus(blueprint, 'hopper');
  const screen = blueprintAddApparatus(blueprint, 'screen');

  const directCrusherFeed = checkBlueprintConnection(blueprint, crusher.id, 'product', screen.id, 'feed');
  assert.equal(directCrusherFeed.ok, false);
  assert.match(directCrusherFeed.reason, /capabilities/);

  const storedFeed = checkBlueprintConnection(blueprint, hopper.id, 'output', screen.id, 'feed');
  assert.equal(storedFeed.ok, true);
});
