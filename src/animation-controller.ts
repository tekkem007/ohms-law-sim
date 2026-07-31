/**
 * animation-controller.ts — the only continuously-running loop in the app.
 *
 * It circulates symbolic CONVENTIONAL-CURRENT markers around the circuit track.
 * The markers are a visual encoding, not electrons and not a literal drift
 * velocity:
 *
 *   normalisedCurrent = I / Imax
 *   visualMarkerSpeed = normalisedCurrent × configuredMaximumSpeed
 *
 * Design rules honoured here:
 *   - Markers are created ONCE and only their positions update each frame.
 *   - They are pre-distributed evenly around the loop; density stays constant.
 *   - At zero current every marker stops.
 *   - The loop pauses when the document is hidden and resumes without a large
 *     elapsed-time jump (the frame delta is capped).
 *   - Fewer markers on narrow / low-core devices.
 *   - `prefers-reduced-motion` ⇒ no moving particles at all; current is then
 *     communicated by the static direction arrow, the values and the graph.
 */
import { SimState, normalisedCurrent } from './physics';

const SVGNS = 'http://www.w3.org/2000/svg';
/** Cap the per-frame delta so a long pause can't teleport the markers. */
const MAX_FRAME_DELTA_S = 0.05;

/** Pure: should moving markers run at all, given the motion preference? */
export function shouldAnimateMarkers(prefersReducedMotion: boolean): boolean {
  return !prefersReducedMotion;
}

/** Pure: marker speed in px/s. Zero current ⇒ zero speed. */
export function visualMarkerSpeed(normalised: number, maxSpeed: number): number {
  const n = Math.min(1, Math.max(0, normalised));
  return n * maxSpeed;
}

/**
 * Pure: how many markers to animate for a viewport width and core count.
 * Narrow or low-powered devices get fewer; always at least a handful so the
 * loop still reads as continuous.
 */
export function markerCountForWidth(width: number, cores: number = 8): number {
  let base = cores <= 4 ? 14 : 22;
  if (width < 360) base = Math.round(base * 0.5);
  else if (width < 720) base = Math.round(base * 0.72);
  return Math.max(6, base);
}

interface AnimationOptions {
  markersGroup: SVGGElement;
  trackPath: SVGPathElement;
  getState: () => SimState;
  /** Full-current speed in user units per second. */
  maxSpeed?: number;
}

export class AnimationController {
  private readonly markersGroup: SVGGElement;
  private readonly trackPath: SVGPathElement;
  private readonly getState: () => SimState;
  private readonly maxSpeed: number;

  private markers: SVGCircleElement[] = [];
  private length = 0;
  private offset = 0;
  private lastTs = 0;
  private rafId = 0;
  private running = false;
  private reduced = false;
  private resizeTimer = 0;
  private readonly motionQuery: MediaQueryList | null;

  constructor(opts: AnimationOptions) {
    this.markersGroup = opts.markersGroup;
    this.trackPath = opts.trackPath;
    this.getState = opts.getState;
    this.maxSpeed = opts.maxSpeed ?? 150;

    this.motionQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    this.reduced = this.motionQuery?.matches ?? false;

    this.buildMarkers();

    this.motionQuery?.addEventListener?.('change', this.onMotionPreferenceChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('resize', this.onResize);
  }

  /** Create the marker circles once and distribute them evenly around the loop. */
  private buildMarkers(): void {
    while (this.markersGroup.firstChild) this.markersGroup.removeChild(this.markersGroup.firstChild);
    this.markers = [];
    this.length = this.safeTrackLength();

    // Reduced motion: draw no moving particles at all.
    if (this.reduced) return;

    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8;
    const width = typeof window !== 'undefined' ? window.innerWidth : 800;
    const count = markerCountForWidth(width, cores);

    for (let i = 0; i < count; i++) {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('r', '5');
      c.setAttribute('class', 'current-marker');
      this.markersGroup.appendChild(c);
      this.markers.push(c);
    }
    this.placeMarkers(this.offset);
  }

  private safeTrackLength(): number {
    try {
      return this.trackPath.getTotalLength();
    } catch {
      return 0;
    }
  }

  private placeMarkers(offset: number): void {
    const n = this.markers.length;
    if (n === 0 || this.length === 0) return;
    const spacing = this.length / n;
    for (let i = 0; i < n; i++) {
      const dist = (((offset + i * spacing) % this.length) + this.length) % this.length;
      const p = this.trackPath.getPointAtLength(dist);
      this.markers[i].setAttribute('cx', String(p.x));
      this.markers[i].setAttribute('cy', String(p.y));
    }
  }

  /** Begin the loop (no-op under reduced motion or if already running). */
  start(): void {
    if (this.reduced || this.running) return;
    this.running = true;
    this.lastTs = 0; // force a fresh delta baseline on the next frame
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private tick = (ts: number): void => {
    if (!this.running) return;
    if (this.lastTs === 0) this.lastTs = ts;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (dt < 0) dt = 0;
    if (dt > MAX_FRAME_DELTA_S) dt = MAX_FRAME_DELTA_S; // cap after a pause

    if (this.length > 0) {
      const state = this.getState();
      const speed = visualMarkerSpeed(normalisedCurrent(state.current), this.maxSpeed);
      if (speed > 0) {
        this.offset = (this.offset + speed * dt) % this.length;
        this.placeMarkers(this.offset);
      }
      // speed === 0 ⇒ markers hold position (current is zero).
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.stop();
      return;
    }
    // Becoming visible. Stop-then-start guarantees a live rAF (a callback queued
    // while hidden may never fire), and start() resets lastTs so there is no
    // elapsed-time jump. Also re-measure: if the page first loaded while hidden,
    // the marker count may reflect a transient width and should be corrected.
    this.stop();
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8;
    const desired = markerCountForWidth(window.innerWidth, cores);
    if (!this.reduced && desired !== this.markers.length) this.buildMarkers();
    this.start();
  };

  private onMotionPreferenceChange = (e: MediaQueryListEvent): void => {
    this.reduced = e.matches;
    this.stop();
    this.buildMarkers();
    if (!this.reduced) this.start();
  };

  private onResize = (): void => {
    // Debounce: rebuild marker count/density after the resize settles.
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      const wasRunning = this.running;
      this.stop();
      this.buildMarkers();
      if (wasRunning && !this.reduced) this.start();
    }, 200);
  };

  /** Detach listeners and cancel the loop. */
  destroy(): void {
    this.stop();
    this.motionQuery?.removeEventListener?.('change', this.onMotionPreferenceChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('resize', this.onResize);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
  }
}
