import {
  isNonEmptyString,
  validateReferenceIdArray,
  worldCollections,
} from './helpers.js';

/** Validate Planet → Region → Site → Feature hierarchy ownership. */
export function validateHierarchy(world) {
  if (!world || typeof world !== 'object' || Array.isArray(world)) return [];
  const { planets, regions, sites, features } = worldCollections(world);
  const errors = [];

  if (!planets[world.planetId]) errors.push(`planetId '${world.planetId}' not in planets map`);

  const planet = planets[world.planetId];
  if (planet) {
    validateReferenceIdArray(planet.regions, `Planet '${planet.id}' regions`, regions, errors);
  }

  const siteFeatureOwners = new Map();
  for (const [regionId, region] of Object.entries(regions)) {
    if ('features' in region) errors.push(`Region '${regionId}' must not own a features collection; use siteIds`);
    if ('backgroundResourceOccurrences' in region) {
      errors.push(`Region '${regionId}' must not own ResourceOccurrences; materialize them through Site Features`);
    }
    validateReferenceIdArray(region.siteIds, `Region '${regionId}' siteIds`, sites, errors);
    for (const siteId of region.siteIds ?? []) {
      const site = sites[siteId];
      if (site && site.regionId !== regionId) {
        errors.push(`Site '${siteId}' regionId '${site.regionId}' does not match parent region '${regionId}'`);
      }
    }
  }

  for (const [siteId, site] of Object.entries(sites)) {
    if (!isNonEmptyString(site.name)) errors.push(`Site '${siteId}' must have a player-facing name`);
    if ('resourceOccurrenceIds' in site) {
      errors.push(`Site '${siteId}' must not duplicate ResourceOccurrence ownership; resources belong to Features`);
    }
    validateReferenceIdArray(site.featureIds, `Site '${siteId}' featureIds`, features, errors);
    for (const featureId of site.featureIds ?? []) {
      const owners = siteFeatureOwners.get(featureId) ?? [];
      owners.push(siteId);
      siteFeatureOwners.set(featureId, owners);
      const feature = features[featureId];
      if (!feature) continue;
      if (feature.siteId !== siteId) {
        errors.push(`Feature '${featureId}' siteId '${feature.siteId}' does not match parent Site '${siteId}'`);
      }
      if (feature.regionId !== site.regionId) {
        errors.push(`Feature '${featureId}' regionId '${feature.regionId}' does not match Site region '${site.regionId}'`);
      }
    }
  }

  for (const [featureId, feature] of Object.entries(features)) {
    const owners = siteFeatureOwners.get(featureId) ?? [];
    if (owners.length !== 1) {
      errors.push(`Feature '${featureId}' must belong to exactly one Site; found ${owners.length}`);
    }
    if ('discovered' in feature || 'discoveryState' in feature) {
      errors.push(`Feature '${featureId}' contains player-discovery state — move it to Knowledge State`);
    }
  }

  return errors;
}
