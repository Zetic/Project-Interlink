import type { MaterialComponentFraction, ResourceSourceDefinition } from './types.js';

export interface CompositionRange {
  speciesId: string;
  minFraction: number;
  maxFraction: number;
}

export interface ResourceSourceTemplate {
  composition: readonly CompositionRange[];
  fragmentationProfileId: ResourceSourceDefinition['fragmentationProfileId'];
  initialReserveMassKg: number | null;
}

interface RangeRng {
  range(min: number, max: number): number;
}

/**
 * The iron-ore bounds preserve the pre-TypeScript geological resource model:
 * hematite 20-70%, magnetite 5-30%, goethite 2-15%, quartz 5-25%.
 * Other Phase 5 sources use conservative authoring templates until geology is
 * deepened in a later phase.
 */
export const RESOURCE_SOURCE_TEMPLATES: Readonly<Record<string, ResourceSourceTemplate>> = Object.freeze({
  'iron-ore': Object.freeze({
    composition: Object.freeze([
      Object.freeze({ speciesId: 'hematite', minFraction: 0.20, maxFraction: 0.70 }),
      Object.freeze({ speciesId: 'magnetite', minFraction: 0.05, maxFraction: 0.30 }),
      Object.freeze({ speciesId: 'goethite', minFraction: 0.02, maxFraction: 0.15 }),
      Object.freeze({ speciesId: 'quartz', minFraction: 0.05, maxFraction: 0.25 }),
    ]),
    fragmentationProfileId: 'run-of-mine-rock',
    initialReserveMassKg: null,
  }),
  'copper-ore': Object.freeze({
    composition: Object.freeze([
      Object.freeze({ speciesId: 'chalcopyrite', minFraction: 0.45, maxFraction: 0.60 }),
      Object.freeze({ speciesId: 'bornite', minFraction: 0.05, maxFraction: 0.15 }),
      Object.freeze({ speciesId: 'pyrite', minFraction: 0.05, maxFraction: 0.15 }),
      Object.freeze({ speciesId: 'quartz', minFraction: 0.15, maxFraction: 0.35 }),
    ]),
    fragmentationProfileId: 'run-of-mine-rock',
    initialReserveMassKg: null,
  }),
  'aluminum-ore': Object.freeze({
    composition: Object.freeze([
      Object.freeze({ speciesId: 'gibbsite', minFraction: 0.40, maxFraction: 0.60 }),
      Object.freeze({ speciesId: 'boehmite', minFraction: 0.10, maxFraction: 0.25 }),
      Object.freeze({ speciesId: 'kaolinite', minFraction: 0.10, maxFraction: 0.25 }),
      Object.freeze({ speciesId: 'hematite', minFraction: 0.05, maxFraction: 0.20 }),
    ]),
    fragmentationProfileId: 'run-of-mine-rock',
    initialReserveMassKg: null,
  }),
  limestone: Object.freeze({
    composition: Object.freeze([
      Object.freeze({ speciesId: 'calcite', minFraction: 0.75, maxFraction: 0.90 }),
      Object.freeze({ speciesId: 'dolomite', minFraction: 0.05, maxFraction: 0.20 }),
      Object.freeze({ speciesId: 'quartz', minFraction: 0.01, maxFraction: 0.10 }),
    ]),
    fragmentationProfileId: 'coarse-solid',
    initialReserveMassKg: null,
  }),
  'silica-sand': Object.freeze({
    composition: Object.freeze([
      Object.freeze({ speciesId: 'quartz', minFraction: 0.85, maxFraction: 0.98 }),
      Object.freeze({ speciesId: 'plagioclase', minFraction: 0.02, maxFraction: 0.15 }),
    ]),
    fragmentationProfileId: 'coarse-solid',
    initialReserveMassKg: null,
  }),
  coal: Object.freeze({
    composition: Object.freeze([
      Object.freeze({ speciesId: 'graphite', minFraction: 0.65, maxFraction: 0.85 }),
      Object.freeze({ speciesId: 'kaolinite', minFraction: 0.10, maxFraction: 0.25 }),
      Object.freeze({ speciesId: 'pyrite', minFraction: 0.02, maxFraction: 0.10 }),
    ]),
    fragmentationProfileId: 'coarse-solid',
    initialReserveMassKg: null,
  }),
  'water-ice': Object.freeze({
    composition: Object.freeze([
      Object.freeze({ speciesId: 'waterIce', minFraction: 1, maxFraction: 1 }),
    ]),
    fragmentationProfileId: 'coarse-solid',
    initialReserveMassKg: null,
  }),
});

function validateTemplate(template: ResourceSourceTemplate, resourceId: string): void {
  if (!template.composition.length) throw new Error(`Resource '${resourceId}' has no material composition.`);
  const minTotal = template.composition.reduce((sum, range) => sum + range.minFraction, 0);
  const maxTotal = template.composition.reduce((sum, range) => sum + range.maxFraction, 0);
  if (minTotal > 1 + 1e-12 || maxTotal < 1 - 1e-12) {
    throw new Error(`Resource '${resourceId}' composition bounds cannot sum to 100%.`);
  }
}

/**
 * Samples a deterministic bounded composition whose fractions sum exactly to 1.
 * Each sampled component remains within its historical/template min/max bounds.
 */
function sampleBoundedComposition(template: ResourceSourceTemplate, rng: RangeRng): MaterialComponentFraction[] {
  const ranges = template.composition;
  const values = ranges.map(range => range.minFraction);
  let remaining = 1 - values.reduce((sum, value) => sum + value, 0);

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]!;
    const capacity = range.maxFraction - range.minFraction;
    const laterCapacity = ranges.slice(index + 1).reduce(
      (sum, later) => sum + (later.maxFraction - later.minFraction),
      0,
    );
    const minimumAdd = Math.max(0, remaining - laterCapacity);
    const maximumAdd = Math.min(capacity, remaining);
    const add = index === ranges.length - 1
      ? remaining
      : rng.range(minimumAdd, maximumAdd);
    values[index] += add;
    remaining -= add;
  }

  if (Math.abs(remaining) > 1e-9) throw new Error('Resource composition sampling failed to close to 100%.');
  return ranges.map((range, index) => ({
    speciesId: range.speciesId,
    massFraction: Number(values[index]!.toFixed(12)),
  }));
}

export function createResourceSource(resourceId: string, rng: RangeRng): ResourceSourceDefinition {
  const template = RESOURCE_SOURCE_TEMPLATES[resourceId];
  if (!template) throw new Error(`No Phase 5 source template for resource '${resourceId}'.`);
  validateTemplate(template, resourceId);
  const composition = sampleBoundedComposition(template, rng);
  const total = composition.reduce((sum, component) => sum + component.massFraction, 0);
  const correction = 1 - total;
  composition[composition.length - 1]!.massFraction = Number(
    (composition[composition.length - 1]!.massFraction + correction).toFixed(12),
  );
  return {
    physicalForm: 'solid-particulate',
    composition,
    initialReserveMassKg: template.initialReserveMassKg,
    fragmentationProfileId: template.fragmentationProfileId,
  };
}
