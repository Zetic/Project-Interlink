import type { GraphState } from '../graph/types.js';
import type { Planet } from '../world/types.js';
import type {
  FlatRuntimePlan,
  RuntimeMachinePlan,
  RuntimeMaterialStreamBinding,
  RuntimeResourceBinding,
  RuntimeResourceSourcePlan,
} from './types.js';

function materialFormForMedium(medium: 'resource' | 'solid' | 'gas'): 'solid-particulate' | 'gas' {
  if (medium === 'solid') return 'solid-particulate';
  if (medium === 'gas') return 'gas';
  throw new Error('Resource-access edges do not compile into material streams.');
}

export function compileFlatRuntimePlan(planet: Planet, graph: GraphState): FlatRuntimePlan {
  const resourceRuntimeIds = new Map<string, number>();
  const machineRuntimeIds = new Map<string, number>();

  const resourceSources: RuntimeResourceSourcePlan[] = planet.resourceNodes.map((resource, index) => {
    const runtimeId = index + 1;
    resourceRuntimeIds.set(resource.id, runtimeId);
    return {
      runtimeId,
      sourceNodeId: resource.id,
      resourceId: resource.resourceId,
      physicalForm: resource.source.physicalForm,
      composition: resource.source.composition.map(component => ({ ...component })),
      initialReserveMassKg: resource.source.initialReserveMassKg,
      fragmentationProfileId: resource.source.fragmentationProfileId,
    };
  });

  const machines: RuntimeMachinePlan[] = graph.nodes.map((node, index) => {
    const runtimeId = index + 1;
    machineRuntimeIds.set(node.id, runtimeId);
    return {
      runtimeId,
      nodeId: node.id,
      nodeType: node.nodeType,
      enabled: node.enabled,
      parameters: { ...node.parameters },
    };
  });

  const resourceBindings: RuntimeResourceBinding[] = [];
  const materialStreams: RuntimeMaterialStreamBinding[] = [];

  for (const connection of graph.connections) {
    if (connection.kind === 'resource-access') {
      const sourceRuntimeId = resourceRuntimeIds.get(connection.from.nodeId);
      const extractorRuntimeId = machineRuntimeIds.get(connection.to.nodeId);
      const extractor = graph.nodes.find(node => node.id === connection.to.nodeId);
      if (sourceRuntimeId == null) throw new Error(`Resource binding '${connection.id}' must begin at a FEATURE source.`);
      if (extractorRuntimeId == null || extractor?.nodeType !== 'extractor') {
        throw new Error(`Resource binding '${connection.id}' must terminate at an Extractor.`);
      }
      resourceBindings.push({
        connectionId: connection.id,
        sourceRuntimeId,
        sourceNodeId: connection.from.nodeId,
        extractorRuntimeId,
        extractorNodeId: connection.to.nodeId,
      });
      continue;
    }

    const sourceRuntimeId = machineRuntimeIds.get(connection.from.nodeId);
    const targetRuntimeId = machineRuntimeIds.get(connection.to.nodeId);
    if (sourceRuntimeId == null || targetRuntimeId == null) {
      throw new Error(`Material connection '${connection.id}' must connect mechanical nodes.`);
    }
    materialStreams.push({
      streamId: `stream:${connection.id}`,
      connectionId: connection.id,
      sourceRuntimeId,
      sourceNodeId: connection.from.nodeId,
      sourcePortId: connection.from.portId,
      targetRuntimeId,
      targetNodeId: connection.to.nodeId,
      targetPortId: connection.to.portId,
      physicalForm: materialFormForMedium(connection.medium),
    });
  }

  return { resourceSources, machines, resourceBindings, materialStreams };
}
