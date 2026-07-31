import { describe, it, expect } from 'vitest';
import {
  solve,
  clampVoltage,
  clampResistance,
  RESISTANCE_MIN,
  RESISTANCE_MAX,
  RESISTANCE_STEP,
  checkConsistency,
  normalisedCurrent,
  powerRatio,
  normalisedVoltage,
  isFiniteNumber,
  RESISTANCE_DEFAULT,
  CURRENT_MAX,
  POWER_MAX,
  VOLTAGE_MIN,
  VOLTAGE_MAX,
  NUMERICAL_TOLERANCE,
} from '../src/physics';

// The canonical verification table from the specification.
const TABLE: Array<{ v: number; i: number; p: number }> = [
  { v: 0, i: 0, p: 0 },
  { v: 5, i: 0.5, p: 2.5 },
  { v: 10, i: 1, p: 10 },
  { v: 15, i: 1.5, p: 22.5 },
  { v: 20, i: 2, p: 40 },
];

describe('verification table', () => {
  for (const { v, i, p } of TABLE) {
    it(`V = ${v} V → I = ${i} A, P = ${p} W`, () => {
      const s = solve(v);
      expect(Math.abs(s.current - i)).toBeLessThan(NUMERICAL_TOLERANCE);
      expect(Math.abs(s.power - p)).toBeLessThan(NUMERICAL_TOLERANCE);
      expect(s.resistance).toBe(RESISTANCE_DEFAULT);
    });

    it(`V = ${v} V satisfies every invariant (V≈IR, P≈VI, P≈I²R, P≈V²/R)`, () => {
      const report = checkConsistency(solve(v));
      expect(report.ok).toBe(true);
      expect(report.ohm).toBeLessThan(NUMERICAL_TOLERANCE);
      expect(report.joule).toBeLessThan(NUMERICAL_TOLERANCE);
      expect(report.iSquaredR).toBeLessThan(NUMERICAL_TOLERANCE);
      expect(report.vSquaredOverR).toBeLessThan(NUMERICAL_TOLERANCE);
    });
  }
});

describe('zero point (V = 0)', () => {
  it('gives I = 0 and P = 0 exactly', () => {
    const s = solve(0);
    expect(s.current).toBe(0);
    expect(s.power).toBe(0);
  });

  it('reports the selected resistance rather than evaluating 0/0', () => {
    const s = solve(0);
    // R is the selected value; V/I would be NaN here and must never be used.
    expect(s.resistance).toBe(RESISTANCE_DEFAULT);
    expect(Number.isNaN(s.voltage / s.current)).toBe(true); // proves why we avoid it
    expect(isFiniteNumber(s.resistance)).toBe(true);
  });

  it('stays at I = 0, P = 0 for every selectable resistance', () => {
    for (let r = RESISTANCE_MIN; r <= RESISTANCE_MAX; r += RESISTANCE_STEP) {
      const s = solve(0, r);
      expect(s.current).toBe(0);
      expect(s.power).toBe(0);
      expect(s.resistance).toBe(r);
    }
  });
});

describe('adjustable resistance', () => {
  it('halving the resistance doubles the current at fixed voltage', () => {
    const a = solve(20, 20);
    const b = solve(20, 10);
    expect(a.current).toBeCloseTo(1, 10);
    expect(b.current).toBeCloseTo(2, 10);
    expect(b.current / a.current).toBeCloseTo(2, 10);
  });

  it('raising R at fixed V lowers current and power (so the bulb dims)', () => {
    let prevCurrent = Infinity;
    let prevPower = Infinity;
    for (let r = RESISTANCE_MIN; r <= RESISTANCE_MAX; r += RESISTANCE_STEP) {
      const s = solve(20, r);
      expect(s.current).toBeLessThan(prevCurrent);
      expect(s.power).toBeLessThan(prevPower);
      prevCurrent = s.current;
      prevPower = s.power;
    }
  });

  it('satisfies every invariant at every selectable resistance', () => {
    for (let r = RESISTANCE_MIN; r <= RESISTANCE_MAX; r += RESISTANCE_STEP) {
      for (const v of [0, 3.3, 10, 17.5, 20]) {
        const report = checkConsistency(solve(v, r));
        expect(report.ok).toBe(true);
      }
    }
  });

  it('never exceeds the declared envelope maxima', () => {
    for (let r = RESISTANCE_MIN; r <= RESISTANCE_MAX; r += RESISTANCE_STEP) {
      const s = solve(VOLTAGE_MAX, r);
      expect(s.current).toBeLessThanOrEqual(CURRENT_MAX + NUMERICAL_TOLERANCE);
      expect(s.power).toBeLessThanOrEqual(POWER_MAX + NUMERICAL_TOLERANCE);
    }
  });
});

