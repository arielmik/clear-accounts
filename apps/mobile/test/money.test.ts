import { describe, expect, it } from 'vitest';
import { formatAmountTyping, formatMoney, minorToInput, parseAmount } from '../src/lib/money';

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

describe('formatAmountTyping', () => {
  const f = (prev: string, next: string, currency = 'ARS') => formatAmountTyping(prev, next, currency);
  it.each([
    ['', '1', '1'],
    ['1.200', '1.2000', '12.000'],
    ['123.456', '123.4567', '1.234.567'],
    ['12.000', '12.000,', '12.000,'],
    ['12.000', '12.000.', '12.000,'], // punto recién tipeado = coma decimal
    ['12.000,5', '12.000,55', '12.000,55'],
    ['12.000,55', '12.000,559', '12.000,55'], // no más de 2 decimales
    ['', ',', '0,'],
    ['', '007', '7'],
    ['12.000', '1.200', '1.200'], // borrar
    ['', '$ 2.500', '2.500'],
  ])('%s + tecla -> %s => %s', (prev, next, expected) => {
    expect(f(prev, next)).toBe(expected);
  });

  it('sin decimales en monedas que no los usan', () => {
    expect(formatAmountTyping('1.000', '1.000,', 'CLP')).toBe('1.000');
  });

  it('lo formateado se sigue leyendo bien', () => {
    expect(parseAmount(formatAmountTyping('', '1234567,8', 'ARS'), 'ARS')).toBe(123456780);
    expect(minorToInput(123450, 'ARS')).toBe('1.234,5');
  });
});
