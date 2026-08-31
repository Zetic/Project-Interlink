import type { World, WorldCollections } from '../types.js';

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function validateReferenceIdArray<T>(
  value: unknown,
  label: string,
  referenceMap: Record<string, T>,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }

  const seen = new Set<string>();
  for (const id of value) {
    if (!isNonEmptyString(id)) {
      errors.push(`${label} contains an invalid id`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${label} contains duplicate id '${id}'`);
      continue;
    }
    seen.add(id);
    if (!referenceMap[id]) errors.push(`${label} references unknown id '${id}'`);
  }
}

export function worldCollections(world: Partial<World> | null | undefined): WorldCollections {
  return {
    planets: world?.planets ?? {},
    regions: world?.regions ?? {},
    sites: world?.sites ?? {},
    features: world?.features ?? {},
    resourceOccurrences: world?.resourceOccurrences ?? {},
    materialBatches: world?.materialBatches ?? {},
    processResults: world?.processResults ?? {},
  };
}
