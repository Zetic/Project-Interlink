/** Helpers for resolving Feature-owned resources at a Site. */

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
