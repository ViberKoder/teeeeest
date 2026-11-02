import { useEffect, useRef, useState } from 'react';
import { haptic } from '../lib/tg';
import { Egg } from './Egg';

/**
 * A real-time 3D egg in plain WebGL (no library): a surface of revolution shaded like the reference photo —
 * warm white shell, soft key light, glossy highlight, faint speckles — that can be dragged to spin (with inertia),
 * pinched / scrolled to zoom, double-tapped to reset, and that sheds sparkles like Telegram Premium's menu.
 */

// ------------------------------------------------------------------ tiny math
type V3 = [number, number, number];
type Q = [number, number, number, number]; // x y z w

const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qAxis = (axis: V3, angle: number): Q => {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};
const qNorm = (q: Q): Q => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
const REST: Q = qMul(qAxis([1, 0, 0], -0.16), qAxis([0, 1, 0], 0.55)); // a flattering resting pose

/** column-major mat3 rotation from a quaternion */
const mat3 = (q: Q): number[] => {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y),
  ];
};

function perspective(fovy: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

// ------------------------------------------------------------------ geometry
const H = 1.0; // half height
const R = 0.7; // base radius
const S = 0.14; // how much wider the bottom is than the top

function buildEgg(nu = 96, nv = 72) {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    const t = (j / nv) * Math.PI;
    const ct = Math.cos(t), st = Math.sin(t);
    const r = R * st * (1 - S * ct);
    const y = H * ct;
    const dr = R * (ct * (1 - S * ct) + st * S * st);
    const dy = -H * st;
    for (let i = 0; i <= nu; i++) {
      const p = (i / nu) * Math.PI * 2;
      const cp = Math.cos(p), sp = Math.sin(p);
      pos.push(r * cp, y, r * sp);
      // normal = (dP/dphi) x (dP/dt), flipped to point outwards
      const tx = dr * cp, ty = dy, tz = dr * sp;
      const px = -r * sp, pz = r * cp;
      let nx = ty * pz - 0 * tz;
      let ny = tz * px - tx * pz;
      let nz = 0 * tx - ty * px;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-6) {
        nx = 0; ny = ct > 0 ? 1 : -1; nz = 0;
      } else {
        nx /= l; ny /= l; nz /= l;
        if (nx * cp * r + ny * y * 0.5 + nz * sp * r < 0) { nx = -nx; ny = -ny; nz = -nz; }
      }
      nor.push(nx, ny, nz);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + nu + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) };
}

// ------------------------------------------------------------------ shaders
const EGG_VS = `
attribute vec3 aPos; attribute vec3 aNor;
uniform mat3 uRot; uniform mat4 uProj; uniform vec3 uOffset; uniform float uScale;
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
void main() {
  vec3 w = uRot * (aPos * uScale);
  vN = uRot * aNor; vW = w + uOffset; vObj = aPos; // camera space: the light stays fixed while the egg turns
  gl_Position = uProj * vec4(w + uOffset, 1.0);
}`;

