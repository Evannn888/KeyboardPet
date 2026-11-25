/**
 * Shared look of the owner's chinchilla (我家龙猫): palette and outlines used by both the 2D canvas
 * renderer and the 3D model, so the two modes stay the same character.
 *
 * Body space: x to the right of the body axis, h up from the seat. Face space: origin between the
 * eyes, y down. Ear space: origin at the ear root, the ear points to -y. All in design pixels of the
 * 420×440 2D canvas.
 */

export const CHINCHILLA_ID = 'my-chinchilla';

export const CHIN = {
  ink: '#9a8373',
  mouth: '#86695b',
  sticker: '#ffffff',
  furTop: '#e7ded5',
  fur: '#dbd0c5',
  furLow: '#cfc1b4',
  cap: 'rgba(191, 174, 159, 0.42)',
  cream: '#fffaf2',
  paw: '#fff8f0',
  toe: '#dba79b',
  earRim: '#e2d8ce',
  earTip: '#fff1e9',
  earRoot: '#f3b3ab',
  earFluff: '#fff6ee',
  freckle: '#b29d8e',
  eyeTop: '#2b1f1a',
  eyeMid: '#3a2a23',
  eyeLow: '#80563f',
  eyeGlow: '#c49277',
  blush: '#f4948c',
  nose: '#e58d8c',
  mouthIn: '#b4625d',
  tongue: '#f2a09a',
  heart: '#f59a94',
  heartInk: '#cf7d76',
} as const;

/** Milk-tea desk set that goes with it. */
export const CHIN_DESK = {
  chassis: '#a8937f',
  chassisEdge: '#b8a491',
  side: '#8a7563',
  plate: '#efe5da',
  key: '#fffaf3',
  keySide: '#ddd0c2',
  mod: '#f1e6da',
  modSide: '#d6c7b7',
  accent: '#f2aaa1',
  accentSide: '#d98d84',
  legend: '#5d4b40',
  hit: '#f7b9b0',
  hitSide: '#dd938a',
  hitRight: '#a9c8c0',
} as const;

/** Cream and blush headphones to match. */
export const CHIN_HEADSET = {
  shell: '#f6ebdf',
  shellLow: '#e6d5c5',
  edge: '#9a8373',
  pad: '#eebcb1',
  padEdge: '#b97f74',
  metal: '#d8c3b1',
  shine: 'rgba(255, 255, 255, 0.75)',
  boom: '#cfb9a6',
  led: '#f7a59b',
  glow: 'rgba(247, 165, 155, 0.55)',
} as const;

export type Cubic = readonly [readonly [number, number], readonly [number, number], readonly [number, number]];

/**
 * How wide the body is, as a share of its first, rounder design: at the hips (up to h=40) and at the head
 * (from h=100), blended in between. The outline, the 3D sculpt and everything that sits on the outline (tail,
 * shoulders, ears, whiskers, blush) follow it.
 */
export const BODY_WIDTH = { hips: 0.84, head: 0.94 } as const;

/** Width share at height h above the seat. */
export function widthAt(h: number): number {
  const t = Math.max(0, Math.min(1, (h - 40) / 60));
  return BODY_WIDTH.hips + (BODY_WIDTH.head - BODY_WIDTH.hips) * t * t * (3 - 2 * t);
}

/** How far in the flank has come at the hips, for the tail that hangs off it. */
export const HIP_IN = 113 * (1 - BODY_WIDTH.hips);

const narrowCubics = (segs: readonly Cubic[]): Cubic[] =>
  segs.map((seg) => seg.map(([x, h]) => [x * widthAt(h), h] as const) as unknown as Cubic);

/** Crown height above the seat. */
export const BODY_H = 188;
/** How far the seat sits below the keyboard's far edge. */
export const SEAT_DROP = 18;
/** Sideways offset that centres it behind the keyboard, and behind the letters of a full-size one. */
export const SEAT_SHIFT = 17;
export const SEAT_SHIFT_108 = -48;
/** Height of the face centre. */
export const FACE_H = 115;

/** Right half of the one-piece silhouette, crown to seat, with fluffy cheek tufts ([x, h]). */
export const BODY_START: readonly [number, number] = [0, 188];
export const BODY_PATH: readonly Cubic[] = narrowCubics([
  [[6, 194], [11, 193], [15, 190]],
  [[68, 188], [91, 154], [95.5, 118]],
  [[103, 116], [106, 106], [98.5, 101]],
  [[107, 100], [109, 89], [100, 84]],
  [[111, 66], [118, 42], [116, 20]],
  [[114, 6], [104, 0], [89, 0]],
]);
/** The same silhouette without tufts, for the 3D lathe: [h, half-width]. */
export const BODY_PROFILE: ReadonlyArray<readonly [h: number, hw: number]> = ([
  [0, 0],
  [1, 70],
  [5, 98],
  [18, 112],
  [40, 113],
  [62, 107],
  [84, 100],
  [100, 98],
  [117, 96.5],
  [134, 91],
  [150, 81.5],
  [166, 66],
  [178, 48],
  [186, 25],
  [188, 0],
] as const).map(([h, hw]) => [h, hw * widthAt(h)] as const);

