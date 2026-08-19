/**
 * Helpers for resolving Feature-owned resources at a Site. Prototype iron
 * compatibility affects only the temporary demonstration apparatus, never Site
 * identity, visibility, or navigation.
 */

export function siteResourceOccurrenceIds(world, site) {
  const ids = [];
  for (const featureId of site?.featureIds ?? []) {
    const feature = world?.features?.[featureId];
    for (const occurrenceId of feature?.resourceOccurrences ?? []) ids.push(occurrenceId);
  }
  return ids;
}

export function featureForOccurrence(world, site, occurrenceId) {
  for (const featureId of site?.featureIds ?? []) {
    const feature = world?.features?.[featureId];
    if (feature?.resourceOccurrences?.includes(occurrenceId)) return feature;
  }
  return null;
}

export function prototypeOccurrenceForSite(world, site) {
  for (const occurrenceId of siteResourceOccurrenceIds(world, site)) {
    const occurrence = world?.resourceOccurrences?.[occurrenceId];
    if (occurrence?.resourceId === 'iron-ore' && occurrence.composition) return occurrence;
  }
  return null;
}

export function prototypeFeatureForSite(world, site) {
  const occurrence = prototypeOccurrenceForSite(world, site);
  return occurrence ? featureForOccurrence(world, site, occurrence.id) : null;
}

export function prototypeNodeTypesForSite(world, site) {
  if (!prototypeOccurrenceForSite(world, site)) return [];
  return ['feature', 'extractor', 'hopper', 'crusher', 'hopper', 'magSep', 'hopper', 'hopper'];
}
