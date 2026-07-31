import { describe, it, expect } from 'vitest';
import {
  visualMarkerSpeed,
  markerCountForWidth,
  shouldAnimateMarkers,
} from '../src/animation-controller';
import { normalisedCurrent, solve } from '../src/physics';

describe('visualMarkerSpeed', () => {
  it('is zero when the current is zero (markers stop)', () => {
    const s = solve(0);
    expect(visualMarkerSpeed(normalisedCurrent(s.current), 150)).toBe(0);
  });

  it('scales linearly with normalised current', () => {
    expect(visualMarkerSpeed(0.5, 150)).toBeCloseTo(75, 10);
    expect(visualMarkerSpeed(1, 150)).toBeCloseTo(150, 10);
  });

  it('clamps normalised input to [0, 1]', () => {
    expect(visualMarkerSpeed(-2, 150)).toBe(0);
    expect(visualMarkerSpeed(5, 150)).toBe(150);
  });
});

describe('markerCountForWidth', () => {
  it('returns a small but positive count at 320px', () => {
    const n = markerCountForWidth(320, 8);
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThan(markerCountForWidth(1200, 8));
  });

  it('reduces the count on low-core devices', () => {
    expect(markerCountForWidth(1200, 4)).toBeLessThan(markerCountForWidth(1200, 8));
  });
});

describe('shouldAnimateMarkers (reduced motion)', () => {
  it('animates when motion is allowed', () => {
    expect(shouldAnimateMarkers(false)).toBe(true);
  });
  it('does NOT animate when reduced motion is requested', () => {
    expect(shouldAnimateMarkers(true)).toBe(false);
  });
});
