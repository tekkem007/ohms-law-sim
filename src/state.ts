/**
 * state.ts — the central simulation state (single source of truth).
 *
 * Every view — numeric cards, equation display, circuit labels, graph point,
 * accessibility text, animation — reads from this one store. Voltage is the
 * only thing anyone can set; current and power are always derived by `solve`.
 * There is deliberately no `setCurrent`: current can never be edited directly.
 *
 * Updates are synchronous: `setVoltage` recomputes and notifies subscribers in
 * the same tick. There is no easing or interpolation of the measured values.
 */
import { solve, SimState, VOLTAGE_MIN, RESISTANCE_DEFAULT, RESISTANCE_STEP } from './physics';

export type StateListener = (state: SimState) => void;

export class SimulationState {
  private state: SimState;
  private readonly listeners = new Set<StateListener>();

  constructor(initialVoltage: number = VOLTAGE_MIN, initialResistance: number = RESISTANCE_DEFAULT) {
    this.state = solve(initialVoltage, initialResistance);
  }

  /** The current, fully-consistent snapshot. */
  get(): SimState {
    return this.state;
  }

  /**
   * Set the one independent quantity. The input is clamped and the derived
   * quantities recomputed, then every subscriber is notified synchronously.
   * No-ops when the clamped voltage is unchanged, to avoid redundant work
   * while a slider re-emits the same value.
   */
  setVoltage(voltage: number): void {
    // Changing one input preserves the other.
    const next = solve(voltage, this.state.resistance);
    if (next.voltage === this.state.voltage) return;
    this.state = next;
    this.emit();
  }

  /**
   * Set the selected resistance. The value is clamped and snapped to the nearest
   * increment; the voltage is preserved.
   */
  setResistance(resistance: number): void {
    const next = solve(this.state.voltage, resistance);
    if (next.resistance === this.state.resistance) return;
    this.state = next;
    this.emit();
  }

  /** Nudge the resistance by whole increments (+1 = one step up). */
  stepResistance(steps: number): void {
    this.setResistance(this.state.resistance + steps * RESISTANCE_STEP);
  }

  /**
   * Subscribe to state changes. The listener is invoked immediately with the
   * current state so views can render their initial frame. Returns an
   * unsubscribe function.
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
