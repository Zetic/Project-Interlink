import {
  addGasMaterialState,
  cloneGasMaterialBody,
  createGasMaterialBody,
  createGasMaterialState,
  totalGasMassKg,
} from '../../core/materials/gas/gasMaterialState.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';

export function createExhaustVent({ id } = {}) {
  return {
    id,
    nodeType: 'exhaustVent',
    systemType: 'exhaust-vent',
    kind: 'primitive',
    gasInputPortId: 'gas-in',
    emittedGasBody: createGasMaterialBody(createGasMaterialState()),
    ports: [{
      id: 'gas-in',
      direction: 'input',
      kind: 'material',
      label: 'gas in',
      accepts: [PORT_CAPABILITIES.GAS],
    }],
  };
}

export function cloneExhaustVentGasState(vent) {
  return cloneGasMaterialBody(vent.emittedGasBody);
}

export function commitExhaustVentGasState(vent, stagedGasBody) {
  vent.emittedGasBody = cloneGasMaterialBody(stagedGasBody);
}

export function ventReceiveGas(ventGasBody, incomingGasBody) {
  addGasMaterialState(ventGasBody.gasState, incomingGasBody.gasState);
  ventGasBody.thermalState.sensibleEnthalpyJ += incomingGasBody.thermalState.sensibleEnthalpyJ;
  return ventGasBody;
}

export function ventedGasMassKg(vent) {
  return totalGasMassKg(vent.emittedGasBody.gasState);
}
