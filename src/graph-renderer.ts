/**
 * graph-renderer.ts — inline SVG voltage-versus-current graph.
 *
 *   Horizontal axis: current  I (A)
 *   Vertical axis:   voltage  V (V)
 *   Relationship:    V = R × I   ⇒   slope ΔV/ΔI = R = 10 Ω
 *
 * The theoretical line is drawn straight from the equation (not from rounded
 * display values). The active point is placed from the EXACT internal V and I,
 * so it always lies on the line. The point follows the slider immediately —
 * there is no tweening or easing through intermediate values.
 *
 * `dataToScreen` is a pure function (exported for unit tests): it is the single
 * mapping used for both the line and the point, which is why the point is
 * guaranteed to sit on the line for every valid state.
 */
import { SimState, CURRENT_MAX, VOLTAGE_MAX } from './physics';

const SVGNS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface GraphGeometry {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  /** Full-scale current (x-axis) and voltage (y-axis). */
  iMax: number;
  vMax: number;
}

export const GRAPH_GEOMETRY: GraphGeometry = {
  width: 380,
  height: 344,
  padLeft: 58,
  padRight: 18,
  // ANCHOR: the top gutter is reserved for the slope annotation ONLY. The active
  // point's coordinate label is clamped inside the plot, so the two occupy
  // structurally separate bands and cannot collide at any voltage — nudging
  // offsets could not fix this, because the point reaches the ceiling at V=20.
  padTop: 34,
  // Deep enough that the x-axis title clears the tick labels even when the
  // container-query tiers enlarge in-viewBox text on a narrow phone.
  padBottom: 62,
  iMax: CURRENT_MAX, // 2 A
  vMax: VOLTAGE_MAX, // 20 V
};

/**
 * Where the theoretical line V = R·I leaves the plot, for a given resistance.
 *
 * The axes are deliberately FIXED (they never rescale with R) so that changing
 * the resistance visibly changes the line's SLOPE — that is the whole lesson. An
 * auto-scaling axis would redraw every line at the same apparent angle and hide
 * the effect.
 *
 * A steep line (large R) hits the voltage ceiling first; a shallow line (small
 * R) runs off the current edge first. Clipping to whichever comes first keeps
 * the line inside the plot at every resistance.
 */
export function theoryLineEnd(resistance: number, g: GraphGeometry): { current: number; voltage: number } {
  const currentAtVMax = g.vMax / resistance;
  const current = Math.min(g.iMax, currentAtVMax);
  return { current, voltage: resistance * current };
}

/** Map a data-space (current, voltage) pair to SVG screen coordinates. */
export function dataToScreen(current: number, voltage: number, g: GraphGeometry): { x: number; y: number } {
  const plotW = g.width - g.padLeft - g.padRight;
  const plotH = g.height - g.padTop - g.padBottom;
  const x = g.padLeft + (current / g.iMax) * plotW;
  // Voltage grows upward, so larger V ⇒ smaller screen y.
  const y = g.height - g.padBottom - (voltage / g.vMax) * plotH;
  return { x, y };
}

export class GraphRenderer {
  private readonly g = GRAPH_GEOMETRY;
  private readonly root: SVGSVGElement;
  private readonly point: SVGCircleElement;
  private readonly guideToX: SVGLineElement;
  private readonly guideToY: SVGLineElement;
  private readonly coordLabel: SVGTextElement;
  /** Redrawn whenever R changes — its slope IS the resistance. */
  private readonly theoryLine: SVGLineElement;
  private readonly slopeLabel: SVGTextElement;

