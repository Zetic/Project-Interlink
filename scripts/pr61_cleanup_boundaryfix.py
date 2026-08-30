from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src/simulation/boundaryTransfer.js'
path.write_text("""/** Browser-side boundary topology validation. Physical transfer execution is Rust-owned. */

import { assertSystemConnectionCompatible } from '../core/systems/connections.js';

export function validateBoundaryTransfer({ sourceComposite, sourcePortId, targetComposite, targetPortId } = {}) {
  if (!sourceComposite || !targetComposite) {
    throw new Error('Boundary transfer requires source and target composites');
  }
  return assertSystemConnectionCompatible(sourceComposite, sourcePortId, targetComposite, targetPortId);
}
""")

print('PR61 boundary topology contract restored')