const EGG_FS = `
precision highp float;
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
uniform vec3 uCam; uniform float uTime; uniform float uGlow;

float hash(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z);
}
// an analytic studio environment: a big soft box top-left, a strip right, a warm floor bounce
vec3 env(vec3 d){
  float box = smoothstep(0.2, 0.95, dot(d, normalize(vec3(-0.55, 0.7, 0.45))))*0.55;
  float strip = smoothstep(0.82, 0.97, dot(d, normalize(vec3(0.9, 0.25, 0.2))));
  vec3 sky = mix(vec3(0.74,0.72,0.72), vec3(1.0,0.995,0.99), d.y*0.5+0.5);
  vec3 floorc = vec3(0.86,0.79,0.72) * smoothstep(0.1, -0.8, d.y);
  return sky*0.6 + box*vec3(1.35,1.3,1.25) + strip*vec3(0.5,0.58,0.7) + floorc*0.5;
}
void main() {
  vec3 n = normalize(vN);
  // shell texture: fine pores bend the normal, rare warm speckles darken the colour
  vec3 q = vObj * 38.0;
  vec3 pore = vec3(noise(q), noise(q + 11.3), noise(q + 27.1)) - 0.5;
  n = normalize(n + pore * 0.018);
  float speck = smoothstep(0.93, 0.985, noise(vObj * 46.0)) * 0.55 + smoothstep(0.965, 1.0, noise(vObj * 90.0 + 3.0)) * 0.35;

  vec3 v = normalize(uCam - vW);
  vec3 L = normalize(vec3(-0.45, 0.8, 0.55));
  vec3 L2 = normalize(vec3(0.85, 0.15, 0.35));
  float ndl = dot(n, L);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  float ndl2 = clamp(dot(n, L2), 0.0, 1.0);

  vec3 albedo = vec3(0.935, 0.92, 0.905);
  albedo = mix(albedo, vec3(0.74, 0.60, 0.50), speck);
  // soft studio light: a wide gradient from the key side to the far side keeps the shading readable but gentle
  vec3 hemi = mix(vec3(0.62, 0.57, 0.56), vec3(0.98, 0.97, 0.96), n.y * 0.5 + 0.5);
  float lit = pow(clamp((dot(n, L) + 0.55) / 1.55, 0.0, 1.0), 1.35);
  vec3 col = albedo * (hemi * 0.72 + vec3(1.0, 0.975, 0.94) * lit * 0.42 + vec3(0.78, 0.86, 1.0) * ndl2 * 0.07);
  // light that travels through the shell and warms the shadow side
  col += vec3(0.95, 0.70, 0.55) * pow(clamp(1.0 - lit, 0.0, 1.0), 2.0) * 0.07;

  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  vec3 r = reflect(-v, n);
  col += (env(r) - 0.45) * (0.02 + fres * 0.3);
  vec3 h = normalize(L + v);
  col += vec3(1.0, 0.97, 0.92) * pow(clamp(dot(n, h), 0.0, 1.0), 160.0) * 0.22;

  // a faint, warm glow at the silhouette (the "alive" look); stronger while there is something to hatch
  col += vec3(0.75, 1.0, 0.7) * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0) * (0.05 + 0.20 * uGlow);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const PT_VS = `
