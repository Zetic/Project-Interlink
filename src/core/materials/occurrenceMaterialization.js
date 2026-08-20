import { MATERIAL_FORMS, physicalFormForOccurrence } from './materialForms.js';
import { addSolidFractionDirect, createSolidMaterialBody, createSolidMaterialState } from './solids/solidMaterialState.js';
import { requireMaterialSpecies } from './species/materialSpecies.js';

export const OCCURRENCE_FRAGMENTATION_PROFILES = Object.freeze({
  COARSE_SOLID: 'coarse-solid',
  RUN_OF_MINE_ROCK: 'run-of-mine-rock',
});

// Compatibility/default profile for non-ore solids and direct callers.
const COARSE_SOLID_TEMPLATE = Object.freeze([
  Object.freeze({ sizeBinId: '60-120mm', liberationShares: Object.freeze({ locked: 0.75, partial: 0.25 }), massShare: 0.65 }),
  Object.freeze({ sizeBinId: '120mm-plus', liberationShares: Object.freeze({ locked: 0.9, partial: 0.1 }), massShare: 0.35 }),
]);

// Blasted run-of-mine ore enters the plant as large rock. Primary/secondary
// crushing is therefore predominantly size reduction; useful liberation is
// intentionally deferred toward grinding rather than being granted at source.
const RUN_OF_MINE_ROCK_TEMPLATE = Object.freeze([
  Object.freeze({ sizeBinId: '120-250mm', liberationShares: Object.freeze({ locked: 0.97, partial: 0.03 }), massShare: 0.20 }),
  Object.freeze({ sizeBinId: '250-500mm', liberationShares: Object.freeze({ locked: 0.985, partial: 0.015 }), massShare: 0.45 }),
  Object.freeze({ sizeBinId: '500-1000mm', liberationShares: Object.freeze({ locked: 0.995, partial: 0.005 }), massShare: 0.35 }),
]);

function fragmentationTemplate(profileId) {
  if (profileId === OCCURRENCE_FRAGMENTATION_PROFILES.COARSE_SOLID) return COARSE_SOLID_TEMPLATE;
  if (profileId === OCCURRENCE_FRAGMENTATION_PROFILES.RUN_OF_MINE_ROCK) return RUN_OF_MINE_ROCK_TEMPLATE;
  throw new Error(`Unknown occurrence fragmentation profile '${profileId}'`);
}

function normalizeComposition(occurrence) {
  const { composition } = occurrence ?? {};
  if (!composition || typeof composition !== 'object' || Array.isArray(composition)) {
    throw new Error(
      `Solid occurrence '${occurrence?.id ?? occurrence?.resourceId ?? 'unknown'}' requires a concrete species composition`
    );
  }
  const entries = Object.entries(composition);
  if (entries.length === 0) {
    throw new Error(
      `Solid occurrence '${occurrence?.id ?? occurrence?.resourceId ?? 'unknown'}' requires a non-empty concrete species composition`
    );
  }
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) throw new Error('Occurrence composition must sum to a positive value');
  return entries.map(([speciesId, amount]) => {
    const species = requireMaterialSpecies(speciesId);
    return { speciesId: species.id, share: amount / total };
  });
}

export function createSolidMaterialBodyFromOccurrence(occurrence, quantity, {
  fragmentationProfile = OCCURRENCE_FRAGMENTATION_PROFILES.COARSE_SOLID,
} = {}) {
  const physicalForm = physicalFormForOccurrence(occurrence);
  if (physicalForm !== MATERIAL_FORMS.SOLID_PARTICULATE) {
    throw new Error(`Occurrence '${occurrence?.id ?? occurrence?.resourceId ?? 'unknown'}' has unsupported physical form '${physicalForm ?? 'unknown'}'`);
  }
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Occurrence materialization quantity must be a finite positive number');
  }
  const solidState = createSolidMaterialState();
  const template = fragmentationTemplate(fragmentationProfile);
  for (const { speciesId, share } of normalizeComposition(occurrence)) {
    for (const sizeTemplate of template) {
      const sizeMass = quantity * share * sizeTemplate.massShare;
      for (const [liberationClassId, liberationShare] of Object.entries(sizeTemplate.liberationShares)) {
        addSolidFractionDirect(solidState, {
          speciesId,
          sizeBinId: sizeTemplate.sizeBinId,
          liberationClassId,
          quantity: sizeMass * liberationShare,
        });
      }
    }
  }
  return createSolidMaterialBody(solidState);
}
