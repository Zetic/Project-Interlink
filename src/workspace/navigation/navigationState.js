import {
  navigationCategoryVocabulary,
  navigationVisibleCategories,
} from '../navigationProjection.js';

export function navigationVisibilityState(open) {
  const visible = Boolean(open);
  return {
    visible,
    hidden: !visible,
    ariaHidden: String(!visible),
    ariaExpanded: String(visible),
  };
}

export function navigationFilterState(hiddenCategories = new Set()) {
  const categories = navigationCategoryVocabulary();
  return {
    categories,
    visibleCategories: navigationVisibleCategories(categories, hiddenCategories),
  };
}
