export const LIBERATION_CLASSES = Object.freeze([
  Object.freeze({ id: 'locked', name: 'Locked', recoveryFactor: 0.25 }),
  Object.freeze({ id: 'partial', name: 'Partial', recoveryFactor: 0.55 }),
  Object.freeze({ id: 'mostly-liberated', name: 'Mostly Liberated', recoveryFactor: 0.8 }),
  Object.freeze({ id: 'liberated', name: 'Liberated', recoveryFactor: 1 }),
]);

const LIBERATION_CLASS_BY_ID = Object.freeze(Object.fromEntries(LIBERATION_CLASSES.map((item, index) => [item.id, Object.freeze({ ...item, index })])));

export function listLiberationClasses() {
  return LIBERATION_CLASSES;
}

export function getLiberationClass(id) {
  return LIBERATION_CLASS_BY_ID[id] ?? null;
}

export function requireLiberationClass(id) {
  const liberationClass = getLiberationClass(id);
  if (!liberationClass) throw new Error(`Unknown liberation class '${id}'`);
  return liberationClass;
}

export function liberationClassIndex(id) {
  return requireLiberationClass(id).index;
}
