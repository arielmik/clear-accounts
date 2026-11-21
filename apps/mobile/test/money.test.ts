import { describe, expect, it } from 'vitest';
import { formatMoney, minorToInput, parseAmount } from '../src/lib/money';

describe('parseAmount', () => {
  it.each([
    ['1234', 123400],
    ['1.234', 123400],
    ['1.234.567', 123456700],
    ['1.234,56', 123456],
    ['1234,5', 123450],
    ['1234.56', 123456],
    ['0,01', 1],
    ['$ 2.500', 250000],
  ])('%s -> %i', (input, expected) => {
    expect(parseAmount(input, 'ARS')).toBe(expected);
  });

  // "1,234": coma decimal con 3 decimales -> inválido en ARS.
  it.each(['', 'abc', '1,234,5', '1,234', '-5'])('rechaza %s', (input) => {
    expect(parseAmount(input, 'ARS')).toBeNull();
  });

  it('respeta monedas sin decimales', () => {
    expect(parseAmount('15.000', 'CLP')).toBe(15000);
    expect(parseAmount('150,5', 'CLP')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formatea en es-AR', () => {
    expect(formatMoney(123456, 'ARS').replace(/\s/g, ' ')).toBe('$ 1.234,56');
    expect(formatMoney(250000, 'ARS').replace(/\s/g, ' ')).toBe('$ 2.500');
  });

  it('ida y vuelta con el input', () => {
    expect(parseAmount(minorToInput(123450, 'ARS'), 'ARS')).toBe(123450);
  });
});
