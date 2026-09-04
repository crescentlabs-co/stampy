/**
 * Enough of a browser to RUN the designer.
 *
 * The design panel is ~1100 lines of JavaScript living inside a template
 * literal. Nothing type-checks it and, until this file, nothing executed it —
 * `test/pages.test.ts` compiles it and greps it for strings. That is how two
 * bugs that destroyed an owner's uploaded stamp shipped green twice: both were
 * about WHEN things happen (an image had not decoded yet; an object was not
 * updated), and no amount of string-matching can see a sequence.
 *
 * Deliberately tiny, and deliberately not jsdom: this project has no build step
 * and a lean toolchain (invariant 12), and a full DOM would be a large
 * dependency to assert two orderings. It supports exactly what the panel
 * touches — measured, not guessed: document, Image, fetch, URL, and a 2D canvas
 * context of 14 methods and 8 properties. When the panel starts using something
 * new, this throws rather than silently returning undefined, so the gap shows up
 * as a failing test instead of a passing one.
 */

/** A recorded canvas call, so a test can ask what was actually drawn. */
export interface DrawCall {
  op: string;
  args: unknown[];
}

class FakeClassList {
  constructor(private el: FakeEl) {}
  add(...names: string[]): void {
    const cur = new Set(this.el.className.split(/\s+/).filter(Boolean));
    for (const n of names) cur.add(n);
    this.el.className = [...cur].join(" ");
  }
  remove(...names: string[]): void {
    const cur = new Set(this.el.className.split(/\s+/).filter(Boolean));
    for (const n of names) cur.delete(n);
    this.el.className = [...cur].join(" ");
  }
  toggle(name: string, on?: boolean): void {
    if (on === undefined ? !this.contains(name) : on) this.add(name);
    else this.remove(name);
  }
  contains(name: string): boolean {
    return this.el.className.split(/\s+/).includes(name);
  }
}

export class FakeEl {
  tag: string;
  attrs: Record<string, string> = {};
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  text = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  classList = new FakeClassList(this);
  /** Handlers the panel assigns; tests fire them to simulate a tap. */
  // Takes the event, because real handlers do — the designer delegates one
  // listener on the preview and reads e.target to find which part was tapped.
  onclick: ((e?: { target?: FakeEl }) => unknown) | null = null;
  onchange: (() => unknown) | null = null;
  oninput: (() => unknown) | null = null;
  files: unknown[] = [];
  /** Mirrors the HTML attribute, so markup that ships hidden reports hidden
   *  before any script has touched it. */
  hidden = false;
  /** Set from markup and read back by the panel — the sign-up field's hint. */
  placeholder = "";
  width = 0;
  height = 0;
  /** Layout geometry. Always 0: nothing here is laid out, and a tab thumb
   *  measuring zero is exactly what a real hidden .seg reports too. */
  offsetWidth = 0;
  offsetLeft = 0;
  scrollWidth = 0;
  clientWidth = 0;
  scrollIntoView(): void {}
  /** Populated for a <canvas>; the log of everything drawn on it. */
  calls: DrawCall[] = [];

  constructor(tag: string) {
    this.tag = tag.toLowerCase();
  }

  get className(): string { return this.attrs.class ?? ""; }
  set className(v: string) { this.attrs.class = v; }
  get value(): string { return this.attrs.value ?? ""; }
  set value(v: string) { this.attrs.value = String(v); }
  get src(): string { return this.attrs.src ?? ""; }
  set src(v: string) { this.attrs.src = String(v); }
  get textContent(): string {
    return this.children.length ? this.children.map((c) => c.textContent).join("") : this.text;
  }
  set textContent(v: string) { this.children = []; this.text = String(v); }
  get isConnected(): boolean { return true; }

  get innerHTML(): string { return this.text; }
  set innerHTML(html: string) {
    this.children = parseHtml(String(html), this);
    this.text = String(html);
  }

