import { mineralTextureProfilesEqual } from '../../core/materials/solids/mineralTextures.js';
import { SOLID_MATERIAL_TOLERANCE } from '../../core/materials/solids/solidMaterialState.js';
import { hopperFreeCapacityKg } from '../hopperNode.js';

/**
 * Runtime-only preflight for a fully planned solid transfer.
 *
 * Apparatus already own validated canonical material states. Transactionality
 * therefore does not require cloning complete source/destination inventories:
 * all conditions that can reject a normal Hopper commit (capacity and texture
 * lineage compatibility) can be checked before authoritative withdrawal.
 */
export function assertHopperCanReceivePlannedSolidState(
  hopper,
  solidState,
  plannedMassKg,
  context = 'Hopper transfer',
) {
  if (!hopper || hopper.nodeType !== 'hopper') {
    throw new Error(`${context} requires Hopper-compatible output storage`);
  }
  if (!Number.isFinite(plannedMassKg) || plannedMassKg < 0) {
    throw new Error(`${context} planned mass must be finite and non-negative`);
  }
  if (plannedMassKg > hopperFreeCapacityKg(hopper) + SOLID_MATERIAL_TOLERANCE) {
    throw new Error(`${context} output storage does not have enough free capacity`);
  }

  const existingProfiles = hopper.materialBody?.solidState?.textureProfiles ?? {};
  for (const [profileId, profile] of Object.entries(solidState?.textureProfiles ?? {})) {
    const existing = existingProfiles[profileId];
    if (existing && !mineralTextureProfilesEqual(existing, profile)) {
      throw new Error(`Conflicting mineral texture profile '${profileId}' cannot be merged`);
    }
  }
  return true;
}
