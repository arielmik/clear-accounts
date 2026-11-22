import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { inviteLink, tokenFromInviteLink } from '../src/lib/invite';
import { darkRuns, qrMatrix } from '../src/lib/qr';

describe('links de invitación', () => {
  it('son https y llevan el token', () => {
    expect(inviteLink('abc123def456', 'https://ejemplo.app/')).toBe('https://ejemplo.app/j/abc123def456');
  });

  it('el token se recupera del link https y del esquema propio', () => {
    expect(tokenFromInviteLink('https://ejemplo.app/j/abc123def456')).toBe('abc123def456');
    expect(tokenFromInviteLink('https://ejemplo.app/j/abc123def456?x=1')).toBe('abc123def456');
    expect(tokenFromInviteLink('clearaccounts://join/abc123def456')).toBe('abc123def456');
    expect(tokenFromInviteLink('https://ejemplo.app/otra/cosa')).toBeNull();
  });
});

/** Dibuja la matriz como imagen RGBA (con margen blanco) para pasarla por un lector de QR real. */
function render(matrix: boolean[][], scale = 6, quiet = 4) {
  const n = matrix.length + quiet * 2;
  const size = n * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, r) =>
    darkRuns(row).forEach(({ start, length }) => {
      for (let y = (r + quiet) * scale; y < (r + quiet + 1) * scale; y++)
        for (let x = (start + quiet) * scale; x < (start + length + quiet) * scale; x++) {
          const i = (y * size + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }),
  );
  return { data, size };
}

describe('código QR', () => {
  it.each([
    'https://clear-accounts-invite.netlify.app/j/0f3a9c2b7d1e4f5a8b6c9d0e1f2a3b4c',
    'https://ejemplo.app/j/x',
  ])('un lector real decodifica exactamente el link (%s)', (link) => {
    const { data, size } = render(qrMatrix(link));
    expect(jsQR(data, size, size)?.data).toBe(link);
  });

  it('darkRuns agrupa tramos contiguos', () => {
    expect(darkRuns([true, true, false, true, false, false, true])).toEqual([
      { start: 0, length: 2 },
      { start: 3, length: 1 },
      { start: 6, length: 1 },
    ]);
  });
});