  setAttribute(k: string, v: string): void { this.attrs[k] = String(v); }
  getAttribute(k: string): string | null { return this.attrs[k] ?? null; }
  removeAttribute(k: string): void { delete this.attrs[k]; }
  appendChild(child: FakeEl): FakeEl { child.parent = this; this.children.push(child); return child; }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  /** Every listener, by type, so a test can fire the ones with no on* alias. */
  listeners: Record<string, ((e?: unknown) => unknown)[]> = {};
  addEventListener(type: string, fn: (e?: unknown) => unknown): void {
    (this.listeners[type] ||= []).push(fn);
    // The three with an on* twin keep it, so the many tests that call
    // el.onclick() directly still work.
    if (type === "click") this.onclick = fn;
    else if (type === "change") this.onchange = fn;
    else if (type === "input") this.oninput = fn;
  }
  /**
   * Fire a listener that has no on* alias — pointerdown and pointermove are
   * why this exists. Without it the cropper's drag could not be driven, and
   * the maths deciding what a shop's logo looks like on a card was reachable
   * only by reading it.
   */
  fire(type: string, event?: unknown): void {
    for (const fn of [...(this.listeners[type] || [])]) fn(event);
  }
  /** A <canvas>. toDataURL is deterministic so callers can compare payloads. */
  getContext(kind: string): Record<string, unknown> {
    if (kind !== "2d") throw new Error(`harness: unsupported context "${kind}"`);
    return makeCtx(this);
  }
  toDataURL(): string { return "data:image/png;base64,SEFSTkVTUw=="; }

  /**
   * Is this node the given one, or an ancestor of it?
   *
   * What "did the tap land inside me?" is really asking, and the whole of how
   * a popover decides to close. It was missing, so that path had never run
   * under test in either direction.
   */
  contains(node: unknown): boolean {
    for (let n = node as FakeEl | null; n; n = n.parent) if (n === this) return true;
    return false;
  }

  /** Every descendant, self included, in document order. */
  all(): FakeEl[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
  querySelector(sel: string): FakeEl | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  querySelectorAll(sel: string): FakeEl[] {
    const groups = sel.split(",").map((s) => s.trim()).filter(Boolean);
    const hit = this.all().slice(1).filter((el) => groups.some((g) => matches(el, g)));
    return hit;
  }
  /**
   * Self first, then outwards — the real contract, and the reason the designer
   * can delegate one listener on the preview instead of binding six that
   * renderPreview would throw away on the next repaint.
   *
   * Without this the panel's guard (`if (!e.target.closest) return`) made every
   * tap a no-op and the tests passed by doing nothing at all.
   */
  closest(sel: string): FakeEl | null {
    const groups = sel.split(",").map((s) => s.trim()).filter(Boolean);
    for (let node: FakeEl | null = this; node; node = node.parent) {
      if (groups.some((g) => matches(node!, g))) return node;
    }
    return null;
  }
}

/** Selector support: tag, .class, [attr], [attr=value], and a descendant chain. */
function matches(el: FakeEl, sel: string): boolean {
  const parts = sel.trim().split(/\s+/);
  const last = parts[parts.length - 1]!;
  if (!matchesSimple(el, last)) return false;
  // Walk ancestors for any leading parts, right to left.
  let node = el.parent;
  for (let i = parts.length - 2; i >= 0; i--) {
    let found = false;
    while (node) {
      if (matchesSimple(node, parts[i]!)) { found = true; node = node.parent; break; }
      node = node.parent;
    }
    if (!found) return false;
  }
  return true;
}

function matchesSimple(el: FakeEl, sel: string): boolean {
  const re = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/;
  const m = re.exec(sel);
  if (!m) throw new Error(`harness: selector not supported: "${sel}"`);
  const [, tag, classes, attrs] = m;
  if (tag && el.tag !== tag.toLowerCase()) return false;
  for (const cls of (classes ?? "").split(".").filter(Boolean)) {
    if (!el.classList.contains(cls)) return false;
  }
  for (const raw of (attrs ?? "").match(/\[[^\]]+\]/g) ?? []) {
    const body = raw.slice(1, -1);
    const eq = body.indexOf("=");
    if (eq === -1) {
      if (!(body in el.attrs)) return false;
    } else {
      const k = body.slice(0, eq);
      const v = body.slice(eq + 1).replace(/^["']|["']$/g, "");
      if (el.attrs[k] !== v) return false;
    }
  }
  return true;
}

const VOID_TAGS = new Set(["img", "input", "br", "hr", "meta", "link", "source"]);

/** A small forgiving parser — enough for the panel's own markup, nothing more. */
function parseHtml(html: string, parent: FakeEl): FakeEl[] {
  const roots: FakeEl[] = [];
  const stack: FakeEl[] = [];
  const tokens = html.matchAll(/<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g);
  for (const t of tokens) {
    const [raw, closeTag, openTag, attrText, selfClose, textRun] = t;
    if (raw.startsWith("<!--")) continue;
    const top = stack[stack.length - 1];
    if (closeTag) {
      // Pop to the matching open tag; unbalanced markup just closes what it can.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.tag === closeTag.toLowerCase()) { stack.length = i; break; }
      }
    } else if (openTag) {
      const el = new FakeEl(openTag);
      for (const a of (attrText ?? "").matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
        const key = a[1]!;
        el.attrs[key] = a[2] ?? a[3] ?? a[4] ?? "";
        if (key === "hidden") el.hidden = true;
        if (key === "placeholder") el.placeholder = el.attrs[key]!;
        if (key.startsWith("data-")) {
          const camel = key.slice(5).replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
          el.dataset[camel] = el.attrs[key]!;
        }
      }
      if (top) top.appendChild(el); else { el.parent = parent; roots.push(el); }
      if (!selfClose && !VOID_TAGS.has(el.tag)) stack.push(el);
    } else if (textRun && textRun.trim()) {
      if (top) top.text += textRun;
    }
  }
  // A <select> reports the value of whichever <option> is selected, and falls
  // back to the first one — which is what a browser does, and what the designer
  // reads to decide which card kind it is editing. Without this a freshly
  // mounted panel sees an empty kind and hides every rule it has.
  for (const el of roots.flatMap((r) => r.all())) {
    if (el.tag !== "select") continue;
    const options = el.children.filter((c) => c.tag === "option");
    const chosen = options.find((o) => "selected" in o.attrs) ?? options[0];
    if (chosen) el.value = chosen.attrs.value ?? chosen.text.trim();
  }
  return roots;
}

/** A 2D context that records rather than rasterises. */
function makeCtx(canvas: FakeEl): Record<string, unknown> {
  const log = (op: string, ...args: unknown[]) => { canvas.calls.push({ op, args }); };
  const gradient = { addColorStop: () => {} };
  return {
    canvas,
    fillStyle: "", strokeStyle: "", font: "", globalAlpha: 1,
    globalCompositeOperation: "", lineWidth: 1, textAlign: "", textBaseline: "",
    beginPath: () => log("beginPath"),
    closePath: () => log("closePath"),
    moveTo: (...a: unknown[]) => log("moveTo", ...a),
    lineTo: (...a: unknown[]) => log("lineTo", ...a),
    arc: (...a: unknown[]) => log("arc", ...a),
    fill: () => log("fill"),
    stroke: () => log("stroke"),
    fillRect: (...a: unknown[]) => log("fillRect", ...a),
    // The cropper wipes the frame before every repaint, so a missing clearRect
    // threw on the first drag rather than on mount.
    clearRect: (...a: unknown[]) => log("clearRect", ...a),
    fillText: (...a: unknown[]) => log("fillText", ...a),
    drawImage: (...a: unknown[]) => log("drawImage", ...a),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    putImageData: () => log("putImageData"),
    // Mid-grey, half of it transparent. Not arbitrary: the stamp upload refuses
    // anything with no see-through pixels, and a uniformly opaque fake would
    // have every upload test failing for a reason that has nothing to do with
    // what is being tested. The scattered alpha also keeps flatBackdrop from
    // deciding there is a flat backdrop to lift.
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(Math.max(4, w * h * 4));
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 128; data[i + 1] = 128; data[i + 2] = 128;
        data[i + 3] = (i / 4) % 2 ? 255 : 0;
      }
      return { width: w, height: h, data };
    },
  };
}

