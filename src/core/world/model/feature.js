export function featureById(world, featureId) {
  return world?.features?.[featureId] ?? null;
}
