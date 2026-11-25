import * as THREE from 'three';
import { CHIN } from './chinchillaStyle';

/** Meshes on this layer are cut out with the white sticker border. */
export const STICKER_LAYER = 1;

/**
 * Put every opaque mesh under `root` on the sticker layer, plus those flagged `userData.sticker`;
 * `userData.stickerOnly` meshes shape the border without being drawn.
 */
export function markStickerLayer(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mesh.userData.stickerOnly) mesh.layers.set(STICKER_LAYER);
    else if (mesh.userData.sticker || mats.every((m) => !m.transparent)) mesh.layers.enable(STICKER_LAYER);
    else mesh.layers.disable(STICKER_LAYER);
  });
}

/**
 * Die-cut sticker look: renders the silhouette into a small mask, then paints a white border
 * (plus a soft drop shadow) behind the normal frame. Costs one extra scene pass and one quad.
 */
export class StickerPass {
  /** Border width and shadow drop as fractions of the canvas height. */
  public border = 0.0135;
  public shadowDrop = 0.009;

  private readonly mask = new THREE.WebGLRenderTarget(4, 4, {
    depthBuffer: true,
    stencilBuffer: false,
    samples: 4,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
  });
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mat: THREE.ShaderMaterial;
  private readonly size = new THREE.Vector2();
  private readonly clearColor = new THREE.Color();

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMask: { value: this.mask.texture },
        uRadius: { value: new THREE.Vector2() },
        uDrop: { value: 0 },
        uPaper: { value: new THREE.Color(CHIN.sticker) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMask;
        uniform vec2 uRadius;
        uniform float uDrop;
        uniform vec3 uPaper;
        varying vec2 vUv;
        float ring(vec2 c, float r) {
          float m = 0.0;
          for (int i = 0; i < 24; i++) {
            float a = float(i) * 0.2617994;
            m = max(m, texture2D(uMask, c + vec2(cos(a), sin(a)) * uRadius * r).a);
          }
          return m;
        }
        float soft(vec2 c) {
          // Turned a little per pixel, so the few samples blend instead of showing as steps.
          float turn = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float s = 0.0;
          for (int i = 0; i < 20; i++) {
            float a = float(i) * 2.399963 + turn;
            float r = sqrt((float(i) + 0.5) / 20.0);
            s += texture2D(uMask, c + vec2(cos(a), sin(a)) * uRadius * r * 1.9).a;
          }
          return s / 20.0;
        }
        void main() {
          float paper = max(ring(vUv, 1.0), ring(vUv, 0.5));
          paper = smoothstep(0.35, 0.65, paper);
          float shade = smoothstep(0.02, 0.75, soft(vUv + vec2(0.0, uDrop))) * 0.30;
          float a = paper + (1.0 - paper) * shade;
          if (a < 0.003) discard;
          vec3 col = mix(vec3(0.02, 0.014, 0.012), uPaper, paper / a);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  public render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.round(this.size.x));
    const h = Math.max(1, Math.round(this.size.y));
    if (this.mask.width !== w || this.mask.height !== h) this.mask.setSize(w, h);

    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    camera.layers.set(STICKER_LAYER);
    renderer.setRenderTarget(this.mask);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(this.clearColor, alpha);
    camera.layers.set(0);

    (this.mat.uniforms.uRadius.value as THREE.Vector2).set((this.border * h) / w, this.border);
    this.mat.uniforms.uDrop.value = this.shadowDrop;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clear();
    renderer.render(this.quadScene, this.quadCamera);
    renderer.render(scene, camera);
    renderer.autoClear = autoClear;
  }

  public dispose(): void {
    this.mask.dispose();
    this.mat.dispose();
  }
}
