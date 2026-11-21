import { describe, expect, it } from 'vitest';
import { allocate } from '../src';

describe('allocate', () => {
  it('reparte en partes iguales sin perder centavos', () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(1001, [1, 1, 1])).toEqual([334, 334, 333]);
  });

  it('asigna el sobrante a la mayor fracción', () => {
    // 100 * 1/6 = 16.67, 100 * 5/6 = 83.33 -> el centavo va al primero
    expect(allocate(100, [1, 5])).toEqual([17, 83]);
  });

  it('nunca le da centavos a un peso cero', () => {
    expect(allocate(5, [0, 1, 1])).toEqual([0, 3, 2]);
  });

  it('soporta montos grandes sin desbordar', () => {
    const total = 9_000_000_000_000;
    const parts = allocate(total, [3333, 3333, 3334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('la suma siempre es exacta (propiedad)', () => {
    for (let t = 0; t < 500; t++) {
      const total = Math.floor(Math.random() * 10_000_000);
      const weights = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, () => 1 + Math.floor(Math.random() * 100));
      expect(allocate(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('rechaza entradas inválidas', () => {
    expect(() => allocate(10.5, [1])).toThrow();
    expect(() => allocate(-1, [1])).toThrow();
    expect(() => allocate(10, [])).toThrow();
    expect(() => allocate(10, [0, 0])).toThrow();
  });
});
