import { describe, expect, it } from 'vitest';
import { base64ToArrayBuffer } from '../src/lib/base64';

describe('base64ToArrayBuffer', () => {
  it.each(['', 'a', 'ab', 'abc', 'hola mundo', 'ÿ\u0000\u0080 binario'])('decodifica igual que Node (%j)', (text) => {
    const original = Buffer.from(text, 'latin1');
    const decoded = new Uint8Array(base64ToArrayBuffer(original.toString('base64')));
    expect(Buffer.from(decoded).equals(original)).toBe(true);
  });

  it('decodifica bytes aleatorios', () => {
    for (let n = 0; n < 50; n++) {
      const original = Buffer.from(Array.from({ length: n * 7 + 1 }, () => Math.floor(Math.random() * 256)));
      expect(Buffer.from(new Uint8Array(base64ToArrayBuffer(original.toString('base64')))).equals(original)).toBe(true);
    }
  });
});
