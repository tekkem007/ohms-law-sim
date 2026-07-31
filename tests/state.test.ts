import { describe, it, expect } from 'vitest';
import { SimulationState } from '../src/state';
import { VOLTAGE_MAX, VOLTAGE_MIN, NUMERICAL_TOLERANCE } from '../src/physics';

describe('SimulationState', () => {
  it('starts consistent and derives current/power from voltage', () => {
    const s = new SimulationState(10);
    expect(s.get().voltage).toBe(10);
    expect(s.get().current).toBeCloseTo(1, 10);
    expect(s.get().power).toBeCloseTo(10, 10);
  });

  it('setVoltage clamps to the permitted range', () => {
    const s = new SimulationState(0);
    s.setVoltage(999);
    expect(s.get().voltage).toBe(VOLTAGE_MAX);
    s.setVoltage(-999);
    expect(s.get().voltage).toBe(VOLTAGE_MIN);
  });

  it('notifies subscribers synchronously on change', () => {
    const s = new SimulationState(0);
    const seen: number[] = [];
    s.subscribe((st) => seen.push(st.current));
    // subscribe pushes the initial state (I = 0) immediately.
    expect(seen).toEqual([0]);
    s.setVoltage(20);
    expect(seen[seen.length - 1]).toBeCloseTo(2, 10);
  });

  it('does not re-notify when the clamped voltage is unchanged', () => {
    const s = new SimulationState(5);
    let count = 0;
    s.subscribe(() => count++);
    count = 0; // ignore the initial push
    s.setVoltage(5); // same value
    s.setVoltage(100); // clamps to 20 → changes
    s.setVoltage(100); // still 20 → no change
    expect(count).toBe(1);
  });

  it('keeps V ≈ I·R after every update (no independent current path)', () => {
    const s = new SimulationState(0);
    for (const v of [0, 3.3, 7.7, 12, 20]) {
      s.setVoltage(v);
      const st = s.get();
      expect(Math.abs(st.voltage - st.current * st.resistance)).toBeLessThan(NUMERICAL_TOLERANCE);
    }
  });

  it('exposes no way to set current directly', () => {
    const s = new SimulationState(0) as unknown as Record<string, unknown>;
    expect(typeof s['setCurrent']).toBe('undefined');
  });
});
