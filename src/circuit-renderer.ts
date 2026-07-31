/**
 * circuit-renderer.ts — inline SVG of the complete closed circuit.
 *
 * A single series loop in the friendly VIR style: a cartoon battery along the
 * bottom edge and an incandescent light BULB along the top edge, joined by ideal
 * wires. The whole loop is exposed as an SVG <path> ("track") plus an empty <g>
 * ("markers") that the animation controller populates.
 *
 * The bulb is the circuit's load: an ideal ohmic component whose resistance the
 * user selects in 5 Ω steps (I = V/R, P = V·I are unchanged). Its brightness is a
 * RELATIVE indicator of POWER (powerRatio) — not a photometric or temperature
 * simulation. Power is the correct driver now that R is adjustable: raising R at
 * a fixed voltage lowers the current and the power, so the bulb visibly dims.
 *
 * Kirchhoff, made visible (current flows CLOCKWISE):
 *   - Single series loop ⇒ the same current everywhere (one track).
 *   - Passive sign convention ⇒ conventional current ENTERS the bulb at the
 *     terminal marked + (its left end, where current crosses the top edge L→R).
 *   - Current leaves the source's + terminal (battery left end), travels the
 *     external circuit clockwise, and returns to the − terminal (battery right end).
 *   - The bulb's voltage drop V_R equals the source voltage V.
 *
 * `update(state)` refreshes only labels and the bulb glow; it never creates or
 * removes elements.
 */
import { SimState, powerRatio } from './physics';

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

// --- Loop geometry (SVG user units) --------------------------------------
const W = 440;
const H = 300;
const LX = 68; // left edge
const RX = 372; // right edge
const TY = 104; // top wire (bulb base sits here)
const BY = 228; // bottom wire (battery sits here)
const MID_X = (LX + RX) / 2; // 220
const BULB_CY = 50; // centre of the glass

export class CircuitRenderer {
  readonly root: SVGSVGElement;
  /** Closed loop the current markers ride. Clockwise from the top-left. */
  readonly trackPath: SVGPathElement;
  /** Empty group the animation controller fills with marker circles. */
  readonly markersGroup: SVGGElement;

  private readonly halo: SVGCircleElement; // soft glow around the bulb
  private readonly core: SVGCircleElement; // warm fill inside the glass
  private readonly sourceLabel: SVGTextElement;
  private readonly resistanceLabel: SVGTextElement;
  private readonly resistorVoltageLabel: SVGTextElement;
  private readonly currentLabel: SVGTextElement;
  private readonly arrow: SVGGElement;

  constructor(mount: HTMLElement) {
    this.root = el('svg', {
      viewBox: `0 0 ${W} ${H}`,
      // Anchor point: scale to fit, centred, never distorted or cropped — so a
      // height cap on a short screen shrinks the drawing rather than clipping it.
      preserveAspectRatio: 'xMidYMid meet',
      class: 'circuit-svg',
      role: 'img',
      'aria-label':
        'A closed series circuit: an adjustable DC battery along the bottom and a light bulb (a fixed 10 ohm load) along the top, joined by ideal wires. The bulb brightens as the voltage rises. Conventional current flows clockwise out of the battery’s positive terminal.',
    });

    this.root.appendChild(this.buildDefs());

    // Soft glow halo behind the bulb; opacity is driven by the voltage.
    this.halo = el('circle', { cx: MID_X, cy: BULB_CY, r: 48, class: 'bulb-halo', fill: 'url(#grad-halo)' });
    this.root.appendChild(this.halo);

    // Conductor loop, clockwise: top L→R, right T→B, bottom R→L, left B→T.
    this.trackPath = el('path', {
      d: `M ${LX} ${TY} H ${RX} V ${BY} H ${LX} Z`,
      class: 'wire',
      fill: 'none',
    });
    this.root.appendChild(this.trackPath);

    this.core = this.buildBulb();
    this.buildBattery();
    this.arrow = this.buildCurrentArrow();

    // Labels ---------------------------------------------------------------
    // Plain-English labels: each names the part it points at, so the diagram
    // reads on its own without decoding symbols like "V_R".
    this.resistanceLabel = el(
      'text',
      { x: MID_X, y: 138, class: 'circuit-label muted', 'text-anchor': 'middle' },
      'Bulb — 10 Ω',
    );
    this.resistorVoltageLabel = el(
      'text',
      { x: MID_X, y: 166, class: 'circuit-label', 'text-anchor': 'middle' },
      '0.0 V across the bulb',
    );
    this.currentLabel = el(
      'text',
      { x: MID_X, y: 192, class: 'circuit-label', 'text-anchor': 'middle' },
      '0.00 A around the loop',
    );
    this.sourceLabel = el(
      'text',
      { x: MID_X, y: 286, class: 'circuit-label', 'text-anchor': 'middle' },
      'Battery — 0.0 V',
    );
    this.root.append(this.resistanceLabel, this.resistorVoltageLabel, this.currentLabel, this.sourceLabel);

    // Markers appended last so they render on top of the wire.
    this.markersGroup = el('g', { class: 'markers', 'aria-hidden': 'true' });
    this.root.appendChild(this.markersGroup);

    mount.appendChild(this.root);
  }

