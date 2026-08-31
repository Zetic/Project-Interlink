import type { FlatRuntimePlan, RuntimeMachinePlan, RuntimeMaterialStreamBinding } from './types.js';

export const FLAT_RUNTIME_SITE_ID = 1;
export const NO_RUNTIME_ID = 0xffff_ffff;

export interface FlatWorkerOccurrence {
  occurrenceId: number;
  sourceNodeId: string;
  resourceId: string;
  speciesIds: Uint16Array;
  sizeBinIds: Uint8Array;
  liberationClassIds: Uint8Array;
  textureProfileIds: Uint32Array;
  quantitiesPerKg: Float64Array;
  reserveMassKg: number | null;
}

export interface FlatWorkerHopper { nodeId: number; canonicalNodeId: string; capacityKg: number; }
export interface FlatWorkerExtractor { nodeId: number; canonicalNodeId: string; ordinal: number; rateKgPerSecond: number; enabled: boolean; occurrenceId: number; outputHopperId: number; }
export interface FlatWorkerStream { streamId: string; sourceRuntimeId: number; sourceNodeId: string; targetRuntimeId: number; targetNodeId: string; runtimeSupported: boolean; }

export interface FlatWorkerSetup {
  siteId: number;
  speciesIds: string[];
  sizeBinIds: string[];
  liberationClassIds: string[];
  textureProfileIds: string[];
  occurrences: FlatWorkerOccurrence[];
  hoppers: FlatWorkerHopper[];
  extractors: FlatWorkerExtractor[];
  streams: FlatWorkerStream[];
}

function numberParameter(machine: RuntimeMachinePlan, id: string, fallback: number): number {
  const value = machine.parameters[id];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function compactRuntimeId(value: string, table: Map<string, number>, values: string[], max: number, label: string): number {
  const existing = table.get(value);
  if (existing != null) return existing;
  const next = values.length;
  if (next > max) throw new Error(`Flat runtime ${label} ID capacity exceeded.`);
  table.set(value, next);
  values.push(value);
  return next;
}

function textureRuntimeId(value: string | null, table: Map<string, number>, values: string[]): number {
  if (value == null) return 0;
  const existing = table.get(value);
  if (existing != null) return existing;
  const next = values.length;
  if (next > 0xffff_ffff) throw new Error('Flat runtime texture ID capacity exceeded.');
  table.set(value, next);
  values.push(value);
  return next;
}

function extractorOutputStream(streams: readonly RuntimeMaterialStreamBinding[], extractorRuntimeId: number): RuntimeMaterialStreamBinding | null {
  return streams.find(stream => stream.sourceRuntimeId === extractorRuntimeId) ?? null;
}

/**
 * Flat TypeScript world data is compiled into sparse statistical particulate
 * populations and compact IDs before it enters Rust. The Site ID is only an
 * implementation scheduler partition; it is not a browser/world concept.
 */
export function compileFlatWorkerSetup(plan: FlatRuntimePlan): FlatWorkerSetup {
  const speciesTable = new Map<string, number>(); const speciesIds: string[] = [];
  const sizeBinTable = new Map<string, number>(); const sizeBinIds: string[] = [];
  const liberationTable = new Map<string, number>(); const liberationClassIds: string[] = [];
  const textureTable = new Map<string, number>(); const textureProfileIds: string[] = ['untextured'];

  const occurrences: FlatWorkerOccurrence[] = plan.resourceSources.map(source => {
    const species: number[] = [];
    const sizes: number[] = [];
    const liberation: number[] = [];
    const textures: number[] = [];
    const quantities: number[] = [];
    for (const population of source.particulatePopulations) {
      species.push(compactRuntimeId(population.speciesId, speciesTable, speciesIds, 0xffff, 'species'));
      sizes.push(compactRuntimeId(population.particleSizeBinId, sizeBinTable, sizeBinIds, 0xff, 'particle-size'));
      liberation.push(compactRuntimeId(population.liberationClassId, liberationTable, liberationClassIds, 0xff, 'liberation'));
      textures.push(textureRuntimeId(population.textureProfileId, textureTable, textureProfileIds));
      quantities.push(population.massFraction);
    }
    const total = quantities.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 1) > 1e-8) throw new Error(`Resource source '${source.sourceNodeId}' particulate populations must total 1 kg.`);
    return {
      occurrenceId: source.runtimeId,
      sourceNodeId: source.sourceNodeId,
      resourceId: source.resourceId,
      speciesIds: Uint16Array.from(species),
      sizeBinIds: Uint8Array.from(sizes),
      liberationClassIds: Uint8Array.from(liberation),
      textureProfileIds: Uint32Array.from(textures),
      quantitiesPerKg: Float64Array.from(quantities),
      reserveMassKg: source.initialReserveMassKg,
    };
  });

  const machineByRuntimeId = new Map(plan.machines.map(machine => [machine.runtimeId, machine]));
  const hoppers: FlatWorkerHopper[] = plan.machines.filter(machine => machine.nodeType === 'hopper').map(machine => ({
    nodeId: machine.runtimeId, canonicalNodeId: machine.nodeId, capacityKg: numberParameter(machine, 'capacityKg', 1000),
  }));
  const hopperIds = new Set(hoppers.map(hopper => hopper.nodeId));
  const bindingByExtractor = new Map(plan.resourceBindings.map(binding => [binding.extractorRuntimeId, binding]));
  const extractors: FlatWorkerExtractor[] = plan.machines.filter(machine => machine.nodeType === 'extractor').map((machine, ordinal) => {
    const binding = bindingByExtractor.get(machine.runtimeId);
    const output = extractorOutputStream(plan.materialStreams, machine.runtimeId);
    const outputTarget = output ? machineByRuntimeId.get(output.targetRuntimeId) : null;
    return {
      nodeId: machine.runtimeId, canonicalNodeId: machine.nodeId, ordinal,
      rateKgPerSecond: numberParameter(machine, 'rateKgPerSecond', 5), enabled: machine.enabled,
      occurrenceId: binding?.sourceRuntimeId ?? NO_RUNTIME_ID,
      outputHopperId: output && outputTarget?.nodeType === 'hopper' && hopperIds.has(output.targetRuntimeId) ? output.targetRuntimeId : NO_RUNTIME_ID,
    };
  });
  const streams: FlatWorkerStream[] = plan.materialStreams.map(stream => {
    const source = machineByRuntimeId.get(stream.sourceRuntimeId); const target = machineByRuntimeId.get(stream.targetRuntimeId);
    return { streamId: stream.streamId, sourceRuntimeId: stream.sourceRuntimeId, sourceNodeId: stream.sourceNodeId, targetRuntimeId: stream.targetRuntimeId, targetNodeId: stream.targetNodeId, runtimeSupported: source?.nodeType === 'extractor' && target?.nodeType === 'hopper' };
  });

  return { siteId: FLAT_RUNTIME_SITE_ID, speciesIds, sizeBinIds, liberationClassIds, textureProfileIds, occurrences, hoppers, extractors, streams };
}

