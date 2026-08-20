import {
  cloneSolidMaterialState,
  validateSolidMaterialState,
} from '../../materials/solids/solidMaterialState.js';

export function feedSolidMaterialState(feedSolidState) {
  validateSolidMaterialState(feedSolidState);
  return cloneSolidMaterialState(feedSolidState);
}