  constructor(mount: HTMLElement) {
    const g = this.g;
    const root = el('svg', {
      viewBox: `0 0 ${g.width} ${g.height}`,
      // Anchor point: scale to fit, centred, never distorted or cropped.
      preserveAspectRatio: 'xMidYMid meet',
      class: 'graph-svg',
      role: 'img',
      'aria-label': 'Voltage versus current graph. The straight line V = R times I has a slope equal to the selected resistance. A point marks the present operating state.',
    });
    this.root = root;

    const origin = dataToScreen(0, 0, g);
    const topOfV = dataToScreen(0, g.vMax, g);
    const endOfI = dataToScreen(g.iMax, 0, g);

    // Axes.
    root.appendChild(el('line', { x1: origin.x, y1: origin.y, x2: endOfI.x, y2: endOfI.y, class: 'axis' }));
    root.appendChild(el('line', { x1: origin.x, y1: origin.y, x2: topOfV.x, y2: topOfV.y, class: 'axis' }));

    // Ticks + gridlines. 1 A spacing keeps the labels legible now that the
    // current axis spans the full 0–4 A envelope.
    for (let i = 0; i <= g.iMax + 1e-9; i += 1) {
      const p = dataToScreen(i, 0, g);
      root.appendChild(el('line', { x1: p.x, y1: origin.y, x2: p.x, y2: topOfV.y, class: 'gridline' }));
      root.appendChild(el('line', { x1: p.x, y1: origin.y, x2: p.x, y2: origin.y + 5, class: 'tick' }));
      // ANCHOR: no label at the origin — the y-axis "0" already marks that
      // corner, and printing both collides once the type is enlarged for phones.
      if (i > 0) {
        root.appendChild(el('text', { x: p.x, y: origin.y + 20, class: 'tick-label', 'text-anchor': 'middle' }, i.toFixed(1)));
      }
    }
    for (let v = 0; v <= g.vMax + 1e-9; v += 5) {
      const p = dataToScreen(0, v, g);
      root.appendChild(el('line', { x1: origin.x, y1: p.y, x2: endOfI.x, y2: p.y, class: 'gridline' }));
      root.appendChild(el('line', { x1: origin.x - 5, y1: p.y, x2: origin.x, y2: p.y, class: 'tick' }));
      root.appendChild(el('text', { x: origin.x - 10, y: p.y + 4, class: 'tick-label', 'text-anchor': 'end' }, String(v)));
    }

    // Theoretical line V = R·I, straight from the equation. Its endpoints are
    // set in update() because the slope depends on the selected resistance.
    this.theoryLine = el('line', { class: 'theory-line', x1: origin.x, y1: origin.y, x2: origin.x, y2: origin.y });
    root.appendChild(this.theoryLine);

    // Axis titles + slope annotation.
    root.appendChild(el('text', { x: (origin.x + endOfI.x) / 2, y: g.height - 8, class: 'axis-title', 'text-anchor': 'middle' }, 'Current  I (A)'));
    root.appendChild(
      el('text', { x: 14, y: (origin.y + topOfV.y) / 2, class: 'axis-title', 'text-anchor': 'middle', transform: `rotate(-90 14 ${(origin.y + topOfV.y) / 2})` }, 'Voltage  V (V)'),
    );
    // Parked in the reserved top gutter, above the plot rect — never moves, so
    // nothing inside the plot can run into it.
    this.slopeLabel = el(
      'text',
      { class: 'slope-label', 'text-anchor': 'end', x: g.width - g.padRight, y: g.padTop - 12 },
      '',
    );
    root.appendChild(this.slopeLabel);

    // Guides from the active point down to each axis.
    this.guideToX = el('line', { class: 'guide', x1: origin.x, y1: origin.y, x2: origin.x, y2: origin.y });
    this.guideToY = el('line', { class: 'guide', x1: origin.x, y1: origin.y, x2: origin.x, y2: origin.y });
    root.append(this.guideToX, this.guideToY);

    // The active operating point.
    this.point = el('circle', { r: 6, class: 'active-point', cx: origin.x, cy: origin.y });
    root.appendChild(this.point);
    this.coordLabel = el('text', { class: 'coord-label', x: origin.x, y: origin.y }, '');
    root.appendChild(this.coordLabel);

    mount.appendChild(root);
  }

  /**
   * Redraw the theoretical line for the current resistance, then move the point
   * (and its guides) to the exact internal state. No easing.
   *
   * Line and point share the same equation and the same data→screen mapping, so
   * the point is guaranteed to sit on the line at every resistance.
   */
  update(s: SimState): void {
    const g = this.g;
    const p = dataToScreen(s.current, s.voltage, g);
    const origin = dataToScreen(0, 0, g);

    // Theoretical line V = R·I — slope = R, drawn from the equation.
    const end = theoryLineEnd(s.resistance, g);
    const endPx = dataToScreen(end.current, end.voltage, g);
    this.theoryLine.setAttribute('x1', String(origin.x));
    this.theoryLine.setAttribute('y1', String(origin.y));
    this.theoryLine.setAttribute('x2', String(endPx.x));
    this.theoryLine.setAttribute('y2', String(endPx.y));

    // Text only — its position is fixed in the top gutter (see constructor).
    this.slopeLabel.textContent = `slope = R = ${s.resistance} Ω`;
    this.root.setAttribute(
      'aria-label',
      `Voltage versus current graph. The line V = R times I has slope ${s.resistance} ohms. The operating point is at ${s.current.toFixed(2)} amperes and ${s.voltage.toFixed(1)} volts.`,
    );

    this.point.setAttribute('cx', String(p.x));
    this.point.setAttribute('cy', String(p.y));

    // Vertical guide down to the current axis; horizontal guide across to V axis.
    this.guideToX.setAttribute('x1', String(p.x));
    this.guideToX.setAttribute('y1', String(p.y));
    this.guideToX.setAttribute('x2', String(p.x));
    this.guideToX.setAttribute('y2', String(origin.y));
    this.guideToY.setAttribute('x1', String(p.x));
    this.guideToY.setAttribute('y1', String(p.y));
    this.guideToY.setAttribute('x2', String(origin.x));
    this.guideToY.setAttribute('y2', String(p.y));

    this.coordLabel.textContent = `(${s.current.toFixed(2)} A, ${s.voltage.toFixed(1)} V)`;
    // Flip the label to the point's other side using its MEASURED width, so it
    // never leaves the plot however wide the enlarged phone type makes it.
    // getComputedTextLength() returns 0 inside a hidden subtree (a closed
    // drawer), hence the character-count fallback.
    let textW = 0;
    try {
      textW = this.coordLabel.getComputedTextLength();
    } catch {
      textW = 0;
    }
    if (!textW) textW = this.coordLabel.textContent.length * 6.2;

    const rightEdge = g.width - g.padRight;
    const flip = p.x + 10 + textW > rightEdge;
    this.coordLabel.setAttribute('text-anchor', flip ? 'end' : 'start');
    this.coordLabel.setAttribute('x', String(flip ? Math.max(p.x - 10, g.padLeft + textW) : p.x + 10));
    // Stay inside the plot: never rise into the slope annotation's gutter.
    this.coordLabel.setAttribute('y', String(Math.max(p.y - 12, g.padTop + 22)));
  }
}
