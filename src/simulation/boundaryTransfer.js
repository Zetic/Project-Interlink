/** Explicit, conserved material transfer across recursive system boundaries. */

import {
  hopperStoredMassKg,
  hopperFreeCapacityKg,
  hopperWithdraw,
  hopperReceiveInflow,
} from './hopperNode.js';
import { resolveBoundaryChain, assertSystemConnectionCompatible } from './systemNode.js';

const TRANSFER_TOLERANCE_KG = 1e-8;

function cloneHopper(hopper) {
  return { ...hopper, storedComponentsKg: { ...hopper.storedComponentsKg } };
}

function commitHopper(target, staged) {
  target.storedComponentsKg = { ...staged.storedComponentsKg };
  target.particleSizeMm = staged.particleSizeMm;
}

function resolveHopperEndpoint(composite, portId, workspaces, direction) {
  const resolved = resolveBoundaryChain(composite, portId, workspaces);
  if (!resolved.boundaryPort) throw new Error(`Unknown boundary port '${portId}'`);
  if (resolved.boundaryPort.direction !== direction) {
    throw new Error(`Boundary port '${portId}' must be an ${direction}`);
  }
  if (!resolved.node) return null;
  if (resolved.node.nodeType !== 'hopper') {
    throw new Error(`Boundary port '${portId}' must resolve to a Hopper endpoint`);
  }
  if (!resolved.port || resolved.port.direction !== direction || resolved.port.kind !== resolved.boundaryPort.kind) {
    throw new Error(`Boundary port '${portId}' resolves to an incompatible child port`);
  }
  return resolved.node;
}

export function validateBoundaryTransfer({ sourceComposite, sourcePortId, targetComposite, targetPortId } = {}) {
  if (!sourceComposite || !targetComposite) throw new Error('Boundary transfer requires source and target composites');
  return assertSystemConnectionCompatible(sourceComposite, sourcePortId, targetComposite, targetPortId);
}

export function transferBoundaryMaterial({
  sourceComposite,
  sourcePortId,
  targetComposite,
  targetPortId,
  workspaces = null,
  sourceWorkspace = null,
  targetWorkspace = null,
  dt,
  requestedRateKgPerSecond = null,
} = {}) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('Boundary transfer dt must be a finite positive number');
  }
  if (requestedRateKgPerSecond != null && (
    typeof requestedRateKgPerSecond !== 'number'
    || !Number.isFinite(requestedRateKgPerSecond)
    || requestedRateKgPerSecond < 0
  )) {
    throw new Error('Boundary transfer requestedRateKgPerSecond must be finite and non-negative');
  }

  validateBoundaryTransfer({ sourceComposite, sourcePortId, targetComposite, targetPortId });

  const workspaceMap = workspaces ?? {
    [sourceComposite.childWorkspaceId]: sourceWorkspace,
    [targetComposite.childWorkspaceId]: targetWorkspace,
  };
  const source = resolveHopperEndpoint(sourceComposite, sourcePortId, workspaceMap, 'output');
  const target = resolveHopperEndpoint(targetComposite, targetPortId, workspaceMap, 'input');
  if (!source || !target) return { movedKg: 0, componentMassKg: {} };
  if (source === target) throw new Error('Boundary transfer source and target cannot resolve to the same physical owner');

  const availableKg = hopperStoredMassKg(source);
  const freeKg = hopperFreeCapacityKg(target);
  if (availableKg <= TRANSFER_TOLERANCE_KG || freeKg <= TRANSFER_TOLERANCE_KG) {
    return { movedKg: 0, componentMassKg: {} };
  }

  const maxRate = Math.min(availableKg / dt, freeKg / dt);
  const rate = requestedRateKgPerSecond == null ? maxRate : Math.min(requestedRateKgPerSecond, maxRate);
  if (rate <= 0) return { movedKg: 0, componentMassKg: {} };

  const requestedRates = Object.fromEntries(
    Object.entries(source.storedComponentsKg).map(([componentId, kg]) => [componentId, (kg / availableKg) * rate])
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
  if (Math.abs(acceptedKg - withdrawal.actualTotalKg) > TRANSFER_TOLERANCE_KG * Math.max(1, acceptedKg)) {
    throw new Error('Boundary transfer could not commit atomically');
  }

  commitHopper(source, stagedSource);
  commitHopper(target, stagedTarget);
  return {
    movedKg: acceptedKg,
    componentMassKg: Object.fromEntries(
      Object.entries(withdrawal.actualRates).map(([componentId, rateKgPerSecond]) => [componentId, rateKgPerSecond * dt])
    ),
  };
}