export interface Harness {
  root: FakeEl;
  /** Every fetch the panel made: [url, init]. */
  requests: { url: string; method: string; body: unknown }[];
  /**
   * Every canvas the panel created. Canvases are made with createElement and
   * never attached, so they are unreachable from the returned node — and the
   * drawing is the whole thing under test.
   */
  canvases: FakeEl[];
  /** Every Image it created, so a test can see what art was requested. */
  images: FakeEl[];
  /** Everything drawn on every canvas, in order. */
  drawn: () => DrawCall[];
  /** Resolves once every Image the panel created has fired onload. */
  settle: () => Promise<void>;
  /** Fire a document-level listener — what a tap outside, or Escape, really is. */
  fireDoc: (type: string, event: unknown) => void;
  globals: Record<string, unknown>;
  /** The stand-in for window.location — `href` is what the panel navigated to. */
  navigated: { href: string };
}

/**
 * Build the globals the panel runs against.
 *
 * `imageSize` decides what every Image reports once loaded — 0 makes a decode
 * fail, which is how a missing stamp icon (404) is simulated.
 */
export function makeHarness(
  opts: {
    /** A number is a square decode; a pair lets a test give a WIDE logo, which
     *  is the only thing that makes the Android square-logo row appear. 0 makes
     *  every decode fail, as a 404 would. */
    imageSize?: number | { w: number; h: number };
    fetchJson?: unknown;
    userAgent?: string;
  } = {},
): Harness {
  const given = opts.imageSize ?? 64;
  const size = typeof given === "number" ? { w: given, h: given } : given;
  const root = new FakeEl("body");
  /** Where the panel sent the browser, if it did. `href` is the whole record. */
  const navigated = { href: "" };
  const requests: Harness["requests"] = [];
  const canvases: FakeEl[] = [];
  const images: FakeEl[] = [];
  const pending: Promise<void>[] = [];

  class FakeImage extends FakeEl {
    naturalWidth = 0;
    naturalHeight = 0;
    complete = false;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    // Registers here, not in createElement: the panel makes its long-lived
    // images with `new Image()`, and those are exactly the ones under test.
    constructor() { super("img"); images.push(this); }
    override get src(): string { return this.attrs.src ?? ""; }
    override set src(v: string) {
      this.attrs.src = String(v);
      // Async on purpose — a real decode never completes in the same tick, and
      // that gap is precisely the bug this harness exists to catch.
      pending.push(new Promise<void>((resolve) => {
        setTimeout(() => {
          if (size.w > 0 && size.h > 0) {
            // width/height as well as natural*: a real decoded image has both,
            // and the panel reads the plain pair when it checks an SVG actually
            // carries a size.
            this.naturalWidth = size.w; this.naturalHeight = size.h;
            this.width = size.w; this.height = size.h;
            this.complete = true;
            this.onload?.();
          } else {
            this.onerror?.();
          }
          resolve();
        }, 0);
      }));
    }
  }

  const newEl = (tag: string): FakeEl => {
    if (tag === "img") return new FakeImage();
    const el = new FakeEl(tag);
    if (tag === "canvas") canvases.push(el);
    return el;
  };

  const docListeners: Record<string, ((e: unknown) => void)[]> = {};
  const document = {
    createElement: newEl,
    // A text node is an element with only text as far as this harness is
    // concerned — enough for appendChild and textContent, which is all the
    // panel does with one ("Custom…" beside a colour swatch).
    createTextNode: (text: string) => {
      const el = new FakeEl("#text");
      el.text = String(text);
      return el;
    },
    querySelector: (sel: string) => root.querySelector(sel),
    querySelectorAll: (sel: string) => root.querySelectorAll(sel),
    /**
     * Document-level listeners, kept so a test can actually fire one.
     *
     * The popover closes on a tap anywhere outside it and on Escape, and both
     * are registered here rather than on an element — without these it threw
     * the moment it opened. Stored rather than swallowed so a test can dispatch
     * a click outside and check the menu really closes.
     */
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      (docListeners[type] ||= []).push(fn);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn);
    },
    body: root,
  };

  const globals: Record<string, unknown> = {
    document,
    Image: FakeImage,
    URL: { createObjectURL: () => "blob:harness", revokeObjectURL: () => {} },
    fetch: async (url: string, init: { method?: string; body?: string } = {}) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      return {
        status: 200,
        ok: true,
        json: async () => opts.fetchJson ?? { ok: true },
        text: async () => JSON.stringify(opts.fetchJson ?? { ok: true }),
      };
    },
    setTimeout,
    // The panel defers its first showSurface by a frame, because in the real
    // dashboard it is still a detached node when it runs and a detached node
    // measures zero. Run it straight through here: this DOM has no layout to
    // wait for, and every test below asserts on the mounted result.
    requestAnimationFrame: (cb: () => void) => { cb(); return 0; },
    console,
    // SEG_JS reseats every tab thumb on resize and once the fonts land. Neither
    // happens here, but both have to be addressable or the panel throws at mount.
    window: { addEventListener: () => {}, removeEventListener: () => {} },
    // The test-card buttons branch on these: a phone is sent straight to its
    // wallet, a laptop is shown a QR instead. A desktop UA is the default here
    // because that is where the designer is actually open.
    navigator: { userAgent: opts.userAgent ?? "Mozilla/5.0 (Macintosh)" },
    location: navigated,
  };

  const settle = async (): Promise<void> => {
    // Drain repeatedly: an onload handler frequently starts the next load.
    for (let i = 0; i < 12; i++) {
      const batch = pending.splice(0);
      await Promise.all(batch);
      await new Promise((r) => setTimeout(r, 0));
      if (!pending.length) break;
    }
  };

  const drawn = (): DrawCall[] => canvases.flatMap((cv) => cv.calls);
  /** Fire a document-level listener — what a tap outside, or Escape, really is. */
  const fireDoc = (type: string, event: unknown): void => {
    for (const fn of [...(docListeners[type] || [])]) fn(event);
  };

  return { root, requests, canvases, images, drawn, settle, globals, navigated, fireDoc };
}
