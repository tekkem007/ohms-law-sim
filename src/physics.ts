/**
 * physics.ts — the pure, framework-agnostic simulation model.
 *
 * Explicitly declared model: an IDEAL, STEADY-STATE, DC lumped circuit.
 *   - One ideal adjustable DC voltage source (no internal resistance)
 *   - One ideal ohmic load, selectable in 5 Ω steps (no thermal dependence:
 *     choosing a different resistance means swapping in a different resistor,
 *     NOT a resistor whose value drifts as it heats)
 *   - Ideal wires (zero resistance), no capacitance/inductance
 *   - No transient switching behaviour; quasi-static after each update
 *
 * Voltage and resistance are the two INDEPENDENT, user-controlled quantities.
 * Current and power are always DERIVED — never independently editable.
 *   I = V / R      (Ohm's law)
 *   P = V × I      (electrical power)
 *
 * This module has NO knowledge of the DOM or rendering. Everything numeric in
 * the app is derived here so there is a single source of physical truth.
 */

/** Permitted voltage range for the adjustable source. */
export const VOLTAGE_MIN = 0;
export const VOLTAGE_MAX = 20;

/**
 * The ohmic load is selectable in fixed increments. It remains an IDEAL ohmic
 * resistance for any chosen value: constant, with no thermal dependence — the
 * user picks which resistor is in the circuit, they do not change a resistor's
 * value by heating it.
 */
export const RESISTANCE_MIN = 5;
export const RESISTANCE_MAX = 50;
export const RESISTANCE_STEP = 5;
export const RESISTANCE_DEFAULT = 10;

/**
 * Envelope maxima over the WHOLE input domain, used only for normalisation and
 * for fixed graph axes. Greatest current occurs at max voltage with the
 * smallest resistance.
 */
export const CURRENT_MAX = VOLTAGE_MAX / RESISTANCE_MIN; // 4 A
export const POWER_MAX = VOLTAGE_MAX * CURRENT_MAX; //       80 W

/**
 * Floating-point tolerance for invariant checks. Never compare full-precision
 * physics values with `===`; compare `abs(a - b) < NUMERICAL_TOLERANCE`.
 */
export const NUMERICAL_TOLERANCE = 1e-9;

/**
 * A fully-consistent snapshot of the circuit. `voltage` and `resistance` are the
 * independent inputs; `current` and `power` are always derived from them and can
 * never be set directly.
 */
export interface SimState {
  /** V — volts. Independent input. */
  readonly voltage: number;
  /** R — ohms. Independent input, chosen in fixed steps. */
  readonly resistance: number;
  /** I — amperes. Derived: V / R. */
  readonly current: number;
  /** P — watts. Derived: V × I. */
  readonly power: number;
}

/** True only for real, finite numbers (rejects NaN and ±Infinity). */
export function isFiniteNumber(x: number): boolean {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Clamp any input (including NaN) into the permitted voltage range. */
export function clampVoltage(v: number): number {
  if (Number.isNaN(v)) return VOLTAGE_MIN;
  if (v < VOLTAGE_MIN) return VOLTAGE_MIN; // also catches -Infinity
  if (v > VOLTAGE_MAX) return VOLTAGE_MAX; // also catches +Infinity
  return v;
}

/**
 * Clamp into the permitted resistance range AND snap to the nearest increment,
 * so the value is always one of the discrete resistors the user can select.
 * NaN falls back to the default rather than an endpoint.
 */
export function clampResistance(r: number): number {
  if (Number.isNaN(r)) return RESISTANCE_DEFAULT;
  if (r <= RESISTANCE_MIN) return RESISTANCE_MIN; // also catches -Infinity
  if (r >= RESISTANCE_MAX) return RESISTANCE_MAX; // also catches +Infinity
  const steps = Math.round((r - RESISTANCE_MIN) / RESISTANCE_STEP);
  const snapped = RESISTANCE_MIN + steps * RESISTANCE_STEP;
  return Math.min(RESISTANCE_MAX, Math.max(RESISTANCE_MIN, snapped));
}

/** Ohm's law: I = V / R. */
export function currentFromVoltage(voltage: number, resistance: number): number {
  return voltage / resistance;
}

/** Electrical power: P = V × I. */
export function powerFromVI(voltage: number, current: number): number {
  return voltage * current;
}

/**
 * Build a fully-consistent state from the independent inputs. Both are clamped
 * first, so the returned state is always valid.
 *
 * At V = 0: I = 0 and P = 0. We deliberately never evaluate R = V / I here
 * (that would be 0 / 0, undefined); R is the value the user selected.
 */
export function solve(voltageInput: number, resistanceInput: number = RESISTANCE_DEFAULT): SimState {
  const voltage = clampVoltage(voltageInput);
  const resistance = clampResistance(resistanceInput);
  const current = currentFromVoltage(voltage, resistance);
  const power = powerFromVI(voltage, current);
  return { voltage, resistance, current, power };
}

/** normalisedCurrent = I / Imax, clamped to [0, 1]. */
export function normalisedCurrent(current: number): number {
  if (!isFiniteNumber(current)) return 0;
  const n = current / CURRENT_MAX;
  return Math.min(1, Math.max(0, n));
}

/**
 * powerRatio = P / Pmax, clamped to [0, 1].
 *
 * This drives the bulb's relative brightness. Power is the right quantity now
 * that resistance is adjustable: at a fixed voltage, a LARGER resistance draws
 * less current and dissipates less power, so the bulb dims — which is exactly
 * what the resistance control should demonstrate. (Brightness ∝ voltage alone
 * would wrongly ignore the resistance entirely.)
 *
 * It remains a RELATIVE indicator, not a photometric or temperature model.
 */
export function powerRatio(power: number): number {
  if (!isFiniteNumber(power)) return 0;
  const r = power / POWER_MAX;
  return Math.min(1, Math.max(0, r));
}

/** normalisedVoltage = V / Vmax, clamped to [0, 1]. */
export function normalisedVoltage(voltage: number): number {
  if (!isFiniteNumber(voltage)) return 0;
  const n = voltage / VOLTAGE_MAX;
  return Math.min(1, Math.max(0, n));
}

/** Result of validating all physical invariants for a state. */
export interface ConsistencyReport {
  ok: boolean;
  /** |V − I·R| — Ohm's law residual. */
  ohm: number;
  /** |P − V·I| — power definition residual. */
  joule: number;
  /** |P − I²·R| — equivalent power expression residual. */
  iSquaredR: number;
  /** |P − V²/R| — equivalent power expression residual. */
  vSquaredOverR: number;
}

/**
 * Verify every invariant the model must satisfy. The three power expressions
 * (V·I, I²·R, V²/R) must agree with the stored power within tolerance.
 */
export function checkConsistency(s: SimState, tol: number = NUMERICAL_TOLERANCE): ConsistencyReport {
  const ohm = Math.abs(s.voltage - s.current * s.resistance);
  const joule = Math.abs(s.power - s.voltage * s.current);
  const iSquaredR = Math.abs(s.power - s.current * s.current * s.resistance);
  const vSquaredOverR = Math.abs(s.power - (s.voltage * s.voltage) / s.resistance);
  return {
    ok: ohm < tol && joule < tol && iSquaredR < tol && vSquaredOverR < tol,
    ohm,
    joule,
    iSquaredR,
    vSquaredOverR,
  };
}
