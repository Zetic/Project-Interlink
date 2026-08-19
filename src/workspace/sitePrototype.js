/**
 * Eligibility for the temporary iron-processing demonstration only.
 * Site identity and navigation must not depend on this helper.
 */
export function prototypeOccurrenceForSite(world, site) {
  for (const occurrenceId of site?.resourceOccurrenceIds ?? []) {
    const occurrence = world?.resourceOccurrences?.[occurrenceId];
    if (occurrence?.resourceId === 'iron-ore' && occurrence.composition) return occurrence;
  }
  return null;
}
