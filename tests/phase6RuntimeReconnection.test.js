import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { apparatusDefinitionById } from '../dist/apparatus/definitions.js';
import {
  connectPorts,
  createEmptyGraphState,
  placeMechanicalNode,
  setMechanicalNodeEnabled,
  setMechanicalNodeParameter,
} from '../dist/graph/graphCommands.js';
import { portForEndpoint } from '../dist/graph/graphQueries.js';
import { compileFlatRuntimePlan } from '../dist/runtime/compileRuntimePlan.js';
import {
  FLAT_RUNTIME_SITE_ID,
  NO_RUNTIME_ID,
  compileFlatWorkerSetup,
  flatWorkerParameterKey,
  flatWorkerStructureKey,
} from '../dist/runtime/workerSetup.js';
import { generateWorld } from '../dist/world/generateWorld.js';

function connect(graph, planet, from, to) {
  return connectPorts(
    graph,
    from,
    portForEndpoint(planet, graph, from),
    to,
    portForEndpoint(planet, graph, to),
  );
}

function extractionGraph(seed = 'phase6-runtime') {
  const planet = generateWorld(seed).planet;
  const resource = planet.resourceNodes[0];
  let graph = createEmptyGraphState();
  const extractor = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), resource.position); graph = extractor.graph;
  const hopper = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), resource.position); graph = hopper.graph;
  graph = setMechanicalNodeEnabled(graph, extractor.node.id, true);
  graph = connect(graph, planet, { nodeId: resource.id, portId: 'resource-access' }, { nodeId: extractor.node.id, portId: 'resource-source' });
  graph = connect(graph, planet, { nodeId: extractor.node.id, portId: 'output' }, { nodeId: hopper.node.id, portId: 'input' });
  return { planet, resource, graph, extractor: extractor.node, hopper: hopper.node };
}

test('Phase 6 compiles the flat Iron Ore FEATURE -> Extractor -> Hopper path directly for Rust', () => {
  const { planet, resource, graph, extractor, hopper } = extractionGraph();
  const plan = compileFlatRuntimePlan(planet, graph);
  const setup = compileFlatWorkerSetup(plan);

  assert.equal(FLAT_RUNTIME_SITE_ID, 1);
  assert.equal(setup.siteId, FLAT_RUNTIME_SITE_ID);
  assert.equal(setup.occurrences.length, planet.resourceNodes.length);
  assert.equal(setup.hoppers.length, 1);
  assert.equal(setup.extractors.length, 1);

  const sourcePlan = plan.resourceSources.find(source => source.sourceNodeId === resource.id);
  const occurrence = setup.occurrences.find(source => source.sourceNodeId === resource.id);
  assert.ok(sourcePlan);
  assert.ok(occurrence);
  assert.equal(occurrence.resourceId, 'iron-ore');
  assert.ok(Math.abs(Array.from(occurrence.quantitiesPerKg).reduce((sum, value) => sum + value, 0) - 1) < 1e-10);
  assert.deepEqual(
    Array.from(occurrence.speciesIds).map(id => setup.speciesIds[id]),
    resource.source.composition.map(component => component.speciesId),
  );

  const hopperRuntimeId = plan.machines.find(machine => machine.nodeId === hopper.id).runtimeId;
  const extractorSetup = setup.extractors[0];
  assert.equal(extractorSetup.canonicalNodeId, extractor.id);
  assert.equal(extractorSetup.enabled, true);
  assert.equal(extractorSetup.rateKgPerSecond, 5);
  assert.equal(extractorSetup.occurrenceId, sourcePlan.runtimeId);
  assert.equal(extractorSetup.outputHopperId, hopperRuntimeId);
  assert.equal(setup.hoppers[0].capacityKg, 1000);
  assert.equal(setup.streams[0].runtimeSupported, true);
});

test('disconnected Extractors compile as blocked-capable Rust machines rather than TypeScript simulation', () => {
  const planet = generateWorld('phase6-disconnected').planet;
  let graph = createEmptyGraphState();
  const extractor = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), planet.resourceNodes[0].position); graph = extractor.graph;
  graph = setMechanicalNodeEnabled(graph, extractor.node.id, true);

  const setup = compileFlatWorkerSetup(compileFlatRuntimePlan(planet, graph));
  assert.equal(setup.extractors.length, 1);
  assert.equal(setup.extractors[0].occurrenceId, NO_RUNTIME_ID);
  assert.equal(setup.extractors[0].outputHopperId, NO_RUNTIME_ID);
});

test('simple parameter edits use live reconfiguration while topology edits require a structural rebuild', () => {
  const { planet, graph, extractor, hopper } = extractionGraph('phase6-reconfigure');
  const initial = compileFlatWorkerSetup(compileFlatRuntimePlan(planet, graph));

  let changed = setMechanicalNodeParameter(graph, extractor.id, 'rateKgPerSecond', 7.5);
  changed = setMechanicalNodeParameter(changed, hopper.id, 'capacityKg', 1200);
  const parameterEdit = compileFlatWorkerSetup(compileFlatRuntimePlan(planet, changed));
  assert.equal(flatWorkerStructureKey(parameterEdit), flatWorkerStructureKey(initial));
  assert.notEqual(flatWorkerParameterKey(parameterEdit), flatWorkerParameterKey(initial));

  const disconnected = {
    ...changed,
    connections: changed.connections.filter(connection => connection.kind !== 'material'),
  };
  const topologyEdit = compileFlatWorkerSetup(compileFlatRuntimePlan(planet, disconnected));
  assert.notEqual(flatWorkerStructureKey(topologyEdit), flatWorkerStructureKey(initial));
});

test('Phase 6 runtime boundary does not restore the recursive browser simulation architecture', () => {
  const worker = fs.readFileSync('src/runtime/flatRuntimeWorker.ts', 'utf8');
  const controller = fs.readFileSync('src/runtime/runtimeController.ts', 'utf8');
  const setup = fs.readFileSync('src/runtime/workerSetup.ts', 'utf8');
  const debug = fs.readFileSync('src/ui/debugPanel.ts', 'utf8');
  const inspector = fs.readFileSync('src/ui/inspectorPanel.ts', 'utf8');

  assert.match(worker, /clone_for_live_reconfigure/);
  assert.match(worker, /replace_hopper_state_live/);
  assert.match(worker, /upsert_extractor_live/);
  assert.match(controller, /new Worker\(new URL\('\.\/flatRuntimeWorker\.js'/);
  assert.match(controller, /compileFlatRuntimePlan/);
  assert.match(controller, /automaticAdvancePromise/);
  assert.match(controller, /manualStepInFlight/);
  assert.match(controller, /if \(inFlight\) await inFlight/);
  assert.match(controller, /!automaticAdvancePromise && !manualStepInFlight/);
  assert.match(debug, /Runtime warning:/);
  assert.match(inspector, /warning: \$\{runtime\.error\}/);
  assert.match(setup, /scheduler partition inside Rust/);

  for (const source of [worker, controller, setup]) {
    assert.doesNotMatch(source, /worldSimulation|simulation\.sessions|simulation\.workspaces|BoundaryTransfer|CompositeNode|ImportTerminal|ExportTerminal/);
  }
});
