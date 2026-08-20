export function regionById(world, regionId) {
  return world?.regions?.[regionId] ?? null;
}
