/**
 * Derived hierarchy index for the shared workspace navigator.
 *
 * This module only reads authoritative world/simulation/graph objects. It
 * deliberately does not create sessions, nodes, or any other simulation state.
 */

import type { SystemNode } from '../../core/systems/types.js';
import type { Feature, World } from '../../core/world/types.js';
import type { BlueprintNode } from '../../simulation/types.js';
import type {
  NavigationEntry,
  NavigationIndex,
  NavigationProjection,
  NavigationRow,
  SiteSessionLike,
  WorkspaceLevel,
} from '../types.js';
import { NODE_CATEGORIES, nodeCategory } from '../graph/nodePresentation.js';

const COMPOSITE_TYPES = new Set<WorkspaceLevel>(['planet', 'region', 'site']);
const CATEGORY_DEFINITIONS = Object.values(NODE_CATEGORIES);
const CATEGORY_ORDER = CATEGORY_DEFINITIONS.map(category => category.key);

interface NavigationGraphNode {
  id: string;
  nodeType: string;
  systemType?: string;
  kind?: string;
  displayName?: string;
  name?: string;
  processId?: string;
  boundaryRole?: string;
  resourceId?: string;
  occurrenceId?: string | null;
  resourceOccurrenceIds?: string[];
  featureId?: string;
  siteId?: string;
  regionId?: string;
  planetId?: string;
  parentId?: string;
  ownerId?: string;
  compositeId?: string;
  workspaceId?: string;
  childWorkspaceId?: string | null;
  inspectableState?: Record<string, unknown>;
  materialBody?: {
    solidState?: {
      fractions?: Record<string, number>;
    };
  };
  solidState?: {
    fractions?: Record<string, number>;
  };
}

interface WorkspaceOwner {
  level: WorkspaceLevel;
  id: string;
  key: string;
}

interface GraphNodeSource {
  node: NavigationGraphNode;
  workspaceId: string | null;
}

interface HierarchyEntryInput {
  key: string;
  targetId: string;
  nodeId?: string | null;
  parentKey?: string | null;
  category: string;
  label: string;
  workspaceLevel: WorkspaceLevel | null;
  workspaceId: string | null;
  isComposite?: boolean;
  searchTerms?: readonly unknown[];
  source?: unknown;
}

interface NavigationSearchResult {
  query: string;
  matchKeys: Set<string>;
  includedKeys: Set<string>;
  contextKeys: Set<string>;
}

