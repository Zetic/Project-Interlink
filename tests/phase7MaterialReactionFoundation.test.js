import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  LIBERATION_CLASSES,
  PARTICLE_SIZE_BINS,
  materializeSolidParticulateUnit,
} from '../dist/material/particulate.js';
import {
  GOETHITE_DEHYDROXYLATION_REACTION,
  candidateSpeciesForFeed,
  validateReactionDefinition,
} from '../dist/material/reactions.js';
import { requireMaterialSpecies } from '../dist/material/species.js';
import { compileFlatRuntimePlan } from '../dist/runtime/compileRuntimePlan.js';
import { compileFlatWorkerSetup } from '../dist/runtime/workerSetup.js';
import { createEmptyGraphState } from '../dist/graph/graphCommands.js';
import { generateWorld } from '../dist/world/generateWorld.js';

test('Phase 7 restores the mature particulate vocabulary and occurrence-specific ore texture', () => {
  const resource = generateWorld('phase7-rich-material').planet.resourceNodes[0];
  assert.equal(resource.resourceId, 'iron-ore');
  assert.equal(resource.source.physicalForm, 'solid-particulate');
  assert.ok(PARTICLE_SIZE_BINS.length >= 18);
  assert.equal(PARTICLE_SIZE_BINS[0].id, 'lt-0.004mm');
  assert.equal(PARTICLE_SIZE_BINS.at(-1).id, '1000mm-plus');
  assert.deepEqual(LIBERATION_CLASSES.map(item => item.id), [
    'locked', 'partial', 'mostly-liberated', 'liberated',
  ]);

  assert.ok(resource.source.mineralTexture);
  assert.ok(resource.source.comminutionProperties);
  assert.deepEqual(
    Object.keys(resource.source.mineralTexture.speciesTextures),
    resource.source.composition.map(component => component.speciesId),
  );
  for (const texture of Object.values(resource.source.mineralTexture.speciesTextures)) {
    assert.ok(texture.grainSizeUm.d10 < texture.grainSizeUm.d50);
    assert.ok(texture.grainSizeUm.d50 < texture.grainSizeUm.d90);
    const occurrenceTotal = Object.values(texture.occurrenceModes).reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(occurrenceTotal - 1) < 0.005);
  }
});

test('run-of-mine extraction materializes sparse statistical populations instead of placeholder descriptors', () => {
  const resource = generateWorld('phase7-populations').planet.resourceNodes[0];
  const populations = materializeSolidParticulateUnit(resource.source);
  assert.equal(populations.length, resource.source.composition.length * 3 * 2);
  assert.ok(Math.abs(populations.reduce((sum, population) => sum + population.massFraction, 0) - 1) < 1e-10);
  assert.deepEqual([...new Set(populations.map(population => population.particleSizeBinId))], [
    '120-250mm', '250-500mm', '500-1000mm',
  ]);
  assert.deepEqual([...new Set(populations.map(population => population.liberationClassId))], [
    'locked', 'partial',
  ]);
  assert.deepEqual([...new Set(populations.map(population => population.textureProfileId))], [
    resource.source.mineralTexture.id,
  ]);
});

test('flat runtime setup packs species, size, liberation, and texture lineage for Rust', () => {
  const planet = generateWorld('phase7-runtime-packing').planet;
  const resource = planet.resourceNodes[0];
  const plan = compileFlatRuntimePlan(planet, createEmptyGraphState());
  const setup = compileFlatWorkerSetup(plan);
  const occurrence = setup.occurrences.find(candidate => candidate.sourceNodeId === resource.id);
  assert.ok(occurrence);
  assert.equal(occurrence.speciesIds.length, occurrence.quantitiesPerKg.length);
  assert.equal(occurrence.sizeBinIds.length, occurrence.quantitiesPerKg.length);
  assert.equal(occurrence.liberationClassIds.length, occurrence.quantitiesPerKg.length);
  assert.equal(occurrence.textureProfileIds.length, occurrence.quantitiesPerKg.length);

  const decodedSizes = [...new Set(Array.from(occurrence.sizeBinIds).map(id => setup.sizeBinIds[id]))];
  const decodedLiberation = [...new Set(Array.from(occurrence.liberationClassIds).map(id => setup.liberationClassIds[id]))];
  const decodedTextures = [...new Set(Array.from(occurrence.textureProfileIds).map(id => setup.textureProfileIds[id]))];
  assert.deepEqual(decodedSizes, ['120-250mm', '250-500mm', '500-1000mm']);
  assert.deepEqual(decodedLiberation, ['locked', 'partial']);
  assert.deepEqual(decodedTextures, [resource.source.mineralTexture.id]);
  assert.notEqual(occurrence.textureProfileIds[0], 0);
});

