/** Material body boundary for future physical-form domains. */
export {
  createSolidMaterialBody,
  cloneSolidMaterialBody,
  commitSolidMaterialBody,
  validateSolidMaterialBody,
} from './solids/solidMaterialState.js';
export {
  createGasMaterialBody,
  cloneGasMaterialBody,
  validateGasMaterialBody,
} from './gas/gasMaterialState.js';

import { MATERIAL_FORMS } from './materialForms.js';
import {
  cloneSolidMaterialBody,
  validateSolidMaterialBody,
} from './solids/solidMaterialState.js';
import {
  cloneGasMaterialBody,
  validateGasMaterialBody,
} from './gas/gasMaterialState.js';

export function validateMaterialBody(body) {
  if (body?.physicalForm === MATERIAL_FORMS.SOLID_PARTICULATE) return validateSolidMaterialBody(body);
  if (body?.physicalForm === MATERIAL_FORMS.GAS) return validateGasMaterialBody(body);
  throw new Error(`Unsupported material body physical form '${body?.physicalForm ?? 'unknown'}'`);
}

export function cloneMaterialBody(body) {
  validateMaterialBody(body);
  if (body.physicalForm === MATERIAL_FORMS.SOLID_PARTICULATE) return cloneSolidMaterialBody(body);
  return cloneGasMaterialBody(body);
}
