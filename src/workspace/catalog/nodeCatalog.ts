/**
 * DOM-independent catalog of player-placeable engineering node definitions.
 * Definitions are projected from the canonical apparatus registry so adding a
 * placeable machine does not require a second registration list here.
 */

import { blueprintAddApparatus } from '../../simulation/simulationEngine.js';
import { APPARATUS_DEFINITIONS } from '../../content/apparatus/definitions.js';
import type { World } from '../../core/world/types.js';
import type { Blueprint, BlueprintNode } from '../../simulation/types.js';
import { NODE_CATEGORIES } from '../graph/nodePresentation.js';

export interface NodePlacementContext {
  world?: World | null;
  siteId?: string | null;
  occurrenceId?: string | null;
  occurrenceIds?: string[];
  [key: string]: unknown;
}

export interface NodeDefinition {
  id: string;
  label: string;
  nodeType: string;
  category: string;
  description: string;
  searchTerms: readonly string[];
  create: (blueprint: Blueprint, context?: NodePlacementContext) => BlueprintNode;
}

export interface NodeCatalogGroup {
  category: string;
  definitions: Array<NodeDefinition & { isMatch: boolean }>;
}

export interface NodeCatalogProjection {
  query: string;
  rows: NodeCatalogGroup[];
  matchCount: number;
  definitions: readonly NodeDefinition[];
}

interface CatalogMetadata {
  id: string;
  label: string;
  category: string;
  description: string;
  searchTerms: readonly string[];
  order?: number;
  placeable?: boolean;
}

interface CatalogApparatusDefinition {
  nodeType: string;
  catalog?: CatalogMetadata;
  defaults?: Record<string, unknown>;
  placementParameterAliases?: Record<string, string>;
}

function definition({ id, label, nodeType, category, description, searchTerms, create }: NodeDefinition): Readonly<NodeDefinition> {
  return Object.freeze({
    id,
    label,
    nodeType,
    category,
    description,
    searchTerms: Object.freeze([...searchTerms]),
    create,
  });
}

function placeableApparatus([nodeType, apparatus]: [string, CatalogApparatusDefinition]): Readonly<NodeDefinition> {
  if (!apparatus.catalog) throw new Error(`Apparatus '${nodeType}' is missing catalog metadata`);
  const placementParameterIds = new Set([
    ...Object.keys(apparatus.defaults ?? {}),
    ...Object.values(apparatus.placementParameterAliases ?? {}),
  ]);
  return definition({
    id: apparatus.catalog.id,
    nodeType: apparatus.nodeType,
    category: apparatus.catalog.category,
    label: apparatus.catalog.label,
    description: apparatus.catalog.description,
    searchTerms: apparatus.catalog.searchTerms,
    create: (blueprint, context = {}) => blueprintAddApparatus(
      blueprint,
      nodeType,
      Object.fromEntries(
        Object.entries(context).filter(([parameterId]) => placementParameterIds.has(parameterId))
      ),
    ),
  });
}

const APPARATUS_CATALOG_ENTRIES = Object.entries(APPARATUS_DEFINITIONS) as Array<[string, CatalogApparatusDefinition]>;

export const NODE_DEFINITIONS: readonly Readonly<NodeDefinition>[] = Object.freeze(
  APPARATUS_CATALOG_ENTRIES
    .filter(([, apparatus]) => apparatus.catalog?.placeable !== false)
    .sort(([, a], [, b]) => (a.catalog?.order ?? 0) - (b.catalog?.order ?? 0))
    .map(placeableApparatus)
);

const CATEGORY_ORDER = Object.values(NODE_CATEGORIES)
  .map(category => category.key)
  .filter(category => NODE_DEFINITIONS.some(definitionItem => definitionItem.category === category));

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function searchableText(definitionItem: NodeDefinition): string {
  return normalized([
    definitionItem.label,
    definitionItem.category,
    definitionItem.description,
    ...(definitionItem.searchTerms ?? []),
  ].join(' '));
}

function matchesQuery(definitionItem: NodeDefinition, query: string): boolean {
  const tokens = normalized(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = searchableText(definitionItem);
  return tokens.every(token => text.includes(token));
}

export function nodeCatalogCategoryVocabulary(definitions: readonly NodeDefinition[] = NODE_DEFINITIONS): string[] {
  const categories = new Set(definitions.map(definitionItem => definitionItem.category));
  return CATEGORY_ORDER.filter(category => categories.has(category));
}

export function nodeCatalogVisibleCategories(
  categories: readonly string[] = nodeCatalogCategoryVocabulary(),
  hiddenCategories: ReadonlySet<string> = new Set(),
): Set<string> {
  return new Set(categories.filter(category => !hiddenCategories.has(category)));
}

export function projectNodeCatalog({
  definitions = NODE_DEFINITIONS,
  query = '',
  visibleCategories = new Set(nodeCatalogCategoryVocabulary(definitions)),
}: {
  definitions?: readonly NodeDefinition[];
  query?: string;
  visibleCategories?: ReadonlySet<string>;
} = {}): NodeCatalogProjection {
  const rows: NodeCatalogGroup[] = [];
  let matchCount = 0;
  for (const category of nodeCatalogCategoryVocabulary(definitions)) {
    if (!visibleCategories.has(category)) continue;
    const items = definitions
      .filter(definitionItem => definitionItem.category === category && matchesQuery(definitionItem, query))
      .map(definitionItem => ({ ...definitionItem, isMatch: Boolean(normalized(query)) }));
    if (!items.length) continue;
    matchCount += items.length;
    rows.push({ category, definitions: items });
  }
  return {
    query: normalized(query),
    rows,
    matchCount,
    definitions,
  };
}

export function nodeDefinitionById(
  id: string | null | undefined,
  definitions: readonly NodeDefinition[] = NODE_DEFINITIONS,
): NodeDefinition | null {
  if (!id) return null;
  return definitions.find(definitionItem => definitionItem.id === id) ?? null;
}