describe('clampResistance', () => {
  it('clamps beyond either end', () => {
    expect(clampResistance(-10)).toBe(RESISTANCE_MIN);
    expect(clampResistance(999)).toBe(RESISTANCE_MAX);
    expect(clampResistance(-Infinity)).toBe(RESISTANCE_MIN);
    expect(clampResistance(Infinity)).toBe(RESISTANCE_MAX);
  });
  it('falls back to the default for NaN', () => {
    expect(clampResistance(NaN)).toBe(RESISTANCE_DEFAULT);
  });
  it('snaps to the nearest increment', () => {
    expect(clampResistance(12)).toBe(10);
    expect(clampResistance(13)).toBe(15);
    expect(clampResistance(27.5)).toBe(30);
  });
  it('leaves exact increments untouched', () => {
    for (let r = RESISTANCE_MIN; r <= RESISTANCE_MAX; r += RESISTANCE_STEP) {
      expect(clampResistance(r)).toBe(r);
    }
  });
});

describe('clamping', () => {
  it('clamps below the minimum', () => {
    expect(clampVoltage(-7)).toBe(VOLTAGE_MIN);
  });
  it('clamps above the maximum', () => {
    expect(clampVoltage(25)).toBe(VOLTAGE_MAX);
  });
  it('passes valid values through', () => {
    expect(clampVoltage(12.3)).toBeCloseTo(12.3, 10);
  });
  it('treats NaN as the minimum', () => {
    expect(clampVoltage(NaN)).toBe(VOLTAGE_MIN);
  });
  it('solve() never produces NaN or Infinity across the range', () => {
    for (let v = -5; v <= 25; v += 0.37) {
      const s = solve(v);
      expect(isFiniteNumber(s.voltage)).toBe(true);
      expect(isFiniteNumber(s.current)).toBe(true);
      expect(isFiniteNumber(s.power)).toBe(true);
    }
  });
});

describe('normalisation helpers', () => {
  it('normalisedCurrent maps 0 → 0 and Imax → 1', () => {
    expect(normalisedCurrent(0)).toBe(0);
    expect(normalisedCurrent(CURRENT_MAX)).toBe(1);
  });
  it('normalisedCurrent clamps out-of-range and non-finite inputs', () => {
    expect(normalisedCurrent(-1)).toBe(0);
    expect(normalisedCurrent(99)).toBe(1);
    expect(normalisedCurrent(NaN)).toBe(0);
  });
  it('powerRatio maps 0 → 0 and Pmax → 1', () => {
    expect(powerRatio(0)).toBe(0);
    expect(powerRatio(POWER_MAX)).toBe(1);
  });

  it('normalisedVoltage maps 0 → 0 and Vmax → 1 (drives bulb brightness)', () => {
    expect(normalisedVoltage(0)).toBe(0);
    expect(normalisedVoltage(VOLTAGE_MAX)).toBe(1);
    expect(normalisedVoltage(VOLTAGE_MAX / 2)).toBeCloseTo(0.5, 10);
  });
  it('normalisedVoltage clamps out-of-range and non-finite inputs', () => {
    expect(normalisedVoltage(-3)).toBe(0);
    expect(normalisedVoltage(999)).toBe(1);
    expect(normalisedVoltage(NaN)).toBe(0);
  });
});
