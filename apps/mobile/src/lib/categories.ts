import type { Category } from './types';

/**
 * Índice de categorías. `roots` y `childrenOf` devuelven solo las activas (para elegir);
 * `byId` y `rootOf` incluyen archivadas (para mostrar gastos viejos).
 * Con `systemOnly`, deja afuera las propias (gastos de grupo: los demás no las verían).
 */
export function categoryIndex(categories: readonly Category[], opts: { systemOnly?: boolean } = {}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const selectable = categories.filter((c) => !c.archived_at && (!opts.systemOnly || c.owner_id === null));
  return {
    byId,
    roots: selectable.filter((c) => c.parent_id === null),
    childrenOf: (id: string) => selectable.filter((c) => c.parent_id === id),
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
  if (c?.owner_id && c.icon) return c.icon;
  const key = c?.system_key?.split('.')[0];
  return (key && ICONS[key]) || '🏷️';
}
