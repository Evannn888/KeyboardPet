import * as THREE from 'three';
import { paintBelly, paintChinShade, paintEarSkin, paintFaceMarkings, sampleCubics } from './chinchilla2d';
import {
  BODY_H,
  BODY_PATH,
  BODY_PROFILE,
  BODY_START,
  CHIN,
  CHIN_HEADSET,
  EAR_INNER,
  EAR_PATH,
  EAR_ROOT,
  EAR_START,
  FACE_H,
  TAIL_CORE,
  TAIL_PUFFS,
  WHISKERS,
  type Cubic,
} from './chinchillaStyle';
import { TaperTube3D, mergeStaticGeometries, mix, smoothstep } from './keyboard3d';

/**
 * 3D sculpt of the owner's chinchilla, inflated from the same outlines and painted with the same
 * markings as the 2D sticker (`chinchilla2d.ts`), so both modes show one character.
 *
 * The body is a single rigid plush: it rocks and nods but is never stretched, so its shape (and
 * belly) looks the same in every pose. Ears and tail sit behind the silhouette and the arms are one
 * piece with their paws, so no part pokes through another.
 */

/** Design pixels to body-local units (the crown sits at 1.98, like the cats'). */
export const PX = 1.98 / BODY_H;
const DEPTH = 0.78;

/** It leans back to look up at the raised camera, which keeps the face level and the drawn proportions. */
const LEAN = 0.3;
/** Slope of what is left of the camera's 30 degrees. */
const VIEW_SLOPE = Math.tan(Math.PI / 6 - LEAN);
/** Things on the bulging front still sink a little on screen; they are painted this much higher (px). */
const FRONT_LIFT = 16;
const FACE_Y = FACE_H + FRONT_LIFT;
/** The tail hangs behind the body's outline. */
const TAIL_Z = -0.52;

export const CHINCHILLA = {
  scale: 0.86,
  lean: LEAN,
  homeX: 0.18,
  /** Behind the letters of a full-size keyboard, so the mouse stays near. */
  homeX108: -0.16,
  homeY: -0.26,
  homeZ: -0.1,
  headPitch: -0.02,
  /** Face pivot and the band over which the one-piece body starts following the head. */
  headCy: FACE_Y * PX,
  headBandLo: 80 * PX,
  headBandHi: 102 * PX,
  eyeX: 38 * PX,
  eyeRx: 12.6 * PX,
  eyeRy: 14.1 * PX,
  /** Eye patch is larger than the eye so grumpy lids can overhang it. */
  eyePatch: 1.3,
  earX: EAR_ROOT.x * PX,
  earY: (FACE_H - EAR_ROOT.y - FACE_Y - 4) * PX,
  /** Behind the head's outline, so the head always covers the ears' roots. */
  earZ: -0.24,
  earLean: EAR_ROOT.lean,
  earScale: 0.94,
  inkWidth: 0.019,
  collarY: 0.9,
  /** Arms leave the flank at this height; the angle follows the hand around the body. */
  shoulderY: 66 * PX,
  /** Length of the stub an idle arm is, in world units. */
  stub: 30 * PX * 0.86,
  /** Body-local hip the tail swings about, its middle, and the puff that hits the desk when it thumps. */
  tailHip: new THREE.Vector3(0.8, 0.23, TAIL_Z),
  tailCore: new THREE.Vector3((TAIL_CORE[0] - 10) * PX, (TAIL_CORE[1] - 12) * PX, TAIL_Z),
  tailTip: 11,
  frontLift: FRONT_LIFT,
} as const;

// ---- surface ----

const PROFILE: THREE.Vector2[] = (() => {
  const curve = new THREE.CatmullRomCurve3(
    BODY_PROFILE.map(([h, hw]) => new THREE.Vector3(hw * PX, h * PX, 0)),
    false,
    'centripetal',
  );
  const pts = curve.getSpacedPoints(108).map((q) => new THREE.Vector2(Math.max(0, q.x), q.y));
  pts[0].set(0, 0);
  pts[pts.length - 1].x = 0;
  return pts;
})();

export function chinchillaRadius(y: number): number {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const a = PROFILE[i];
    const b = PROFILE[i + 1];
    if (y >= a.y && y <= b.y && b.y - a.y > 1e-6) return mix(a.x, b.x, (y - a.y) / (b.y - a.y));
  }
  return 0;
}

/** Half-width of the drawn outline, cheek tufts included. */
const tuftedRadius: (y: number) => number = (() => {
  const pts = sampleCubics(BODY_START, BODY_PATH, 24).filter((q) => q.y < 150);
  return (y) => {
    const h = y / PX;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (h <= a.y && h >= b.y && a.y - b.y > 1e-6) return mix(a.x, b.x, (a.y - h) / (a.y - b.y)) * PX;
    }
    return 0;
  };
})();

/** Small forward swell of the muzzle (body-local). */
const muzzle = (x: number, y: number) =>
  0.055 * Math.exp(-((x / (24 * PX)) ** 2) - ((y - (FACE_Y - 19) * PX) / (15 * PX)) ** 2);

/** Front-surface depth at body-local (x, y). */
export function chinchillaSurfaceZ(x: number, y: number): number {
  const r = Math.max(0.03, chinchillaRadius(y));
  const u = Math.min(0.99, Math.abs(x) / r);
  const z = r * DEPTH * Math.sqrt(1 - u * u);
  return z + muzzle(x, y) * smoothstep(0, 0.25, z);
}

/** Point on the body at height y, `angle` radians round from the front, pulled in by `inset`. */
export function chinchillaFlank(angle: number, y: number, inset: number, out: THREE.Vector3): THREE.Vector3 {
  const r = chinchillaRadius(y) - inset;
  return out.set(Math.sin(angle) * r, y, Math.cos(angle) * r * DEPTH);
}

/** Front-surface depth in face space (head pivot at the origin, y up). */
const faceZ = (x: number, y: number) => chinchillaSurfaceZ(x, y + CHINCHILLA.headCy);

/** Points further round the head drift up the screen; lowering them keeps the face level. */
const faceDrop = (x: number) => {
  const r = 100 * PX;
  const u = Math.min(0.97, Math.abs(x) / r);
  return DEPTH * r * (1 - Math.sqrt(1 - u * u)) * VIEW_SLOPE;
};

export function buildChinchillaBody(): { geo: THREE.BufferGeometry; outline: THREE.Vector3[] } {
  // Start the lathe at the back so its seam never faces the viewer.
  const geo = new THREE.LatheGeometry(PROFILE, 72, Math.PI);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i) * DEPTH;
    pos.setZ(i, z + muzzle(x, y) * smoothstep(0, 0.25, z));
  }
  geo.computeVertexNormals();
  // Fluff is added after the normals, so it scallops the outline without creasing the shading.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z / DEPTH);
    if (r < 1e-4) continue;
    const tuft = tuftedRadius(y);
    if (tuft > 0) {
      const side = smoothstep(0.6, 0.95, Math.abs(x) / r);
      const k = 1 + (side * Math.max(0, tuft - chinchillaRadius(y))) / r;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / PX;
    const y = pos.getY(i);
    const z = pos.getZ(i) / PX;
    const bump = (c: number) => Math.exp(-(((x - c) / 5.6) ** 2));
    const lift = 5.6 * (bump(-7.2) + bump(7.2)) * Math.exp(-((z / 15) ** 2)) * smoothstep(172, 184, y / PX);
    pos.setY(i, y + lift * PX);
  }
  return { geo, outline: PROFILE.map((q) => new THREE.Vector3(q.x, q.y, 0)) };
}

