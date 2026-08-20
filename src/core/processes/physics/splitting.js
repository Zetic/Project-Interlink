import {
  multiplySolidMaterialState,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../../materials/solids/solidMaterialState.js';

const CONSERVATION_TOLERANCE = 1e-9;

export function splitSolidMaterialState(feedSolidState, splitFractionToA) {
  validateSolidMaterialState(feedSolidState);
  if (typeof splitFractionToA !== 'number' || !Number.isFinite(splitFractionToA) || splitFractionToA < 0 || splitFractionToA > 1) {
    throw new Error('Splitter splitFractionToA must be a finite number in [0, 1]');
  }

  const outputA = multiplySolidMaterialState(feedSolidState, splitFractionToA);
  const outputB = multiplySolidMaterialState(feedSolidState, 1 - splitFractionToA);
  const inputTotal = totalSolidQuantity(feedSolidState);
  const outputTotal = totalSolidQuantity(outputA) + totalSolidQuantity(outputB);
  if (Math.abs(inputTotal - outputTotal) > CONSERVATION_TOLERANCE * Math.max(1, inputTotal)) {
    throw new Error('Splitter violated solid-matter conservation');
  }
  return { outputA, outputB };
}
