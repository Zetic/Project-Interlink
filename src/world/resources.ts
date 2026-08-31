import type { ResourceDefinition } from './types.js';

export const RESOURCE_DEFINITIONS: readonly ResourceDefinition[] = [
  { id: 'hematite', name: 'Hematite', category: 'metallic' },
  { id: 'magnetite', name: 'Magnetite', category: 'metallic' },
  { id: 'chalcopyrite', name: 'Chalcopyrite', category: 'metallic' },
  { id: 'bauxite', name: 'Bauxite', category: 'metallic' },
  { id: 'limestone', name: 'Limestone', category: 'industrial' },
  { id: 'silica-sand', name: 'Silica Sand', category: 'industrial' },
  { id: 'coal', name: 'Coal', category: 'fuel' },
  { id: 'water-ice', name: 'Water Ice', category: 'volatile' },
];

const RESOURCE_BY_ID = new Map(RESOURCE_DEFINITIONS.map(definition => [definition.id, definition]));

export function resourceDefinitionById(id: string): ResourceDefinition | null {
  return RESOURCE_BY_ID.get(id) ?? null;
}
