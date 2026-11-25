// ─────────────── Colores de grupo ───────────────
// Se guarda la clave en la base; acá se traduce al tono de cada modo.
// Todos son claros, para que el texto oscuro (onGroup) se lea siempre.

export const GROUP_COLORS = ['coral', 'sky', 'sun', 'lilac', 'pink', 'teal', 'lime', 'sand', 'mint'] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

/** Verde menta: el color por defecto de "Personal". Los grupos no lo reciben automáticamente. */
export const PERSONAL_DEFAULT: GroupColor = 'mint';
const AUTO_COLORS = GROUP_COLORS.filter((c) => c !== PERSONAL_DEFAULT);

const groupLight: Record<GroupColor, string> = {
  coral: '#FFB3A3',
  sky: '#B5C3FF',
  sun: '#FFE39A',
  lilac: '#D9C2FF',
  pink: '#FFC2DD',
  teal: '#A6E3E9',
  lime: '#D4F08C',
  sand: '#E9DCC8',
  mint: '#9FE5C8',
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
  mint: '#76C9A7',
};

export function isGroupColor(value: unknown): value is GroupColor {
  return typeof value === 'string' && (GROUP_COLORS as readonly string[]).includes(value);
}

/** Color estable para grupos que todavía no eligieron uno (depende solo del id). */
export function fallbackGroupColor(groupId: string): GroupColor {
  let h = 0;
  for (let i = 0; i < groupId.length; i++) h = (h * 31 + groupId.charCodeAt(i)) >>> 0;
  return AUTO_COLORS[h % AUTO_COLORS.length]!;
}

/** Clave de color efectiva de un grupo (Personal: menta salvo que el usuario elija otro). */
export function groupColorKey(group: { id: string; kind: string; color?: string | null }): GroupColor {
  if (isGroupColor(group.color)) return group.color;
  return group.kind === 'personal' ? PERSONAL_DEFAULT : fallbackGroupColor(group.id);
}

/** Tono de fondo de un grupo para el modo actual. */
export function groupColorValue(key: GroupColor, theme: { dark: boolean }): string {
  return (theme.dark ? groupDark : groupLight)[key];
}

/** Primer color que el usuario todavía no usa en sus grupos (para proponer al crear uno). */
export function freeGroupColor(used: readonly (string | null | undefined)[]): GroupColor {
  return AUTO_COLORS.find((c) => !used.includes(c)) ?? AUTO_COLORS[used.length % AUTO_COLORS.length]!;
}
