// ─────────────── Colores de grupo ───────────────
// Se guarda la clave en la base; acá se traduce al tono de cada modo.
// Todos son claros, para que el texto oscuro (onGroup) se lea siempre.

export const GROUP_COLORS = ['coral', 'sky', 'sun', 'lilac', 'pink', 'teal', 'lime', 'sand'] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

const groupLight: Record<GroupColor | 'personal', string> = {
  coral: '#FFB3A3',
  sky: '#B5C3FF',
  sun: '#FFE39A',
  lilac: '#D9C2FF',
  pink: '#FFC2DD',
  teal: '#A6E3E9',
  lime: '#D4F08C',
  sand: '#E9DCC8',
  personal: '#9FE5C8',
};

const groupDark: typeof groupLight = {
  coral: '#E8907F',
  sky: '#8E9FE8',
  sun: '#E3C56F',
  lilac: '#B59BE6',
  pink: '#E39BBE',
  teal: '#7CC5CC',
  lime: '#AFCB62',
  sand: '#C9B99F',
  personal: '#76C9A7',
};

export function isGroupColor(value: unknown): value is GroupColor {
  return typeof value === 'string' && (GROUP_COLORS as readonly string[]).includes(value);
}

/** Color estable para grupos que todavía no eligieron uno (depende solo del id). */
export function fallbackGroupColor(groupId: string): GroupColor {
  let h = 0;
  for (let i = 0; i < groupId.length; i++) h = (h * 31 + groupId.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length]!;
}

/** Clave de color efectiva de un grupo. */
export function groupColorKey(group: { id: string; kind: string; color?: string | null }): GroupColor | 'personal' {
  if (group.kind === 'personal') return 'personal';
  return isGroupColor(group.color) ? group.color : fallbackGroupColor(group.id);
}

/** Tono de fondo de un grupo para el modo actual. */
export function groupColorValue(key: GroupColor | 'personal', theme: { dark: boolean }): string {
  return (theme.dark ? groupDark : groupLight)[key];
}

/** Primer color que el usuario todavía no usa en sus grupos (para proponer al crear uno). */
export function freeGroupColor(used: readonly (string | null | undefined)[]): GroupColor {
  return GROUP_COLORS.find((c) => !used.includes(c)) ?? GROUP_COLORS[used.length % GROUP_COLORS.length]!;
}
