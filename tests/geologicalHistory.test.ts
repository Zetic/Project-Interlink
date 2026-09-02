import assert from 'node:assert/strict';
import test from 'node:test';

import { generateWorld } from '../dist/world/generateWorld.js';
import { environmentContextForPlanet, samplePlanetEnvironment } from '../dist/world/generation/surfaceField.js';

const WORLDS = ['history-a', 'history-b', 'history-c'].map(seed => generateWorld(seed).planet);

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

test('continental and oceanic plates carry distinct crustal history baselines', () => {
  const plates = WORLDS.flatMap(world => world.tectonicPlates);
  const continental = plates.filter(plate => plate.crustType === 'continental');
  const oceanic = plates.filter(plate => plate.crustType === 'oceanic');
  assert.ok(continental.length > 0 && oceanic.length > 0);
  assert.ok(average(continental.map(plate => plate.baseCrustAgeMyr)) > average(oceanic.map(plate => plate.baseCrustAgeMyr)) * 5);
  assert.ok(average(continental.map(plate => plate.baseCrustThicknessKm)) > average(oceanic.map(plate => plate.baseCrustThicknessKm)) * 3);
});

test('spreading ridges create younger oceanic crust while convergence thickens and uplifts crust', () => {
  const oceanicRidgeAges: number[] = [];
  const oceanicInteriorAges: number[] = [];
  const orogenicThickness: number[] = [];
  const quietContinentalThickness: number[] = [];
  const orogenicUplift: number[] = [];
  const quietContinentalUplift: number[] = [];

  for (const planet of WORLDS) {
    const context = environmentContextForPlanet(planet);
    const platesById = new Map(planet.tectonicPlates.map(plate => [plate.id, plate]));
    for (let y = 48; y < planet.height; y += 96) {
      for (let x = 48; x < planet.width; x += 96) {
        const sample = samplePlanetEnvironment(context, { x, y });
        const plate = platesById.get(sample.plateId);
        if (!plate) continue;
        if (plate.crustType === 'oceanic') {
          if (sample.ridgeInfluence > 0.55) oceanicRidgeAges.push(sample.crustAgeMyr);
          if (sample.boundaryProximity < 0.12) oceanicInteriorAges.push(sample.crustAgeMyr);
        } else {
          if (sample.orogenicInfluence > 0.55) {
            orogenicThickness.push(sample.crustThicknessKm);
            orogenicUplift.push(sample.upliftIndex);
          }
          if (sample.boundaryProximity < 0.12) {
            quietContinentalThickness.push(sample.crustThicknessKm);
            quietContinentalUplift.push(sample.upliftIndex);
          }
        }
      }
    }
  }

  assert.ok(oceanicRidgeAges.length > 4 && oceanicInteriorAges.length > 20);
  assert.ok(average(oceanicRidgeAges) < average(oceanicInteriorAges) * 0.6);
  assert.ok(orogenicThickness.length > 4 && quietContinentalThickness.length > 20);
  assert.ok(average(orogenicThickness) > average(quietContinentalThickness) + 4);
  assert.ok(average(orogenicUplift) > average(quietContinentalUplift) + 0.25);
});

test('continental rifting thins/subsides crust and semantic provinces reflect geological history', () => {
  const riftThickness: number[] = [];
  const quietThickness: number[] = [];
  const riftSubsidence: number[] = [];
  const quietSubsidence: number[] = [];
  const allLand = WORLDS.flatMap(world => world.regions.filter(region => region.surfaceType === 'land'));
  const mountains = allLand.filter(region => region.geographicType === 'mountain-range');
  const rifts = allLand.filter(region => region.geographicType === 'rift-zone');
  const basins = allLand.filter(region => region.geographicType === 'sedimentary-basin');

  for (const planet of WORLDS) {
    const context = environmentContextForPlanet(planet);
    const platesById = new Map(planet.tectonicPlates.map(plate => [plate.id, plate]));
    for (let y = 48; y < planet.height; y += 96) {
      for (let x = 48; x < planet.width; x += 96) {
        const sample = samplePlanetEnvironment(context, { x, y });
        const plate = platesById.get(sample.plateId);
        if (!plate || plate.crustType !== 'continental') continue;
        if (sample.riftInfluence > 0.55) {
          riftThickness.push(sample.crustThicknessKm);
          riftSubsidence.push(sample.subsidenceIndex);
        }
        if (sample.boundaryProximity < 0.12) {
          quietThickness.push(sample.crustThicknessKm);
          quietSubsidence.push(sample.subsidenceIndex);
        }
      }
    }
  }

  assert.ok(riftThickness.length > 4 && quietThickness.length > 20);
  assert.ok(average(riftThickness) < average(quietThickness) - 2);
  assert.ok(average(riftSubsidence) > average(quietSubsidence) + 0.18);

  const landOrogeny = average(allLand.map(region => region.environment.orogenicInfluence));
  const landRifting = average(allLand.map(region => region.environment.riftInfluence));
  const landBasin = average(allLand.map(region => region.environment.basinInfluence));
  if (mountains.length) assert.ok(average(mountains.map(region => region.environment.orogenicInfluence)) > landOrogeny);
  if (rifts.length) assert.ok(average(rifts.map(region => region.environment.riftInfluence)) > landRifting);
  if (basins.length) assert.ok(average(basins.map(region => region.environment.basinInfluence)) > landBasin);
});
