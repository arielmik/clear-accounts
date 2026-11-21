const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local en formato ISO (YYYY-MM-DD). */
export function isoDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const last = new Date(year, month + 1, 0).getDate();
  return { from: `${year}-${pad(month + 1)}-01`, to: `${year}-${pad(month + 1)}-${pad(last)}` };
}

export function monthLabel(year: number, month: number, locale = 'es-AR'): string {
  const label = new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shortDate(iso: string, locale = 'es-AR'): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
