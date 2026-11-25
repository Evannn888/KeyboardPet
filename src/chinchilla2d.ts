import {
  BELLY_PATH,
  BELLY_START,
  BODY_H,
  BODY_PATH,
  BODY_START,
  CHIN,
  CUFF,
  EAR_FRECKLES,
  EAR_INNER,
  EAR_PATH,
  EAR_ROOT,
  EAR_START,
  FACE_H,
  IDLE_PAW,
  TAIL_CORE,
  TAIL_INNER,
  TAIL_PUFFS,
  TAIL_TAP_SCALE,
  WHISKERS,
  type Cubic,
} from './chinchillaStyle';

export interface Pt {
  x: number;
  y: number;
}

export interface ChinchillaPaw2D {
  side: -1 | 1;
  x: number;
  y: number;
  squash: number;
  scale: number;
  /** Turn of the toes: 0 = down, positive = inwards, PI = up (covering the eyes). */
  rot: number;
  /** Opacity of the contact shadow on the keys. */
  shadow: number;
  /** 0..1 while the arm is raised to the face: the elbow stays in. */
  lift: number;
  /** 0..1 idle: the arm is tucked in, short and stubby. */
  idle: number;
  /** 0..1 the paw rests against the chest and shades it. */
  chest: number;
}

/** Everything the 2D engine animates, resolved into logical canvas space. */
export interface ChinchillaPose2D {
  /** Body axis at height h above the seat. */
  spine: (h: number) => Pt;
  tilt: number;
  /** Horizontal face parallax in px. */
  turn: number;
  /** -1..1 gaze. */
  lookX: number;
  lookY: number;
  blink: number;
  sleep: number;
  privacy: number;
  squint: number;
  curious: number;
  cross: number;
  typing: number;
  earPerk: number;
  earTwitchL: number;
  earTwitchR: number;
  elapsed: number;
  /** Top edge of the keyboard. */
  deskTop: number;
  /**
   * `stretch` 0..1 is how far the cloud has swung round, past the flank on that `side`, to press a key at
   * `end`; its middle stays this side of `limit`, inside the window.
   */
  tail: { end: Pt; stretch: number; squash: number; sway: number; side: -1 | 1; limit: number };
  paws: ChinchillaPaw2D[];
}

type Ctx = CanvasRenderingContext2D;

const INK = 2.5;
const BORDER = 5.6;
/** Half-width of the tail's stalk. */
const STALK = 10.5;
const STALK_STEPS = 90;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

type Map2 = (x: number, y: number) => Pt;

/** Trace a cubic chain, optionally closed. Points go through `map`. */
function traceCubics(ctx: Ctx, start: readonly [number, number], segs: readonly Cubic[], map: Map2, close = true): void {
  ctx.beginPath();
  const s = map(start[0], start[1]);
  ctx.moveTo(s.x, s.y);
  for (const [a, b, c] of segs) {
    const p = map(a[0], a[1]);
    const q = map(b[0], b[1]);
    const r = map(c[0], c[1]);
    ctx.bezierCurveTo(p.x, p.y, q.x, q.y, r.x, r.y);
  }
  if (close) ctx.closePath();
}

/** Right half + mirrored left half as one closed chain. */
function mirroredChain(start: readonly [number, number], segs: readonly Cubic[]): Cubic[] {
  const pts: Array<readonly [number, number]> = [start, ...segs.map((s) => s[2])];
  const left: Cubic[] = [];
  const seat = pts[pts.length - 1];
  const third = (k: number): readonly [number, number] => [lerp(seat[0], -seat[0], k), seat[1]];
  left.push([third(1 / 3), third(2 / 3), [-seat[0], seat[1]]]);
  for (let i = segs.length - 1; i >= 0; i--) {
    const [a, b] = segs[i];
    const to = pts[i];
    left.push([[-b[0], b[1]], [-a[0], a[1]], [-to[0], to[1]]]);
  }
  return [...segs, ...left];
}
const BODY_CHAIN = mirroredChain(BODY_START, BODY_PATH);

/** Sample a cubic chain into a polyline (used to build the 3D ear). */
export function sampleCubics(start: readonly [number, number], segs: readonly Cubic[], per: number): Pt[] {
  const out: Pt[] = [];
  let p = start;
  for (const [a, b, c] of segs) {
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const m = 1 - t;
      out.push({
        x: m * m * m * p[0] + 3 * m * m * t * a[0] + 3 * m * t * t * b[0] + t * t * t * c[0],
        y: m * m * m * p[1] + 3 * m * m * t * a[1] + 3 * m * t * t * b[1] + t * t * t * c[1],
      });
    }
    p = c;
  }
  return out;
}

/** Body outline as points, for finding its flank. */
const BODY_POINTS: readonly Pt[] = sampleCubics(BODY_START, BODY_CHAIN, 8);

// ---- markings shared with the 3D model (painted there into textures) ----

/** Scalloped belly fluff; `at` maps body space (x, h) to the canvas. */
export function paintBelly(ctx: Ctx, at: Map2): void {
  traceCubics(ctx, BELLY_START, BELLY_PATH, at);
  ctx.fillStyle = CHIN.cream;
  ctx.fill();
}

let chinShade: HTMLCanvasElement | null = null;

