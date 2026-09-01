import { LIBERATION_CLASSES, PARTICLE_SIZE_BINS } from '../material/particulate.js';
import { GOETHITE_DEHYDROXYLATION_REACTION } from '../material/reactions.js';
import { requireMaterialSpecies } from '../material/species.js';
import type { MineralTextureProfile } from '../material/types.js';
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

export interface FlatWorkerSpeciesProperty {
  runtimeId: number;
  canonicalId: string;
  magneticResponse: number;
  specificHeatCapacityJPerKgK: number | null;
}

export interface FlatWorkerSizeBinProperty {
  runtimeId: number;
  canonicalId: string;
  orderIndex: number;
  maxMm: number;
  representativeMm: number;
  canonical: boolean;
  magneticSuitability: number;
}

export interface FlatWorkerLiberationProperty {
  runtimeId: number;
  canonicalId: string;
  orderIndex: number;
  recoveryFactor: number;
}

export interface FlatWorkerTextureProperty {
  textureProfileId: number;
  canonicalTextureProfileId: string;
  speciesId: number;
  canonicalSpeciesId: string;
  d10Um: number;
  d50Um: number;
  d90Um: number;
  free: number;
  boundary: number;
  intergrown: number;
  included: number;
}

export interface FlatWorkerComminutionProperty {
  textureProfileId: number;
  canonicalTextureProfileId: string;
  bondCrushingWorkIndexKWhPerT: number;
  bondBallMillWorkIndexKWhPerT: number;
  bondAbrasionIndex: number;
}

export interface FlatWorkerReactionSizeFactor {
  sizeBinId: number;
  canonicalSizeBinId: string;
  factor: number;
}

export interface FlatWorkerReactionTextureMapping {
  sourceTextureProfileId: number;
  productTextureProfileId: number;
  sourceCanonicalId: string;
  productCanonicalId: string;
}

export interface FlatWorkerGoethiteReaction {
  sourceSpeciesId: number;
  solidProductSpeciesId: number;
  gasProductSpeciesId: number;
  sourceMassPerExtentKg: number;
  solidProductMassPerExtentKg: number;
  gasProductMassPerExtentKg: number;
  reactionEnthalpyJPerMolExtent: number;
  activationEnergyJPerMol: number;
  preExponentialFactorPerSecond: number;
  sizeFactors: FlatWorkerReactionSizeFactor[];
  textureMappings: FlatWorkerReactionTextureMapping[];
}

export interface FlatWorkerMaterialTables {
  species: FlatWorkerSpeciesProperty[];
  sizeBins: FlatWorkerSizeBinProperty[];
  liberationClasses: FlatWorkerLiberationProperty[];
  textures: FlatWorkerTextureProperty[];
  comminutionProperties: FlatWorkerComminutionProperty[];
  legacyLtOneMmId: number;
  goethiteReaction: FlatWorkerGoethiteReaction;
}

export interface FlatWorkerSetup {
  siteId: number;
  speciesIds: string[];
  sizeBinIds: string[];
  liberationClassIds: string[];
  textureProfileIds: string[];
  materialTables: FlatWorkerMaterialTables;
  occurrences: FlatWorkerOccurrence[];
  hoppers: FlatWorkerHopper[];
  extractors: FlatWorkerExtractor[];
  streams: FlatWorkerStream[];
}

interface RuntimeSizeVocabularyRow {
  id: string;
  orderIndex: number;
  maxMm: number;
  representativeMm: number;
  canonical: boolean;
}

const LEGACY_SIZE_BINS: readonly RuntimeSizeVocabularyRow[] = Object.freeze([
  Object.freeze({ id: 'lt-0.032mm', orderIndex: 3, maxMm: 0.032, representativeMm: 0.016, canonical: false }),
  Object.freeze({ id: 'lt-1mm', orderIndex: 8, maxMm: 1, representativeMm: 0.5, canonical: false }),
  Object.freeze({ id: '120mm-plus', orderIndex: 14, maxMm: Number.POSITIVE_INFINITY, representativeMm: 140, canonical: false }),
]);

const MAGNETIC_SIZE_SUITABILITY: Readonly<Record<string, number>> = Object.freeze({
  'lt-0.032mm': 0.05,
  '0.032-0.063mm': 0.10,
  '0.063-0.125mm': 0.15,
  '0.125-0.25mm': 0.20,
  '0.25-0.5mm': 0.30,
  '0.5-1mm': 0.40,
  'lt-1mm': 0.40,
  '1-5mm': 0.65,
  '5-15mm': 0.90,
  '15-25mm': 1.00,
});

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

function runtimeSizeVocabulary(): RuntimeSizeVocabularyRow[] {
  return [
    ...PARTICLE_SIZE_BINS.map((bin, orderIndex) => ({
      id: bin.id,
      orderIndex,
      maxMm: bin.maxMm,
      representativeMm: bin.representativeMm,
      canonical: true,
    })),
    ...LEGACY_SIZE_BINS,
  ];
}