export function flatWorkerStructureKey(setup: FlatWorkerSetup): string {
  return JSON.stringify({
    siteId: setup.siteId,
    speciesIds: setup.speciesIds,
    sizeBinIds: setup.sizeBinIds,
    liberationClassIds: setup.liberationClassIds,
    textureProfileIds: setup.textureProfileIds,
    occurrences: setup.occurrences.map(source => ({
      occurrenceId: source.occurrenceId, sourceNodeId: source.sourceNodeId, resourceId: source.resourceId,
      speciesIds: Array.from(source.speciesIds), sizeBinIds: Array.from(source.sizeBinIds), liberationClassIds: Array.from(source.liberationClassIds), textureProfileIds: Array.from(source.textureProfileIds), quantitiesPerKg: Array.from(source.quantitiesPerKg), reserveMassKg: source.reserveMassKg,
    })),
    hoppers: setup.hoppers.map(hopper => ({ nodeId: hopper.nodeId, canonicalNodeId: hopper.canonicalNodeId })),
    extractors: setup.extractors.map(extractor => ({ nodeId: extractor.nodeId, canonicalNodeId: extractor.canonicalNodeId, ordinal: extractor.ordinal, occurrenceId: extractor.occurrenceId, outputHopperId: extractor.outputHopperId })),
    streams: setup.streams,
  });
}

export function flatWorkerParameterKey(setup: FlatWorkerSetup): string {
  return JSON.stringify({
    hoppers: setup.hoppers.map(hopper => ({ nodeId: hopper.nodeId, capacityKg: hopper.capacityKg })),
    extractors: setup.extractors.map(extractor => ({ nodeId: extractor.nodeId, enabled: extractor.enabled, rateKgPerSecond: extractor.rateKgPerSecond })),
  });
}
