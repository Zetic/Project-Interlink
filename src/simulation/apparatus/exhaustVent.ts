
import { createGasMaterialBody, createGasMaterialState } from '../../core/materials/gas/gasMaterialState.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';

export function createExhaustVent({ id } = {}) {
  return {
    id,
    nodeType: 'exhaustVent',
    systemType: 'exhaust-vent',
    kind: 'primitive',
    gasInputPortId: 'gas-in',
    emittedGasBody: createGasMaterialBody(createGasMaterialState()),
    ports: [{ id: 'gas-in', direction: 'input', kind: 'material', label: 'gas in', accepts: [PORT_CAPABILITIES.GAS] }],
  };
}
