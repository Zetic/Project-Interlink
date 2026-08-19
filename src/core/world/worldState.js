/**
 * World State — the root serialisable simulation object.
 *
 * Canonical physical hierarchy:
 * Planet → Region → Site → Feature → ResourceOccurrence.
 * Regions group Sites; Sites own Features; Features own all natural-resource
 * occurrences. Player knowledge and UI/layout state are kept separately.
 */

import { SCHEMA_VERSION, GENERATOR_VERSION } from './versions.js';
import { generatePlanet } from '../../generator/generatePlanet.js';
import { getProcessDefinition } from '../processes/processDefinitions.js';
import { createCompositeNode, createSystemPort } from '../../simulation/systemNode.js';
import { summarizeSolidMaterialBySpecies, totalSolidQuantity, validateSolidMaterialBody } from '../materials/solidMaterialState.js';

export function createWorld(seed) {
  const seedStr = String(seed ?? 'default-seed');
  const planet = generatePlanet(seedStr);

  const world = {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    seed: seedStr,
    planetId: planet.id,
    planets: {},
    regions: {},
    sites: {},
    features: {},
    resourceOccurrences: {},
    materialBatches: {},
    processResults: {},
    nextMaterialBatchOrdinal: 1,
    nextProcessRunOrdinal: 1,
    simulation: {
      running: true,
      elapsedSeconds: 0,
      sessions: {},
    },
    systemNodes: {},
  };

  const regionIds = [];
  for (const generatedRegion of planet.regions) {
    const siteIds = [];

    for (const generatedSite of generatedRegion.sites ?? []) {
      const featureIds = [];
      for (const generatedFeature of generatedSite.features ?? []) {
        const occurrenceIds = [];
        for (const occurrence of generatedFeature.resourceOccurrences ?? []) {
          world.resourceOccurrences[occurrence.id] = occurrence;
          occurrenceIds.push(occurrence.id);
        }

        world.features[generatedFeature.id] = {
          ...generatedFeature,
          siteId: generatedSite.id,
          regionId: generatedRegion.id,
          resourceOccurrences: occurrenceIds,
        };
        featureIds.push(generatedFeature.id);
      }

      const siteNode = createCompositeNode({
        id: generatedSite.id,
        nodeType: 'site',
        systemType: 'site',
        childWorkspaceId: `${generatedSite.id}-workspace`,
        ports: [
          createSystemPort({ id: 'material-input', direction: 'input', kind: 'material', label: 'material in' }),
          createSystemPort({ id: 'material-output', direction: 'output', kind: 'material', label: 'material out' }),
        ],
        inspectableState: { regionId: generatedRegion.id, featureIds },
      });

      world.sites[generatedSite.id] = {
        id: generatedSite.id,
        name: generatedSite.name ?? world.features[featureIds[0]]?.name ?? generatedSite.id,
        siteKind: generatedSite.siteKind ?? 'localized',
        nodeType: 'site',
        systemType: 'site',
        regionId: generatedRegion.id,
        featureIds,
        childWorkspaceId: siteNode.childWorkspaceId,
        boundaryPorts: siteNode.ports,
      };
      world.systemNodes[generatedSite.id] = siteNode;
      siteIds.push(generatedSite.id);
    }

    const regionNode = createCompositeNode({
      id: generatedRegion.id,
      nodeType: 'region',
      systemType: 'region',
      childWorkspaceId: `${generatedRegion.id}-workspace`,
      ports: [
        createSystemPort({ id: 'material-input', direction: 'input', kind: 'material', label: 'material in' }),
        createSystemPort({ id: 'material-output', direction: 'output', kind: 'material', label: 'material out' }),
      ],
      inspectableState: { regionId: generatedRegion.id, siteIds },
    });
    world.systemNodes[generatedRegion.id] = regionNode;

    const { sites: _generatedSites, ...regionState } = generatedRegion;
    world.regions[generatedRegion.id] = {
      ...regionState,
      siteIds,
      boundaryPorts: regionNode.ports,
    };
    regionIds.push(generatedRegion.id);
  }

  world.planets[planet.id] = {
    ...planet,
    regions: regionIds,
  };
  world.systemNodes[planet.id] = createCompositeNode({
    id: planet.id,
    nodeType: 'planet',
    systemType: 'planet',
    childWorkspaceId: `${planet.id}-workspace`,
    ports: [],
    inspectableState: { regionIds },
  });

  validateWorld(world);
  return world;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function validateExactVersion(actual, expected, label, errors) {
  if (!Number.isInteger(actual)) {
    errors.push(`${label} must be an integer`);
    return;
  }
  if (actual !== expected) {
    errors.push(`Unsupported ${label} '${actual}'; expected ${expected}`);
  }
}

function validateReferenceIdArray(value, label, referenceMap, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }

  const seen = new Set();
  for (const id of value) {
    if (!isNonEmptyString(id)) {
      errors.push(`${label} contains an invalid id`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${label} contains duplicate id '${id}'`);
      continue;
    }
    seen.add(id);
    if (!referenceMap[id]) errors.push(`${label} references unknown id '${id}'`);
  }
}

/** Validate cross-references and physical ownership invariants within a world. */
export function validateWorld(world) {
  if (!world || typeof world !== 'object' || Array.isArray(world)) {
    return ['world must be an object'];
  }
  const errors = [];
  validateExactVersion(world.schemaVersion, SCHEMA_VERSION, 'schemaVersion', errors);
  validateExactVersion(world.generatorVersion, GENERATOR_VERSION, 'generatorVersion', errors);
  if (errors.length > 0) return errors;

  const planets = world.planets ?? {};
  const regions = world.regions ?? {};
  const sites = world.sites ?? {};
  const features = world.features ?? {};
  const resourceOccurrences = world.resourceOccurrences ?? {};
  const materialBatches = world.materialBatches ?? {};
  const processResults = world.processResults ?? {};

  if (!planets[world.planetId]) errors.push(`planetId '${world.planetId}' not in planets map`);

  const planet = planets[world.planetId];
  if (planet) {
    validateReferenceIdArray(planet.regions, `Planet '${planet.id}' regions`, regions, errors);
  }

  const siteFeatureOwners = new Map();
  const featureOccurrenceOwners = new Map();

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
      const ownersForOccurrence = featureOccurrenceOwners.get(occurrenceId) ?? [];
      ownersForOccurrence.push(featureId);
      featureOccurrenceOwners.set(occurrenceId, ownersForOccurrence);
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
  }

  // Material batch references and physical invariants
  for (const [bid, batch] of Object.entries(materialBatches)) {
    if (batch.sourceOccurrenceId && !resourceOccurrences[batch.sourceOccurrenceId]) {
      errors.push(`Material batch '${bid}' references unknown source occurrence '${batch.sourceOccurrenceId}'`);
    }

    if (!batch.provenance || typeof batch.provenance !== 'object' || Array.isArray(batch.provenance)) {
      errors.push(`Material batch '${bid}' is missing a valid provenance object`);
    } else {
      validateReferenceIdArray(
        batch.provenance.sourceOccurrenceIds,
        `Material batch '${bid}' provenance.sourceOccurrenceIds`,
        resourceOccurrences,
        errors
      );
      validateReferenceIdArray(
        batch.provenance.sourceBatchIds,
        `Material batch '${bid}' provenance.sourceBatchIds`,
      materialBatches,
        errors
      );

      const createdByProcessRunId = batch.provenance.createdByProcessRunId;
      if (createdByProcessRunId != null) {
        if (!isNonEmptyString(createdByProcessRunId)) {
          errors.push(`Material batch '${bid}' provenance.createdByProcessRunId must be a non-empty string or null`);
        } else if (!processResults[createdByProcessRunId]) {
          errors.push(`Material batch '${bid}' provenance references unknown process run '${createdByProcessRunId}'`);
        }
      }
    }

    try {
      validateSolidMaterialBody(batch.materialBody);
    } catch (error) {
      errors.push(`Material batch '${bid}' has invalid materialBody: ${error.message}`);
      continue;
    }

    if (!batch.componentsKg || typeof batch.componentsKg !== 'object' || Array.isArray(batch.componentsKg)) {
      errors.push(`Material batch '${bid}' is missing componentsKg`);
      continue;
    }

    const componentEntries = Object.entries(batch.componentsKg);
    let massSum = 0;
    for (const [componentId, massKg] of componentEntries) {
      if (typeof massKg !== 'number' || Number.isNaN(massKg) || !Number.isFinite(massKg)) {
        errors.push(`Material batch '${bid}' component '${componentId}' has invalid mass '${massKg}'`);
        continue;
      }
      if (massKg < 0) errors.push(`Material batch '${bid}' component '${componentId}' has negative mass '${massKg}'`);
      massSum += massKg;
    }

    if (componentEntries.length === 0) errors.push(`Material batch '${bid}' has no components`);

    const derivedComponents = summarizeSolidMaterialBySpecies(batch.materialBody.solidState);
    const derivedMassSum = totalSolidQuantity(batch.materialBody.solidState);
    if (JSON.stringify(batch.componentsKg) !== JSON.stringify(derivedComponents)) {
      errors.push(`Material batch '${bid}' componentsKg does not match derived material-body species summary`);
    }

    if (
      typeof batch.totalMassKg !== 'number' ||
      Number.isNaN(batch.totalMassKg) ||
      !Number.isFinite(batch.totalMassKg)
    ) {
      errors.push(`Material batch '${bid}' has invalid totalMassKg '${batch.totalMassKg}'`);
    } else if (Math.abs(batch.totalMassKg - derivedMassSum) > 1e-6 || Math.abs(batch.totalMassKg - massSum) > 1e-6) {
      errors.push(`Material batch '${bid}' totalMassKg '${batch.totalMassKg}' does not match component/material-body sum '${derivedMassSum}'`);
    }
  }

  // Process result references and port contracts
  for (const [runId, result] of Object.entries(processResults)) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      errors.push(`Process result '${runId}' must be an object`);
      continue;
    }

    const processDefinition = isNonEmptyString(result.processId) ? getProcessDefinition(result.processId) : null;
    if (!isNonEmptyString(result.processId)) errors.push(`Process result '${runId}' has invalid processId`);
    else if (!processDefinition) errors.push(`Process result '${runId}' references unknown process '${result.processId}'`);

    const expectedInputIds = new Set((processDefinition?.inputs ?? []).map(input => input.id));
    const seenInputIds = new Set();
    const seenInputBatchIds = new Set();

    if (!Array.isArray(result.inputBindings)) {
      errors.push(`Process result '${runId}' inputBindings must be an array`);
    } else {
      for (const inputBinding of result.inputBindings) {
        if (!inputBinding || typeof inputBinding !== 'object' || Array.isArray(inputBinding)) {
          errors.push(`Process result '${runId}' has invalid input binding`);
          continue;
        }
        const { inputId, batchId } = inputBinding;
        if (!isNonEmptyString(inputId)) {
          errors.push(`Process result '${runId}' has invalid input binding id`);
        } else {
          if (seenInputIds.has(inputId)) errors.push(`Process result '${runId}' has duplicate input binding '${inputId}'`);
          seenInputIds.add(inputId);
          if (processDefinition && !expectedInputIds.has(inputId)) {
            errors.push(`Process result '${runId}' has unexpected input binding '${inputId}'`);
          }
        }
        if (!isNonEmptyString(batchId)) {
          errors.push(`Process result '${runId}' has invalid input batch id`);
        } else {
          if (seenInputBatchIds.has(batchId)) errors.push(`Process result '${runId}' binds input batch '${batchId}' more than once`);
          seenInputBatchIds.add(batchId);
          if (!materialBatches[batchId]) errors.push(`Process result '${runId}' references unknown input batch '${batchId}'`);
        }
      }
    }

    if (processDefinition) {
      for (const expectedInputId of expectedInputIds) {
        if (!seenInputIds.has(expectedInputId)) errors.push(`Process result '${runId}' is missing required input binding '${expectedInputId}'`);
      }
    }

    const expectedOutputIds = new Set((processDefinition?.outputs ?? []).map(output => output.id));
    const seenOutputIds = new Set();
    const seenOutputBatchIds = new Set();

    if (!Array.isArray(result.outputBatches)) {
      errors.push(`Process result '${runId}' outputBatches must be an array`);
    } else {
      for (const output of result.outputBatches) {
        if (!output || typeof output !== 'object' || Array.isArray(output)) {
          errors.push(`Process result '${runId}' has invalid output binding`);
          continue;
        }
        const { outputId, batchId } = output;
        if (!isNonEmptyString(outputId)) {
          errors.push(`Process result '${runId}' has invalid output binding id`);
        } else {
          if (seenOutputIds.has(outputId)) errors.push(`Process result '${runId}' has duplicate output binding '${outputId}'`);
          seenOutputIds.add(outputId);
          if (processDefinition && !expectedOutputIds.has(outputId)) {
            errors.push(`Process result '${runId}' has unexpected output binding '${outputId}'`);
          }
        }
        if (!isNonEmptyString(batchId)) {
          errors.push(`Process result '${runId}' has invalid output batch id`);
        } else {
          if (seenOutputBatchIds.has(batchId)) errors.push(`Process result '${runId}' references output batch '${batchId}' more than once`);
          seenOutputBatchIds.add(batchId);
          if (!materialBatches[batchId]) errors.push(`Process result '${runId}' references unknown output batch '${batchId}'`);
        }
      }
    }

    if (processDefinition) {
      for (const expectedOutputId of expectedOutputIds) {
        if (!seenOutputIds.has(expectedOutputId)) errors.push(`Process result '${runId}' is missing required output binding '${expectedOutputId}'`);
      }
    }
  }

  if (errors.length > 0) console.error('[Interlink] World validation errors:', errors);
  return errors;
}