/** Faint fold under the cheeks in face space, so the face reads as a ball resting on the body. */
export function paintChinShade(ctx: Ctx): void {
  if (!chinShade) {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 100;
    const g = c.getContext('2d')!;
    g.save();
    g.translate(120, -6);
    g.scale(1, 0.62);
    const ring = g.createRadialGradient(0, 0, 58, 0, 0, 122);
    ring.addColorStop(0, 'rgba(146, 120, 101, 0)');
    ring.addColorStop(0.52, 'rgba(146, 120, 101, 0.14)');
    ring.addColorStop(1, 'rgba(146, 120, 101, 0)');
    g.fillStyle = ring;
    g.fillRect(-120, -20, 240, 200);
    g.restore();
    // Fade out towards the sides, where the outline already separates head and body.
    const fade = g.createLinearGradient(0, 14, 0, 46);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 1)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = fade;
    g.fillRect(0, 0, 240, 100);
    const sides = g.createLinearGradient(16, 0, 224, 0);
    sides.addColorStop(0, 'rgba(0, 0, 0, 0)');
    sides.addColorStop(0.3, 'rgba(0, 0, 0, 1)');
    sides.addColorStop(0.7, 'rgba(0, 0, 0, 1)');
    sides.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = sides;
    g.fillRect(0, 0, 240, 100);
    chinShade = c;
  }
  ctx.drawImage(chinShade, -120, 0);
}

export interface FaceMarkingState {
  turn: number;
  curious: number;
  cross: number;
  squint: number;
}