  /** Gradients for the battery, its cap, the brass base, and the bulb glow. */
  private buildDefs(): SVGDefsElement {
    const defs = el('defs');

    const batt = el('linearGradient', { id: 'grad-batt', x1: '0', y1: '0', x2: '0', y2: '1' });
    batt.append(
      el('stop', { offset: '0%', 'stop-color': '#ffe27a' }),
      el('stop', { offset: '45%', 'stop-color': '#ffce3d' }),
      el('stop', { offset: '100%', 'stop-color': '#eaa22b' }),
    );

    const cap = el('linearGradient', { id: 'grad-cap', x1: '0', y1: '0', x2: '0', y2: '1' });
    cap.append(
      el('stop', { offset: '0%', 'stop-color': '#b5c9d3' }),
      el('stop', { offset: '50%', 'stop-color': '#96aeba' }),
      el('stop', { offset: '100%', 'stop-color': '#7a95a3' }),
    );

    const brass = el('linearGradient', { id: 'grad-brass', x1: '0', y1: '0', x2: '0', y2: '1' });
    brass.append(
      el('stop', { offset: '0%', 'stop-color': '#e0c063' }),
      el('stop', { offset: '55%', 'stop-color': '#b08a34' }),
      el('stop', { offset: '100%', 'stop-color': '#7f5f22' }),
    );

    // Soft radial halo (bulb "on" glow).
    const halo = el('radialGradient', { id: 'grad-halo' });
    halo.append(
      el('stop', { offset: '0%', 'stop-color': '#fff4bf', 'stop-opacity': '0.95' }),
      el('stop', { offset: '55%', 'stop-color': '#ffd54a', 'stop-opacity': '0.55' }),
      el('stop', { offset: '100%', 'stop-color': '#ffb020', 'stop-opacity': '0' }),
    );

    // Warm core that fills the glass when lit.
    const core = el('radialGradient', { id: 'grad-core' });
    core.append(
      el('stop', { offset: '0%', 'stop-color': '#fffbe6' }),
      el('stop', { offset: '70%', 'stop-color': '#ffdf7a' }),
      el('stop', { offset: '100%', 'stop-color': '#ffc23d' }),
    );

    defs.append(batt, cap, brass, halo, core);
    return defs;
  }

  /**
   * Incandescent bulb on the top edge: brass screw base, glass envelope, coiled
   * filament, plus a warm core whose opacity tracks the voltage. Returns the
   * warm-core element so `update` can drive its brightness.
   */
  private buildBulb(): SVGCircleElement {
    const g = el('g', { class: 'bulb' });

    // Brass screw base with ridges, sitting on the wire.
    g.appendChild(el('rect', { x: 205, y: 84, width: 30, height: 18, rx: 3, fill: 'url(#grad-brass)', stroke: '#872e0e', 'stroke-width': 1.5 }));
    for (const y of [88, 92, 96]) {
      g.appendChild(el('line', { x1: 207, y1: y, x2: 233, y2: y, stroke: '#872e0e', 'stroke-width': 1, opacity: '0.6' }));
    }
    g.appendChild(el('rect', { x: 213, y: 100, width: 14, height: 5, rx: 2, fill: '#8a5a2b' }));

    // Neck joining base to glass.
    g.appendChild(el('path', { d: 'M206 84 Q210 74 220 74 Q230 74 234 84 Z', fill: '#dfe9ee', stroke: '#7a95a3', 'stroke-width': 2 }));

    // Glass envelope.
    g.appendChild(el('circle', { cx: MID_X, cy: BULB_CY, r: 30, class: 'bulb-glass' }));

    // Warm core (driven by voltage) — semi-transparent so the filament shows through.
    const core = el('circle', { cx: MID_X, cy: BULB_CY, r: 28, class: 'bulb-core', fill: 'url(#grad-core)' });
    g.appendChild(core);

    // Filament: two supports and a coil across the top.
    const fil = el('g', { class: 'filament' });
    fil.append(
      el('line', { x1: 212, y1: 84, x2: 212, y2: 54 }),
      el('line', { x1: 228, y1: 84, x2: 228, y2: 54 }),
      el('path', { d: 'M212 54 l3 -6 l3 6 l3 -6 l3 6 l3 -6 l3 6', fill: 'none' }),
    );
    g.appendChild(fil);

    // Passive-sign polarity: + where current enters (left), − where it leaves.
    g.append(
      el('text', { x: 150, y: BULB_CY + 5, class: 'terminal pos', 'text-anchor': 'middle' }, '+'),
      el('text', { x: 290, y: BULB_CY + 5, class: 'terminal neg', 'text-anchor': 'middle' }, '−'),
    );

    this.root.appendChild(g);
    return core;
  }