/** Scalloped chest and belly fluff ([x, h]), narrow enough to sit between the resting paws. */
export const BELLY_START: readonly [number, number] = [-45, -6];
export const BELLY_PATH: readonly Cubic[] = [
  [[-51, 20], [-50, 48], [-34, 55]],
  [[-29, 66], [-16, 68], [-10, 61]],
  [[-6, 68], [6, 68], [10, 61]],
  [[16, 68], [29, 66], [34, 55]],
  [[50, 48], [51, 20], [45, -6]],
];

/** Whiskers in face space, right side: start, control, end. They end inside the white border. */
export const WHISKERS: ReadonlyArray<readonly [number, number, number, number, number, number]> = (
  [
    [74, 11, 89, 7.5, 105, 8],
    [74, 20, 89, 20.5, 106, 25],
  ] as const
).map(([x0, y0, cx, cy, x1, y1]) => {
  const k = BODY_WIDTH.head;
  return [x0 * k, y0, cx * k, cy, x1 * k, y1] as const;
});

/** How far from the body axis the paws wait on the keyboard's edge between keys. */
export const PAW_REST = 44;
/** Keys closer than this to the body axis (in 2D px) are pressed by a paw even if they are tail keys. */
export const CHIN_PAW_ZONE = 72;
/** Idle hands: centre in body space, turn of the toes, size, and how far the arm comes round from the side. */
export const IDLE_PAW = { x: 21.5, h: 39.5, rot: 0.66, scale: 0.86, bend: 0.42 } as const;

/** Where the fur turns into the cream of a paw: between two circles round a point near its toes, in px of the 2D paw. */
export const CUFF = { y: 12, inner: 20, outer: 22.5 } as const;

/** Ear root in face space (right ear) and its outward lean from upright. */
export const EAR_ROOT = { x: 52 * BODY_WIDTH.head, y: -43, lean: 0.82 } as const;
export const EAR_START: readonly [number, number] = [-20, 15];
export const EAR_PATH: readonly Cubic[] = [
  [[-43, -8], [-41, -66], [0, -68]],
  [[41, -66], [43, -8], [20, 15]],
];
export const EAR_INNER = 0.82;

/** Freckles in right-ear space: [x, y, rx, ry, rotation]. The two lists differ, like the real ears. */
export const EAR_FRECKLES: Record<'left' | 'right', ReadonlyArray<readonly [number, number, number, number, number]>> = {
  right: [
    [20, -43, 4.4, 3.4, 0.66],
    [25, -29, 3.2, 3.9, 0],
    [9, -51, 2.8, 2.2, 0.3],
    [16, -31, 1.8, 1.9, 0],
    [23, -15, 2.3, 2.0, 0],
    [10, -41, 1.4, 1.4, 0],
  ],
  left: [
    [22, -38, 4.6, 3.8, 0.8],
    [13, -49, 3.4, 2.5, 0.4],
    [25, -24, 2.9, 3.5, 0],
    [15, -36, 2.0, 1.8, 0],
    [1, -53, 2.0, 1.6, 0],
    [19, -13, 1.9, 1.7, 0],
    [12, -27, 1.4, 1.5, 0],
  ],
};

/** Cloud tail at rest: [x, h, radius], hip first. */
export const TAIL_PUFFS: ReadonlyArray<readonly [number, number, number]> = ([
  [86, 34, 11],
  [91, 36, 12],
  [96, 39, 14],
  [103, 42, 16],
  [109, 45, 18],
  [115, 48, 21],
  [120, 50, 24],
  [123, 51, 24],
  [126, 52, 24],
  [128, 50, 24],
  [130, 48, 23],
  [143, 33, 18],
  [151, 44, 18],
  [158, 56, 18.5],
  [145, 80, 18.5],
  [118, 81, 17.5],
] as const).map(([x, h, r]) => [x - HIP_IN, h, r] as const);
/** The first puffs lead from the hip into the cloud. */
export const TAIL_INNER = 10;
/** Middle of the cloud. To press a key the whole cloud swings over on a stalk, shrunk to `TAIL_TAP_SCALE`. */
export const TAIL_CORE: readonly [number, number] = [128 - HIP_IN, 54];
export const TAIL_TAP_SCALE = 0.58;
