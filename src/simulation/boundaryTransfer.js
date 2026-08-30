/** Browser-side boundary topology validation. Physical transfer execution is Rust-owned. */

import { assertSystemConnectionCompatible } from '../core/systems/connections.js';

export function validateBoundaryTransfer({ sourceComposite, sourcePortId, targetComposite, targetPortId } = {}) {
  if (!sourceComposite || !targetComposite) {
    throw new Error('Boundary transfer requires source and target composites');
  }
  return assertSystemConnectionCompatible(sourceComposite, sourcePortId, targetComposite, targetPortId);
}
