
import { createSolidMaterialBody, totalSolidQuantity } from '../../core/materials/solids/solidMaterialState.js';
import { createGasMaterialBody, createGasMaterialState } from '../../core/materials/gas/gasMaterialState.js';
import { ROASTING_PROCESS_ID } from '../../core/processes/definitions/index.js';

export const DEFAULT_ROASTING_FURNACE_ZONE_COUNT = 4;

function emptySolidBody() { return createSolidMaterialBody(); }
function createZoneBodies(count) { return Array.from({ length: count }, () => emptySolidBody()); }
function solidBodyMassKg(body) { return body?.solidState ? totalSolidQuantity(body.solidState) : 0; }

function ensureFurnaceState(node) {
  node.zones ??= createZoneBodies(node.internalZoneCount);
  node.pendingFeed ??= emptySolidBody();
  node.gasInventory ??= createGasMaterialBody(createGasMaterialState());
  return node;
}

export function roastingFurnaceZoneCapacityKg(node) {
  return node.effectiveChamberHoldUpKg / node.internalZoneCount;
}

export function roastingFurnaceChargeMassKg(node) {
  ensureFurnaceState(node);
  return node.zones.reduce((sum, zone) => sum + solidBodyMassKg(zone), 0);
}

export function roastingFurnacePendingFeedMassKg(node) {
  ensureFurnaceState(node);
  return solidBodyMassKg(node.pendingFeed);
}

export function createRoastingFurnace({
  id,
  temperatureSetpointK = 900,
  ratedHeaterPowerKw = 60,
  maximumOperatingTemperatureK = 1200,
  maximumSolidThroughputKgPerSecond = 4,
  effectiveChamberHoldUpKg = 20,
  heatLossCoefficientWPerK = 25,
  internalZoneCount = DEFAULT_ROASTING_FURNACE_ZONE_COUNT,
  enabled = false,
} = {}) {
  if (!id || typeof id !== 'string') throw new Error('Roasting Furnace id must be a non-empty string');
  for (const [label, value] of Object.entries({ temperatureSetpointK, ratedHeaterPowerKw, maximumOperatingTemperatureK, maximumSolidThroughputKgPerSecond, effectiveChamberHoldUpKg, heatLossCoefficientWPerK })) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Roasting Furnace ${label} must be finite and positive`);
  }
  if (!Number.isInteger(internalZoneCount) || internalZoneCount < 1) throw new Error('Roasting Furnace internalZoneCount must be a positive integer');
  if (typeof enabled !== 'boolean') throw new Error('Roasting Furnace enabled must be boolean');
  const node = {
    id, nodeType: 'roastingFurnace', systemType: 'roasting-furnace', kind: 'primitive', processId: ROASTING_PROCESS_ID,
    temperatureSetpointK, ratedHeaterPowerKw, maximumOperatingTemperatureK,
    maximumSolidThroughputKgPerSecond, effectiveChamberHoldUpKg, heatLossCoefficientWPerK, internalZoneCount,
    enabled, operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputPortId: 'feed', solidProductPortId: 'solid-product', gasExhaustPortId: 'gas-exhaust',
    zones: createZoneBodies(internalZoneCount), pendingFeed: emptySolidBody(), gasInventory: createGasMaterialBody(createGasMaterialState()),
    lastHeaterPowerKw: 0, lastHeatLossPowerKw: 0, lastReactionPowerKw: 0,
    lastGoethiteConversionFraction: 0, lastFeedRateKgPerSecond: 0, lastProductRateKgPerSecond: 0,
    lastSolverEvaluationCount: 0, actualChargeTemperatureK: 298.15,
  };
  return node;
}