interface NavigationRowsOptions {
  query?: string;
  visibleCategories?: ReadonlySet<string> | readonly string[] | null;
  manualExpandedKeys?: Iterable<string>;
  activeKey?: string | null;
  selectedKey?: string | null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nonEmptyStrings(values: readonly unknown[]): string[] {
  return [...new Set(asArray(values).flatMap(value => {
    if (typeof value === 'string') return [value];
    return value == null ? [] : [String(value)];
  }).map(value => value.trim()).filter(Boolean))];
}

function workspaceLevel(value: unknown): WorkspaceLevel | null {
  return value === 'planet' || value === 'region' || value === 'site' ? value : null;
}

function categoryForNode(node: NavigationGraphNode): string {
  return nodeCategory(node).key;
}

function nodeLabel(node: NavigationGraphNode): string {
  return node.displayName
    ?? node.name
    ?? node.systemType
    ?? node.nodeType
    ?? node.id
    ?? 'Unnamed node';
}

function featureSearchTerms(world: World | null | undefined, feature: Feature | null | undefined): string[] {
  const terms: unknown[] = [
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

function graphNodeSearchTerms(world: World | null | undefined, node: NavigationGraphNode): string[] {
  const terms: unknown[] = [
    nodeLabel(node),
    node.id,
    node.nodeType,
    node.systemType,
    node.processId,
    node.kind,
    node.boundaryRole,
    node.resourceId,
    node.occurrenceId,
    ...(node.resourceOccurrenceIds ?? []),
    ...Object.keys(node.materialBody?.solidState?.fractions ?? {}).map(key => key.split('|')[0]),
    ...Object.keys(node.solidState?.fractions ?? {}).map(key => key.split('|')[0]),
  ];

  if (node.featureId) {
    terms.push(...featureSearchTerms(world, world?.features?.[node.featureId]));
  }
  for (const occurrenceId of node.resourceOccurrenceIds ?? []) {
    const occurrence = world?.resourceOccurrences?.[occurrenceId];
    terms.push(
      occurrence?.name,
      occurrence?.resourceId,
      occurrence?.descriptor,
      ...Object.keys(occurrence?.composition ?? {}),
    );
  }
  if (node.occurrenceId) {
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
  workspaceLevel: entryWorkspaceLevel,
  workspaceId,
  isComposite = false,
  searchTerms = [],
  source = null,
}: HierarchyEntryInput): NavigationEntry {
  return {
    key,
    targetId,
    nodeId,
    parentKey,
    category,
    label,
    workspaceLevel: entryWorkspaceLevel,
    workspaceId,
    isComposite,
    searchTerms: nonEmptyStrings([label, ...searchTerms]),
    source,
  };
}

function workspaceOwner(world: World | null | undefined, workspaceId: string | null | undefined): WorkspaceOwner | null {
  if (!workspaceId) return null;
  for (const node of Object.values(world?.systemNodes ?? {})) {
    const level = workspaceLevel(node.nodeType);
    if (!level) continue;
    if (node.id === workspaceId || node.childWorkspaceId === workspaceId) {
      return { level, id: node.id, key: `${level}:${node.id}` };
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

function stateString(state: Record<string, unknown>, key: string): string | null {
  const value = state[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function worldContains(world: World | null | undefined, level: WorkspaceLevel, id: string): boolean {
  if (level === 'planet') return Boolean(world?.planets?.[id]);
  if (level === 'region') return Boolean(world?.regions?.[id]);
  return Boolean(world?.sites?.[id]);
}

function nodeOwner(
  world: World | null | undefined,
  node: NavigationGraphNode | null | undefined,
  workspaceId: string | null = null,
): WorkspaceOwner | null {
  if (!node) return null;
  if (node.nodeType === 'feature' && node.featureId) {
    const feature = world?.features?.[node.featureId];
    return feature ? { level: 'site', id: feature.siteId, key: `site:${feature.siteId}` } : null;
  }
  const compositeLevel = workspaceLevel(node.nodeType);
  if (compositeLevel && world?.systemNodes?.[node.id]) {
    return { level: compositeLevel, id: node.id, key: `${compositeLevel}:${node.id}` };
  }

  const state = node.inspectableState ?? {};
  const candidates: Array<[WorkspaceLevel, string | null | undefined]> = [
    ['site', node.siteId],
    ['site', stateString(state, 'siteId')],
    ['site', node.parentId],
    ['site', node.ownerId],
    ['site', node.compositeId],
    ['site', stateString(state, 'parentId')],
    ['site', stateString(state, 'ownerId')],
    ['region', node.regionId],
    ['region', stateString(state, 'regionId')],
    ['region', node.parentId],
    ['region', node.ownerId],
    ['region', node.compositeId],
    ['region', stateString(state, 'parentId')],
    ['region', stateString(state, 'ownerId')],
    ['planet', node.planetId],
    ['planet', stateString(state, 'planetId')],
    ['planet', node.parentId],
    ['planet', node.ownerId],
    ['planet', node.compositeId],
    ['planet', stateString(state, 'parentId')],
    ['planet', stateString(state, 'ownerId')],
  ];
  for (const [level, id] of candidates) {
    if (id && worldContains(world, level, id)) return { level, id, key: `${level}:${id}` };
  }

  return workspaceOwner(world, node.workspaceId ?? workspaceId);
}

function addEntry(entries: Map<string, NavigationEntry>, entry: NavigationEntry): NavigationEntry | null {
  if (!entry.key || entries.has(entry.key)) return entries.get(entry.key) ?? null;
  entries.set(entry.key, entry);
  return entry;
}

function addOrEnrichEntry(
  entries: Map<string, NavigationEntry>,
  entry: NavigationEntry,
  enrich: Partial<NavigationEntry> = {},
): NavigationEntry {
  const existing = entries.get(entry.key);
  if (!existing) {
    entries.set(entry.key, entry);
    return entry;
  }
  Object.assign(existing, enrich);
  existing.searchTerms = nonEmptyStrings([
    existing.label,
    ...existing.searchTerms,
    ...(enrich.searchTerms ?? []),
  ]);
  if (!existing.nodeId && enrich.nodeId) existing.nodeId = enrich.nodeId;
  return existing;
}

function addCanonicalHierarchy(entries: Map<string, NavigationEntry>, world: World | null | undefined): void {
  const planet = world?.planets?.[world?.planetId];
  if (!planet || !world) return;

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

function addGraphNode(
  entries: Map<string, NavigationEntry>,
  world: World | null | undefined,
  node: NavigationGraphNode,
  workspaceId: string | null,
): void {
  if (!node.id) return;
  const category = categoryForNode(node);
  const owner = nodeOwner(world, node, workspaceId);
  const compositeLevel = workspaceLevel(node.nodeType);
  const canonicalComposite = compositeLevel
    ? entries.get(`${compositeLevel}:${node.id}`)
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

  const fallbackOwner = workspaceOwner(world, workspaceId);
  const parentKey = owner?.key ?? null;
  const entryWorkspaceLevel = owner?.level
    ?? fallbackOwner?.level
    ?? compositeLevel;
  const workspaceOwnerId = owner?.id
    ?? fallbackOwner?.id
    ?? null;
  const key = `node:${node.id}`;

  addEntry(entries, hierarchyEntry({
    key,
    targetId: node.id,
    parentKey: parentKey === key ? null : parentKey,
    category,
    label: nodeLabel(node),
    workspaceLevel: entryWorkspaceLevel,
    workspaceId: workspaceOwnerId,
    isComposite: node.kind === 'composite' || Boolean(compositeLevel) || Boolean(node.childWorkspaceId),
    searchTerms: graphNodeSearchTerms(world, node),
    source: node,
  }));
}

function collectGraphNodes(
  world: World | null | undefined,
  siteSessions: Record<string, SiteSessionLike> = {},
): GraphNodeSource[] {
  const sources: GraphNodeSource[] = [];
  for (const node of Object.values(world?.systemNodes ?? {})) {
    sources.push({ node: node as SystemNode, workspaceId: null });
  }

  for (const [workspaceId, workspace] of Object.entries(world?.simulation?.workspaces ?? {})) {
    for (const node of Object.values(workspace?.nodes ?? {})) {
      sources.push({ node: node as BlueprintNode, workspaceId });
    }
  }

  for (const [sessionId, blueprint] of Object.entries(world?.simulation?.sessions ?? {})) {
    for (const node of Object.values(blueprint?.nodes ?? {})) {
      sources.push({ node: node as BlueprintNode, workspaceId: `${sessionId}-workspace` });
    }
  }

  for (const [siteId, session] of Object.entries(siteSessions)) {
    for (const node of Object.values(session.blueprint?.nodes ?? {})) {
      sources.push({ node: node as BlueprintNode, workspaceId: `${siteId}-workspace` });
    }
  }
  return sources;
}

function normalizedCategorySet(
  categories: ReadonlySet<string> | readonly string[] | null | undefined,
  fallback: readonly string[],
): Set<string> {
  if (categories == null) return new Set(fallback);
  return new Set(categories instanceof Set ? categories : categories);
}

export function navigationCategoryVocabulary(): string[] {
  return [...CATEGORY_ORDER];
}

export function navigationAncestorKeys(index: NavigationIndex, key: string | null | undefined): string[] {
  if (!key) return [];
  const ancestors: string[] = [];
  let entry = index.byKey.get(key);
  const seen = new Set<string>();
  while (entry?.parentKey && !seen.has(entry.key)) {
    seen.add(entry.key);
    ancestors.unshift(entry.parentKey);
    entry = index.byKey.get(entry.parentKey);
  }
  return ancestors;
}

export function navigationExpandableKeys(index: NavigationIndex): Set<string> {
  return new Set([...index.childrenByKey.entries()]
    .filter(([, children]) => children.length > 0)
    .map(([key]) => key));
}

export function expandNavigationPath(
  index: NavigationIndex,
  key: string | null | undefined,
  expandedKeys: Iterable<string> = [],
): Set<string> {
  const expanded = new Set(expandedKeys);
  for (const ancestorKey of navigationAncestorKeys(index, key)) expanded.add(ancestorKey);
  return expanded;
}

export function navigationVisibleCategories(
  categories: readonly string[],
  hiddenCategories: Iterable<string> = [],
): Set<string> {
  const hidden = new Set(hiddenCategories);
  return new Set(categories.filter(category => !hidden.has(category)));
}

function pathKeys(index: NavigationIndex, key: string): string[] {
  return [...navigationAncestorKeys(index, key), key];
}

export function searchNavigationIndex(index: NavigationIndex, query: string | null | undefined): NavigationSearchResult {
  const normalizedQuery = String(query ?? '').trim().toLowerCase();
  if (!normalizedQuery) {
    return {
      query: '',
      matchKeys: new Set(),
      includedKeys: new Set(index.entries.map(entry => entry.key)),
      contextKeys: new Set(),
    };
  }

  const matchKeys = new Set(index.entries
    .filter(entry => entry.searchTerms.some(term => term.toLowerCase().includes(normalizedQuery)))
    .map(entry => entry.key));
  const includedKeys = new Set<string>();
  const contextKeys = new Set<string>();
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
export function getNavigationRows(
  index: NavigationIndex,
  {
    query = '',
    visibleCategories = null,
    manualExpandedKeys = [],
    activeKey = null,
    selectedKey = null,
  }: NavigationRowsOptions = {},
): NavigationProjection {
  const categories = normalizedCategorySet(visibleCategories, index.categories);
  const manual = new Set(manualExpandedKeys);
  const search = searchNavigationIndex(index, query);
  const activePath = activeKey ? new Set(pathKeys(index, activeKey)) : new Set<string>();
  const includedKeys = new Set(search.includedKeys);
  const contextKeys = new Set(search.contextKeys);
  if (search.query && activeKey) {
    for (const key of activePath) {
      includedKeys.add(key);
      if (!search.matchKeys.has(key)) contextKeys.add(key);
    }
  }
  const requiredExpandedKeys = new Set(search.contextKeys);
  if (search.query) {
    for (const key of navigationAncestorKeys(index, activeKey)) requiredExpandedKeys.add(key);
  }
  const expandedKeys = new Set([...manual, ...requiredExpandedKeys]);
  const rows: NavigationRow[] = [];

  const visit = (entry: NavigationEntry, depth: number): void => {
    const included = search.query
      ? includedKeys.has(entry.key)
      : true;
    const visible = categories.has(entry.category);
    const context = contextKeys.has(entry.key);
    if (included && (visible || Boolean(search.query))) {
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

export function navigationEntryForTarget(
  index: NavigationIndex,
  targetId: string | null | undefined,
): NavigationEntry | null {
  if (!targetId) return null;
  return index.entries.find(entry => entry.targetId === targetId || entry.nodeId === targetId) ?? null;
}

/**
 * Build the navigator projection without invoking createWorldSimulation,
 * buildSiteSession, or any other state-creating helper.
 */
export function buildNavigationIndex(
  world: World | null | undefined,
  { siteSessions = {} }: { siteSessions?: Record<string, SiteSessionLike> } = {},
): NavigationIndex {
  const entries = new Map<string, NavigationEntry>();
  addCanonicalHierarchy(entries, world);
  for (const { node, workspaceId } of collectGraphNodes(world, siteSessions)) {
    addGraphNode(entries, world, node, workspaceId);
  }

  const allEntries = [...entries.values()];
  const byKey = new Map(allEntries.map(entry => [entry.key, entry]));
  const childrenByKey = new Map<string, NavigationEntry[]>(allEntries.map(entry => [entry.key, []]));
  for (const entry of allEntries) {
    if (!entry.parentKey || !childrenByKey.has(entry.parentKey)) continue;
    childrenByKey.get(entry.parentKey)?.push(entry);
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
    categoryLabels: Object.fromEntries(CATEGORY_DEFINITIONS.map(category => [category.key, category.label])),
  };
}

/**
 * Descriptive aliases kept for callers that refer to the derived result as a
 * projection or a created index; both remain pure views over the same source.
 */
export const buildNavigationProjection = buildNavigationIndex;
export const createNavigationIndex = buildNavigationIndex;
