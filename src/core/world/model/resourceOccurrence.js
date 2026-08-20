export function resourceOccurrenceById(world, occurrenceId) {
  return world?.resourceOccurrences?.[occurrenceId] ?? null;
}
