/**
 * accessibility.ts — a live, spoken-friendly description of the circuit state.
 *
 * The text is written into an `aria-live="polite"` region so screen readers
 * announce each new operating point. `describeState` is pure (exported for
 * tests) and reads only from the central state — same numbers as everything
 * else on screen.
 *
 * At V = 0 the description says the current is zero and the markers are stopped,
 * and it never mentions R = V / I (undefined at the origin).
 */
import { SimState } from './physics';

export function describeState(s: SimState): string {
  if (s.current <= 0) {
    return (
      `Voltage 0.0 volts. Current 0.00 amperes. Power 0.00 watts. ` +
      `Resistance ${s.resistance} ohms. No current flows, so the conventional-current ` +
      'markers are stopped and the operating point sits at the origin of the ' +
      'voltage–current graph.'
    );
  }
  return (
    `Voltage ${s.voltage.toFixed(1)} volts. ` +
    `Current ${s.current.toFixed(2)} amperes. ` +
    `Power ${s.power.toFixed(2)} watts. ` +
    `Resistance ${s.resistance} ohms. ` +
    `The operating point lies on the line V equals R times I, which has slope ${s.resistance} ohms.`
  );
}

export class AccessibilityAnnouncer {
  constructor(private readonly node: HTMLElement) {}

  update(s: SimState): void {
    this.node.textContent = describeState(s);
  }
}
