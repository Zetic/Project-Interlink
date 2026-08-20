/** Hopper — finite-capacity solid-material storage node. */

import { particleSizeBinIdForMm } from '../core/materials/solids/particleSizeBins.js';
import {
  SOLID_MATERIAL_TOLERANCE as HOPPER_TOLERANCE_KG,
  SOLID_PARTICULATE_FORM,
  addSolidFractionDirect,
  addSolidMaterialState,
  cloneSolidMaterialBody,
  createSolidMaterialBody,
  createSolidMaterialState,
  createSolidMaterialStateFromSpeciesQuantities,
  proportionalSolidMaterialShare,
  summarizeSolidMaterialByLiberationClass,
  summarizeSolidMaterialBySizeBin,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
  validateSolidMaterialBody,
  validateSolidMaterialState,
  withdrawSolidMaterialState,
} from '../core/materials/solids/solidMaterialState.js';
import { PORT_CAPABILITIES } from '../core/systems/ports.js';

function legacyMaterialBody(initialComponentsKg, initialParticleSizeMm, initialLiberationClassId = 'partial') {
  if (!initialComponentsKg || Object.keys(initialComponentsKg).length === 0) {
    return createSolidMaterialBody();
  }
  if (typeof initialParticleSizeMm !== 'number' || !Number.isFinite(initialParticleSizeMm) || initialParticleSizeMm <= 0) {
    throw new Error('Hopper initialParticleSizeMm must be a finite positive number when contents are non-empty');
  }
  const solidState = createSolidMaterialState();
  const sizeBinId = particleSizeBinIdForMm(initialParticleSizeMm);
  for (const [speciesId, kg] of Object.entries(initialComponentsKg)) {
    if (typeof kg !== 'number' || !Number.isFinite(kg) || kg < 0) {
      throw new Error(`Hopper initial component '${speciesId}' must be a finite non-negative number`);
    }
    addSolidFractionDirect(solidState, {
      speciesId,
      sizeBinId,
      liberationClassId: initialLiberationClassId,
      quantity: kg,
    });
  }
  return createSolidMaterialBody(solidState);
}

export function createHopper({
  id,
  capacityKg,
  initialMaterialBody = null,
  initialComponentsKg = {},
  initialParticleSizeMm = null,
} = {}) {
  if (!id || typeof id !== 'string') throw new Error('Hopper id must be a non-empty string');
  if (typeof capacityKg !== 'number' || !Number.isFinite(capacityKg) || capacityKg <= 0) {
    throw new Error('Hopper capacityKg must be a finite positive number');
  }

  const materialBody = initialMaterialBody
    ? cloneSolidMaterialBody(initialMaterialBody)
    : legacyMaterialBody(initialComponentsKg, initialParticleSizeMm);
  validateSolidMaterialBody(materialBody);
  const total = totalSolidQuantity(materialBody.solidState);
  if (total > capacityKg + HOPPER_TOLERANCE_KG) {
    throw new Error(`Hopper initial contents (${total} kg) exceed capacity (${capacityKg} kg)`);
  }

  const hopper = {
    id,
    capacityKg,
    physicalForm: SOLID_PARTICULATE_FORM,
    nominalParticleSizeMm: initialParticleSizeMm,
    materialBody,
    inputPortId: 'input',
    outputPortId: 'output',
    nodeType: 'hopper',
    systemType: 'hopper',
    kind: 'primitive',
    ports: [
      {
        id: 'input',
        direction: 'input',
        kind: 'material',
        label: 'in',
        accepts: [PORT_CAPABILITIES.SOLID_PARTICULATE],
      },
      {
        id: 'output',
        direction: 'output',
        kind: 'material',
        label: 'out',
        provides: [
          PORT_CAPABILITIES.SOLID_PARTICULATE,
          PORT_CAPABILITIES.STORED_SOLID_PARTICULATE,
        ],
      },
    ],
  };
  Object.defineProperty(hopper, 'storedComponentsKg', {
    enumerable: true,
    get() { return summarizeSolidMaterialBySpecies(hopper.materialBody.solidState); },
  });
  return hopper;
}

