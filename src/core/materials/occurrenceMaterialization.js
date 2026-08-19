import { MATERIAL_FORMS, physicalFormForOccurrence } from './materialForms.js';
import { addSolidFractionDirect, createSolidMaterialBody, createSolidMaterialState } from './solidMaterialState.js';
import { requireMaterialConstituentId } from './materialSpecies.js';

const RUN_OF_OCCURRENCE_TEMPLATE = Object.freeze([
  Object.freeze({ sizeBinId: '60-120mm', liberationShares: Object.freeze({ locked: 0.75, partial: 0.25 }), massShare: 0.65 }),
  Object.freeze({ sizeBinId: '120mm-plus', liberationShares: Object.freeze({ locked: 0.9, partial: 0.1 }), massShare: 0.35 }),
]);

function unresolvedOccurrenceConstituent(occurrence) {
  return [{
    speciesId: requireMaterialConstituentId(occurrence?.resourceId),
    share: 1,
  }];
}

function normalizeComposition(occurrence) {
  const { composition } = occurrence ?? {};
  if (composition == null) {
    return unresolvedOccurrenceConstituent(occurrence);
  }
  if (typeof composition !== 'object' || Array.isArray(composition)) {
    throw new Error('Occurrence composition must be a structured object or null');
  }
  const entries = Object.entries(composition);
  if (entries.length === 0) {
    return unresolvedOccurrenceConstituent(occurrence);
  }
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) throw new Error('Occurrence composition must sum to a positive value');
  return entries.map(([speciesId, amount]) => ({ speciesId, share: amount / total }));
}

export function createSolidMaterialBodyFromOccurrence(occurrence, quantity) {
  const physicalForm = physicalFormForOccurrence(occurrence);
  if (physicalForm !== MATERIAL_FORMS.SOLID_PARTICULATE) {
    throw new Error(`Occurrence '${occurrence?.id ?? occurrence?.resourceId ?? 'unknown'}' has unsupported physical form '${physicalForm ?? 'unknown'}'`);
  }
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Occurrence materialization quantity must be a finite positive number');
  }
  const solidState = createSolidMaterialState();
  for (const { speciesId, share } of normalizeComposition(occurrence)) {
    for (const sizeTemplate of RUN_OF_OCCURRENCE_TEMPLATE) {
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
