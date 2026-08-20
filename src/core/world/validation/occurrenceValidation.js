import {
  validateReferenceIdArray,
  worldCollections,
} from './helpers.js';
import { getResourceDefinition } from '../../../content/resources/resourceDefinitions.js';
import { validateMineralTextureProfile } from '../../materials/solids/mineralTextures.js';

function validateOccurrenceTexture(occurrenceId, occurrence, errors) {
  const resource = getResourceDefinition(occurrence?.resourceId);
  const requiresTexture = resource?.occurrenceFamily === 'ore-body';
  if (!occurrence?.mineralTexture) {
    if (requiresTexture) errors.push(`Ore-body ResourceOccurrence '${occurrenceId}' must define mineralTexture`);
    return;
  }

  try {
    validateMineralTextureProfile(occurrence.mineralTexture);
  } catch (error) {
    errors.push(`ResourceOccurrence '${occurrenceId}' has invalid mineralTexture: ${error.message}`);
    return;
  }

  for (const speciesId of Object.keys(occurrence.composition ?? {})) {
    if (!(speciesId in occurrence.mineralTexture.speciesLiberationSizeUm)) {
      errors.push(`ResourceOccurrence '${occurrenceId}' mineralTexture is missing species '${speciesId}'`);
    }
  }
}

/** Validate Feature-owned ResourceOccurrence references and ownership. */
export function validateOccurrences(world) {
  if (!world || typeof world !== 'object' || Array.isArray(world)) return [];
  const { features, resourceOccurrences } = worldCollections(world);
  const errors = [];
  const featureOccurrenceOwners = new Map();

  for (const [featureId, feature] of Object.entries(features)) {
    if (!Array.isArray(feature.resourceOccurrences) || feature.resourceOccurrences.length === 0) {
      errors.push(`Feature '${featureId}' must expose at least one ResourceOccurrence`);
      continue;
    }
    validateReferenceIdArray(
      feature.resourceOccurrences,
      `Feature '${featureId}' resourceOccurrences`,
      resourceOccurrences,
      errors,
    );
    for (const occurrenceId of feature.resourceOccurrences) {
      const owners = featureOccurrenceOwners.get(occurrenceId) ?? [];
      owners.push(featureId);
      featureOccurrenceOwners.set(occurrenceId, owners);
      const occurrence = resourceOccurrences[occurrenceId];
      if (!occurrence) continue;
      if (occurrence.sourceType !== 'feature') {
        errors.push(`ResourceOccurrence '${occurrenceId}' must have sourceType 'feature', got '${occurrence.sourceType}'`);
      }
      if (occurrence.sourceId !== featureId) {
        errors.push(`ResourceOccurrence '${occurrenceId}' sourceId '${occurrence.sourceId}' does not match Feature '${featureId}'`);
      }
    }
  }

  for (const [occurrenceId, occurrence] of Object.entries(resourceOccurrences)) {
    const owners = featureOccurrenceOwners.get(occurrenceId) ?? [];
    if (owners.length !== 1) {
      errors.push(`ResourceOccurrence '${occurrenceId}' must belong to exactly one Feature; found ${owners.length}`);
    }
    if (occurrence.sourceType !== 'feature') {
      errors.push(`ResourceOccurrence '${occurrenceId}' cannot be owned by '${occurrence.sourceType}'`);
    }
    validateOccurrenceTexture(occurrenceId, occurrence, errors);
  }

  return errors;
}
