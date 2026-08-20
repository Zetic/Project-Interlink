import {
  addSolidMaterialState,
  createSolidMaterialState,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../../materials/solids/solidMaterialState.js';

const CONSERVATION_TOLERANCE = 1e-9;

export function mergeSolidMaterialStates(inputA, inputB) {
  validateSolidMaterialState(inputA);
  validateSolidMaterialState(inputB);
  const product = createSolidMaterialState();
  addSolidMaterialState(product, inputA);
  addSolidMaterialState(product, inputB);

  const inputTotal = totalSolidQuantity(inputA) + totalSolidQuantity(inputB);
  const outputTotal = totalSolidQuantity(product);
  if (Math.abs(inputTotal - outputTotal) > CONSERVATION_TOLERANCE * Math.max(1, inputTotal)) {
    throw new Error('Merger violated solid-matter conservation');
  }
  return product;
}