export function createBoundaryBuffer({
  id,
  capacityKg,
  role,
  initialMaterialBody = null,
  initialComponentsKg = {},
  initialParticleSizeMm = null,
} = {}) {
  if (role !== 'import' && role !== 'export') {
    throw new Error('Boundary buffer role must be import or export');
  }
  const hopper = createHopper({
    id,
    capacityKg,
    initialMaterialBody,
    initialComponentsKg,
    initialParticleSizeMm,
  });
  hopper.systemType = 'boundary-buffer';
  hopper.boundaryRole = role;
  hopper.displayName = role === 'import' ? 'Import Boundary' : 'Export Boundary';
  return hopper;
}

export function hopperStoredMassKg(hopper) {
  return totalSolidQuantity(hopper.materialBody.solidState);
}

export function hopperFreeCapacityKg(hopper) {
  return Math.max(0, hopper.capacityKg - hopperStoredMassKg(hopper));
}

export function hopperCompositionKg(hopper) {
  return summarizeSolidMaterialBySpecies(hopper.materialBody.solidState);
}

export function hopperParticleSizeDistributionKg(hopper) {
  return summarizeSolidMaterialBySizeBin(hopper.materialBody.solidState);
}

export function hopperLiberationDistributionKg(hopper) {
  return summarizeSolidMaterialByLiberationClass(hopper.materialBody.solidState);
}

export function hopperReceiveInflow(hopper, inflowSolidStateOrComponents, particleSizeMmOrDt, maybeDt) {
  const usingLegacySignature = typeof maybeDt === 'number';
  const inflowSolidState = usingLegacySignature
    ? createSolidMaterialStateFromSpeciesQuantities(inflowSolidStateOrComponents, particleSizeMmOrDt)
    : inflowSolidStateOrComponents;
  const dt = usingLegacySignature ? maybeDt : particleSizeMmOrDt;
  validateSolidMaterialState(inflowSolidState);
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('hopperReceiveInflow: dt must be a finite positive number');
  }
  const freeKg = hopperFreeCapacityKg(hopper);
  if (freeKg <= HOPPER_TOLERANCE_KG) return 0;
  const requestedKg = totalSolidQuantity(inflowSolidState) * dt;
  if (requestedKg <= 0) return 0;
  const acceptedState = proportionalSolidMaterialShare(inflowSolidState, Math.min(requestedKg, freeKg) / dt);
  hopper.materialBody.physicalForm = SOLID_PARTICULATE_FORM;
  if (usingLegacySignature) hopper.nominalParticleSizeMm = particleSizeMmOrDt;
  addSolidMaterialState(hopper.materialBody.solidState, acceptedState, dt);
  return totalSolidQuantity(acceptedState) * dt;
}

export function hopperWithdraw(hopper, requestedTotalRateKgPerSecond, dt) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('hopperWithdraw: dt must be a finite positive number');
  }
  const storedMassKg = hopperStoredMassKg(hopper);
  if (storedMassKg <= HOPPER_TOLERANCE_KG) {
    return { actualSolidState: createSolidMaterialState(), actualTotalKg: 0 };
  }
  const requestedRate = typeof requestedTotalRateKgPerSecond === 'number'
    ? requestedTotalRateKgPerSecond
    : Object.values(requestedTotalRateKgPerSecond ?? {}).reduce((sum, value) => sum + value, 0);
  if (typeof requestedRate !== 'number' || !Number.isFinite(requestedRate) || requestedRate < 0) {
    throw new Error('hopperWithdraw: requestedTotalRateKgPerSecond must be finite and non-negative');
  }
  const requestedTotalKg = requestedRate * dt;
  if (requestedTotalKg <= 0) {
    return { actualSolidState: createSolidMaterialState(), actualTotalKg: 0 };
  }
  const actualSolidState = withdrawSolidMaterialState(hopper.materialBody.solidState, requestedTotalKg);
  const actualTotalKg = totalSolidQuantity(actualSolidState);
  const actualRates = Object.fromEntries(
    Object.entries(summarizeSolidMaterialBySpecies(actualSolidState)).map(([speciesId, quantity]) => [speciesId, quantity / dt])
  );
  return { actualSolidState, actualRates, actualTotalKg };
}

export function cloneHopperMaterialState(hopper) {
  return { ...hopper, materialBody: cloneSolidMaterialBody(hopper.materialBody) };
}

export function commitHopperMaterialState(target, staged) {
  target.materialBody = cloneSolidMaterialBody(staged.materialBody);
}

export { HOPPER_TOLERANCE_KG };
