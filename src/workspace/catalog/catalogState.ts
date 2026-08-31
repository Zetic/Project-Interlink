import {
  nodeCatalogCategoryVocabulary,
  nodeCatalogVisibleCategories,
} from './nodeCatalog.js';

export function nodeCatalogFilterState(hiddenCategories = new Set()) {
  const categories = nodeCatalogCategoryVocabulary();
  return {
    categories,
    visibleCategories: nodeCatalogVisibleCategories(categories, hiddenCategories),
  };
}
