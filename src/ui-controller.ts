/**
 * ui-controller.ts — binds the DOM controls and readouts to the central state.
 *
 * The slider is the only input. It listens to the `input` event so the physics
 * state updates continuously while dragging, and every readout — numeric cards,
 * equation display, circuit labels, graph point, accessibility text — is driven
 * synchronously from the resulting state (via the store's subscribers). The
 * measured values are never eased toward their result.
 *
 * The formatting helpers are pure and NaN/Infinity-safe (exported for tests):
 * a non-finite value renders as an em dash, never "NaN" or "Infinity".
 */
import { SimulationState } from './state';
import {
  SimState,
  VOLTAGE_MIN,
  VOLTAGE_MAX,
  RESISTANCE_MIN,
  RESISTANCE_MAX,
  isFiniteNumber,
} from './physics';

const EM_DASH = '—';

/** Fixed-decimal formatter that refuses to print NaN or ±Infinity. */
export function fmt(value: number, digits: number): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  return value.toFixed(digits);
}

export const formatVoltage = (v: number): string => fmt(v, 1);
export const formatCurrent = (i: number): string => fmt(i, 2);
export const formatPower = (p: number): string => fmt(p, 2);
export const formatResistance = (r: number): string => fmt(r, 0);

/** Ohm's-law equation string. Uses ÷ / × so it reads naturally aloud. */
export function ohmEquation(s: SimState): string {
  return `I = V ÷ R = ${formatVoltage(s.voltage)} V ÷ ${formatResistance(s.resistance)} Ω = ${formatCurrent(s.current)} A`;
}

/** Power equation string, P = V × I. */
export function powerEquation(s: SimState): string {
  return `P = V × I = ${formatVoltage(s.voltage)} V × ${formatCurrent(s.current)} A = ${formatPower(s.power)} W`;
}

/** Pure layout helper: single column on narrow viewports. */
export function layoutColumnsForWidth(width: number): number {
  return width <= 720 ? 1 : 2;
}

/** Pure: how far through the resistance range a value sits, as a 0–1 fraction. */
export function resistanceFraction(resistance: number): number {
  const span = RESISTANCE_MAX - RESISTANCE_MIN;
  if (span <= 0) return 0;
  const f = (resistance - RESISTANCE_MIN) / span;
  return Math.min(1, Math.max(0, f));
}

function must<T extends Element>(root: Document | Element, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`ui-controller: required element not found: ${selector}`);
  return node;
}

export class UIController {
  constructor(doc: Document, private readonly state: SimulationState) {
    const slider = must<HTMLInputElement>(doc, '#voltage-slider');
    const valVoltage = must<HTMLElement>(doc, '#val-voltage');
    const valCurrent = must<HTMLElement>(doc, '#val-current');
    const valPower = must<HTMLElement>(doc, '#val-power');
    const valResistance = must<HTMLElement>(doc, '#val-resistance');
    const eqOhm = must<HTMLElement>(doc, '#eq-ohm');
    const eqPower = must<HTMLElement>(doc, '#eq-power');
    const rDec = must<HTMLButtonElement>(doc, '#r-dec');
    const rInc = must<HTMLButtonElement>(doc, '#r-inc');
    const rFill = must<HTMLElement>(doc, '#r-fill');

    // Configure the slider from the model so the range can never drift from it.
    slider.min = String(VOLTAGE_MIN);
    slider.max = String(VOLTAGE_MAX);
    slider.step = '0.1';
    slider.setAttribute('aria-valuemin', String(VOLTAGE_MIN));
    slider.setAttribute('aria-valuemax', String(VOLTAGE_MAX));

    // Voltage: `input` fires continuously during a drag.
    slider.addEventListener('input', () => {
      this.state.setVoltage(parseFloat(slider.value));
    });

    // Resistance: discrete steps. The store clamps and snaps, so holding a
    // button at a limit simply does nothing.
    rDec.addEventListener('click', () => this.state.stepResistance(-1));
    rInc.addEventListener('click', () => this.state.stepResistance(+1));

    // Every readout updates from the single state snapshot.
    this.state.subscribe((s) => {
      // Keep the slider's own value in sync (covers programmatic changes).
      const asString = String(s.voltage);
      if (slider.value !== asString) slider.value = asString;

      valVoltage.textContent = formatVoltage(s.voltage);
      valCurrent.textContent = formatCurrent(s.current);
      valPower.textContent = formatPower(s.power);
      valResistance.textContent = formatResistance(s.resistance);

      // Stepper: the upright fill shows where R sits in its range; buttons
      // disable at the limits so the control's bounds are self-evident.
      rFill.style.height = `${(resistanceFraction(s.resistance) * 100).toFixed(1)}%`;
      rDec.disabled = s.resistance <= RESISTANCE_MIN;
      rInc.disabled = s.resistance >= RESISTANCE_MAX;

      eqOhm.textContent = ohmEquation(s);
      eqPower.textContent = powerEquation(s);

      slider.setAttribute('aria-valuenow', formatVoltage(s.voltage));
      slider.setAttribute(
        'aria-valuetext',
        `${formatVoltage(s.voltage)} volts, giving ${formatCurrent(s.current)} amperes and ${formatPower(s.power)} watts`,
      );
    });
  }
}