attribute vec4 aPosLife; attribute vec4 aAttr; // xyz, age01 | size, seed, r, g
uniform mat4 uProj; uniform vec3 uOffset; uniform float uDpr; uniform float uTime;
varying float vAlpha; varying float vSeed; varying vec3 vCol;
void main() {
  float a = aPosLife.w;
  vec4 p = uProj * vec4(aPosLife.xyz + uOffset, 1.0);
  gl_Position = p;
  float fade = smoothstep(0.0, 0.12, a) * (1.0 - smoothstep(0.55, 1.0, a));
  float tw = 0.65 + 0.35 * sin(uTime * 7.0 + aAttr.y * 40.0);
  vAlpha = fade * tw; vSeed = aAttr.y;
  vCol = mix(vec3(1.0, 0.88, 0.45), vec3(0.78, 1.0, 0.86), fract(aAttr.y * 7.13));
  vCol = mix(vCol, vec3(1.0), step(0.7, fract(aAttr.y * 3.7)));
  gl_PointSize = aAttr.x * uDpr * (1.0 - 0.35 * a) * (6.0 / max(p.w, 1.0));
}`;

const PT_FS = `
precision mediump float;
varying float vAlpha; varying float vSeed; varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  // 4-point star for some sparkles, soft dot for the rest
  float star = pow(max(0.0, 1.0 - abs(c.x)) * max(0.0, 1.0 - abs(c.y)), 1.6) * 1.15 + smoothstep(0.35, 0.0, d) * 0.9;
  float dot_ = smoothstep(1.0, 0.0, d);
  float k = mix(dot_ * dot_, star, step(0.5, fract(vSeed * 11.7)));
  gl_FragColor = vec4(vCol * k * vAlpha * 1.7, k * vAlpha);
}`;

// ------------------------------------------------------------------ component
const MAX_P = 140;

export interface Egg3DProps {
  /** more sparkles and a warmer glow when there is something to hatch */
  energy?: number;
  /** increment to fire a burst of sparkles and a squash (e.g. after hatching) */
  burst?: number;
  /** the egg trembles (a claim is in flight) */
  shaking?: boolean;
  className?: string;
}

export function Egg3D({ energy = 0, burst = 0, shaking = false, className }: Egg3DProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ energy, burst, shaking, lastBurst: burst });
  const [fallback, setFallback] = useState(false);
  live.current.energy = energy;
  live.current.shaking = shaking;
  live.current.burst = burst;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, depth: true }) as WebGLRenderingContext | null;
    if (!gl) return setFallback(true);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const program = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
      return p;
    };

    let eggP: WebGLProgram, ptP: WebGLProgram;
    try {
      eggP = program(EGG_VS, EGG_FS);
      ptP = program(PT_VS, PT_FS);
    } catch {
      return setFallback(true);
    }

    // egg buffers
    const geo = buildEgg();
    const vb = gl.createBuffer()!, nb = gl.createBuffer()!, ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, geo.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, geo.nor, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
    const eU = (n: string) => gl.getUniformLocation(eggP, n);
    const pU = (n: string) => gl.getUniformLocation(ptP, n);

    // particle state
    const px = new Float32Array(MAX_P * 3), pv = new Float32Array(MAX_P * 3);
    const age = new Float32Array(MAX_P).fill(2), life = new Float32Array(MAX_P).fill(1), size = new Float32Array(MAX_P), seed = new Float32Array(MAX_P);
    const posLife = new Float32Array(MAX_P * 4), attr = new Float32Array(MAX_P * 4);
    const pb1 = gl.createBuffer()!, pb2 = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pb1); gl.bufferData(gl.ARRAY_BUFFER, posLife.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, pb2); gl.bufferData(gl.ARRAY_BUFFER, attr.byteLength, gl.DYNAMIC_DRAW);

    const spawn = (i: number, fast = false) => {
      // a point just outside the shell, biased towards the upper-right silhouette like Premium's sparkles
      const th = Math.acos(1 - 2 * Math.random());
      const ph = Math.random() * Math.PI * 2;
      const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
      const rr = 1.0 + Math.random() * 0.12;
      px[i * 3] = dx * R * 1.05 * rr; px[i * 3 + 1] = dy * H * 1.02 * rr; px[i * 3 + 2] = dz * R * 1.05 * rr;
      const sp = (fast ? 1.2 : 0.35) * (0.5 + Math.random());
      pv[i * 3] = dx * sp + (Math.random() - 0.5) * 0.12;
      pv[i * 3 + 1] = dy * sp * 0.9 + 0.12 + Math.random() * 0.12;
      pv[i * 3 + 2] = dz * sp + (Math.random() - 0.5) * 0.12;
      age[i] = 0; life[i] = (fast ? 0.9 : 1.5) + Math.random() * 1.4;
      size[i] = 6 + Math.random() * 12; seed[i] = Math.random();
    };

    // interaction state
    let q: Q = REST;
    let wx = 0, wy = 0; // angular velocity (rad/s) about world X and Y
    let zoom = 1, zoomTarget = 1;
    let spin = 0, releasedAt = performance.now(), zoomTouched = 0;
    let squash = 0, squashV = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinch = 0;
    let dragging = false;
    let lastMove = 0;
    let lastTap = 0;
    let moved = 0;

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragging = true; moved = 0; wx = 0; wy = 0; releasedAt = Infinity;
      lastMove = performance.now();
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomTouched = performance.now();
        if (lastPinch) zoomTarget = Math.min(1.3, Math.max(0.65, zoomTarget * (d / lastPinch)));
        lastPinch = d;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      const now = performance.now();
      const dt = Math.max(8, now - lastMove) / 1000;
      lastMove = now;
      const k = 0.0105;
      q = qNorm(qMul(qMul(qAxis([0, 1, 0], dx * k), qAxis([1, 0, 0], dy * k)), q));
      wy = (dx * k) / dt; wx = (dy * k) / dt;
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) lastPinch = 0;
      if (pointers.size === 0) {
        dragging = false; releasedAt = performance.now(); zoomTouched = releasedAt;
        const now = performance.now();
        if (moved < 6) {
          if (now - lastTap < 320) { zoomTarget = 1; q = REST; spin = 0; wx = wy = 0; } // double tap: reset
          else { fireBurst(true); haptic.tap(); }
          lastTap = now;
        }
        // a flick keeps its speed, but not an absurd one
        wx = Math.max(-9, Math.min(9, wx)); wy = Math.max(-9, Math.min(9, wy));
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTouched = performance.now();
      zoomTarget = Math.min(1.3, Math.max(0.65, zoomTarget * Math.exp(-e.deltaY * 0.0015)));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const fireBurst = (small = false) => {
      squashV = small ? 2.2 : 4.5;
      const n = small ? 16 : 46;
      let spawned = 0;
      for (let i = 0; i < MAX_P && spawned < n; i++) if (age[i] >= 1) { spawn(i, true); spawned++; }
    };

    // sizing
    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width * dpr)); h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.01 });
    io.observe(canvas);

    let raf = 0, last = performance.now(), t0 = last, spawnAcc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = (now - t0) / 1000;
      const L = live.current;

      if (L.burst !== L.lastBurst) { L.lastBurst = L.burst; fireBurst(false); }

      // spin: inertia while flicked, otherwise a slow idle turn (and a tremble while shaking)
      if (!dragging) {
        const damp = Math.exp(-dt * 2.2);
        wx *= damp; wy *= damp;
        const idle = reduce ? 0 : 0.42;
        const speed = Math.hypot(wx, wy);
        if (speed < idle) wy += (idle - wy) * Math.min(1, dt * 1.5); // settle into the slow idle turn
        q = qNorm(qMul(qMul(qAxis([0, 1, 0], wy * dt), qAxis([1, 0, 0], wx * dt)), q));
        // after the finger lets go the egg always comes back to its resting pose (and the idle turn carries on from there)
        spin += idle * dt;
        if (now - releasedAt > 450) {
          const target: Q = qMul(qAxis([1, 0, 0], -0.16), qAxis([0, 1, 0], 0.55 + spin));
          const dot = q[0] * target[0] + q[1] * target[1] + q[2] * target[2] + q[3] * target[3];
          const sg = dot < 0 ? -1 : 1;
          const k = 1 - Math.exp(-dt * 3.2);
          q = qNorm([
            q[0] + (sg * target[0] - q[0]) * k, q[1] + (sg * target[1] - q[1]) * k,
            q[2] + (sg * target[2] - q[2]) * k, q[3] + (sg * target[3] - q[3]) * k,
          ]);
          wx *= 0.9; wy = wy * 0.9 + idle * 0.1;
        }
      }
      if (!dragging && now - zoomTouched > 700) zoomTarget = 1;
      if (L.shaking) {
        q = qNorm(qMul(qAxis([0, 0, 1], Math.sin(time * 38) * 0.02), q));
      }
      zoom += (zoomTarget - zoom) * Math.min(1, dt * 9);
      // squash & stretch spring
      squashV += (-squash * 90 - squashV * 9) * dt;
      squash += squashV * dt;

      // emit
      const rate = reduce ? 0 : 9 + L.energy * 22 + (L.shaking ? 40 : 0);
      spawnAcc += rate * dt;
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        for (let i = 0; i < MAX_P; i++) if (age[i] >= 1) { spawn(i, false); break; }
      }
      for (let i = 0; i < MAX_P; i++) {
        if (age[i] >= 1) { posLife[i * 4 + 3] = 2; attr[i * 4] = 0; continue; }
        age[i] += dt / life[i];
        px[i * 3] += pv[i * 3] * dt; px[i * 3 + 1] += pv[i * 3 + 1] * dt; px[i * 3 + 2] += pv[i * 3 + 2] * dt;
        pv[i * 3] *= 1 - dt * 0.6; pv[i * 3 + 1] *= 1 - dt * 0.6; pv[i * 3 + 2] *= 1 - dt * 0.6;
        posLife[i * 4] = px[i * 3]; posLife[i * 4 + 1] = px[i * 3 + 1]; posLife[i * 4 + 2] = px[i * 3 + 2]; posLife[i * 4 + 3] = Math.min(age[i], 1);
        attr[i * 4] = size[i]; attr[i * 4 + 1] = seed[i];
      }

      // draw
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      const aspect = w / h;
      const fov = (28 * Math.PI) / 180;
      const dist = 5.0 / zoom;
      const proj = perspective(fov, aspect, 0.5, 20);
      const bob = reduce ? 0 : Math.sin(time * 1.3) * 0.03;
      const off: V3 = [0, bob, -dist];
      const sc = 1 + squash * 0.06;
      const rot = mat3(q);

      gl.useProgram(eggP);
      gl.uniformMatrix4fv(eU('uProj'), false, proj);
      gl.uniformMatrix3fv(eU('uRot'), false, rot);
      gl.uniform3fv(eU('uOffset'), off);
      gl.uniform1f(eU('uScale'), sc);
      gl.uniform3f(eU('uCam'), 0, 0, 0);
      gl.uniform1f(eU('uTime'), time);
      gl.uniform1f(eU('uGlow'), L.energy);
      const aPos = gl.getAttribLocation(eggP, 'aPos'), aNor = gl.getAttribLocation(eggP, 'aNor');
      gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.enableVertexAttribArray(aNor); gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.disable(gl.BLEND);
      gl.drawElements(gl.TRIANGLES, geo.idx.length, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.CULL_FACE);

      // particles: world-space points, depth-tested against the egg, additive
      gl.useProgram(ptP);
      gl.uniformMatrix4fv(pU('uProj'), false, proj);
      gl.uniform3fv(pU('uOffset'), off);
      gl.uniform1f(pU('uDpr'), dpr);
      gl.uniform1f(pU('uTime'), time);
      const a0 = gl.getAttribLocation(ptP, 'aPosLife'), a1 = gl.getAttribLocation(ptP, 'aAttr');
      gl.bindBuffer(gl.ARRAY_BUFFER, pb1); gl.bufferSubData(gl.ARRAY_BUFFER, 0, posLife); gl.enableVertexAttribArray(a0); gl.vertexAttribPointer(a0, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, pb2); gl.bufferSubData(gl.ARRAY_BUFFER, 0, attr); gl.enableVertexAttribArray(a1); gl.vertexAttribPointer(a1, 4, gl.FLOAT, false, 0, 0);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.POINTS, 0, MAX_P);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    };
    raf = requestAnimationFrame(frame);

    const lost = (e: Event) => { e.preventDefault(); setFallback(true); };
    canvas.addEventListener('webglcontextlost', lost);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', lost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  if (fallback) {
    return (
      <div className={className} style={{ display: 'grid', placeItems: 'center' }}>
        <Egg size={150} float state={shaking ? 'cracking' : 'idle'} />
      </div>
    );
  }
  return <canvas ref={ref} className={className} style={{ touchAction: 'none', display: 'block', width: '100%', height: '100%' }} aria-label="3D egg: drag to spin, pinch to zoom, double-tap to reset" />;
}

