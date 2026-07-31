# Ohm's Law — Ideal DC Circuit

An interactive, scientifically-honest Ohm's law simulator. Voltage is the only
input; current and power follow from an **ideal, steady-state DC lumped-circuit
model** with a fixed resistor.

```text
R = 10 Ω          (fixed, ohmic, no thermal dependence)
0 V ≤ V ≤ 20 V    (the only independent quantity)
I = V / R
P = V × I
```

Built with **Vite + TypeScript + inline SVG**. No Phaser, no GSAP, no runtime
dependencies.

## Mobile & the graph drawer

The layout is a single centred column optimised for phones (touch-sized slider,
safe-area insets, no horizontal scroll down to 320px). The voltage–current graph
lives in a **collapsible panel that slides in from the right**:

- On phones it is **closed by default** — tap the edge handle, the header
  **V–I Graph** button, or the graph icon to slide it in over a dimming backdrop;
  tap the backdrop, the **×**, or press **Escape** to close.
- On wide screens it is **docked open** by default and pushes the content left so
  it never overlaps the controls; the same button collapses it.

The graph keeps updating live whether the drawer is open or closed.

## Model assumptions

These are the full declared assumptions. The in-app disclosure panel was removed
at the maintainer's request, so **this section is now the canonical record** — the
short honesty captions under the circuit remain in the UI.

- Ideal, steady-state DC lumped-circuit model (an educational idealisation).
- One ideal adjustable DC voltage source — no internal resistance.
- One ideal ohmic load, drawn as a light bulb, selectable from **5 Ω to 50 Ω** in
  5 Ω steps.
- Choosing a resistance means **swapping in a different ideal resistor** — *not* a
  resistor whose value drifts with temperature. Each value is perfectly ohmic and
  constant. (A real filament's resistance rises steeply as it heats; this model
  excludes that.)
- Ideal wires: zero resistance, no capacitance, no inductance.
- No transient switching; quasi-static operation after each change.
- Marker speed is a normalised visual encoding (I / I<sub>max</sub>), **not** a
  literal drift velocity, and the markers represent **conventional current**, not
  electrons.
- The bulb's glow tracks power (P / P<sub>max</sub>) as a **relative** indicator —
  not a photometric or temperature model.
- Graph axes are deliberately fixed, so changing the resistance visibly changes
  the line's slope.
- This is an idealised model, not a microscopic simulation of a physical circuit.

## Scripts

```bash
npm install      # install dev dependencies
npm run dev      # start the Vite dev server
npm run build    # type-check (tsc --noEmit) then production build → dist/
npm run preview  # serve the production build
npm test         # run the Vitest unit tests
```

## Architecture

The physics is a pure module; everything renders from one central state, so the
numeric cards, equations, circuit labels, graph point, and accessibility text
can never disagree.

| File | Responsibility |
| --- | --- |
| `src/physics.ts` | Pure model: `I = V/R`, `P = V·I`, clamping, normalisation, invariant checks. No DOM. |
| `src/state.ts` | Central store (single source of truth); observer pattern; voltage is the only setter. |
| `src/circuit-renderer.ts` | Inline SVG closed loop: source ±, resistor, conventional-current arrow, polarity, labels, power glow, marker track. |
| `src/graph-renderer.ts` | Inline SVG V-vs-I graph; theoretical line `V = R·I` drawn from the equation; active point on exact values. |
| `src/animation-controller.ts` | One `requestAnimationFrame` loop moving conventional-current markers; speed ∝ `I/Imax`; pauses when hidden; reduced-motion aware. |
| `src/ui-controller.ts` | Slider `input` binding, numeric cards, equation display, NaN-safe formatters. |
| `src/accessibility.ts` | Live `aria-live` description of the operating point. |
| `src/styles.css` | Responsive (down to 320px), light/dark, reduced-motion, `backdrop-filter` fallback. |

## Physics honesty notes

- The moving markers are **conventional current** (a symbolic encoding), not
  electrons and not a literal drift velocity: `speed = (I/Imax) × maxSpeed`.
- The resistor glow is a **relative power indicator** (`P/Pmax`), not a
  temperature model; resistance never changes in response to it.
- At `V = 0`, `R = V/I` (0/0) is never evaluated — the fixed resistance is shown.
- The graph point is placed from full-precision internal values and always lies
  on the theoretical line; values are never eased toward their result.

## Tests

`npm test` covers the verification table (`V = 0, 5, 10, 15, 20`), all four
consistency relations (`V≈IR`, `P≈VI`, `P≈I²R`, `P≈V²/R`), clamping, NaN/Infinity
guards, the graph point lying on `V = R·I`, marker speed reaching zero at zero
current, the reduced-motion decision, and single-column layout at narrow widths.
