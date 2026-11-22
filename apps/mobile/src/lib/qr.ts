import qrcode from 'qrcode-generator';

/**
 * Matriz de módulos de un código QR (true = oscuro). Nivel de corrección "M":
 * tolera ~15% de daño, suficiente para pantallas y fotos.
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Agrupa cada fila en tramos contiguos oscuros, para dibujar con pocas vistas. */
export function darkRuns(row: readonly boolean[]): { start: number; length: number }[] {
  const runs: { start: number; length: number }[] = [];
  let start = -1;
  row.forEach((dark, i) => {
    if (dark && start < 0) start = i;
    if (!dark && start >= 0) {
      runs.push({ start, length: i - start });
      start = -1;
    }
  });
  if (start >= 0) runs.push({ start, length: row.length - start });
  return runs;
}