  /**
   * Cartoon battery on the bottom edge. Metal cap + nub on the LEFT (+ terminal);
   * blue band on the RIGHT (− terminal). Current leaves + and returns to −.
   */
  private buildBattery(): void {
    const g = el('g', { class: 'battery' });
    const cy = BY;
    g.append(
      el('rect', { x: 144, y: cy - 6, width: 8, height: 12, rx: 2, fill: 'url(#grad-cap)', stroke: '#7a95a3', 'stroke-width': 1.5 }),
      el('rect', { x: 150, y: cy - 14, width: 16, height: 28, rx: 4, fill: 'url(#grad-cap)', stroke: '#7a95a3', 'stroke-width': 1.5 }),
    );
    g.appendChild(el('rect', { x: 164, y: cy - 20, width: 112, height: 40, rx: 13, fill: 'url(#grad-batt)', stroke: '#2d548a', 'stroke-width': 3 }));
    g.appendChild(el('rect', { x: 250, y: cy - 16, width: 22, height: 32, rx: 6, fill: '#4a72a8' }));
    g.appendChild(el('rect', { x: 172, y: cy - 15, width: 92, height: 9, rx: 5, fill: '#ffffff', opacity: '0.4' }));
    g.append(
      el('text', { x: 182, y: cy + 7, class: 'batt-mark pos', 'text-anchor': 'middle' }, '+'),
      el('text', { x: 261, y: cy + 7, class: 'batt-mark on-blue', 'text-anchor': 'middle' }, '−'),
    );
    this.root.appendChild(g);
  }

  /** Conventional-current arrow on the right edge, pointing down (clockwise). */
  private buildCurrentArrow(): SVGGElement {
    const g = el('g', { class: 'current-arrow' });
    const x = RX;
    const yc = (TY + BY) / 2;
    g.appendChild(el('line', { x1: x, y1: yc - 20, x2: x, y2: yc + 8, class: 'arrow-shaft' }));
    g.appendChild(el('polygon', { points: `${x},${yc + 20} ${x - 7},${yc + 6} ${x + 7},${yc + 6}`, class: 'arrow-head' }));
    this.root.appendChild(g);
    return g;
  }

  /** Refresh labels and the bulb glow. Creates nothing. */
  update(s: SimState): void {
    this.resistanceLabel.textContent = `Bulb — ${s.resistance} Ω`;
    this.sourceLabel.textContent = `Battery — ${s.voltage.toFixed(1)} V`;
    // Single loop ⇒ the bulb drop equals the source voltage.
    this.resistorVoltageLabel.textContent = `${s.voltage.toFixed(1)} V across the bulb`;
    this.currentLabel.textContent = `${s.current.toFixed(2)} A around the loop`;

    // Bulb brightness tracks POWER (P / Pmax) — a relative indicator, not a
    // photometric or temperature model. Using power (rather than voltage alone)
    // is what makes the resistance control visible: raising R at a fixed voltage
    // lowers the current and the power, so the bulb dims.
    const brightness = powerRatio(s.power);
    this.halo.style.opacity = String(brightness);
    this.core.style.opacity = String(brightness);

    // Dim the direction arrow when no current flows.
    this.arrow.style.opacity = s.current > 0 ? '1' : '0.25';
  }
}
