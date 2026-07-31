import { describe, it, expect } from 'vitest';
import { dataToScreen, theoryLineEnd, GRAPH_GEOMETRY } from '../src/graph-renderer';
import {
  solve,
  RESISTANCE_MIN,
  RESISTANCE_MAX,
  RESISTANCE_STEP,
  VOLTAGE_MAX,
} from '../src/physics';

const g = GRAPH_GEOMETRY;

/** Signed area × 2 of the triangle (a, b, c). Zero ⇒ the points are collinear. */
function collinearity(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
}

describe('graph point lies on the theoretical line V = R·I', () => {
  const lineStart = dataToScreen(0, 0, g);

  // The point must stay on the line at EVERY selectable resistance, because the
  // line's slope is the resistance.
  for (let r = RESISTANCE_MIN; r <= RESISTANCE_MAX; r += RESISTANCE_STEP) {
    for (const v of [0, 5, 12.4, 20]) {
      it(`R = ${r} Ω, V = ${v} V plots exactly on the line`, () => {
        const s = solve(v, r);
        const end = theoryLineEnd(r, g);
        const lineEnd = dataToScreen(end.current, end.voltage, g);
        const point = dataToScreen(s.current, s.voltage, g);
        expect(Math.abs(collinearity(lineStart, lineEnd, point))).toBeLessThan(1e-6);
      });
    }
  }
});

describe('theoryLineEnd — the line responds to resistance', () => {
  it('has slope exactly equal to the resistance', () => {
    for (let r = RESISTANCE_MIN; r <= RESISTANCE_MAX; r += RESISTANCE_STEP) {
      const end = theoryLineEnd(r, g);
      expect(end.voltage / end.current).toBeCloseTo(r, 9);
    }
  });

  it('stays inside the plot at every resistance', () => {
    for (let r = RESISTANCE_MIN; r <= RESISTANCE_MAX; r += RESISTANCE_STEP) {
      const end = theoryLineEnd(r, g);
      expect(end.current).toBeLessThanOrEqual(g.iMax + 1e-9);
      expect(end.voltage).toBeLessThanOrEqual(g.vMax + 1e-9);
      const px = dataToScreen(end.current, end.voltage, g);
      expect(px.x).toBeLessThanOrEqual(g.width - g.padRight + 1e-6);
      expect(px.y).toBeGreaterThanOrEqual(g.padTop - 1e-6);
    }
  });

  it('draws a steeper line (smaller screen slope) for a larger resistance', () => {
    const origin = dataToScreen(0, 0, g);
    let prevAngle = Infinity;
    for (let r = RESISTANCE_MIN; r <= RESISTANCE_MAX; r += RESISTANCE_STEP) {
      const end = theoryLineEnd(r, g);
      const px = dataToScreen(end.current, end.voltage, g);
      // dx per unit rise: smaller means a steeper line on screen.
      const runPerRise = (px.x - origin.x) / (origin.y - px.y);
      expect(runPerRise).toBeLessThan(prevAngle);
      prevAngle = runPerRise;
    }
  });

  it('the smallest resistance spans the full current axis', () => {
    const end = theoryLineEnd(RESISTANCE_MIN, g);
    expect(end.current).toBeCloseTo(g.iMax, 9);
    expect(end.voltage).toBeCloseTo(VOLTAGE_MAX, 9);
  });
});

describe('dataToScreen mapping', () => {
  it('places the origin at the bottom-left of the plot', () => {
    const p = dataToScreen(0, 0, g);
    expect(p.x).toBeCloseTo(g.padLeft, 6);
    expect(p.y).toBeCloseTo(g.height - g.padBottom, 6);
  });

  it('places (Imax, Vmax) at the top-right of the plot', () => {
    const p = dataToScreen(g.iMax, g.vMax, g);
    expect(p.x).toBeCloseTo(g.width - g.padRight, 6);
    expect(p.y).toBeCloseTo(g.padTop, 6);
  });

  it('maps larger voltage to a smaller screen-y (voltage grows upward)', () => {
    const low = dataToScreen(0, 5, g);
    const high = dataToScreen(0, 15, g);
    expect(high.y).toBeLessThan(low.y);
  });
});