// ---- materials ----

/** Soft plush light fixed to the camera, so the sticker look survives orbiting. */
export const SOFT_GLSL = `
  vec3 softShade(vec3 col, vec3 n, vec3 v) {
    n = normalize(n);
    float w = dot(n, vec3(-0.302, 0.754, 0.583)) * 0.5 + 0.5;
    col *= mix(vec3(0.850, 0.822, 0.808), vec3(1.03), smoothstep(0.10, 0.86, w));
    float rim = pow(1.0 - clamp(dot(n, normalize(v)), 0.0, 1.0), 3.0);
    return col * (1.0 - 0.09 * rim);
  }
`;

const SOFT_VERTEX = `
  #ifdef CLOUD
    uniform vec3 uCloud;
  #endif
  uniform float uPull;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    #ifdef CLOUD
      n = normalize(normalize(n) * 0.45 + normalize(p.xyz - uCloud) * 0.55);
    #endif
    vec4 mv = modelViewMatrix * p;
    vN = normalMatrix * n;
    vV = -mv.xyz;
    mv.xyz -= normalize(mv.xyz) * uPull;
    gl_Position = projectionMatrix * mv;
  }
`;

/** `pull` brings a part towards the viewer along the view ray: in front, but not moved on screen. */
export function createSoftMaterial(hex: string, pull = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCol: { value: new THREE.Color(hex) },
      uPull: { value: pull },
    },
    vertexShader: SOFT_VERTEX,
    fragmentShader: `
      uniform vec3 uCol;
      varying vec3 vN;
      varying vec3 vV;
      ${SOFT_GLSL}
      void main() {
        gl_FragColor = vec4(softShade(uCol, vN, vV), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

const INK_FRAGMENT = `
  uniform vec3 uInk;
  void main() {
    gl_FragColor = vec4(uInk, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Inverted hull: back faces pushed out along the view-space normal. */
export function createInkMaterial(
  width: number = CHINCHILLA.inkWidth,
  hex: string = CHIN.ink,
  /** Pushes the hull away from the camera so overlapping parts only share an outer outline. */
  push = 0,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInk: { value: new THREE.Color(hex) },
      uWidth: { value: width },
      uPush: { value: push },
    },
    side: THREE.BackSide,
    vertexShader: `
      uniform float uWidth, uPush;
      void main() {
        vec4 p = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 mv = modelViewMatrix * p;
        mv.xyz += normalize(normalMatrix * n) * uWidth;
        mv.xyz += normalize(mv.xyz) * uPush;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: INK_FRAGMENT,
  });
}

/** Square canvas texture whose design-px origin is placed by `origin` (0..1, y down). */
function paintTexture(
  size: number,
  span: number,
  origin: [number, number],
  paint: (g: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  g.translate(size * origin[0], size * origin[1]);
  g.scale(size / span, size / span);
  paint(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Body texture: px span and seat position, shared with the body shader. */
const BODY_TEX = { span: 240, seat: 0.92 } as const;

function makeBodyTexture(): THREE.CanvasTexture {
  const size = 1024;
  const flat = document.createElement('canvas');
  flat.width = size;
  flat.height = size;
  {
    const g = flat.getContext('2d')!;
    g.translate(size * 0.5, size * BODY_TEX.seat);
    g.scale(size / BODY_TEX.span, size / BODY_TEX.span);
    const fur = g.createLinearGradient(0, -BODY_H - 14, 0, 0);
    fur.addColorStop(0, CHIN.furTop);
    fur.addColorStop(0.5, CHIN.fur);
    fur.addColorStop(1, CHIN.furLow);
    g.fillStyle = fur;
    g.fillRect(-200, -300, 400, 400);
    g.translate(0, -FRONT_LIFT);
    g.save();
    g.translate(0, -FACE_H);
    paintChinShade(g);
    g.restore();
    paintBelly(g, (x, h) => ({ x, y: -h }));
    g.translate(0, -FACE_H);
    paintFaceMarkings(g, { turn: 0, curious: 0, cross: 0, squint: 0 });
  }
  // Column by column, counter what is left of the raised camera (see faceDrop).
  return paintTexture(size, size, [0, 0], (g) => {
    g.drawImage(flat, 0, 0);
    for (let px = 0; px < size; px += 2) {
      const x = ((px + 1) / size - 0.5) * BODY_TEX.span * PX;
      const dy = (faceDrop(x) / PX) * (size / BODY_TEX.span);
      g.drawImage(flat, px, 0, 2, size, px, dy, 2, size);
    }
  });
}

/** Turns the upper body with the head; `vRest` keeps the undeformed position for the texture. */
const HEAD_GLSL = `
  uniform vec3 uHeadRot; // pitch, yaw, roll (Euler YXZ)
  vec3 turnHead(vec3 p, inout vec3 n) {
    float k = smoothstep(${CHINCHILLA.headBandLo.toFixed(5)}, ${CHINCHILLA.headBandHi.toFixed(5)}, p.y);
    vec3 c = cos(uHeadRot * k);
    vec3 s = sin(uHeadRot * k);
    // Column-major Ry * Rx * Rz, matching THREE.Euler(..., 'YXZ')
    mat3 rot = mat3(
      c.y * c.z + s.y * s.x * s.z,  c.x * s.z, -s.y * c.z + c.y * s.x * s.z,
      -c.y * s.z + s.y * s.x * c.z, c.x * c.z,  s.y * s.z + c.y * s.x * c.z,
      s.y * c.x,                    -s.x,       c.y * c.x
    );
    const vec3 PIVOT = vec3(0.0, ${CHINCHILLA.headCy.toFixed(5)}, 0.0);
    n = rot * n;
    return rot * (p - PIVOT) + PIVOT;
  }
`;

export function createChinchillaBodyMaterials(): {
  fill: THREE.ShaderMaterial;
  ink: THREE.ShaderMaterial;
  headRot: THREE.Vector3;
} {
  const headRot = new THREE.Vector3();
  const uHeadRot = { value: headRot };
  const fill = new THREE.ShaderMaterial({
    uniforms: { uHeadRot, uMap: { value: makeBodyTexture() } },
    vertexShader: `
      ${HEAD_GLSL}
      varying vec3 vRest;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vRest = position;
        vec3 n = normal;
        vec4 mv = modelViewMatrix * vec4(turnHead(position, n), 1.0);
        vN = normalMatrix * n;
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec3 vRest;
      varying vec3 vN;
      varying vec3 vV;
      ${SOFT_GLSL}
      void main() {
        // Face and belly are painted on the front; the coat carries on around the back.
        vec2 uv = vec2(0.5, ${(1 - BODY_TEX.seat).toFixed(4)}) + vRest.xy / ${(BODY_TEX.span * PX).toFixed(5)};
        if (vRest.z < 0.0) {
          float r = length(vec2(vRest.x, vRest.z / ${DEPTH.toFixed(3)}));
          uv.x = 0.5 + (vRest.x < 0.0 ? -r : r) / ${(BODY_TEX.span * PX).toFixed(5)};
        }
        vec3 col = textureGrad(uMap, uv, vec2(0.001, 0.0), vec2(0.0, 0.001)).rgb;
        gl_FragColor = vec4(softShade(col, vN, vV), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const ink = new THREE.ShaderMaterial({
    uniforms: { uHeadRot, uInk: { value: new THREE.Color(CHIN.ink) }, uWidth: { value: CHINCHILLA.inkWidth } },
    side: THREE.BackSide,
    vertexShader: `
      ${HEAD_GLSL}
      uniform float uWidth;
      void main() {
        vec3 n = normal;
        vec4 mv = modelViewMatrix * vec4(turnHead(position, n), 1.0);
        mv.xyz += normalize(normalMatrix * n) * uWidth;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: INK_FRAGMENT,
  });
  return { fill, ink, headRot };
}

// ---- inflated parts ----

/** Pillow mesh from a closed outline. `z(r, dir)` gives depth from centre (0) to rim (1). */
function inflate(
  ring: THREE.Vector2[],
  center: THREE.Vector2,
  rings: number,
  z: (r: number, dir: 1 | -1) => number,
): THREE.BufferGeometry {
  const M = ring.length;
  let area = 0;
  for (let i = 0; i < M; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % M];
    area += a.x * b.y - b.x * a.y;
  }
  const ccw = area > 0;
  const pos: number[] = [];
  const front: number[] = [];
  const index: number[] = [];
  const push = (x: number, y: number, d: number, f: number) => {
    pos.push(x, y, d);
    front.push(f);
    return pos.length / 3 - 1;
  };
  const rim = ring.map((q) => push(q.x, q.y, 0, 0.5));
  for (const dir of [1, -1] as const) {
    const f = dir > 0 ? 1 : 0;
    const flip = dir > 0 !== ccw;
    let outer = rim;
    for (let k = rings - 1; k >= 1; k--) {
      const r = k / rings;
      const inner = ring.map((q) =>
        push(mix(center.x, q.x, r), mix(center.y, q.y, r), z(r, dir), f),
      );
      for (let j = 0; j < M; j++) {
        const n = (j + 1) % M;
        const q = [outer[j], outer[n], inner[n], outer[j], inner[n], inner[j]];
        index.push(...(flip ? q.reverse() : q));
      }
      outer = inner;
    }
    const mid = push(center.x, center.y, z(0, dir), f);
    for (let j = 0; j < M; j++) {
      const t = [outer[j], outer[(j + 1) % M], mid];
      index.push(...(flip ? t.reverse() : t));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('front', new THREE.Float32BufferAttribute(front, 1));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

const EAR_SPAN = 120;

export function buildChinchillaEar(side: -1 | 1): { group: THREE.Group; solid: THREE.Mesh } {
  const pts = sampleCubics(EAR_START, EAR_PATH, 16);
  pts.push({ x: 20, y: 15 });
  const ring = pts.map((q) => new THREE.Vector2(side * q.x * PX, -q.y * PX));
  const geo = inflate(ring, new THREE.Vector2(0, 30 * PX), 14, (r, dir) => {
    const cup = -0.085 * (1 - r * r) + 0.022 * Math.exp(-(((r - 0.9) / 0.09) ** 2));
    return cup + dir * 0.042 * Math.sqrt(Math.max(0, 1 - r * r));
  });
  const map = paintTexture(512, EAR_SPAN, [0.5, 0.72], (g) => {
    g.fillStyle = CHIN.earRim;
    g.fillRect(-100, -120, 200, 200);
    g.scale(side, 1);
    g.beginPath();
    const s = EAR_INNER;
    g.moveTo(EAR_START[0] * s, EAR_START[1] * s - 1);
    for (const [a, b, c] of EAR_PATH) {
      g.bezierCurveTo(a[0] * s, a[1] * s - 1, b[0] * s, b[1] * s - 1, c[0] * s, c[1] * s - 1);
    }
    g.closePath();
    g.clip();
    paintEarSkin(g, side);
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uSpan: { value: EAR_SPAN * PX },
      uBack: { value: new THREE.Color(CHIN.earRim) },
    },
    vertexShader: `
      attribute float front;
      varying vec3 vRest;
      varying vec3 vN;
      varying vec3 vV;
      varying float vFront;
      void main() {
        vRest = position;
        vFront = front;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalMatrix * normal;
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uSpan;
      uniform vec3 uBack;
      varying vec3 vRest;
      varying vec3 vN;
      varying vec3 vV;
      varying float vFront;
      ${SOFT_GLSL}
      void main() {
        vec3 skin = texture2D(uMap, vec2(vRest.x / uSpan + 0.5, vRest.y / uSpan + 0.28)).rgb;
        vec3 col = mix(uBack, skin, smoothstep(0.45, 0.55, vFront));
        gl_FragColor = vec4(softShade(col, vN, vV), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const solid = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(solid, new THREE.Mesh(geo, createInkMaterial()));
  group.visible = false;
  return { group, solid };
}

// ---- face ----

export interface ChinchillaFace {
  group: THREE.Group;
  smile: THREE.Object3D;
  frown: THREE.Object3D;
  oh: THREE.Object3D;
  /** Open mouth + tongue, scaled by how happy it is. */
  open: THREE.Group;
}

const quad = (a: number, b: number, c: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

/** Tube stroke lying on the face, given in face px (y down). */
function faceStroke(
  point: (t: number) => [x: number, y: number],
  radius: (t: number) => number,
  segments: number,
  lift: number,
): THREE.BufferGeometry {
  const tube = new TaperTube3D(segments, 6, new THREE.MeshBasicMaterial(), 12);
  tube.update(
    (t, out) => {
      const [px, py] = point(t);
      const x = px * PX;
      const y = -py * PX - faceDrop(x);
      out.set(x, y, faceZ(x, y) + lift);
    },
    (t) => radius(t) * PX,
  );
  return tube.mesh.geometry;
}

/** Flat decal lying on the face, from a closed cubic outline in face px. */
function faceDecal(start: readonly [number, number], segs: readonly Cubic[], lift: number): THREE.BufferGeometry {
  const pts = sampleCubics(start, segs, 10);
  const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(q.x * PX, -q.y * PX)));
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, faceZ(pos.getX(i), pos.getY(i)) + lift);
  return geo;
}

/** Quadratic outline helper: [control, end] pairs to cubics. */
function quads(start: readonly [number, number], list: ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]>): Cubic[] {
  let p = start;
  return list.map(([c, e]) => {
    const seg: Cubic = [
      [p[0] + ((c[0] - p[0]) * 2) / 3, p[1] + ((c[1] - p[1]) * 2) / 3],
      [e[0] + ((c[0] - e[0]) * 2) / 3, e[1] + ((c[1] - e[1]) * 2) / 3],
      e,
    ];
    p = e;
    return seg;
  });
}

const capped = (r: number) => (t: number) =>
  r * Math.sqrt(Math.max(0.03, 1 - Math.max(0, (Math.abs(t - 0.5) * 2 - 0.84) / 0.16) ** 2));

export function buildChinchillaFace(): ChinchillaFace {
  const group = new THREE.Group();
  const flat = (hex: string) =>
    new THREE.MeshBasicMaterial({
      color: hex,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
  const mouthMat = flat(CHIN.mouth);

  // Nose.
  const noseGeo = new THREE.SphereGeometry(1, 24, 16);
  const np = noseGeo.attributes.position;
  for (let i = 0; i < np.count; i++) {
    np.setX(i, np.getX(i) * mix(0.5, 1.06, smoothstep(-1, 0.6, np.getY(i))));
  }
  noseGeo.computeVertexNormals();
  const nose = new THREE.Mesh(noseGeo, createSoftMaterial(CHIN.nose));
  const ny = -10.2 * PX;
  nose.position.set(0, ny, faceZ(0, ny) + 0.004);
  nose.scale.set(6 * PX, 4.6 * PX, 0.032);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), flat('#fff2f0'));
  shine.position.set(-2 * PX, ny + 1.9 * PX, faceZ(0, ny) + 0.03);
  shine.scale.set(1.8 * PX, 1.0 * PX, 0.006);
  group.add(nose, shine);

  // Mouths.
  const lip = capped(1.2);
  const smile = new THREE.Mesh(
    mergeStaticGeometries(
      [-1, 1].map((s) => ({
        geo: faceStroke((t) => [s * quad(8.4, 6.2, 0, t), quad(17.5, 23.3, 18.5, t)], lip, 16, 0.010),
      })),
    ),
    mouthMat,
  );
  const frown = new THREE.Mesh(
    faceStroke((t) => [quad(-6, 0, 6, t), quad(23, 17.2, 23, t)], lip, 14, 0.010),
    mouthMat,
  );
  frown.visible = false;
  const ohStart: readonly [number, number] = [3.2, 21.5];
  const ohSegs = quads(ohStart, [
    [[3.2, 25.3], [0, 25.3]],
    [[-3.2, 25.3], [-3.2, 21.5]],
    [[-3.2, 17.7], [0, 17.7]],
    [[3.2, 17.7], [3.2, 21.5]],
  ]);
  const oh = new THREE.Mesh(faceDecal(ohStart, ohSegs, 0.010), flat(CHIN.mouthIn));
  oh.visible = false;

  // Open mouth hangs from the lip line so it can be scaled open.
  const open = new THREE.Group();
  const hinge = -20.1 * PX;
  const mStart: readonly [number, number] = [-4.8, 20.1];
  const mouthIn = new THREE.Mesh(
    faceDecal(mStart, quads(mStart, [[[0, 21.1], [4.8, 20.1]], [[5, 28.3], [0, 28.7]], [[-5, 28.3], [-4.8, 20.1]]]), 0.008),
    flat(CHIN.mouthIn),
  );
  const tStart: readonly [number, number] = [-3.2, 26.8];
  const tongue = new THREE.Mesh(
    faceDecal(tStart, quads(tStart, [[[0, 23.8], [3.2, 26.8]], [[2.4, 28.6], [0, 28.7]], [[-2.4, 28.6], [-3.2, 26.8]]]), 0.012),
    flat(CHIN.tongue),
  );
  for (const m of [mouthIn, tongue]) m.position.y = -hinge;
  open.add(mouthIn, tongue);
  open.position.y = hinge;
  open.visible = false;
  group.add(smile, frown, oh, open);

  // Whiskers, plus a thicker copy that only gives them their white border.
  const whiskers = (thick: number) =>
    mergeStaticGeometries(
      [-1, 1].flatMap((s) =>
        WHISKERS.map(([x0, y0, cx, cy, x1, y1]) => {
          const tube = new TaperTube3D(12, 6, mouthMat, 12);
          const drop = faceDrop(x0 * PX);
          const z0 = faceZ(x0 * PX, -y0 * PX - drop);
          tube.update(
            (t, out) =>
              out.set(
                s * quad(x0, cx, x1, t) * PX,
                -quad(y0, cy, y1, t) * PX - drop,
                quad(z0 + 0.004, z0 + 0.02, z0 - 0.16, t),
              ),
            (t) => thick || 0.0098 * (1 - 0.4 * t),
          );
          return { geo: tube.mesh.geometry };
        }),
      ),
    );
  const whiskerMesh = new THREE.Mesh(whiskers(0), new THREE.MeshBasicMaterial({ color: CHIN.ink, transparent: true }));
  whiskerMesh.renderOrder = 12;
  const halo = new THREE.Mesh(whiskers(0.024), new THREE.MeshBasicMaterial());
  halo.userData.stickerOnly = true;
  group.add(whiskerMesh, halo);
  group.visible = false;
  return { group, smile, frown, oh, open };
}

/** Eye patch, sleep arc, happy arc and petting blush, in head space. */
export function buildChinchillaEyeRig(side: -1 | 1): {
  patch: THREE.BufferGeometry;
  sleep: THREE.BufferGeometry;
  happy: THREE.BufferGeometry;
  blush: THREE.BufferGeometry;
} {
  const cx = side * CHINCHILLA.eyeX;
  const patchGeo = (x0: number, y0: number, rx: number, ry: number, lift: number, segs: number) => {
    const geo = new THREE.PlaneGeometry(2, 2, segs, segs);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = x0 + pos.getX(i) * rx;
      const y = y0 + pos.getY(i) * ry - faceDrop(x);
      pos.setXYZ(i, x, y, faceZ(x, y) + lift);
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  };
  const lid = capped(1.55);
  const k = CHINCHILLA.eyePatch;
  return {
    patch: patchGeo(cx, 0, CHINCHILLA.eyeRx * k, CHINCHILLA.eyeRy * k, 0.010, 20),
    sleep: faceStroke((t) => [side * 38 + mix(-10, 10, t), quad(0, 8.5, 0, t)], lid, 18, 0.016),
    happy: faceStroke((t) => [side * 38 + mix(-10.5, 10.5, t), quad(5, -9.5, 5, t)], lid, 18, 0.016),
    blush: patchGeo(side * 65 * PX, -19.5 * PX, 20 * PX, 14 * PX, 0.008, 8),
  };
}

/**
 * Glossy eye matching the 2D one. Uniforms the engine drives: scale (blink), gaze, grumpy lid and
 * curiosity; they mirror the cats' eye shader.
 */
export function createChinchillaEyeMaterial(side: -1 | 1): THREE.ShaderMaterial {
  const color = (hex: string) => ({ value: new THREE.Color(hex) });
  return new THREE.ShaderMaterial({
    uniforms: {
      uSide: { value: side },
      uScale: { value: new THREE.Vector2(1 / CHINCHILLA.eyePatch, 1 / CHINCHILLA.eyePatch) },
      uGaze: { value: new THREE.Vector2(0, 0) },
      uCross: { value: 0 },
      uCurious: { value: 0 },
      uTop: color(CHIN.eyeTop),
      uMid: color(CHIN.eyeMid),
      uLow: color(CHIN.eyeLow),
      uGlow: color(CHIN.eyeGlow),
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: `
      varying vec2 vEye;
      void main() {
        vEye = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uSide, uCross, uCurious;
      uniform vec2 uScale, uGaze;
      uniform vec3 uTop, uMid, uLow, uGlow;
      varying vec2 vEye;
      float disc(vec2 p, vec2 c, vec2 r) {
        float d = length((p - c) / r);
        float a = max(fwidth(d), 0.012);
        return 1.0 - smoothstep(1.0 - a, 1.0 + a, d);
      }
      void main() {
        vec2 p = vEye / max(uScale, vec2(0.04));
        vec2 g = uGaze * vec2(0.206, 0.156);
        float alpha = disc(p, vec2(0.0), vec2(1.0));
        float t = 0.5 - p.y * 0.5;
        vec3 col = mix(mix(uTop, uMid, smoothstep(0.0, 0.55, t)), uLow, smoothstep(0.55, 1.0, t));
        // Warm crescent in the lower iris.
        float glow = disc(p, vec2(g.x * 0.5, -0.42), vec2(0.62, 0.36)) * (1.0 - disc(p, vec2(g.x * 0.5, -0.22), vec2(0.78, 0.42)));
        col = mix(col, uGlow, glow * 0.8);
        // Glints stay round: r is in units of the eye's half-width.
        vec2 q = vec2(1.0, 0.894);
        float shine = disc(p, g + vec2(-0.32, 0.38), vec2(0.38 + 0.05 * uCurious) * q);
        shine = max(shine, disc(p, g + vec2(0.40, -0.34), vec2(0.18 + 0.06 * uCurious) * q));
        shine = max(shine, disc(p, g + vec2(0.44, 0.32), vec2(0.09) * q));
        col = mix(col, vec3(1.0), shine);
        if (uCross > 0.02) {
          // Slanted lid, lowest towards the nose, with an inked edge.
          float k = clamp(uSide * p.x * 0.5 + 0.5, -0.1, 1.1);
          float lid = mix(1.3, mix(0.21, 0.75, k), uCross);
          float e = max(fwidth(p.y), 0.012);
          alpha *= 1.0 - smoothstep(lid - e, lid + e, p.y);
          float bar = (1.0 - smoothstep(0.105 - e, 0.105 + e, abs(p.y - lid)))
                    * (1.0 - smoothstep(1.06, 1.11, abs(p.x))) * smoothstep(0.05, 0.4, uCross);
          col = mix(col, uMid, bar);
          alpha = max(alpha, bar);
        }
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

// ---- arms, tail, heart ----

const SLEEVE_RINGS = 18;
const PALM_RINGS = 8;
const TOE_RINGS = 20;
const PAW_RINGS = PALM_RINGS + TOE_RINGS;
const ARM_RADIAL = 32;
/** Paw size in world units; at the wrist it runs on straight into the sleeve. */
export const PAW = { length: 0.34, halfWidth: 0.18, halfHeight: 0.124, wrist: 0.157, sole: 0.08, toe: 0.026 } as const;
/** Sleeve radius at the shoulder. */
export const SHOULDER_R = 0.168;
const ARM_PULL = '0.160';

/** Roundness of the toes' end seen from above: 2 would be a circle. */
const PAW_ROUND = 2.2;
/** Half-width / half-height of the paw along it, 0 at the wrist and 1 at the toes. */
const pawProfile = (v: number, size: number) =>
  v < 0.5
    ? mix(PAW.wrist, size, smoothstep(0, 0.5, v))
    : size * Math.pow(Math.max(0, 1 - Math.pow((v - 0.5) / 0.5, PAW_ROUND)), 1 / PAW_ROUND);

/** Three round toes across the paw, `x` from -1 to 1; the gaps between them are just wide enough for the outline. */
const TOE_GAP = 0.38;
const toeShape = (x: number) => 2 * Math.hypot(Math.cos(x * Math.PI * 1.5), TOE_GAP) - 1;
/** How far the toes stick out, by the place along the paw. */
const toeReach = (v: number) => PAW.toe * smoothstep(0.62, 0.96, v);

/**
 * Sleeve and three-toed mitten in one skin, so nothing can poke through at the wrist. Rebuilt in
 * place each frame; its flat side always faces `up`.
 */
export class ChinchillaArm {
  public readonly group = new THREE.Group();
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly toes: THREE.Mesh;
  private readonly cos = new Float32Array(ARM_RADIAL);
  private readonly sin = new Float32Array(ARM_RADIAL);
  private readonly c = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly T = new THREE.Vector3();
  private readonly U = new THREE.Vector3();
  private readonly S = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  /** How far along the sleeve its outline fades in, and has swelled to the full line as a multiple of that. */
  private readonly uFade = { value: 0.42 };
  private readonly uSwell = { value: 1.2 };
  /** How far along the sleeve it has become solid. */
  private readonly uSolid = { value: 0.4 };
  /** Body normal at the shoulder: the sleeve is lit like the fur it grows out of. */
  private readonly uBodyN = { value: new THREE.Vector3(0, 0, 1) };

  constructor() {
    const rings = SLEEVE_RINGS + 1 + PAW_RINGS;
    const count = rings * ARM_RADIAL;
    this.pos = new Float32Array(count * 3);
    const root = new Float32Array(count);
    const cuff = new Float32Array(count * 2);
    const index: number[] = [];
    for (let j = 0; j < ARM_RADIAL; j++) {
      this.cos[j] = Math.cos((j / ARM_RADIAL) * Math.PI * 2);
      this.sin[j] = Math.sin((j / ARM_RADIAL) * Math.PI * 2);
    }
    for (let i = 0; i < rings; i++) {
      const u = Math.min(1, i / SLEEVE_RINGS);
      const v = i <= SLEEVE_RINGS ? u - 1 : this.pawV(i - SLEEVE_RINGS);
      for (let j = 0; j < ARM_RADIAL; j++) {
        root[i * ARM_RADIAL + j] = u;
        cuff[(i * ARM_RADIAL + j) * 2] = v;
        cuff[(i * ARM_RADIAL + j) * 2 + 1] = this.cos[j];
        if (i === rings - 1) continue;
        const a = i * ARM_RADIAL + j;
        const b = i * ARM_RADIAL + ((j + 1) % ARM_RADIAL);
        index.push(a, b, a + ARM_RADIAL, b, b + ARM_RADIAL, a + ARM_RADIAL);
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('root', new THREE.BufferAttribute(root, 1));
    this.geo.setAttribute('cuff', new THREE.BufferAttribute(cuff, 2));
    this.geo.setIndex(index);

    // The root sinks into the fur, the rest comes towards the viewer (along the view ray, so it does
    // not move on screen): the arm always lies on top of the body, the keys and the mouse.
    const layer = (root: string) => `
      float k = 1.0 - smoothstep(0.0, 0.34, ${root});
      mv.xyz += normalize(mv.xyz) * (0.22 * k * k - ${ARM_PULL} * smoothstep(0.1, 0.5, ${root}));
    `;
    const fill = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({
        uniforms: {
          uFur: { value: new THREE.Color('#d7cbbf') },
          uPaw: { value: new THREE.Color(CHIN.paw) },
          uBodyN: this.uBodyN,
          uSolid: this.uSolid,
        },
        transparent: true,
        vertexShader: `
          uniform vec3 uBodyN;
          attribute float root;
          attribute vec2 cuff;
          varying vec2 vCuff;
          varying float vRoot;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vCuff = cuff;
            vRoot = root;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalMatrix * normalize(mix(uBodyN, normal, smoothstep(0.1, 0.75, root)));
            ${layer('root')}
            vV = -mv.xyz;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 uFur, uPaw;
          uniform float uSolid;
          varying vec2 vCuff;
          varying float vRoot;
          varying vec3 vN;
          varying vec3 vV;
          ${SOFT_GLSL}
          void main() {
            // The fur ends in an arch across the back of the paw.
            float e = max(fwidth(vCuff.x), 0.035);
            float edge = 0.22 + 0.17 * vCuff.y * vCuff.y;
            vec3 col = mix(uFur, uPaw, smoothstep(edge - e, edge + e, vCuff.x));
            gl_FragColor = vec4(softShade(col, vN, vV), smoothstep(0.04, uSolid, vRoot));
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    const ink = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({
        uniforms: {
          uInk: { value: new THREE.Color(CHIN.ink) },
          uWidth: { value: CHINCHILLA.inkWidth },
          uFade: this.uFade,
          uSwell: this.uSwell,
        },
        side: THREE.BackSide,
        vertexShader: `
          attribute float root;
          uniform float uWidth, uFade, uSwell;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            mv.xyz += normalize(normalMatrix * normal) * uWidth * smoothstep(uFade * 0.6, uFade * uSwell, root);
            // Hidden in the fur at the shoulder: only the sides of the sleeve are drawn.
            mv.xyz += normalize(mv.xyz) * 0.42 * (1.0 - smoothstep(uFade * 0.5, uFade * 1.1, root));
            ${layer('root')}
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: INK_FRAGMENT,
      }),
    );
    this.toes = new THREE.Mesh(
      this.buildToes(),
      new THREE.ShaderMaterial({
        uniforms: { uInk: { value: new THREE.Color(CHIN.toe) } },
        vertexShader: `
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            ${layer('1.0')}
            mv.xyz -= normalize(mv.xyz) * 0.02;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: INK_FRAGMENT,
      }),
    );
    this.toes.matrixAutoUpdate = false;
    for (const m of [fill, ink, this.toes]) {
      m.frustumCulled = false;
      this.group.add(m);
    }
    fill.userData.sticker = true;
    fill.renderOrder = 20;
    ink.renderOrder = 19;
    this.toes.renderOrder = 21;
    this.group.visible = false;
  }

  /** Rings are evenly spread over the palm, and across the toes, where the outline turns. */
  private pawV(j: number): number {
    if (j <= PALM_RINGS) return (0.5 * j) / PALM_RINGS;
    const across = 1 - (j - PALM_RINGS) / TOE_RINGS;
    return 0.5 + 0.5 * Math.pow(Math.max(0, 1 - Math.pow(across, PAW_ROUND)), 1 / PAW_ROUND);
  }

  /** Two short creases that run up the back of the paw from between the toes, in paw space (x across, y up, z to the toes). */
  private buildToes(): THREE.BufferGeometry {
    return mergeStaticGeometries(
      [-1, 1].map((s) => {
        const x = (s * PAW.halfWidth) / 3;
        const tube = new TaperTube3D(10, 6, new THREE.MeshBasicMaterial(), 21);
        tube.update(
          (t, out) => {
            const v = mix(0.7, 0.985, Math.sin((t * Math.PI) / 2));
            const w = pawProfile(v, PAW.halfWidth);
            const y = pawProfile(v, PAW.halfHeight) * Math.sqrt(Math.max(0, 1 - (x / w) ** 2));
            out.set(x, y + 0.002, v * PAW.length + toeReach(v) * toeShape(1 / 3) + 0.003);
          },
          (t) => 0.0085 * Math.sqrt(Math.max(0.02, 1 - Math.max(0, (0.35 - t) / 0.35, (t - 0.75) / 0.25) ** 2)),
        );
        return { geo: tube.mesh.geometry };
      }),
    );
  }

  /**
   * @param a shoulder, inside the body
   * @param b,c Bezier handles of the sleeve
   * @param d wrist
   * @param dir unit direction the mitten points in
   * @param up unit-ish vector the back of the hand faces
   * @param fade how far along the sleeve the outline fades in
   * @param bodyNormal of the fur at the shoulder
   * @param size of the mitten and cuff
   * @param solid how far along the sleeve it has become solid
   * @param shoulder radius of the sleeve at the shoulder
   * @param swell how soon the outline is full, as a multiple of `fade`
   */
  public update(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    dir: THREE.Vector3,
    up: THREE.Vector3,
    fade: number,
    bodyNormal: THREE.Vector3,
    size = 1,
    solid = 0.4,
    shoulder = SHOULDER_R,
    swell = 1.2,
  ): void {
    this.uFade.value = fade;
    this.uSwell.value = swell;
    this.uSolid.value = solid;
    this.uBodyN.value.copy(bodyNormal).normalize();
    const { pos, T, U, S } = this;
    const frame = () => {
      U.copy(up).addScaledVector(T, -up.dot(T)).normalize();
      S.crossVectors(U, T);
    };
    const ring = (i: number, w: number, h: number, flat: number, toe: number) => {
      for (let j = 0; j < ARM_RADIAL; j++) {
        const cs = this.cos[j];
        const sn = this.sin[j];
        const y = sn < 0 ? sn * mix(h, h * (PAW.sole / PAW.halfHeight), flat) : sn * h;
        const push = toe > 0 ? toe * toeShape((cs * w) / (PAW.halfWidth * size)) : 0;
        const k = (i * ARM_RADIAL + j) * 3;
        pos[k] = this.c.x + S.x * cs * w + U.x * y + T.x * push;
        pos[k + 1] = this.c.y + S.y * cs * w + U.y * y + T.y * push;
        pos[k + 2] = this.c.z + S.z * cs * w + U.z * y + T.z * push;
      }
    };
    for (let i = 0; i <= SLEEVE_RINGS; i++) {
      const u = i / SLEEVE_RINGS;
      const m = 1 - u;
      this.c
        .set(0, 0, 0)
        .addScaledVector(a, m * m * m)
        .addScaledVector(b, 3 * m * m * u)
        .addScaledVector(c, 3 * m * u * u)
        .addScaledVector(d, u * u * u);
      T.set(0, 0, 0)
        .addScaledVector(this.n.subVectors(b, a), m * m)
        .addScaledVector(this.n.subVectors(c, b), 2 * m * u)
        .addScaledVector(this.n.subVectors(d, c), u * u)
        .normalize();
      frame();
      const r = mix(shoulder, PAW.wrist * size, smoothstep(0, 1, u));
      ring(i, r, r, smoothstep(0.3, 1, u), 0);
    }
    T.copy(dir).normalize();
    frame();
    for (let j = 1; j <= PAW_RINGS; j++) {
      const v = this.pawV(j);
      this.c.copy(d).addScaledVector(T, v * PAW.length * size);
      ring(
        SLEEVE_RINGS + j,
        pawProfile(v, PAW.halfWidth) * size,
        pawProfile(v, PAW.halfHeight) * size,
        1,
        toeReach(v) * size,
      );
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.basis.makeBasis(S, U, T).scale(this.n.setScalar(size)).setPosition(d);
    this.toes.matrix.copy(this.basis);
    this.toes.matrixWorldNeedsUpdate = true;
  }
}

/** The tail's outlines sit behind all its parts, so only the outer edge of the whole is drawn. */
const TAIL_INK_PUSH = 0.16;
const TAIL_FUR = '#d9cec2';

const STALK_RINGS = 48;

/** Cloud tail: instanced puffs, plus the stalk it swings over to a key on. */
export class ChinchillaTail {
  public readonly group = new THREE.Group();
  private readonly stalk: TaperTube3D;
  private readonly stalkInk: THREE.Mesh;
  /** Fur that fills the inside of the stalk's bend, so the tail is plump at the root and no gap opens up. */
  private readonly web: THREE.Mesh;
  private readonly webPos = new Float32Array((STALK_RINGS + 2) * 3);
  private readonly uWebDist = { value: 1 };
  /** Where along the stalk it has come furthest out from the body and turns to the front. */
  private readonly uTurn = { value: 0.5 };
  private readonly tmpPoint = new THREE.Vector3();
  private readonly fill: THREE.InstancedMesh;
  private readonly fillMat: THREE.ShaderMaterial;
  private readonly ink: THREE.InstancedMesh;
  private readonly inkMat = createInkMaterial(CHINCHILLA.inkWidth, CHIN.ink, TAIL_INK_PUSH);
  /** How far the tail is layered towards the viewer. */
  private readonly uLayer = { value: 0 };
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor() {
    const geo = new THREE.SphereGeometry(1, 24, 18);
    this.fillMat = createSoftMaterial(TAIL_FUR);
    this.fillMat.defines = { CLOUD: 1 };
    this.fillMat.uniforms.uCloud = { value: new THREE.Vector3() };
    this.fill = new THREE.InstancedMesh(geo, this.fillMat, TAIL_PUFFS.length);
    this.ink = new THREE.InstancedMesh(geo, this.inkMat, TAIL_PUFFS.length);

    // The stalk starts well behind the body and comes to the front on its way.
    const layer =
      'mv.xyz += normalize(mv.xyz) * (0.3 * (1.0 - smoothstep(uTurn - 0.06, uTurn + 0.1, along)) - uLayer * smoothstep(uTurn + 0.04, uTurn + 0.18, along));';
    this.stalk = new TaperTube3D(
      STALK_RINGS,
      18,
      new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(TAIL_FUR) }, uLayer: this.uLayer, uTurn: this.uTurn },
        vertexShader: `
          attribute float along;
          uniform float uLayer, uTurn;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalMatrix * normal;
            vV = -mv.xyz;
            ${layer}
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 uCol;
          varying vec3 vN;
          varying vec3 vV;
          ${SOFT_GLSL}
          void main() {
            gl_FragColor = vec4(softShade(uCol, vN, vV), 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    this.stalkInk = new THREE.Mesh(
      this.stalk.mesh.geometry,
      new THREE.ShaderMaterial({
        uniforms: {
          uInk: { value: new THREE.Color(CHIN.ink) },
          uWidth: { value: CHINCHILLA.inkWidth },
          uLayer: this.uLayer,
          uTurn: this.uTurn,
        },
        side: THREE.BackSide,
        vertexShader: `
          attribute float along;
          uniform float uWidth, uLayer, uTurn;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            mv.xyz += normalize(normalMatrix * normal) * uWidth;
            // Behind the fur inside the bend, so only the outside of the root is outlined.
            mv.xyz += normalize(mv.xyz) * (${TAIL_INK_PUSH.toFixed(3)} + 0.3 * (1.0 - smoothstep(uTurn - 0.04, uTurn + 0.14, along)));
            ${layer}
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: INK_FRAGMENT,
      }),
    );
    this.stalkInk.frustumCulled = false;
    const webGeo = new THREE.BufferGeometry();
    webGeo.setAttribute('position', new THREE.BufferAttribute(this.webPos, 3).setUsage(THREE.DynamicDrawUsage));
    const fan: number[] = [];
    for (let i = 1; i <= STALK_RINGS; i++) fan.push(0, i, i + 1);
    webGeo.setIndex(fan);
    this.web = new THREE.Mesh(
      webGeo,
      new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(TAIL_FUR) }, uDist: this.uWebDist },
        side: THREE.DoubleSide,
        vertexShader: `
          uniform float uDist;
          varying vec3 vV;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            // Laid flat behind the body and the desk, over the stalk's own root.
            mv.xyz = normalize(mv.xyz) * uDist;
            vV = -mv.xyz;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 uCol;
          varying vec3 vV;
          ${SOFT_GLSL}
          void main() {
            gl_FragColor = vec4(softShade(uCol, normalize(vV), vV), 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    this.web.frustumCulled = false;
    this.group.add(this.stalk.mesh, this.stalkInk, this.web);
    for (const mesh of [this.fill, this.ink]) {
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.group.visible = false;
  }

  public get count(): number {
    return TAIL_PUFFS.length;
  }

  /** Resting puff in body-local units; `out` gets the centre, the return value is the radius. */
  public rest(i: number, out: THREE.Vector3): number {
    const [x, h, r] = TAIL_PUFFS[i];
    // Far enough back that the body's outline always covers it, fanned a little for volume.
    out.set((x - 10) * PX, (h - 12) * PX, TAIL_Z + 0.04 * Math.sin(i * 2.4));
    return r * PX;
  }

  public set(i: number, center: THREE.Vector3, radius: number): void {
    this.m.compose(this.p.copy(center), this.q, this.s.setScalar(radius));
    this.fill.setMatrixAt(i, this.m);
    this.ink.setMatrixAt(i, this.m);
  }

  /** Lay the stalk along a path from the hip to the cloud, out to one `side`; `viewer` is the camera's position. */
  public layStalk(
    path: (u: number, out: THREE.Vector3) => void,
    radius: (u: number) => number,
    side: -1 | 1,
    viewer: THREE.Vector3,
  ): void {
    this.stalk.update(path, radius);
    const q = this.tmpPoint;
    path(0, q);
    this.uWebDist.value = q.distanceTo(viewer) - 0.24;
    // Its foot is out of sight behind the keyboard.
    q.y -= 0.5;
    q.toArray(this.webPos, 0);
    let turn = 0;
    let far = -Infinity;
    for (let i = 0; i <= STALK_RINGS; i++) {
      path(i / STALK_RINGS, q);
      q.toArray(this.webPos, (i + 1) * 3);
      if (side * q.x > far) {
        far = side * q.x;
        turn = i / STALK_RINGS;
      }
    }
    this.uTurn.value = Math.max(0.3, Math.min(0.62, turn));
    this.web.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * `cloud` is the centre the puffs are shaded around, so they read as one fluffy mass; `layer` brings
   * it in front of keys and paws, and the stalk only shows while it is out.
   */
  public commit(cloud: THREE.Vector3, layer: number, out: boolean): void {
    (this.fillMat.uniforms.uCloud.value as THREE.Vector3).copy(cloud);
    this.fillMat.uniforms.uPull.value = layer;
    this.inkMat.uniforms.uPush.value = TAIL_INK_PUSH - layer;
    this.uLayer.value = layer;
    this.stalk.mesh.visible = out;
    this.stalkInk.visible = out;
    this.web.visible = out;
    this.fill.instanceMatrix.needsUpdate = true;
    this.ink.instanceMatrix.needsUpdate = true;
  }
}

/** Puffy heart, about 2 units wide: a sphere folded along its middle, so it has no crease. */
export function buildChinchillaHeart(): THREE.Group {
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const fold = Math.sqrt(x * x + 0.012);
    pos.setXYZ(i, x * (0.92 + 0.08 * y), y * 0.76 + 1.12 * fold - 0.46 * x * x - 0.26, pos.getZ(i) * 0.46);
  }
  geo.computeVertexNormals();
  // One normal at each pole, or the outline frays at the tip.
  const normal = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const row = Math.floor(i / 49);
    if (row === 0 || row === 32) normal.setXYZ(i, 0, row === 0 ? 1 : -1, 0);
  }
  const group = new THREE.Group();
  const shine = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), createSoftMaterial('#fff6f4', 0.06));
  shine.position.set(-0.46, 0.46, 0.34);
  shine.scale.set(0.16, 0.10, 0.05);
  shine.rotation.z = 0.7;
  group.add(
    // In front of the belly it is held against.
    new THREE.Mesh(geo, createSoftMaterial(CHIN.heart, 0.06)),
    new THREE.Mesh(geo, createInkMaterial(CHINCHILLA.inkWidth, CHIN.heartInk, -0.06)),
    shine,
  );
  group.visible = false;
  return group;
}

/** Cream headphones in head space, layered in front of the fur so ears and cheeks never poke through. */
export function buildChinchillaHeadset(): { group: THREE.Group; led: THREE.MeshBasicMaterial } {
  const PULL = 0.16;
  const group = new THREE.Group();
  const shell = createSoftMaterial(CHIN_HEADSET.shell, PULL);
  const pad = createSoftMaterial(CHIN_HEADSET.pad, PULL);
  const boom = createSoftMaterial(CHIN_HEADSET.boom, PULL);
  const ink = createInkMaterial(0.014, CHIN.ink, -PULL);
  const led = new THREE.MeshBasicMaterial({ color: CHIN_HEADSET.led });
  led.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
      mvPosition.xyz -= normalize(mvPosition.xyz) * ${(PULL + 0.01).toFixed(3)};
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, outlined = true) => {
    group.add(new THREE.Mesh(geo, mat));
    if (outlined) group.add(new THREE.Mesh(geo, ink));
  };
  const arch = (t0: number, t1: number, lift: number, z: number, r: number) => {
    // Just outside the silhouette from cup to cup.
    const pts: THREE.Vector3[] = [];
    const at = (t: number) => {
      const a = (t - 0.5) * Math.PI;
      const side = Math.sign(a) * Math.abs(Math.sin(a)) ** 0.94;
      return new THREE.Vector3(side * (1.0 + lift), -0.02 + (0.69 + lift) * Math.max(0, Math.cos(a)) ** 0.86, z);
    };
    for (let i = 0; i <= 28; i++) pts.push(at(mix(t0, t1, i / 28)));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, r, 12, false);
  };
  add(arch(0.3, 0.7, -0.05, 0.03, 0.045), pad, false);
  add(arch(0.02, 0.98, 0.02, 0, 0.058), shell);

  // Cups are turned a little to the front so their rings show.
  const parts: Array<[THREE.BufferGeometry, THREE.Material, boolean]> = [
    [new THREE.SphereGeometry(1, 26, 18).scale(0.085, 0.25, 0.215).translate(-0.05, 0, 0), pad, true],
    [new THREE.SphereGeometry(1, 28, 20).scale(0.1, 0.232, 0.2).translate(0.035, 0, 0), shell, true],
    [new THREE.TorusGeometry(0.115, 0.016, 10, 30).rotateY(Math.PI / 2).translate(0.118, 0, 0), led, false],
    [new THREE.SphereGeometry(1, 14, 10).scale(0.016, 0.036, 0.034).translate(0.135, 0, 0), led, false],
  ];
  for (const s of [-1, 1] as const) {
    const m = new THREE.Matrix4()
      .makeTranslation(s * 1.03, -0.03, 0.16)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, s < 0 ? Math.PI + 0.62 : -0.62, 0, 'YXZ')));
    for (const [geo, mat, outlined] of parts) add(geo.clone().applyMatrix4(m), mat, outlined);
  }
  for (const [geo] of parts) geo.dispose();

  const mic = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.03, -0.2, 0.26),
    new THREE.Vector3(-0.92, -0.36, 0.6),
    new THREE.Vector3(-0.66, -0.4, 0.82),
    new THREE.Vector3(-0.46, -0.37, 0.92),
  ]);
  add(new THREE.TubeGeometry(mic, 24, 0.022, 8, false), boom);
  add(new THREE.SphereGeometry(1, 16, 12).scale(0.07, 0.05, 0.05).translate(-0.43, -0.365, 0.94), pad);
  group.visible = false;
  return { group, led };
}
