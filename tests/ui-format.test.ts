import { describe, it, expect } from 'vitest';
import {
  fmt,
  formatCurrent,
  formatPower,
  formatVoltage,
  ohmEquation,
  powerEquation,
  layoutColumnsForWidth,
} from '../src/ui-controller';
import { solve } from '../src/physics';

describe('formatters never display NaN or Infinity', () => {
  it('renders an em dash for non-finite inputs', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(fmt(bad, 2)).toBe('—');
      expect(formatCurrent(bad)).toBe('—');
      expect(formatPower(bad)).toBe('—');
      expect(formatVoltage(bad)).toBe('—');
    }
  });

  it('formats finite values to fixed decimals', () => {
    expect(formatVoltage(12)).toBe('12.0');
    expect(formatCurrent(0.5)).toBe('0.50');
    expect(formatPower(22.5)).toBe('22.50');
  });

  it('equation strings never contain NaN or Infinity for valid states', () => {
    for (const v of [0, 5, 10, 15, 20]) {
      const s = solve(v);
      const o = ohmEquation(s);
      const p = powerEquation(s);
      expect(o).not.toMatch(/NaN|Infinity/);
      expect(p).not.toMatch(/NaN|Infinity/);
    }
  });

  it('equation strings read from the exact state', () => {
    const s = solve(15);
    expect(ohmEquation(s)).toBe('I = V ÷ R = 15.0 V ÷ 10 Ω = 1.50 A');
    expect(powerEquation(s)).toBe('P = V × I = 15.0 V × 1.50 A = 22.50 W');
  });
});

describe('layoutColumnsForWidth', () => {
  it('is single-column at 320px (usable on narrow screens)', () => {
    expect(layoutColumnsForWidth(320)).toBe(1);
  });
  it('is two-column on wide screens', () => {
    expect(layoutColumnsForWidth(1200)).toBe(2);
  });
});
