import resources from './raw-resources.js';

export { resources };

const REGIONAL_DISTRIBUTIONS = new Set(['regional', 'both']);
const LOCALIZED_DISTRIBUTIONS = new Set(['localized', 'both']);

export function getRegionalResources() {
  return resources.filter(resource => REGIONAL_DISTRIBUTIONS.has(resource.distribution));
}

export function getLocalizedResources() {
  return resources.filter(resource => LOCALIZED_DISTRIBUTIONS.has(resource.distribution));
}

export function getResourceDefinition(resourceId) {
  return resources.find(resource => resource.id === resourceId) ?? null;
}
