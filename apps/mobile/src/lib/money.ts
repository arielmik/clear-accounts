const fractionDigitsCache = new Map<string, number>();

/** Cantidad de decimales de una moneda (ARS: 2, CLP: 0, ...). */
export function fractionDigits(currency: string): number {
  let digits = fractionDigitsCache.get(currency);
  if (digits === undefined) {
    try {
      digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      digits = 2;
    }
    fractionDigitsCache.set(currency, digits);
  }
  return digits;
}

/**
 * Convierte lo que escribe el usuario en unidades mínimas.
 * Acepta formato argentino ("1.234,56") y también punto decimal ("1234.56").
 * Devuelve null si no es un monto válido.
 */
export function parseAmount(input: string, currency: string): number | null {
  const raw = input.replace(/[\s$]/g, '');
  if (!raw) return null;
  let normalized: string;
  if (raw.includes(',')) {
    // Coma decimal: los puntos son separadores de miles.
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = raw.split('.').length - 1;
    const decimalDot = dots === 1 && /\.\d{1,2}$/.test(raw);
    normalized = decimalDot ? raw : raw.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [intPart = '0', decPart = ''] = normalized.split('.');
  const digits = fractionDigits(currency);
  if (decPart.length > digits) return null;
  const minor = Number(intPart) * 10 ** digits + Number(decPart.padEnd(digits, '0') || '0');
  return Number.isSafeInteger(minor) ? minor : null;
}

export function formatMoney(minor: number, currency: string, locale = 'es-AR'): string {
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 10 ** digits === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

/** Para precargar un input a partir de unidades mínimas ("1.234,5"). */
export function minorToInput(minor: number, currency: string): string {
  const digits = fractionDigits(currency);
  const value = minor / 10 ** digits;
  return formatAmountTyping('', digits === 0 ? String(value) : String(value).replace('.', ','), currency);
}

/**
 * Formatea un monto mientras se escribe, con separador de miles: "12000" -> "12.000",
 * "1234,5" -> "1.234,5". La coma es el decimal; un punto recién tipeado al final
 * (teclados que muestran "." como decimal) se toma como coma. Recibe el texto
 * anterior para distinguir ese punto de los separadores que ya estaban.
 */
export function formatAmountTyping(prev: string, next: string, currency: string): string {
  let text = next;
  if (text.length === prev.length + 1 && text.startsWith(prev) && text.endsWith('.')) {
    text = `${text.slice(0, -1)},`;
  }
  text = text.replace(/[^\d,]/g, '');
  const comma = text.indexOf(',');
  const digits = fractionDigits(currency);
  let intPart = comma === -1 ? text : text.slice(0, comma);
  const decPart = comma === -1 ? null : text.slice(comma + 1).replace(/,/g, '').slice(0, digits);

  intPart = intPart.replace(/^0+(?=\d)/, '');
  if (decPart !== null && intPart === '') intPart = '0';
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decPart === null || digits === 0 ? grouped : `${grouped},${decPart}`;
}
