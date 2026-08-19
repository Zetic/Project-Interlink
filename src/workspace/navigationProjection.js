/**
 * Derived hierarchy index for the shared workspace navigator.
 *
 * This module only reads authoritative world/simulation/graph objects. It
 * deliberately does not create sessions, nodes, or any other simulation state.
 */

import { NODE_CATEGORIES, nodeCategory } from './nodePresentation.js';

const COMPOSITE_TYPES = new Set(['planet', 'region', 'site']);
const CATEGORY_ORDER = [
  'planet',
  'region',
  'site',
  'facility',
  'feature',
  'apparatus',
  'container',
  'boundary',
  'process',
  'sensor',
  'controller',
  'logistics',
  'system',
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmptyStrings(values) {
  return [...new Set(asArray(values).flatMap(value => {
    if (typeof value === 'string') return [value];
    return value == null ? [] : [String(value)];
  }).map(value => value.trim()).filter(Boolean))];
}

function categoryForNode(node) {
  return nodeCategory(node).key;
}

function nodeLabel(node) {
  return node?.displayName
    ?? node?.name
    ?? node?.systemType
    ?? node?.nodeType
    ?? node?.id
    ?? 'Unnamed node';
}

function featureSearchTerms(world, feature) {
  const terms = [
    feature?.name,
    feature?.type,
    feature?.id,
    feature?.regionalAccess ? 'regional access' : null,
  ];

  for (const occurrenceId of feature?.resourceOccurrences ?? []) {
    const occurrence = world?.resourceOccurrences?.[occurrenceId];
    if (!occurrence) continue;
    terms.push(
      occurrence.name,
      occurrence.id,
      occurrence.resourceId,
      occurrence.descriptor,
      occurrence.accessScope,
      ...Object.keys(occurrence.composition ?? {}),
    );
  }

  return nonEmptyStrings(terms);
}

function graphNodeSearchTerms(world, node) {
  const terms = [
    nodeLabel(node),
    node?.id,
    node?.nodeType,
    node?.systemType,
    node?.processId,
    node?.kind,
    node?.boundaryRole,
    node?.resourceId,
    node?.occurrenceId,
    ...asArray(node?.resourceOccurrenceIds),
    ...Object.keys(node?.storedComponentsKg ?? {}),
    ...Object.keys(node?.componentMassFlowKgPerSecond ?? {}),
  ];

  if (node?.featureId) {
    terms.push(...featureSearchTerms(world, world?.features?.[node.featureId]));
  }
  for (const occurrenceId of node?.resourceOccurrenceIds ?? []) {
    const occurrence = world?.resourceOccurrences?.[occurrenceId];
    terms.push(
      occurrence?.name,
      occurrence?.resourceId,
      occurrence?.descriptor,
      ...Object.keys(occurrence?.composition ?? {}),
    );
  }
  if (node?.occurrenceId) {
    const occurrence = world?.resourceOccurrences?.[node.occurrenceId];
    terms.push(
      occurrence?.name,
      occurrence?.resourceId,
      occurrence?.descriptor,
      ...Object.keys(occurrence?.composition ?? {}),
    );
  }

  return nonEmptyStrings(terms);
}

function hierarchyEntry({
  key,
  targetId,
  nodeId = null,
  parentKey = null,
  category,
  label,
  workspaceLevel,
  workspaceId,
  isComposite = false,
  searchTerms = [],
  source = null,
}) {
  return {
    key,
    targetId,
    nodeId,
    parentKey,
    category,
    label,
    workspaceLevel,
    workspaceId,
    isComposite,
    searchTerms: nonEmptyStrings([label, ...searchTerms]),
    source,
  };
}

function workspaceOwner(world, workspaceId) {
  if (!workspaceId) return null;
  for (const node of Object.values(world?.systemNodes ?? {})) {
    if (!COMPOSITE_TYPES.has(node.nodeType)) continue;
    if (node.id === workspaceId || node.childWorkspaceId === workspaceId) {
      return { level: node.nodeType, id: node.id, key: `${node.nodeType}:${node.id}` };
    }
  }
  for (const planet of Object.values(world?.planets ?? {})) {
    if (planet.id === workspaceId || planet.childWorkspaceId === workspaceId) {
      return { level: 'planet', id: planet.id, key: `planet:${planet.id}` };
    }
  }
  for (const region of Object.values(world?.regions ?? {})) {
    if (region.id === workspaceId || region.childWorkspaceId === workspaceId) {
      return { level: 'region', id: region.id, key: `region:${region.id}` };
    }
  }
  for (const site of Object.values(world?.sites ?? {})) {
    if (site.id === workspaceId || site.childWorkspaceId === workspaceId) {
      return { level: 'site', id: site.id, key: `site:${site.id}` };
    }
  }
  return null;
}

function nodeOwner(world, node, workspaceId = null) {
  if (!node) return null;
  if (node.nodeType === 'feature' && node.featureId) {
    const feature = world?.features?.[node.featureId];
    return feature ? { level: 'site', id: feature.siteId, key: `site:${feature.siteId}` } : null;
  }
  if (COMPOSITE_TYPES.has(node.nodeType) && world?.systemNodes?.[node.id]) {
    const level = node.nodeType;
    return { level, id: node.id, key: `${level}:${node.id}` };
  }
  const state = node.inspectableState ?? {};
  for (const [level, id] of [
    ['site', node.siteId],
    ['site', state.siteId],
    ['site', node.parentId],
    ['site', node.ownerId],
    ['site', node.compositeId],
    ['site', state.parentId],
    ['site', state.ownerId],
    ['region', node.regionId],
    ['region', state.regionId],
    ['region', node.parentId],
    ['region', node.ownerId],
    ['region', node.compositeId],
    ['region', state.parentId],
    ['region', state.ownerId],
    ['planet', node.planetId],
    ['planet', state.planetId],
    ['planet', node.parentId],
    ['planet', node.ownerId],
    ['planet', node.compositeId],
    ['planet', state.parentId],
    ['planet', state.ownerId],
  ]) {
    if (id && world?.[`${level}s`]?.[id]) return { level, id, key: `${level}:${id}` };
  }

  return workspaceOwner(world, node.workspaceId ?? workspaceId);
}

function addEntry(entries, entry) {
  if (!entry?.key || entries.has(entry.key)) return entries.get(entry.key) ?? null;
  entries.set(entry.key, entry);
  return entry;
}

function addOrEnrichEntry(entries, entry, enrich = {}) {
  const existing = entries.get(entry.key);
  if (!existing) {
    entries.set(entry.key, entry);
    return entry;
  }
  Object.assign(existing, enrich);
  existing.searchTerms = nonEmptyStrings([existing.label, ...existing.searchTerms, ...(enrich.searchTerms ?? [])]);
  if (!existing.nodeId && enrich.nodeId) existing.nodeId = enrich.nodeId;
  return existing;
}

function addCanonicalHierarchy(entries, world) {
  const planet = world?.planets?.[world?.planetId];
  if (!planet) return;

  addEntry(entries, hierarchyEntry({
    key: `planet:${planet.id}`,
    targetId: planet.id,
    category: 'planet',
    label: planet.name ?? planet.id,
    workspaceLevel: 'planet',
    workspaceId: planet.id,
    isComposite: true,
    searchTerms: [planet.id],
    source: planet,
  }));

  for (const regionId of planet.regions ?? []) {
    const region = world.regions?.[regionId];
    if (!region) continue;
    addEntry(entries, hierarchyEntry({
      key: `region:${region.id}`,
      targetId: region.id,
      parentKey: `planet:${planet.id}`,
      category: 'region',
      label: region.name ?? region.id,
      workspaceLevel: 'region',
      workspaceId: region.id,
      isComposite: true,
      searchTerms: [region.id, region.surfaceCover],
      source: region,
    }));

    for (const siteId of region.siteIds ?? []) {
      const site = world.sites?.[siteId];
      if (!site) continue;
      addEntry(entries, hierarchyEntry({
        key: `site:${site.id}`,
        targetId: site.id,
        parentKey: `region:${region.id}`,
        category: 'site',
        label: site.name ?? site.id,
        workspaceLevel: 'site',
        workspaceId: site.id,
        isComposite: true,
        searchTerms: [site.id, site.siteKind],
        source: site,
      }));

      for (const featureId of site.featureIds ?? []) {
        const feature = world.features?.[featureId];
        if (!feature) continue;
        addEntry(entries, hierarchyEntry({
          key: `feature:${feature.id}`,
          targetId: feature.id,
          nodeId: `feature-node-${feature.id}`,
          parentKey: `site:${site.id}`,
          category: 'feature',
          label: feature.name ?? feature.id,
          workspaceLevel: 'site',
          workspaceId: site.id,
          searchTerms: featureSearchTerms(world, feature),
          source: feature,
        }));
      }
    }
  }
}

function addGraphNode(entries, world, node, workspaceId, sessionId = null) {
  if (!node?.id) return;
  const category = categoryForNode(node);
  const owner = nodeOwner(world, node, workspaceId);
  const canonicalComposite = COMPOSITE_TYPES.has(node.nodeType)
    ? entries.get(`${node.nodeType}:${node.id}`)
    : null;
  if (canonicalComposite) {
    addOrEnrichEntry(entries, canonicalComposite, {
      nodeId: node.id,
      source: node,
      searchTerms: graphNodeSearchTerms(world, node),
    });
    return;
  }
  const canonicalFeature = category === 'feature' && node.featureId
    ? entries.get(`feature:${node.featureId}`)
    : null;

  if (canonicalFeature) {
    addOrEnrichEntry(entries, canonicalFeature, {
      nodeId: node.id,
      source: node,
      searchTerms: graphNodeSearchTerms(world, node),
    });
    return;
  }

  const parentKey = owner?.key ?? null;
  const ownerEntry = parentKey ? entries.get(parentKey) : null;
  const workspaceLevel = owner?.level
    ?? workspaceOwner(world, workspaceId)?.level
    ?? (COMPOSITE_TYPES.has(node.nodeType) ? node.nodeType : null);
  const workspaceOwnerId = owner?.id
    ?? workspaceOwner(world, workspaceId)?.id
    ?? null;
  const key = `node:${node.id}`;

  addEntry(entries, hierarchyEntry({
    key,
    targetId: node.id,
    parentKey: parentKey === key ? null : parentKey,
    category,
    label: nodeLabel(node),
    workspaceLevel,
    workspaceId: workspaceOwnerId,
    isComposite: node.kind === 'composite' || COMPOSITE_TYPES.has(node.nodeType) || Boolean(node.childWorkspaceId),
    searchTerms: graphNodeSearchTerms(world, node),
    source: node,
  }));

  // A future graph node may be discovered before its owner is materialized in
  // the canonical maps. Keep it indexable without inventing a second hierarchy.
  if (!ownerEntry && parentKey && !entries.has(parentKey)) {
    return;
  }
  void sessionId;
}

function collectGraphNodes(world, siteSessions = {}) {
  const sources = [];
  for (const node of Object.values(world?.systemNodes ?? {})) {
    sources.push({ node, workspaceId: null, sessionId: null });
  }

  for (const [workspaceId, workspace] of Object.entries(world?.simulation?.workspaces ?? {})) {
    for (const node of Object.values(workspace?.nodes ?? {})) {
      sources.push({ node, workspaceId, sessionId: workspaceId });
    }
  }

  for (const [sessionId, blueprint] of Object.entries(world?.simulation?.sessions ?? {})) {
    for (const node of Object.values(blueprint?.nodes ?? {})) {
      sources.push({ node, workspaceId: `${sessionId}-workspace`, sessionId });
    }
  }

  for (const [siteId, session] of Object.entries(siteSessions ?? {})) {
    for (const node of Object.values(session?.blueprint?.nodes ?? {})) {
      sources.push({ node, workspaceId: `${siteId}-workspace`, sessionId: siteId });
    }
  }
  return sources;
}

function normalizedCategorySet(categories, fallback) {
  if (categories == null) return new Set(fallback);
  const values = categories instanceof Set ? [...categories] : asArray(categories);
  return new Set(values.map(category => typeof category === 'string' ? category : category?.key).filter(Boolean));
}

export function navigationAncestorKeys(index, key) {
  const ancestors = [];
  let entry = index?.byKey?.get(key);
  const seen = new Set();
  while (entry?.parentKey && !seen.has(entry.key)) {
    seen.add(entry.key);
    ancestors.unshift(entry.parentKey);
    entry = index.byKey.get(entry.parentKey);
  }
  return ancestors;
}

function pathKeys(index, key) {
  return [...navigationAncestorKeys(index, key), key];
}

export function searchNavigationIndex(index, query) {
  const normalizedQuery = String(query ?? '').trim().toLowerCase();
  if (!normalizedQuery) {
    return {
      query: '',
      matchKeys: new Set(),
      includedKeys: new Set(index?.entries?.map(entry => entry.key) ?? []),
      contextKeys: new Set(),
    };
  }

  const matchKeys = new Set(index.entries
    .filter(entry => entry.searchTerms.some(term => term.toLowerCase().includes(normalizedQuery)))
    .map(entry => entry.key));
  const includedKeys = new Set();
  const contextKeys = new Set();
  for (const matchKey of matchKeys) {
    for (const key of pathKeys(index, matchKey)) {
      includedKeys.add(key);
      if (key !== matchKey) contextKeys.add(key);
    }
  }
  for (const matchKey of matchKeys) contextKeys.delete(matchKey);
  return { query: normalizedQuery, matchKeys, includedKeys, contextKeys };
}

/**
 * Return a deterministic, hierarchy-preserving row projection for the drawer.
 * Search-derived expansion is returned separately from manual expansion so
 * clearing a query never destroys the player's expansion choices.
 */
export function getNavigationRows(index, {
  query = '',
  visibleCategories = null,
  manualExpandedKeys = [],
  activeKey = null,
  selectedKey = null,
} = {}) {
  const categories = normalizedCategorySet(visibleCategories, index?.categories ?? []);
  const manual = new Set(manualExpandedKeys);
  const search = searchNavigationIndex(index, query);
  const activePath = activeKey ? new Set(pathKeys(index, activeKey)) : new Set();
  const includedKeys = new Set(search.includedKeys);
  const contextKeys = new Set(search.contextKeys);
  if (search.query && activeKey) {
    for (const key of activePath) {
      includedKeys.add(key);
      if (!search.matchKeys.has(key)) contextKeys.add(key);
    }
  }
  const requiredExpandedKeys = new Set([
    ...navigationAncestorKeys(index, activeKey),
    ...search.contextKeys,
  ]);
  const expandedKeys = new Set([...manual, ...requiredExpandedKeys]);
  const rows = [];

  const visit = (entry, depth) => {
    const included = search.query
      ? includedKeys.has(entry.key)
      : true;
    const visible = categories.has(entry.category);
    const context = contextKeys.has(entry.key);
    if (included && (visible || search.query)) {
      rows.push({
        ...entry,
        depth,
        isMatch: search.matchKeys.has(entry.key),
        isContext: context,
        isFiltered: !visible,
        isActive: activePath.has(entry.key) && entry.key === activeKey,
        isSelected: entry.key === selectedKey,
        isExpanded: expandedKeys.has(entry.key),
        hasChildren: (index.childrenByKey.get(entry.key) ?? []).length > 0,
      });
    }

    const childEntries = index.childrenByKey.get(entry.key) ?? [];
    const shouldExpand = expandedKeys.has(entry.key) || !visible;
    if (!shouldExpand) return;
    for (const child of childEntries) visit(child, depth + 1);
  };

  for (const root of index.roots) visit(root, 0);
  return {
    rows,
    query: search.query,
    matchCount: search.matchKeys.size,
    searchRevealedKeys: new Set(search.contextKeys),
    requiredExpandedKeys,
    manualExpandedKeys: manual,
    visibleCategories: categories,
  };
}

export function navigationEntryForTarget(index, targetId) {
  if (!targetId) return null;
  return index?.entries?.find(entry => entry.targetId === targetId || entry.nodeId === targetId) ?? null;
}

/**
 * Build the navigator projection without invoking createWorldSimulation,
 * buildSiteSession, or any other state-creating helper.
 */
export function buildNavigationIndex(world, { siteSessions = {} } = {}) {
  const entries = new Map();
  addCanonicalHierarchy(entries, world);
  for (const { node, workspaceId, sessionId } of collectGraphNodes(world, siteSessions)) {
    addGraphNode(entries, world, node, workspaceId, sessionId);
  }

  const allEntries = [...entries.values()];
  const byKey = new Map(allEntries.map(entry => [entry.key, entry]));
  const childrenByKey = new Map(allEntries.map(entry => [entry.key, []]));
  for (const entry of allEntries) {
    if (!entry.parentKey || !childrenByKey.has(entry.parentKey)) continue;
    childrenByKey.get(entry.parentKey).push(entry);
  }
  const roots = allEntries.filter(entry => !entry.parentKey || !byKey.has(entry.parentKey));
  const categories = [...new Set(allEntries.map(entry => entry.category))]
    .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));

  return {
    entries: allEntries,
    byKey,
    roots,
    childrenByKey,
    categories,
    categoryLabels: Object.fromEntries(Object.values(NODE_CATEGORIES).map(category => [category.key, category.label])),
  };
}

export const buildNavigationProjection = buildNavigationIndex;
export const createNavigationIndex = buildNavigationIndex;
