import type { ResourceDefinition } from './types.js';

/**
 * World resources are geological/material source identities, not purified
 * mineral species. Iron Ore, for example, contains hematite, magnetite,
 * goethite, and quartz in its source composition.
 */
export const RESOURCE_DEFINITIONS: readonly ResourceDefinition[] = [
  { id: 'iron-ore', name: 'Iron Ore', category: 'metallic' },
  { id: 'copper-ore', name: 'Copper Ore', category: 'metallic' },
  { id: 'aluminum-ore', name: 'Aluminum Ore', category: 'metallic' },
  { id: 'limestone', name: 'Limestone', category: 'industrial' },
  { id: 'silica-sand', name: 'Silica Sand', category: 'industrial' },
  { id: 'coal', name: 'Coal', category: 'fuel' },
  { id: 'water-ice', name: 'Water Ice', category: 'volatile' },
];

const RESOURCE_BY_ID = new Map(RESOURCE_DEFINITIONS.map(definition => [definition.id, definition]));

export function resourceDefinitionById(id: string): ResourceDefinition | null {
  return RESOURCE_BY_ID.get(id) ?? null;
}
