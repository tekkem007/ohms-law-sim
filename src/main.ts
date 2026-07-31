/**
 * main.ts — composition root. Wires the pure state store to every view and
 * starts the single animation loop. Each view subscribes to the store, so a
 * slider change fans out to all of them from one source of truth.
 */
import './styles.css';
import { SimulationState } from './state';
import { CircuitRenderer } from './circuit-renderer';
import { GraphRenderer } from './graph-renderer';
import { AnimationController } from './animation-controller';
import { UIController } from './ui-controller';
import { AccessibilityAnnouncer } from './accessibility';

/**
 * Dock breakpoint for the graph drawer. Must match --dock-min /
 * --dock-min-height in styles.css.
 *
 * Declared HERE, above the setup calls below: function declarations hoist but a
 * `const` does not — a module const placed under its first use sits in the
 * temporal dead zone and throws at module init, which silently kills every
 * setup after it.
 */
const DOCK_QUERY = '(min-width: 960px) and (min-height: 560px)';

function mount(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`main: missing mount #${id}`);
  return node;
}

const state = new SimulationState(0);

const circuit = new CircuitRenderer(mount('circuit-mount'));
const graph = new GraphRenderer(mount('graph-mount'));
const announcer = new AccessibilityAnnouncer(mount('sr-status'));

// Views react to state. subscribe() pushes the initial state immediately.
state.subscribe((s) => circuit.update(s));
state.subscribe((s) => graph.update(s));
state.subscribe((s) => announcer.update(s));

// UIController subscribes internally and owns the slider input.
new UIController(document, state);

// One rAF loop drives the conventional-current markers around the loop.
const animation = new AnimationController({
  markersGroup: circuit.markersGroup,
  trackPath: circuit.trackPath,
  getState: () => state.get(),
});
animation.start();

setupGraphDrawer();
setupRotatePrompt();
setupFullscreen();
setupSvgTextScale();

/**
 * Keep SVG label text legible at every size.
 *
 * An SVG scales uniformly, so its in-viewBox text shrinks along with the
 * drawing — 13px labels rendered at ~9px on a 375px phone. This publishes
 * `--svg-k` (= viewBoxWidth / renderedWidth) on each mount; styles.css then asks
 * for `max(designSize, calc(floor * var(--svg-k)))`, which pins the RENDERED
 * size to a floor without hard-coding any breakpoint.
 *
 * A `@container` version of this silently stopped matching once the panel
 * became a flex container, so the labels quietly reverted to unscaled sizes.
 * This form depends only on the measured box.
 */
function setupSvgTextScale(): void {
  const mounts = Array.from(document.querySelectorAll<HTMLElement>('.svg-mount'));
  if (!mounts.length) return;

  /** [label class, design size, minimum RENDERED size]. */
  const LABELS: ReadonlyArray<readonly [string, number, number]> = [
    ['circuit-label', 13, 12],
    ['terminal', 15, 13],
    ['batt-mark', 20, 16],
    ['tick-label', 14, 12],
    ['axis-title', 15, 12.5],
    ['slope-label', 14, 11.5],
    ['coord-label', 15, 12.5],
  ];

  // A generated stylesheet, appended last and keyed on the mount's id, so these
  // rules beat the base `font:` shorthand on BOTH order and specificity. Custom
  // properties were tried first and lost the cascade against that shorthand in
  // this engine even when the variable was correctly set.
  const sheet = document.createElement('style');
  sheet.id = 'svg-text-scale';
  document.head.appendChild(sheet);

  const apply = (): void => {
    const rules: string[] = [];
    for (const mount of mounts) {
      if (!mount.id) continue;
      const svg = mount.querySelector('svg');
      if (!svg) continue;
      const viewBoxWidth = svg.viewBox?.baseVal?.width ?? 0;
      const renderedWidth = svg.getBoundingClientRect().width;
      // A closed drawer reports 0 — skip it; it re-runs when the drawer opens.
      if (!viewBoxWidth || !renderedWidth) continue;

      // rendered = inViewBox x (renderedWidth / viewBoxWidth), so the smallest
      // in-viewBox size that renders at `floor` px is floor x k.
      const k = viewBoxWidth / renderedWidth;
      for (const [cls, design, floor] of LABELS) {
        rules.push(`#${mount.id} .${cls}{font-size:${Math.max(design, floor * k).toFixed(2)}px}`);
      }
    }
    if (rules.length) sheet.textContent = rules.join('');
  };

  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => apply());
    for (const mount of mounts) ro.observe(mount);
  } else {
    window.addEventListener('resize', apply);
  }
  apply();
}

