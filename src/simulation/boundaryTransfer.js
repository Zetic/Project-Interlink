/**
 * Explicit material transfer across a composite boundary.
 *
 * The boundary resolves to a child Hopper endpoint and the transfer withdraws
 * from that owner before accepting into the destination owner. No stream or
 * storage object is copied between workspaces.
 */

import {
  hopperStoredMassKg,
  hopperFreeCapacityKg,
  hopperWithdraw,
  hopperReceiveInflow,
} from './hopperNode.js';
import { resolveBoundaryPort } from './systemNode.js';

const TRANSFER_TOLERANCE_KG = 1e-8;

function cloneHopper(hopper) {
  return { ...hopper, storedComponentsKg: { ...hopper.storedComponentsKg } };
}

function commitHopper(target, staged) {
  target.storedComponentsKg = { ...staged.storedComponentsKg };
  target.particleSizeMm = staged.particleSizeMm;
}

function endpoint(composite, portId, workspace, direction) {
  const resolved = resolveBoundaryPort(composite, portId, workspace);
  if (resolved.boundaryPort.direction !== direction) {
    throw new Error(`Boundary port '${portId}' must be an ${direction}`);
  }
  if (resolved.node?.nodeType !== 'hopper') {
    throw new Error(`Boundary port '${portId}' must resolve to a Hopper endpoint`);
  }
  return resolved.node;
}

export function transferBoundaryMaterial({
  sourceComposite,
  sourcePortId,
  sourceWorkspace,
  targetComposite,
  targetPortId,
  targetWorkspace,
  dt,
  requestedRateKgPerSecond = null,
} = {}) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('Boundary transfer dt must be a finite positive number');
  }
  const source = endpoint(sourceComposite, sourcePortId, sourceWorkspace, 'output');
  const target = endpoint(targetComposite, targetPortId, targetWorkspace, 'input');
  const availableKg = hopperStoredMassKg(source);
  const freeKg = hopperFreeCapacityKg(target);
  if (availableKg <= TRANSFER_TOLERANCE_KG || freeKg <= TRANSFER_TOLERANCE_KG) {
    return { movedKg: 0, componentMassKg: {} };
  }

  const rate = requestedRateKgPerSecond == null
    ? availableKg / dt
    : Math.max(0, Math.min(requestedRateKgPerSecond, availableKg / dt, freeKg / dt));
  if (rate <= 0) return { movedKg: 0, componentMassKg: {} };

  const requestedRates = Object.fromEntries(
    Object.entries(source.storedComponentsKg).map(([componentId, kg]) => [
      componentId,
      (kg / availableKg) * rate,
    ])
  );
  const stagedSource = cloneHopper(source);
  const stagedTarget = cloneHopper(target);
  const withdrawal = hopperWithdraw(stagedSource, requestedRates, dt);
  const acceptedKg = hopperReceiveInflow(
    stagedTarget,
    withdrawal.actualRates,
    source.particleSizeMm,
    dt
  );
  if (Math.abs(acceptedKg - withdrawal.actualTotalKg) > TRANSFER_TOLERANCE_KG) {
    return { movedKg: 0, componentMassKg: {} };
  }

  commitHopper(source, stagedSource);
  commitHopper(target, stagedTarget);
  return {
    movedKg: acceptedKg,
    componentMassKg: Object.fromEntries(
      Object.entries(withdrawal.actualRates).map(([componentId, rateKgPerSecond]) => [
        componentId,
        rateKgPerSecond * dt,
      ])
    ),
  };
}