function derivedReactionTextureProfile(
  profile: MineralTextureProfile,
  reactionId: string,
  sourceSpeciesId: string,
  productSpeciesId: string,
): MineralTextureProfile {
  const sourceTexture = profile.speciesTextures[sourceSpeciesId];
  if (!sourceTexture) throw new Error(`Mineral texture '${profile.id}' is missing species '${sourceSpeciesId}'.`);
  return {
    id: `${profile.id}--${reactionId}--${sourceSpeciesId}-to-${productSpeciesId}`,
    speciesTextures: {
      ...Object.fromEntries(Object.entries(profile.speciesTextures).map(([speciesId, texture]) => [speciesId, {
        grainSizeUm: { ...texture.grainSizeUm },
        occurrenceModes: { ...texture.occurrenceModes },
      }])),
      [productSpeciesId]: {
        grainSizeUm: { ...sourceTexture.grainSizeUm },
        occurrenceModes: { ...sourceTexture.occurrenceModes },
      },
    },
    ...(profile.comminutionProperties ? { comminutionProperties: { ...profile.comminutionProperties } } : {}),
  };
}

function reactionSpeciesMassKg(speciesId: string, stoichiometricMoles: number): number {
  const chemistry = requireMaterialSpecies(speciesId).chemistry;
  if (!chemistry) throw new Error(`Reaction species '${speciesId}' requires chemistry data.`);
  return chemistry.molarMassKgPerMol * stoichiometricMoles;
}