/**
 * Full-screen toggle. Phones have no F11 and their browser chrome eats a lot of
 * a small screen, so this is worth having — but ONLY where it actually works:
 * iOS Safari exposes `requestFullscreen` on <video> and not on ordinary
 * elements, so we feature-detect and leave the button `hidden` rather than
 * shipping a control that does nothing. Those users get
 * `apple-mobile-web-app-capable` instead ("Add to Home Screen").
 *
 * The label/icon are driven by the `fullscreenchange` EVENT, never by our own
 * click, so Escape and system gestures keep the button in sync.
 */
function setupFullscreen(): void {
  const btn = document.getElementById('fullscreen-btn') as HTMLButtonElement | null;
  if (!btn) return;

  type FsRoot = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  type FsDoc = Document & {
    webkitFullscreenEnabled?: boolean;
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  const root = document.documentElement as FsRoot;
  const doc = document as FsDoc;

  const supported =
    Boolean(doc.fullscreenEnabled) ||
    Boolean(doc.webkitFullscreenEnabled) ||
    typeof root.webkitRequestFullscreen === 'function';
  if (!supported) return; // stays hidden — no dead button

  btn.hidden = false;

  const isFullscreen = (): boolean => Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
  const label = btn.querySelector('.fs-label');

  const sync = (): void => {
    const on = isFullscreen();
    btn.setAttribute('aria-pressed', String(on));
    if (label) label.textContent = on ? 'Exit full screen' : 'Full screen';
    btn.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
  };

  btn.addEventListener('click', () => {
    // Both requests reject without user activation, so always catch.
    if (isFullscreen()) {
      void Promise.resolve(document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()).catch(() => {});
    } else {
      void Promise.resolve(root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.()).catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}

/**
 * On a narrow PORTRAIT screen the side-by-side bench is cramped, so we suggest
 * turning the device. It shows at the start of every load in portrait, vanishes
 * by itself the moment the screen becomes landscape, and "Continue anyway"
 * dismisses it until the next load — it never blocks anyone staying in portrait.
 */
function setupRotatePrompt(): void {
  const prompt = document.getElementById('rotate-prompt');
  const dismissBtn = document.getElementById('rotate-dismiss');
  if (!prompt || !dismissBtn) return;

  // Deliberately NOT persisted. A stored dismissal meant one tap of "Continue
  // anyway" hid the prompt for the whole browsing session — including every
  // later reload — so it looked like there was no rotate prompt at all. The
  // flag lives in memory only: it shows once per load in portrait, and
  // dismissing it lasts until the page is reloaded or the device is turned.
  let dismissed = false;

  // Only phones-and-similar in portrait; a narrow desktop window isn't asked to rotate.
  const narrowPortrait = window.matchMedia('(orientation: portrait) and (max-width: 900px)');

  const sync = (): void => {
    prompt.hidden = dismissed || !narrowPortrait.matches;
  };

  dismissBtn.addEventListener('click', () => {
    dismissed = true;
    sync();
  });

  // Turning the device to landscape hides it; turning back to portrait shows it
  // again only if it wasn't dismissed this load.
  narrowPortrait.addEventListener('change', sync);
  sync();
}

/**
 * The graph lives in a panel that slides in from the right. It is a docked,
 * open-by-default side panel on wide screens and a collapsible, modal-style
 * drawer on phones (closed by default; a backdrop tap, the × button, or Escape
 * closes it). The graph keeps updating whether the drawer is open or not.
 */
function setupGraphDrawer(): void {
  const drawer = document.getElementById('graph-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const closeBtn = document.getElementById('graph-close');
  const toggles = Array.from(document.querySelectorAll<HTMLElement>('[data-graph-toggle]'));
  if (!drawer || !backdrop || !closeBtn) return;

  // Must match --dock-min / --dock-min-height in styles.css: below this the
  // drawer overlays (no room for both), at or above it docks beside the content.
  // The HEIGHT half matters — width alone docked the graph on a 1000×447
  // landscape phone, stealing ~340px so the circuit drew smaller at a bigger
  // viewport.
  const wide = window.matchMedia(DOCK_QUERY);
  let open = false;

  const apply = (next: boolean): void => {
    open = next;
    document.body.classList.toggle('graph-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    for (const t of toggles) t.setAttribute('aria-expanded', String(open));
  };

  const close = (): void => apply(false);
  const toggle = (): void => apply(!open);

  for (const t of toggles) t.addEventListener('click', toggle);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) close();
  });

  // Open by default on wide screens, collapsed on phones. Re-apply this default
  // when the viewport crosses the breakpoint (e.g. device rotation).
  apply(wide.matches);
  wide.addEventListener('change', (e) => apply(e.matches));
}
