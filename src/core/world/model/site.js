export function siteById(world, siteId) {
  return world?.sites?.[siteId] ?? null;
}
