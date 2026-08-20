/**
 * DOM-independent catalog of player-placeable engineering node definitions.
 *
 * Definitions are intentionally separate from graph instances. A definition
 * describes what may be placed; its create callback adds the authoritative
 * simulation node to a blueprint.
 */

import {
  blueprintAddExtractor,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintAddMagSep,
  DEFAULT_HOPPER_CAPACITY_KG,
  DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
  DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
  DEFAULT_MAG_SEP_FIELD_STRENGTH,
} from '../simulation/simulationEngine.js';
import { APPARATUS_DEFINITIONS } from '../content/apparatus/definitions.js';
import { NODE_CATEGORIES } from './nodePresentation.js';

function definition({
  id,
  label,
  nodeType,
  category,
  description,
  searchTerms,
  create,
}) {
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

export const NODE_DEFINITIONS = Object.freeze([
  placeableApparatus('extractor', (blueprint, context = {}) => blueprintAddExtractor(
    blueprint,
    null,
    context.rateKgPerSecond,
  )),
  placeableApparatus('crusher', blueprint => blueprintAddCrusher(blueprint, {
    throughputKgPerSecond: DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
    targetParticleSizeMm: DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
  })),
  placeableApparatus('magSep', blueprint => blueprintAddMagSep(blueprint, {
    fieldStrength: DEFAULT_MAG_SEP_FIELD_STRENGTH,
  }), 'magnetic-separator'),
  placeableApparatus('hopper', blueprint => blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG)),
]);

function placeableApparatus(nodeType, create, id = nodeType) {
  const apparatus = APPARATUS_DEFINITIONS[nodeType];
  if (!apparatus?.catalog) throw new Error(`Apparatus '${nodeType}' is missing catalog metadata`);
  return definition({
    id,
    nodeType: apparatus.nodeType,
    category: apparatus.catalog.category,
    label: apparatus.catalog.label,
    description: apparatus.catalog.description,
    searchTerms: apparatus.catalog.searchTerms,
    create,
  });
}

const CATEGORY_ORDER = Object.values(NODE_CATEGORIES)
  .map(category => category.key)
  .filter(category => NODE_DEFINITIONS.some(definitionItem => definitionItem.category === category));

function normalized(value) {
  return String(value ?? '').trim().toLowerCase();
}

function searchableText(definitionItem) {
  return normalized([
    definitionItem.label,
    definitionItem.category,
    definitionItem.description,
    ...(definitionItem.searchTerms ?? []),
  ].join(' '));
}

function matchesQuery(definitionItem, query) {
  const tokens = normalized(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = searchableText(definitionItem);
  return tokens.every(token => text.includes(token));
}

export function nodeCatalogCategoryVocabulary(definitions = NODE_DEFINITIONS) {
  const categories = new Set(definitions.map(definitionItem => definitionItem.category));
  return CATEGORY_ORDER.filter(category => categories.has(category));
}

export function nodeCatalogVisibleCategories(
  categories = nodeCatalogCategoryVocabulary(),
  hiddenCategories = new Set(),
) {
  return new Set(categories.filter(category => !hiddenCategories.has(category)));
}

/**
 * Project definitions into deterministic grouped rows for the NODE panel.
 */
export function projectNodeCatalog({
  definitions = NODE_DEFINITIONS,
  query = '',
  visibleCategories = new Set(nodeCatalogCategoryVocabulary(definitions)),
} = {}) {
  const rows = [];
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

export function nodeDefinitionById(id, definitions = NODE_DEFINITIONS) {
  return definitions.find(definitionItem => definitionItem.id === id) ?? null;
}