function compileMaterialTables(
  plan: FlatRuntimePlan,
  speciesTable: Map<string, number>,
  speciesIds: string[],
  sizeBinTable: Map<string, number>,
  sizeBinIds: string[],
  liberationTable: Map<string, number>,
  liberationClassIds: string[],
  textureTable: Map<string, number>,
  textureProfileIds: string[],
): FlatWorkerMaterialTables {
  const sizes = runtimeSizeVocabulary();
  for (const size of sizes) compactRuntimeId(size.id, sizeBinTable, sizeBinIds, 0xff, 'particle-size');
  for (const item of LIBERATION_CLASSES) compactRuntimeId(item.id, liberationTable, liberationClassIds, 0xff, 'liberation');

  const sourceProfiles = new Map<string, MineralTextureProfile>();
  const comminutionByProfile = new Map<string, NonNullable<FlatRuntimePlan['resourceSources'][number]['comminutionProperties']>>();
  for (const source of plan.resourceSources) {
    const profile = source.mineralTexture;
    if (!profile) continue;
    sourceProfiles.set(profile.id, profile);
    textureRuntimeId(profile.id, textureTable, textureProfileIds);
    const properties = source.comminutionProperties ?? profile.comminutionProperties ?? null;
    if (properties) comminutionByProfile.set(profile.id, properties);
    for (const speciesId of Object.keys(profile.speciesTextures)) {
      compactRuntimeId(speciesId, speciesTable, speciesIds, 0xffff, 'species');
    }
  }

  const reaction = GOETHITE_DEHYDROXYLATION_REACTION;
  const kinetics = reaction.kinetics;
  const thermochemistry = reaction.thermochemistry;
  if (!kinetics || !thermochemistry) throw new Error(`Reaction '${reaction.id}' requires kinetics and thermochemistry.`);
  const sourceSpeciesId = compactRuntimeId('goethite', speciesTable, speciesIds, 0xffff, 'species');
  const solidProductSpeciesId = compactRuntimeId('hematite', speciesTable, speciesIds, 0xffff, 'species');
  const gasProductSpeciesId = compactRuntimeId('waterVapor', speciesTable, speciesIds, 0xffff, 'species');

  const allProfiles = new Map(sourceProfiles);
  const textureMappings: FlatWorkerReactionTextureMapping[] = [];
  for (const profile of sourceProfiles.values()) {
    if (!profile.speciesTextures.goethite) continue;
    const derived = derivedReactionTextureProfile(profile, reaction.id, 'goethite', 'hematite');
    allProfiles.set(derived.id, derived);
    const sourceRuntimeId = textureRuntimeId(profile.id, textureTable, textureProfileIds);
    const productRuntimeId = textureRuntimeId(derived.id, textureTable, textureProfileIds);
    textureMappings.push({
      sourceTextureProfileId: sourceRuntimeId,
      productTextureProfileId: productRuntimeId,
      sourceCanonicalId: profile.id,
      productCanonicalId: derived.id,
    });
    const sourceProperties = comminutionByProfile.get(profile.id) ?? profile.comminutionProperties ?? null;
    if (sourceProperties) comminutionByProfile.set(derived.id, { ...sourceProperties });
  }

  const species: FlatWorkerSpeciesProperty[] = speciesIds.map((canonicalId, runtimeId) => {
    const definition = requireMaterialSpecies(canonicalId);
    return {
      runtimeId,
      canonicalId,
      magneticResponse: definition.physicalProperties.magneticResponse.normalizedSeparationCoefficient,
      specificHeatCapacityJPerKgK: definition.physicalProperties.thermal?.specificHeatCapacityJPerKgK ?? null,
    };
  });

  const sizeBins: FlatWorkerSizeBinProperty[] = sizes.map(size => ({
    runtimeId: compactRuntimeId(size.id, sizeBinTable, sizeBinIds, 0xff, 'particle-size'),
    canonicalId: size.id,
    orderIndex: size.orderIndex,
    maxMm: size.maxMm,
    representativeMm: size.representativeMm,
    canonical: size.canonical,
    magneticSuitability: MAGNETIC_SIZE_SUITABILITY[size.id] ?? 0,
  }));

  const liberationClasses: FlatWorkerLiberationProperty[] = LIBERATION_CLASSES.map((item, orderIndex) => ({
    runtimeId: compactRuntimeId(item.id, liberationTable, liberationClassIds, 0xff, 'liberation'),
    canonicalId: item.id,
    orderIndex,
    recoveryFactor: item.recoveryFactor,
  }));

  const textures: FlatWorkerTextureProperty[] = [];
  for (const profile of allProfiles.values()) {
    const textureProfileId = textureRuntimeId(profile.id, textureTable, textureProfileIds);
    for (const [canonicalSpeciesId, texture] of Object.entries(profile.speciesTextures)) {
      const runtimeSpeciesId = compactRuntimeId(canonicalSpeciesId, speciesTable, speciesIds, 0xffff, 'species');
      textures.push({
        textureProfileId,
        canonicalTextureProfileId: profile.id,
        speciesId: runtimeSpeciesId,
        canonicalSpeciesId,
        d10Um: texture.grainSizeUm.d10,
        d50Um: texture.grainSizeUm.d50,
        d90Um: texture.grainSizeUm.d90,
        free: texture.occurrenceModes.free,
        boundary: texture.occurrenceModes.boundary,
        intergrown: texture.occurrenceModes.intergrown,
        included: texture.occurrenceModes.included,
      });
    }
  }

  const comminutionProperties: FlatWorkerComminutionProperty[] = Array.from(comminutionByProfile.entries()).map(([canonicalTextureProfileId, properties]) => ({
    textureProfileId: textureRuntimeId(canonicalTextureProfileId, textureTable, textureProfileIds),
    canonicalTextureProfileId,
    bondCrushingWorkIndexKWhPerT: properties.bondCrushingWorkIndexKWhPerT,
    bondBallMillWorkIndexKWhPerT: properties.bondBallMillWorkIndexKWhPerT,
    bondAbrasionIndex: properties.bondAbrasionIndex,
  }));

  const referenceParticleSizeM = kinetics.referenceParticleSizeM ?? 1e-4;
  const particleSizeExponent = kinetics.particleSizeExponent ?? 0;
  const minimumParticleSizeFactor = kinetics.minimumParticleSizeFactor ?? 1;
  const maximumParticleSizeFactor = kinetics.maximumParticleSizeFactor ?? 1;
  const sizeFactors: FlatWorkerReactionSizeFactor[] = sizeBins.map(size => {
    const particleSizeM = size.representativeMm / 1000;
    const raw = (referenceParticleSizeM / particleSizeM) ** particleSizeExponent;
    return {
      sizeBinId: size.runtimeId,
      canonicalSizeBinId: size.canonicalId,
      factor: Math.min(maximumParticleSizeFactor, Math.max(minimumParticleSizeFactor, raw)),
    };
  });

  return {
    species,
    sizeBins,
    liberationClasses,
    textures,
    comminutionProperties,
    legacyLtOneMmId: compactRuntimeId('lt-1mm', sizeBinTable, sizeBinIds, 0xff, 'particle-size'),
    goethiteReaction: {
      sourceSpeciesId,
      solidProductSpeciesId,
      gasProductSpeciesId,
      sourceMassPerExtentKg: reactionSpeciesMassKg('goethite', 2),
      solidProductMassPerExtentKg: reactionSpeciesMassKg('hematite', 1),
      gasProductMassPerExtentKg: reactionSpeciesMassKg('waterVapor', 1),
      reactionEnthalpyJPerMolExtent: thermochemistry.reactionEnthalpyJPerMolExtent,
      activationEnergyJPerMol: kinetics.activationEnergyJPerMol,
      preExponentialFactorPerSecond: kinetics.preExponentialFactorPerSecond,
      sizeFactors,
      textureMappings,
    },
  };
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
  const textureTable = new Map<string, number>([['untextured', 0]]); const textureProfileIds: string[] = ['untextured'];

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

  const materialTables = compileMaterialTables(
    plan,
    speciesTable,
    speciesIds,
    sizeBinTable,
    sizeBinIds,
    liberationTable,
    liberationClassIds,
    textureTable,
    textureProfileIds,
  );

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

  return { siteId: FLAT_RUNTIME_SITE_ID, speciesIds, sizeBinIds, liberationClassIds, textureProfileIds, materialTables, occurrences, hoppers, extractors, streams };
}

export function flatWorkerStructureKey(setup: FlatWorkerSetup): string {
  return JSON.stringify({
    siteId: setup.siteId,
    speciesIds: setup.speciesIds,
    sizeBinIds: setup.sizeBinIds,
    liberationClassIds: setup.liberationClassIds,
    textureProfileIds: setup.textureProfileIds,
    materialTables: setup.materialTables,
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
