/**
 * World State — the root serialisable simulation object.
 *
 * Canonical physical hierarchy:
 * Planet → Region → Site → Feature → ResourceOccurrence.
 * Regions group Sites; Sites own Features; Features own all natural-resource
 * occurrences. Player knowledge and UI/layout state are kept separately.
 */

import { generateWorld } from '../../generator/generateWorld.js';
import { validateWorld } from './validation/worldValidation.js';

export function createWorld(seed) {
  // Compatibility factory. New application code should call generator/generateWorld.
  return generateWorld(seed);
}

export { validateWorld };
