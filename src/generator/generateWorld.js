import { generatePlanet } from './generatePlanet.js';
import { assembleWorld } from '../core/world/model/worldAssembly.js';

export function generateWorld(seed) {
  const seedStr = String(seed ?? 'default-seed');
  return assembleWorld(generatePlanet(seedStr), seedStr);
}

export { generateWorld as createWorld };
