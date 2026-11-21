import type { Category } from './types';

export function categoryIndex(categories: readonly Category[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return {
    byId,
    roots: categories.filter((c) => c.parent_id === null),
    childrenOf: (id: string) => categories.filter((c) => c.parent_id === id),
    /** Categoría de primer nivel (para agrupar reportes). */
    rootOf: (id: string | null): Category | undefined => {
      let c = id ? byId.get(id) : undefined;
      while (c?.parent_id) c = byId.get(c.parent_id);
      return c;
    },
  };
}

const ICONS: Record<string, string> = {
  food: '🍽️', home: '🏠', transport: '🚗', leisure: '🎉', health: '💊', travel: '✈️',
  shopping: '🛍️', education: '📚', services: '🧾', gifts: '🎁', other: '📦',
};

/** Emoji para la categoría raíz (sin dependencias de íconos en el MVP). */
export function categoryEmoji(c: Category | undefined): string {
  const key = c?.system_key?.split('.')[0];
  return (key && ICONS[key]) || '🏷️';
}
