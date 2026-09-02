import { deterministicUnit } from '../random.js';
import { PLANET_MAP_WIDTH } from '../scale.js';
function smooth(value) {
    return value * value * (3 - 2 * value);
}
function wrappedLatticeValue(seed, namespace, x, y, period) {
    const wrappedX = ((x % period) + period) % period;
    return deterministicUnit(seed, `${namespace}:${wrappedX}:${y}`);
}
/** Deterministic bilinear value noise with longitude wrapping. */
export function wrappedValueNoise(seed, namespace, point, scale) {
    const scaledX = point.x / scale;
    const scaledY = point.y / scale;
    const x0 = Math.floor(scaledX);
    const y0 = Math.floor(scaledY);
    const tx = smooth(scaledX - x0);
    const ty = smooth(scaledY - y0);
    const period = Math.max(1, Math.round(PLANET_MAP_WIDTH / scale));
    const north = wrappedLatticeValue(seed, namespace, x0, y0, period) * (1 - tx)
        + wrappedLatticeValue(seed, namespace, x0 + 1, y0, period) * tx;
    const south = wrappedLatticeValue(seed, namespace, x0, y0 + 1, period) * (1 - tx)
        + wrappedLatticeValue(seed, namespace, x0 + 1, y0 + 1, period) * tx;
    return north * (1 - ty) + south * ty;
}