/** Smoky cap, muzzle, brow dots and blush in face space. */
export function paintFaceMarkings(ctx: Ctx, p: FaceMarkingState): void {
  const tn = p.turn;
  ctx.fillStyle = CHIN.cap;
  ctx.beginPath();
  ctx.moveTo(-130, -112);
  ctx.lineTo(130, -112);
  ctx.lineTo(124, 2);
  ctx.bezierCurveTo(100 + tn * 0.4, -40, 68 + tn * 0.7, -55, 41 + tn * 0.9, -44);
  ctx.bezierCurveTo(22 + tn, -36, 8 + tn, -29, tn, -16);
  ctx.bezierCurveTo(-8 + tn, -29, -22 + tn, -36, -41 + tn * 0.9, -44);
  ctx.bezierCurveTo(-68 + tn * 0.7, -55, -100 + tn * 0.4, -40, -124, 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = CHIN.cream;
  ctx.beginPath();
  ctx.arc(tn - 12, 19.5, 14.6, 0, Math.PI * 2);
  ctx.arc(tn + 12, 19.5, 14.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(tn * 0.95, 26.5, 16, 10.5, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(
      s * (37 - p.cross * 3) + tn * 0.95,
      -27 - p.curious * 3 + p.cross * 5,
      7.6,
      5 - p.cross * 0.8,
      s * lerp(0.14, -0.42, p.cross),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 65 + tn * 0.85, 19.5);
    ctx.scale(1, 0.7);
    const r = 18 + p.squint * 3;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const a = 0.66 + p.squint * 0.24;
    g.addColorStop(0, `rgba(244, 148, 140, ${a.toFixed(3)})`);
    g.addColorStop(0.5, `rgba(244, 148, 140, ${(a * 0.55).toFixed(3)})`);
    g.addColorStop(1, 'rgba(244, 148, 140, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Pink skin, root fluff and freckles of one inner ear, in ear space; the caller clips. */
export function paintEarSkin(ctx: Ctx, side: -1 | 1): void {
  const g = ctx.createLinearGradient(0, -58, 0, 14);
  g.addColorStop(0, CHIN.earTip);
  g.addColorStop(1, CHIN.earRoot);
  ctx.fillStyle = g;
  ctx.fillRect(-60, -80, 120, 120);
  ctx.fillStyle = CHIN.earFluff;
  ctx.beginPath();
  ctx.moveTo(-28, -2);
  ctx.quadraticCurveTo(-17, -15, -10, -5);
  ctx.quadraticCurveTo(-4, -18, 3, -6);
  ctx.quadraticCurveTo(9, -16, 14, -5);
  ctx.quadraticCurveTo(21, -11, 30, 0);
  ctx.lineTo(30, 34);
  ctx.lineTo(-28, 34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = CHIN.freckle;
  for (const [x, y, rx, ry, rot] of EAR_FRECKLES[side < 0 ? 'left' : 'right']) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Plump heart around the origin, about `2r` wide. */
function traceHeart(ctx: Ctx, r: number): void {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.95);
  ctx.bezierCurveTo(-r * 1.25, r * 0.2, -r * 1.2, -r * 0.85, -r * 0.5, -r * 0.82);
  ctx.bezierCurveTo(-r * 0.2, -r * 0.82, 0, -r * 0.62, 0, -r * 0.42);
  ctx.bezierCurveTo(0, -r * 0.62, r * 0.2, -r * 0.82, r * 0.5, -r * 0.82);
  ctx.bezierCurveTo(r * 1.2, -r * 0.85, r * 1.25, r * 0.2, 0, r * 0.95);
  ctx.closePath();
}

/** Three-toed paw around its centre, toes down, open at the wrist, where it runs on straight into the sleeve. */
const PAW_START: readonly [number, number] = [-17.4, -15];
const PAW_PATH: readonly Cubic[] = [
  [[-17.4, -9], [-20.2, -5], [-20.2, 2]],
  [[-20.2, 12.4], [-11.4, 18.4], [-6.7, 14.4]],
  [[-4.7, 20.2], [4.7, 20.2], [6.7, 14.4]],
  [[11.4, 18.4], [20.2, 12.4], [20.2, 2]],
  [[20.2, -5], [17.4, -9], [17.4, -15]],
];
const PAW_POINTS: readonly Pt[] = [...sampleCubics(PAW_START, PAW_PATH, 9), { x: 17.4, y: -15 }];
/**
 * Half-width of the sleeve at the shoulder and wrist, how far the wrist sits from the paw's centre, and the
 * length of the straight stub an idle arm is.
 */
const SLEEVE = { shoulder: 18.5, wrist: 17.4, reach: 15, stub: 30, steps: 36 } as const;

interface ArmShape {
  /** Sleeve edges from shoulder to wrist. */
  left: Pt[];
  right: Pt[];
  /** Mitten from left wrist to right wrist. */
  paw: Pt[];
  /** Cuff bulge between the wrists. */
  cuff: Pt;
  angle: number;
  /** Which sleeve edge runs round the elbow: negative = left. */
  elbow: number;
  /** Step from which each edge runs freely: a tightly bent sleeve folds over near the shoulder. */
  freeL: number;
  freeR: number;
}

export class Chinchilla2D {
  // ---- geometry ----

  private facePoint(p: ChinchillaPose2D): Pt {
    return p.spine(FACE_H);
  }

  /** Body space (x, h) to canvas, with the rock and head tilt applied. */
  private bodyAt(p: ChinchillaPose2D, x: number, h: number): Pt {
    const c = p.spine(h);
    const k = ease(74, 104, h);
    if (k <= 0) return { x: c.x + x, y: c.y };
    const f = this.facePoint(p);
    const dx = c.x + x - f.x;
    const dy = c.y - f.y;
    const cos = Math.cos(p.tilt * k);
    const sin = Math.sin(p.tilt * k);
    return { x: f.x + dx * cos - dy * sin, y: f.y + dx * sin + dy * cos };
  }

  private furGradient(ctx: Ctx, p: ChinchillaPose2D): CanvasGradient {
    const g = ctx.createLinearGradient(0, p.spine(BODY_H + 16).y, 0, p.spine(0).y);
    g.addColorStop(0, CHIN.furTop);
    g.addColorStop(0.5, CHIN.fur);
    g.addColorStop(1, CHIN.furLow);
    return g;
  }

  private traceBody(ctx: Ctx, p: ChinchillaPose2D): void {
    traceCubics(ctx, BODY_START, BODY_CHAIN, (x, h) => this.bodyAt(p, x, h));
  }

  private withFace(ctx: Ctx, p: ChinchillaPose2D, fn: () => void): void {
    const f = this.facePoint(p);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(p.tilt);
    fn();
    ctx.restore();
  }

  /** Ear space; the left ear is the mirrored right one. */
  private withEar(ctx: Ctx, p: ChinchillaPose2D, s: -1 | 1, fn: () => void): void {
    const droop = Math.max(0, -p.earPerk);
    const twitch = s < 0 ? p.earTwitchL : p.earTwitchR;
    ctx.save();
    ctx.translate(p.turn * 0.25, droop * 9);
    ctx.scale(s, 1);
    ctx.translate(EAR_ROOT.x + droop * 8, EAR_ROOT.y);
    ctx.rotate(EAR_ROOT.lean + droop * 1.15 - Math.max(0, p.earPerk) * 0.9 - twitch);
    fn();
    ctx.restore();
  }

  private traceEar(ctx: Ctx, scale = 1): void {
    traceCubics(ctx, EAR_START, EAR_PATH, (x, y) => ({ x: x * scale, y: y * scale - (scale < 1 ? 1 : 0) }));
  }

  /**
   * Cloud tail. To press a key the whole cloud swings round the outside of the body on a stalk; for keys on
   * the left it first crosses over behind the body.
   */
  private tail(p: ChinchillaPose2D): { puffs: Array<{ x: number; y: number; r: number }>; at: Pt; stalk: Pt[]; out: boolean; front: boolean } {
    const { end, stretch, squash, sway, side: s, limit } = p.tail;
    const root = p.spine(34);
    const rest = (px: number, ph: number): Pt => {
      const x = p.spine(ph * 0.5).x + px - (root.x + 92);
      const y = 34 - ph;
      const cos = Math.cos(sway);
      const sin = Math.sin(sway);
      return { x: root.x + 92 + x * cos - y * sin, y: root.y + x * sin + y * cos - p.sleep * ph * 0.16 };
    };
    const go = clamp01(stretch);
    const core = rest(TAIL_CORE[0], TAIL_CORE[1]);
    const shrink = lerp(1, TAIL_TAP_SCALE, ease(0, s > 0 ? 0.6 : 0.3, go));
    const flank = root.x + s * 124;
    // How far round the flank it is; crossing over behind the body takes the first half of the way.
    const round = s > 0 ? go : clamp01(go * 2 - 1);
    let at = core;
    if (go > 0.001) {
      const m = 1 - round;
      const p0 = s > 0 ? core : { x: lerp(core.x, flank - 46, ease(0, 0.5, go)), y: core.y };
      const p1 = { x: flank + s * 50, y: core.y - 46 };
      const p2 = { x: s * Math.max(s * end.x + 14, s * flank - 6), y: end.y - 62 };
      const p3 = { x: s * Math.min(s * end.x, s * limit), y: end.y - 6 };
      at = {
        x: m * m * m * p0.x + 3 * m * m * round * p1.x + 3 * m * round * round * p2.x + round * round * round * p3.x,
        y: m * m * m * p0.y + 3 * m * m * round * p1.y + 3 * m * round * round * p2.y + round * round * round * p3.y,
      };
    }
    const turn = 0.9 * ease(0.1, 1, go);
    // Behind the body it turns over, so that it lands on either side with the same shape.
    const mirror = s > 0 ? 1 : lerp(1, -1, ease(0.1, 0.5, go));
    const gather = ease(0.05, 0.5, go);
    const flat = 1 - squash * 0.14 * go;
    const puffs = TAIL_PUFFS.map(([px, ph, pr], i) => {
      const q = rest(px, ph);
      // On the stalk the puffs towards the hip draw in, leaving a round pompon.
      const keep = shrink * (i < TAIL_INNER ? 1 - gather : 1);
      const dx = (q.x - core.x) * keep;
      const dy = (q.y - core.y) * keep;
      return {
        x: at.x + (dx * Math.cos(turn) - dy * Math.sin(turn)) * mirror,
        y: at.y + (dx * Math.sin(turn) + dy * Math.cos(turn)) * flat,
        r: pr * shrink,
      };
    });
    const stalk: Pt[] = [];
    const out = go > 0.02;
    if (out) {
      // Out from the hip, up and over, and down onto the key.
      const a = { x: root.x + s * 84, y: root.y };
      const c = { x: s * Math.max(s * at.x + 12, s * lerp(at.x, flank + s * 26, round)), y: at.y - 40 * round };
      const b = { x: lerp(at.x, flank + s * 38, ease(0, 0.5, round)), y: Math.min(root.y - 16, c.y - 14 * round) };
      for (let i = 0; i <= STALK_STEPS; i++) {
        const u = i / STALK_STEPS;
        const m = 1 - u;
        stalk.push({
          x: m * m * m * a.x + 3 * m * m * u * b.x + 3 * m * u * u * c.x + u * u * u * at.x,
          y: m * m * m * a.y + 3 * m * m * u * b.y + 3 * m * u * u * c.y + u * u * u * at.y,
        });
      }
    }
    return { puffs, at, stalk, out, front: go > (s > 0 ? 0.4 : 0.55) };
  }

  /** Sleeve and mitten as one outline, from the flank to the toes. */
  private arm(p: ChinchillaPose2D, paw: ChinchillaPaw2D): ArmShape {
    // The shoulder slides out to the flank when the arm has to reach sideways.
    const out = ease(0, 80, (paw.x - p.spine(54).x) * paw.side - 62);
    const root = this.bodyAt(p, paw.side * lerp(66, 87, out), lerp(66, 56, out));
    const along = Math.atan2(root.x - paw.x, Math.max(1, paw.y - root.y));
    const free = 1 - clamp01(Math.abs(paw.rot) * 2);
    const angle =
      paw.rot * paw.side + Math.max(-1.1, Math.min(1.1, along)) * 0.6 * free * (1 - paw.idle) * ease(0.1, 0.6, Math.abs(along));
    const dir = { x: -Math.sin(angle), y: Math.cos(angle) };
    const k = paw.scale;
    const wrist = { x: paw.x - dir.x * SLEEVE.reach * k, y: paw.y - dir.y * SLEEVE.reach * k };
    // Idle, it is a short stub that comes round from the side and runs straight into the paw.
    const turn = angle + paw.side * IDLE_PAW.bend;
    const from = { x: -Math.sin(turn), y: Math.cos(turn) };
    const sh = {
      x: lerp(root.x, wrist.x - (dir.x + from.x) * 0.5 * SLEEVE.stub, paw.idle),
      y: lerp(root.y, wrist.y - (dir.y + from.y) * 0.5 * SLEEVE.stub, paw.idle),
    };
    const len = Math.max(1, Math.hypot(wrist.x - sh.x, wrist.y - sh.y));

    // Elbows hang out and down; a reaching arm runs straight.
    const bow = len * lerp(0.34, 0.1, out) * (1 - paw.lift);
    const b = {
      x: sh.x + lerp(paw.side * bow, from.x * len * 0.38, paw.idle),
      y: sh.y + lerp(len * lerp(0.3, 0.14, out), from.y * len * 0.38, paw.idle),
    };
    const c = { x: wrist.x - dir.x * len * 0.4, y: wrist.y - dir.y * len * 0.4 };
    const left: Pt[] = [];
    const right: Pt[] = [];
    let freeL = 0;
    let freeR = 0;
    for (let i = 0; i <= SLEEVE.steps; i++) {
      const u = i / SLEEVE.steps;
      const m = 1 - u;
      const x = m * m * m * sh.x + 3 * m * m * u * b.x + 3 * m * u * u * c.x + u * u * u * wrist.x;
      const y = m * m * m * sh.y + 3 * m * m * u * b.y + 3 * m * u * u * c.y + u * u * u * wrist.y;
      let tx = m * m * (b.x - sh.x) + 2 * m * u * (c.x - b.x) + u * u * (wrist.x - c.x);
      let ty = m * m * (b.y - sh.y) + 2 * m * u * (c.y - b.y) + u * u * (wrist.y - c.y);
      const tl = Math.max(1e-3, Math.hypot(tx, ty));
      tx /= tl;
      ty /= tl;
      const r = lerp(lerp(SLEEVE.shoulder, SLEEVE.wrist * k * 1.06, paw.idle), SLEEVE.wrist * k, ease(0, 1, u));
      left.push({ x: x - ty * r, y: y + tx * r });
      right.push({ x: x + ty * r, y: y - tx * r });
      if (i > 0 && u < 0.6 && (left[i].x - left[i - 1].x) * tx + (left[i].y - left[i - 1].y) * ty <= 0) freeL = i;
      if (i > 0 && u < 0.6 && (right[i].x - right[i - 1].x) * tx + (right[i].y - right[i - 1].y) * ty <= 0) freeR = i;
    }

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const sx = k * (1 + paw.squash * 0.1);
    const sy = k * (1 - paw.squash * 0.1);
    const place = (q: Pt): Pt => ({
      x: paw.x + q.x * sx * cos - q.y * sy * sin,
      y: paw.y + q.x * sx * sin + q.y * sy * cos,
    });
    const h = SLEEVE.steps >> 1;
    return {
      left,
      right,
      paw: PAW_POINTS.map(place),
      cuff: place({ x: 0, y: -28 }),
      angle,
      elbow: (right[h].x - left[h].x) * paw.side,
      freeL,
      freeR,
    };
  }

  private traceArm(ctx: Ctx, a: ArmShape): void {
    ctx.beginPath();
    a.left.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    for (const q of a.paw) ctx.lineTo(q.x, q.y);
    for (let i = a.right.length - 1; i >= 0; i--) ctx.lineTo(a.right[i].x, a.right[i].y);
    ctx.closePath();
  }

  private traceMitten(ctx: Ctx, a: ArmShape): void {
    ctx.beginPath();
    a.paw.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.quadraticCurveTo(a.cuff.x, a.cuff.y, a.paw[0].x, a.paw[0].y);
    ctx.closePath();
  }

  /** One line round the whole arm, brushed out to nothing towards the shoulder. */
  private inkArm(ctx: Ctx, a: ArmShape): void {
    const n = a.left.length - 1;
    // The elbow's side starts later along the sleeve than the other one.
    const lead = (edge: Pt[], free: number): number => {
      const from = Math.max(free, Math.round(n * (edge === (a.elbow < 0 ? a.left : a.right) ? 0.24 : 0.16)));
      // Full after a bit less than half of the way that is left.
      let total = 0;
      for (let i = from + 1; i <= n; i++) total += Math.hypot(edge[i].x - edge[i - 1].x, edge[i].y - edge[i - 1].y);
      let full = from;
      for (let run = 0; full < n && run < total * 0.46; full++) run += Math.hypot(edge[full + 1].x - edge[full].x, edge[full + 1].y - edge[full].y);
      return this.brushIn(ctx, edge, from, full);
    };
    const fullL = lead(a.left, a.freeL);
    const fullR = lead(a.right, a.freeR);
    ctx.beginPath();
    for (let i = fullL; i <= n; i++) {
      if (i === fullL) ctx.moveTo(a.left[i].x, a.left[i].y);
      else ctx.lineTo(a.left[i].x, a.left[i].y);
    }
    for (const q of a.paw) ctx.lineTo(q.x, q.y);
    for (let i = n; i >= fullR; i--) ctx.lineTo(a.right[i].x, a.right[i].y);
    this.ink(ctx);
  }

  /** A brush stroke along `edge` that starts from nothing at `from` and has swelled to the full line at `full`. */
  private brushIn(ctx: Ctx, edge: Pt[], from: number, full: number): number {
    const n = edge.length - 1;
    const run: number[] = [0];
    for (let i = from + 1; i <= full; i++) {
      run.push(run[run.length - 1] + Math.hypot(edge[i].x - edge[i - 1].x, edge[i].y - edge[i - 1].y));
    }
    const span = Math.max(1e-3, run[run.length - 1]);
    const one: Pt[] = [];
    const other: Pt[] = [];
    for (let i = from; i <= full; i++) {
      const prev = edge[Math.max(from, i - 1)];
      const next = edge[Math.min(n, i + 1)];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const l = Math.max(1e-3, Math.hypot(tx, ty));
      const w = (INK / 2) * ease(0, span, run[i - from]);
      one.push({ x: edge[i].x - (ty / l) * w, y: edge[i].y + (tx / l) * w });
      other.push({ x: edge[i].x + (ty / l) * w, y: edge[i].y - (tx / l) * w });
    }
    ctx.fillStyle = CHIN.ink;
    ctx.beginPath();
    one.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    for (let i = other.length - 1; i >= 0; i--) ctx.lineTo(other[i].x, other[i].y);
    ctx.closePath();
    ctx.fill();
    return full;
  }

  private ink(ctx: Ctx, width = INK, color: string = CHIN.ink): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  private strokeWhiskers(ctx: Ctx, p: ChinchillaPose2D): void {
    const tn = p.turn;
    const twitch = Math.sin(p.elapsed * 9) * 0.7 * p.typing;
    for (const s of [-1, 1]) {
      for (const [x0, y0, cx, cy, x1, y1] of WHISKERS) {
        ctx.beginPath();
        ctx.moveTo(s * x0 + tn * 0.5, y0);
        ctx.quadraticCurveTo(s * cx + tn * 0.3, cy, s * x1 + tn * 0.15, y1 + twitch);
        ctx.stroke();
      }
    }
  }

  // ---- layers ----

  /** White die-cut backing + soft drop shadow behind everything. `desk` adds keyboard & mouse paths. */
  public drawBacking(ctx: Ctx, p: ChinchillaPose2D, desk: Array<(c: Ctx) => void>): void {
    const tail = this.tail(p);
    const paint = (solid: boolean) => {
      const stroke = () => {
        if (solid) ctx.fill();
        ctx.stroke();
      };
      for (const trace of desk) {
        ctx.save();
        trace(ctx);
        stroke();
        ctx.restore();
      }
      for (const q of tail.puffs) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        stroke();
      }
      if (tail.out) {
        ctx.save();
        ctx.lineWidth += STALK * 2;
        this.tracePoints(ctx, tail.stalk);
        ctx.stroke();
        ctx.restore();
      }
      this.withFace(ctx, p, () => {
        for (const s of [-1, 1] as const) {
          this.withEar(ctx, p, s, () => {
            this.traceEar(ctx);
            stroke();
          });
        }
      });
      this.traceBody(ctx, p);
      stroke();
      for (const paw of p.paws) {
        this.traceArm(ctx, this.arm(p, paw));
        stroke();
      }
      ctx.save();
      ctx.lineWidth = 8;
      this.withFace(ctx, p, () => this.strokeWhiskers(ctx, p));
      ctx.restore();
    };

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = INK + BORDER * 2;
    ctx.fillStyle = CHIN.sticker;
    ctx.strokeStyle = CHIN.sticker;
    ctx.shadowColor = 'rgba(90, 70, 58, 0.30)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3.5;
    paint(false);
    ctx.shadowColor = 'transparent';
    paint(true);
    ctx.restore();
  }

  private tracePoints(ctx: Ctx, pts: Pt[], from = 0, to = pts.length - 1): void {
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      if (i === from) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
  }

  /** Everything between the stalk and its hip, down to where it is out of sight behind the keyboard. */
  private traceRoot(ctx: Ctx, stalk: Pt[]): void {
    this.tracePoints(ctx, stalk);
    ctx.lineTo(stalk[0].x, stalk[0].y + 46);
    ctx.closePath();
  }

  /** The stalk's edge at `d` to one side, and where it runs on again after a bend too tight for it. */
  private stalkEdge(stalk: Pt[], d: number): { edge: Pt[]; from: number } {
    const n = stalk.length - 1;
    const edge: Pt[] = [];
    let from = 0;
    for (let i = 0; i <= n; i++) {
      const a = stalk[Math.max(0, i - 1)];
      const b = stalk[Math.min(n, i + 1)];
      const l = Math.max(1e-3, Math.hypot(b.x - a.x, b.y - a.y));
      const tx = (b.x - a.x) / l;
      const ty = (b.y - a.y) / l;
      edge.push({ x: stalk[i].x - ty * d, y: stalk[i].y + tx * d });
      if (i > 0 && (edge[i].x - edge[i - 1].x) * tx + (edge[i].y - edge[i - 1].y) * ty <= 0) from = i;
    }
    return { edge, from };
  }

  /** Edge of the body on the tail's side at canvas height `y`, as a distance to that side. */
  private flank(p: ChinchillaPose2D, y: number): number {
    const s = p.tail.side;
    let far = -Infinity;
    let a = this.bodyAt(p, BODY_POINTS[0].x, BODY_POINTS[0].y);
    for (let i = 1; i < BODY_POINTS.length; i++) {
      const b = this.bodyAt(p, BODY_POINTS[i].x, BODY_POINTS[i].y);
      if (a.y !== b.y && (a.y - y) * (b.y - y) <= 0) far = Math.max(far, s * (a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)));
      a = b;
    }
    return far;
  }

  /**
   * Point from which the stalk is in front: where it has come furthest out from the body, or earlier if it
   * would otherwise already be over the keyboard, so that neither of them is cut.
   */
  private stalkFront(p: ChinchillaPose2D, inside: Pt[]): number {
    const s = p.tail.side;
    const n = inside.length - 1;
    const first = Math.round(n * 0.2);
    let at = first;
    for (let i = at; i <= n * 0.75; i++) if (s * inside[i].x > s * inside[at].x) at = i;
    const clear = (i: number) => s * inside[i].x > this.flank(p, inside[i].y) + INK;
    while (at > first && inside[at].y > p.deskTop - 8 && clear(at - 1)) at--;
    return at;
  }

  /**
   * The tail in two layers: what is behind the body, and what has swung round in front of the keys.
   * The stalk changes layer where it is already outside the body, so nothing gets cut off.
   */
  public drawTail(ctx: Ctx, p: ChinchillaPose2D, layer: 'back' | 'front'): void {
    const { puffs, at, stalk, out, front } = this.tail(p);
    const s = p.tail.side;
    if (layer === 'front' && !front) return;
    const cloud = layer === 'front' || !front;
    // The bend folds the inside of the stalk over: from there on its edge is a crease in the fur.
    const inside = this.stalkEdge(stalk, s * (STALK + INK / 2));
    const start = layer === 'front' ? this.stalkFront(p, inside.edge) : 0;
    const g = ctx.createRadialGradient(at.x - 8, at.y - 14, 6, at.x, at.y, 62);
    g.addColorStop(0, '#e0d6cb');
    g.addColorStop(1, '#c8baac');

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.strokeStyle = CHIN.ink;
    if (out) {
      ctx.lineWidth = INK;
      this.tracePoints(ctx, this.stalkEdge(stalk, -s * (STALK + INK / 2)).edge, start);
      ctx.stroke();
      if (layer === 'back') {
        // Fur fills the inside of the bend, so the tail is plump at the root and no gap opens up.
        ctx.lineWidth = INK * 2;
        this.traceRoot(ctx, stalk);
        ctx.stroke();
      }
    }
    if (cloud) {
      ctx.lineCap = 'round';
      for (const q of puffs) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        this.ink(ctx, INK * 2);
      }
    }
    if (out) {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = g;
      ctx.fillStyle = g;
      // A hair wider than the gap between the lines, so nothing shows between fur and line.
      ctx.lineWidth = STALK * 2 + 0.6;
      this.tracePoints(ctx, stalk, Math.max(0, start - 1));
      ctx.stroke();
      if (layer === 'back') {
        this.traceRoot(ctx, stalk);
        ctx.fill();
      }
      if (cloud) {
        let from = Math.max(start, inside.from);
        // Only where the edge has turned downwards: the fur inside the bend needs no line.
        const last = inside.edge.length - 1;
        for (; from < last - 1; from++) {
          const q = inside.edge[from];
          const r = inside.edge[from + 1];
          if (r.y - q.y > Math.abs(r.x - q.x) * 0.5 || s * q.x < this.flank(p, q.y)) break;
        }
        // It has to be a full line where it meets the body, the keyboard or the cloud's own outline.
        let meet = last;
        for (let i = from; i < meet; i++) {
          const q = inside.edge[i];
          if (q.y > p.deskTop || s * q.x < this.flank(p, q.y) || puffs.some((o) => Math.hypot(q.x - o.x, q.y - o.y) < o.r + INK)) meet = i;
        }
        const on = this.brushIn(ctx, inside.edge, from, meet);
        this.tracePoints(ctx, inside.edge, on);
        this.ink(ctx);
      }
    }
    if (cloud) {
      ctx.fillStyle = g;
      for (const q of puffs) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.fill();
      }
      const curl = 1 - clamp01(p.tail.stretch * 3);
      if (curl > 0.02) {
        const c = puffs[8];
        ctx.globalAlpha = 0.7 * curl;
        ctx.beginPath();
        ctx.moveTo(c.x - 8, c.y + 16);
        ctx.bezierCurveTo(c.x + 12, c.y + 14, c.x + 18, c.y - 2, c.x + 11, c.y - 12);
        ctx.bezierCurveTo(c.x + 5, c.y - 20, c.x - 6, c.y - 17, c.x - 6, c.y - 9);
        this.ink(ctx, 2);
      }
    }
    ctx.restore();
  }

  /** Ears, body, belly and face. */
  public drawBody(ctx: Ctx, p: ChinchillaPose2D, accessories?: { back: () => void; front: () => void }): void {
    const fur = this.furGradient(ctx, p);
    this.withFace(ctx, p, () => {
      for (const s of [-1, 1] as const) {
        this.withEar(ctx, p, s, () => {
          this.traceEar(ctx);
          ctx.fillStyle = CHIN.earRim;
          ctx.fill();
          ctx.save();
          this.traceEar(ctx, EAR_INNER);
          ctx.clip();
          paintEarSkin(ctx, s);
          ctx.restore();
          this.traceEar(ctx);
          this.ink(ctx);
        });
      }
    });

    ctx.save();
    this.traceBody(ctx, p);
    ctx.fillStyle = fur;
    ctx.fill();
    ctx.save();
    ctx.clip();
    this.withFace(ctx, p, () => paintChinShade(ctx));
    paintBelly(ctx, (x, h) => this.bodyAt(p, x, h));
    this.withFace(ctx, p, () => paintFaceMarkings(ctx, p));
    ctx.restore();
    this.traceBody(ctx, p);
    this.ink(ctx);
    ctx.restore();

    this.withFace(ctx, p, () => {
      accessories?.back();
      ctx.strokeStyle = CHIN.ink;
      ctx.lineWidth = 1.9;
      ctx.lineCap = 'round';
      this.strokeWhiskers(ctx, p);
      this.drawEye(ctx, p, -1);
      this.drawEye(ctx, p, 1);
      this.drawMouth(ctx, p);
      accessories?.front();
    });
  }

  private drawEye(ctx: Ctx, p: ChinchillaPose2D, s: -1 | 1): void {
    const closed = Math.max(p.blink, p.sleep);
    ctx.save();
    ctx.translate(s * 38 + p.turn, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = CHIN.eyeMid;
    ctx.lineWidth = 3;

    if (p.sleep > 0.52) {
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.quadraticCurveTo(0, 8.5, 10, 0);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (p.squint > 0.38 && p.blink < 0.3) {
      ctx.beginPath();
      ctx.moveTo(-10.5, 5);
      ctx.quadraticCurveTo(0, -9.5, 10.5, 5);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const grow = 1 + p.curious * 0.14;
    const rx = 12.6 * grow;
    const full = 14.1 * grow;
    const ry = Math.max(1.6, full * (1 - closed * 0.92));
    ctx.save();
    if (p.cross > 0.04) {
      const inner = lerp(-full - 4, -3, p.cross);
      const outer = lerp(-full - 4, -full + 3.5, p.cross);
      ctx.beginPath();
      ctx.moveTo(-rx - 4, s < 0 ? outer : inner);
      ctx.lineTo(rx + 4, s < 0 ? inner : outer);
      ctx.lineTo(rx + 4, full + 6);
      ctx.lineTo(-rx - 4, full + 6);
      ctx.closePath();
      ctx.clip();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(0, -ry, 0, ry);
    g.addColorStop(0, CHIN.eyeTop);
    g.addColorStop(0.55, CHIN.eyeMid);
    g.addColorStop(1, CHIN.eyeLow);
    ctx.fillStyle = g;
    ctx.fill();
    if (ry > 5) {
      ctx.clip();
      const gx = p.lookX * 2.6;
      const gy = p.lookY * 2.2;
      // Warm crescent in the lower iris.
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = CHIN.eyeGlow;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.6 + gx * 0.5, ry * 0.5);
      ctx.quadraticCurveTo(gx * 0.5, ry * 1.06, rx * 0.6 + gx * 0.5, ry * 0.5);
      ctx.quadraticCurveTo(gx * 0.5, ry * 0.74, -rx * 0.6 + gx * 0.5, ry * 0.5);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      const dot = (x: number, y: number, r: number) => {
        ctx.beginPath();
        ctx.arc(x + gx, y + gy, r, 0, Math.PI * 2);
        ctx.fill();
      };
      dot(-rx * 0.32, -full * 0.38, rx * (0.38 + p.curious * 0.05));
      dot(rx * 0.4, full * 0.34, rx * (0.18 + p.curious * 0.06));
      dot(rx * 0.44, -full * 0.32, rx * 0.09);
    }
    ctx.restore();

    if (p.cross > 0.04) {
      const inner = lerp(-full - 4, -3, p.cross);
      const outer = lerp(-full - 4, -full + 3.5, p.cross);
      ctx.globalAlpha = clamp01(p.cross * 1.5);
      ctx.beginPath();
      ctx.moveTo(-rx - 1, s < 0 ? outer : inner);
      ctx.lineTo(rx + 1, s < 0 ? inner : outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMouth(ctx: Ctx, p: ChinchillaPose2D): void {
    ctx.save();
    ctx.translate(p.turn * 1.08, 0);
    ctx.beginPath();
    ctx.moveTo(-5.6, 8.5);
    ctx.quadraticCurveTo(0, 5.3, 5.6, 8.5);
    ctx.quadraticCurveTo(5.6, 12.7, 0, 14.3);
    ctx.quadraticCurveTo(-5.6, 12.7, -5.6, 8.5);
    ctx.fillStyle = CHIN.nose;
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.ellipse(-1.8, 8.7, 1.7, 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    const happy = Math.max(ease(0.3, 0.7, p.squint), ease(0.45, 0.8, p.typing)) * (1 - clamp01(p.cross * 2));
    if (p.cross > 0.5) {
      ctx.beginPath();
      ctx.moveTo(-6, 23);
      ctx.quadraticCurveTo(0, 17.2, 6, 23);
      this.ink(ctx, 2.4, CHIN.mouth);
    } else if (p.curious > 0.55) {
      ctx.beginPath();
      ctx.ellipse(0, 21.5, 3.2, 3.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = CHIN.mouthIn;
      ctx.fill();
      this.ink(ctx, 2.1, CHIN.mouth);
    } else {
      if (happy > 0.03) {
        const d = lerp(1, 8.2, happy);
        ctx.beginPath();
        ctx.moveTo(-4.8, 20.1);
        ctx.quadraticCurveTo(0, 21.1, 4.8, 20.1);
        ctx.quadraticCurveTo(5, 20.1 + d, 0, 20.5 + d);
        ctx.quadraticCurveTo(-5, 20.1 + d, -4.8, 20.1);
        ctx.fillStyle = CHIN.mouthIn;
        ctx.fill();
        if (d > 4) {
          ctx.beginPath();
          ctx.moveTo(-3.2, 18.6 + d);
          ctx.quadraticCurveTo(0, 15.6 + d, 3.2, 18.6 + d);
          ctx.quadraticCurveTo(2.4, 20.4 + d, 0, 20.5 + d);
          ctx.quadraticCurveTo(-2.4, 20.4 + d, -3.2, 18.6 + d);
          ctx.fillStyle = CHIN.tongue;
          ctx.fill();
        }
      }
      ctx.beginPath();
      ctx.moveTo(-8.4, 17.5);
      ctx.quadraticCurveTo(-6.2, 23.3, 0, 18.5);
      ctx.quadraticCurveTo(6.2, 23.3, 8.4, 17.5);
      this.ink(ctx, 2.4, CHIN.mouth);
    }
    ctx.restore();
  }

  /** Short sleeves, three-toed mittens, and the heart it hugs while being petted. */
  public drawArms(ctx: Ctx, p: ChinchillaPose2D, hug: number): void {
    const fur = this.furGradient(ctx, p);
    if (hug > 0.02) {
      const c = this.bodyAt(p, 0, 45);
      const beat = 1 + Math.sin(p.elapsed * 6.5) * 0.045;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(hug * beat, hug * beat);
      traceHeart(ctx, 30);
      ctx.fillStyle = CHIN.heart;
      ctx.fill();
      this.ink(ctx, INK, CHIN.heartInk);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.ellipse(-13, -13, 5.2, 3.4, -0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const paw of p.paws) {
      const arm = this.arm(p, paw);
      ctx.save();
      if (paw.shadow > 0.02) {
        ctx.fillStyle = `rgba(110, 88, 74, ${(0.26 * paw.shadow).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(paw.x, paw.y + 16 * paw.scale, 23 * paw.scale, 4.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (paw.chest > 0.02) {
        const r = 27 * paw.scale;
        const g = ctx.createRadialGradient(paw.x, paw.y + 6, r * 0.35, paw.x, paw.y + 6, r);
        g.addColorStop(0, `rgba(132, 104, 86, ${(0.24 * paw.chest).toFixed(3)})`);
        g.addColorStop(1, 'rgba(132, 104, 86, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(paw.x, paw.y + 6, r, 0, Math.PI * 2);
        ctx.fill();
      }
      this.traceArm(ctx, arm);
      // Same fur and chin shade as the body, so the sleeve grows out of it without a seam.
      ctx.fillStyle = fur;
      ctx.fill();
      ctx.save();
      ctx.clip();
      this.withFace(ctx, p, () => paintChinShade(ctx));
      ctx.restore();
      // The fur fades into the cream of the paw.
      this.traceMitten(ctx, arm);
      ctx.save();
      ctx.translate(paw.x, paw.y);
      ctx.rotate(arm.angle);
      ctx.scale(paw.scale, paw.scale);
      const cream = ctx.createRadialGradient(0, CUFF.y, CUFF.inner, 0, CUFF.y, CUFF.outer);
      cream.addColorStop(0, CHIN.paw);
      cream.addColorStop(1, `${CHIN.paw}00`);
      ctx.fillStyle = cream;
      ctx.fill();
      ctx.restore();
      this.inkArm(ctx, arm);
      // Toe creases.
      ctx.save();
      ctx.translate(paw.x, paw.y);
      ctx.rotate(arm.angle);
      ctx.scale(paw.scale * (1 + paw.squash * 0.1), paw.scale * (1 - paw.squash * 0.1));
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(s * 6.7, 13.4);
        ctx.lineTo(s * 7, 7.2);
      }
      this.ink(ctx, 2.1, CHIN.toe);
      ctx.restore();
      ctx.restore();
    }
  }

  /** Paw targets for the special poses. */
  public eyeCover(p: Pick<ChinchillaPose2D, 'spine' | 'tilt' | 'turn'>, side: -1 | 1): Pt {
    const f = p.spine(FACE_H);
    const x = side * 37 + p.turn;
    const y = 1;
    return {
      x: f.x + x * Math.cos(p.tilt) - y * Math.sin(p.tilt),
      y: f.y + x * Math.sin(p.tilt) + y * Math.cos(p.tilt),
    };
  }

  public hugPoint(p: Pick<ChinchillaPose2D, 'spine'>, side: -1 | 1): Pt {
    const c = p.spine(34);
    return { x: c.x + side * 30, y: c.y };
  }
}