test('flat setup compiles immutable physical-property tables for Rust hot paths', () => {
  const planet = generateWorld('phase7-runtime-tables').planet;
  const setup = compileFlatWorkerSetup(compileFlatRuntimePlan(planet, createEmptyGraphState()));
  const tables = setup.materialTables;

  assert.equal(tables.sizeBins.filter(bin => bin.canonical).length, PARTICLE_SIZE_BINS.length);
  assert.ok(tables.sizeBins.some(bin => bin.canonicalId === 'lt-1mm' && bin.canonical === false));
  assert.deepEqual(tables.liberationClasses.map(item => item.canonicalId), [
    'locked', 'partial', 'mostly-liberated', 'liberated',
  ]);

  const magnetiteRuntimeId = setup.speciesIds.indexOf('magnetite');
  const magnetite = tables.species.find(item => item.runtimeId === magnetiteRuntimeId);
  assert.ok(magnetite);
  assert.equal(magnetite.magneticResponse, 1);
  assert.equal(magnetite.specificHeatCapacityJPerKgK, 670);

  const ironSource = planet.resourceNodes[0].source;
  const sourceTextureRuntimeId = setup.textureProfileIds.indexOf(ironSource.mineralTexture.id);
  assert.ok(sourceTextureRuntimeId > 0);
  assert.ok(tables.textures.some(item => item.textureProfileId === sourceTextureRuntimeId));
  assert.ok(tables.comminutionProperties.some(item => item.textureProfileId === sourceTextureRuntimeId));

  const reaction = tables.goethiteReaction;
  assert.equal(setup.speciesIds[reaction.sourceSpeciesId], 'goethite');
  assert.equal(setup.speciesIds[reaction.solidProductSpeciesId], 'hematite');
  assert.equal(setup.speciesIds[reaction.gasProductSpeciesId], 'waterVapor');
  assert.ok(Math.abs(reaction.sourceMassPerExtentKg - reaction.solidProductMassPerExtentKg - reaction.gasProductMassPerExtentKg) < 1e-12);
  assert.equal(reaction.sizeFactors.length, tables.sizeBins.length);
  assert.ok(reaction.textureMappings.some(mapping => mapping.sourceTextureProfileId === sourceTextureRuntimeId));
  for (const mapping of reaction.textureMappings) {
    assert.ok(mapping.productTextureProfileId > 0);
    assert.match(setup.textureProfileIds[mapping.productTextureProfileId], /goethite-dehydroxylation/);
  }
});

test('intrinsic species properties live in the shared registry instead of material populations', () => {
  const magnetite = requireMaterialSpecies('magnetite');
  assert.equal(magnetite.formula, 'Fe3O4');
  assert.equal(magnetite.physicalProperties.densityKgPerM3, 5170);
  assert.equal(magnetite.physicalProperties.magneticResponse.normalizedSeparationCoefficient, 1);
  assert.equal(magnetite.physicalProperties.thermal.specificHeatCapacityJPerKgK, 670);
  assert.deepEqual(magnetite.chemistry.elementalComposition, { Fe: 3, O: 4 });

  const population = materializeSolidParticulateUnit(generateWorld('phase7-registry').planet.resourceNodes[0].source)[0];
  assert.equal(Object.hasOwn(population, 'densityKgPerM3'), false);
  assert.equal(Object.hasOwn(population, 'magneticResponse'), false);
  assert.equal(Object.hasOwn(population, 'formula'), false);
});

test('reaction foundation enforces atom conservation and discovers candidates from available elements', () => {
  assert.equal(validateReactionDefinition(GOETHITE_DEHYDROXYLATION_REACTION), GOETHITE_DEHYDROXYLATION_REACTION);
  assert.throws(() => validateReactionDefinition({
    id: 'unbalanced-example',
    name: 'Unbalanced Example',
    reactants: [{ speciesId: 'goethite', stoichiometricMoles: 1 }],
    products: [
      { speciesId: 'hematite', stoichiometricMoles: 1 },
      { speciesId: 'waterVapor', stoichiometricMoles: 1 },
    ],
  }), /does not conserve element/);

  const candidates = candidateSpeciesForFeed(['goethite']).map(species => species.id);
  assert.ok(candidates.includes('goethite'));
  assert.ok(candidates.includes('hematite'));
  assert.ok(candidates.includes('magnetite'));
  assert.ok(candidates.includes('waterVapor'));
  assert.equal(candidates.includes('quartz'), false);
});

test('material contracts are form-specific and keep ore-only descriptors out of universal matter state', () => {
  const source = fs.readFileSync('src/material/types.ts', 'utf8');
  assert.match(source, /'solid-particulate' \| 'liquid' \| 'gas' \| 'bulk-solid' \| 'product'/);
  assert.match(source, /interface LiquidBodyDescriptor/);
  assert.match(source, /interface GasBodyDescriptor/);
  assert.match(source, /interface BulkSolidBodyDescriptor/);
  assert.match(source, /interface ProductBodyDescriptor/);
  assert.doesNotMatch(source, /interface GasBodyDescriptor[\s\S]*liberationClassId/);
});

test('Worker and Inspector keep rich material detail query-driven while Rust owns state', () => {
  const worker = fs.readFileSync('src/runtime/flatRuntimeWorker.ts', 'utf8');
  const presentation = fs.readFileSync('src/runtime/presentation.ts', 'utf8');
  const inspector = fs.readFileSync('src/ui/inspectorPanel.ts', 'utf8');

  assert.match(worker, /populateMaterialTables/);
  assert.match(worker, /set_specific_heat_capacity_j_per_kg_k/);
  assert.match(worker, /set_species_magnetic_response/);
  assert.match(worker, /set_comminution_species_texture/);
  assert.match(worker, /set_comminution_texture_properties/);
  assert.match(worker, /begin_goethite_reaction/);
  assert.match(worker, /hopper_size_bin_ids/);
  assert.match(worker, /hopper_liberation_class_ids/);
  assert.match(worker, /hopper_texture_profile_ids/);
  assert.match(worker, /hopper_sensible_enthalpy_j/);
  assert.match(presentation, /particleSizeKg/);
  assert.match(presentation, /liberationKg/);
  assert.match(presentation, /textureKg/);
  assert.match(inspector, /Refresh Material Detail/);
  assert.match(inspector, /Particle size/);
  assert.match(inspector, /Liberation/);
  assert.match(inspector, /Texture lineage/);
});
