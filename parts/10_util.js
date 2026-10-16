/* =========================================================================
   10_util.js — 数学 / 随机 / 噪声 / 曲线 / 小工具
   ========================================================================= */
'use strict';

/* 运行参数（?lite=1 低配/测试；?vt=1 用 setTimeout 驱动主循环；?frames=N 跑 N 帧后停止） */
const QS = (typeof location !== 'undefined' ? location.search : '') || '';
const CFG = {
  lite: /[?&]lite=1/.test(QS),
  vt: /[?&]vt=1/.test(QS),
  frames: (function () {
    const m = QS.match(/[?&]frames=(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  })(),
  noShadow: /[?&]noshadow=1/.test(QS),
  shot: /[?&]shot=1/.test(QS),
  dbg: (function(){const m=QS.match(/[?&]dbg=(\d+)/);return m?+m[1]:0;})(),
  nopost: /[?&]nopost=1/.test(QS),
  nofog: /[?&]nofog=1/.test(QS),
  noao: /[?&]noao=1/.test(QS),
  nobloom: /[?&]nobloom=1/.test(QS),
  dumplights: /[?&]dumplights=1/.test(QS),
  noenv: /[?&]noenv=1/.test(QS),
  envint: (function(){const m=QS.match(/[?&]envint=([\d.]+)/);return m?parseFloat(m[1]):null;})(),
  envbg: /[?&]envbg=1/.test(QS),
  skyonly: /[?&]skyonly=1/.test(QS),
  envview: /[?&]envview=1/.test(QS),
  nogod: /[?&]nogod=1/.test(QS),
  nn: /[?&]nn=1/.test(QS),
  nodetail: /[?&]nodetail=1/.test(QS),
  clearmag: /[?&]clearmag=1/.test(QS),
  nowater: /[?&]nowater=1/.test(QS),
  noscenefog: /[?&]noscenefog=1/.test(QS),
  post: /[?&]post=1/.test(QS),
  forceWeather: (function(){const m=QS.match(/[?&]weather=([a-z]+)/);return m?m[1]:null;})(),
  depthview: /[?&]depthview=1/.test(QS),
  stage: (function(){const m=QS.match(/[?&]stage=(\d)/);return m?+m[1]:0;})(),
  nofxaa: /[?&]nofxaa=1/.test(QS),
  noaces: /[?&]noaces=1/.test(QS),
  stage: (function(){const m=QS.match(/[?&]stage=(\d)/);return m?+m[1]:0;})(),
  smoke: /[?&]smoke=1/.test(QS),
  nograss: /[?&]nograss=1/.test(QS),
  notrees: /[?&]notrees=1/.test(QS),
  nobloom2: /[?&]nobloom2=1/.test(QS),
  noskirt: /[?&]noskirt=1/.test(QS),
  skirt: /[?&]skirt=1/.test(QS),
  px: (function(){const m=QS.match(/[?&]px=(-?[\d.]+)/);return m?parseFloat(m[1]):null;})(),
  pz: (function(){const m=QS.match(/[?&]pz=(-?[\d.]+)/);return m?parseFloat(m[1]):null;})(),
  py: (function(){const m=QS.match(/[?&]py=(-?[\d.]+)/);return m?parseFloat(m[1]):null;})(),
  lookup: /[?&]lookup=1/.test(QS),
  seed: (function () {
    const m = QS.match(/[?&]seed=(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  })(),
};
/** 需要按帧调度时统一走这里：虚拟时间下 rAF 不推进，用 setTimeout 兜底 */
const schedule = CFG.vt
  ? (cb => setTimeout(cb, 16))
  : (cb => requestAnimationFrame(cb));

const PI = Math.PI, TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (v - a) / (b - a);
const saturate = clamp01;
const sign = Math.sign;
const mod = (a, n) => ((a % n) + n) % n;
const floor = Math.floor, ceil = Math.ceil, abs = Math.abs, min = Math.min, max = Math.max;
const sin = Math.sin, cos = Math.cos, sqrt = Math.sqrt, atan2 = Math.atan2, pow = Math.pow;
const exp = Math.exp, log = Math.log;
const hypot = Math.hypot;

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function smootherstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
/** 帧率无关的指数逼近 */
function damp(cur, target, lambda, dt) { return lerp(cur, target, 1 - exp(-lambda * dt)); }
function dampAngle(cur, target, lambda, dt) {
  let d = mod(target - cur + PI, TAU) - PI;
  return cur + d * (1 - exp(-lambda * dt));
}
function moveTowards(cur, target, maxDelta) {
  const d = target - cur;
  return abs(d) <= maxDelta ? target : cur + sign(d) * maxDelta;
}

/* ---------- 缓动 ---------- */
const Ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  inCubic: t => t * t * t,
  outCubic: t => (--t) * t * t + 1,
  inOutCubic: t => t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  outQuart: t => 1 - (--t) * t * t * t,
  inOutQuart: t => t < .5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
  outExpo: t => t >= 1 ? 1 : 1 - pow(2, -10 * t),
  inExpo: t => t <= 0 ? 0 : pow(2, 10 * t - 10),
  outBack: t => { const c = 1.70158, c3 = c + 1; return 1 + c3 * pow(t - 1, 3) + c * pow(t - 1, 2); },
  outElastic: t => t === 0 ? 0 : t === 1 ? 1 :
    pow(2, -10 * t) * sin((t * 10 - .75) * (TAU / 3)) + 1,
  outBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375;
  },
  // 塞尔达式"哒—哒"脉冲
  pulse: t => sin(t * PI),
};

/* ---------- 随机数 ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
class Rand {
  constructor(seed) { this.next = mulberry32(seed === undefined ? 1337 : seed); }
  f(a = 0, b = 1) { return a + this.next() * (b - a); }
  i(a, b) { return floor(this.f(a, b + 1)); }
  pick(arr) { return arr[floor(this.next() * arr.length)]; }
  bool(p = .5) { return this.next() < p; }
  sign() { return this.next() < .5 ? -1 : 1; }
  /** 高斯（Box–Muller 近似） */
  gauss(mu = 0, sigma = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mu + sigma * sqrt(-2 * log(u)) * cos(TAU * v);
  }
  ang() { return this.next() * TAU; }
  /** 单位圆盘上的点 */
  disc(r = 1) {
    const a = this.ang(), d = sqrt(this.next()) * r;
    return [cos(a) * d, sin(a) * d];
  }
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = floor(this.next() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  weighted(pairs) { // [[val, w], ...]
    let tot = 0;
    for (const p of pairs) tot += p[1];
    let r = this.next() * tot;
    for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  }
}

/* =========================================================================
   噪声：经典 Perlin 梯度噪声 (2D/3D) + Simplex 风格 + fBm + 脊状 + 域扭曲
   ========================================================================= */
const Noise = (() => {
  const P = new Uint8Array(512);
  const G2 = new Float32Array(512);
  (function init() {
    const r = mulberry32(20240712);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) { P[i] = p[i & 255]; G2[i] = (P[i] / 255) * TAU; }
  })();

  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

  /** 2D Perlin，输出约 -1..1 */
  function perlin2(x, y) {
    const X = floor(x) & 255, Y = floor(y) & 255;
    const xf = x - floor(x), yf = y - floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = G2[X + P[Y]], ab = G2[X + P[Y + 1]];
    const ba = G2[X + 1 + P[Y]], bb = G2[X + 1 + P[Y + 1]];
    const x1 = cos(aa) * xf + sin(aa) * yf;
    const x2 = cos(ba) * (xf - 1) + sin(ba) * yf;
    const y1 = cos(ab) * xf + sin(ab) * (yf - 1);
    const y2 = cos(bb) * (xf - 1) + sin(bb) * (yf - 1);
    return lerp(lerp(x1, x2, u), lerp(y1, y2, u), v) * 1.42;
  }

  const GH = new Float32Array(512 * 3);
  (function init3() {
    const r = mulberry32(99173);
    for (let i = 0; i < 512; i++) {
      // 单位球面均匀分布
      const z = r() * 2 - 1, a = r() * TAU, s = sqrt(max(0, 1 - z * z));
      GH[i * 3] = cos(a) * s; GH[i * 3 + 1] = sin(a) * s; GH[i * 3 + 2] = z;
    }
  })();

  /** 3D Perlin，输出约 -1..1 */
  function perlin3(x, y, z) {
    const X = floor(x) & 255, Y = floor(y) & 255, Z = floor(z) & 255;
    const xf = x - floor(x), yf = y - floor(y), zf = z - floor(z);
    const u = fade(xf), v = fade(yf), w = fade(zf);
    function g(h, dx, dy, dz) {
      const i = (h * 3) % 1536;
      return GH[i] * dx + GH[i + 1] * dy + GH[i + 2] * dz;
    }
    const A = P[X] + Y, B = P[X + 1] + Y;
    const AA = P[A] + Z, AB = P[A + 1] + Z, BA = P[B] + Z, BB = P[B + 1] + Z;
    const x1 = lerp(g(P[AA], xf, yf, zf), g(P[BA], xf - 1, yf, zf), u);
    const x2 = lerp(g(P[AB], xf, yf - 1, zf), g(P[BB], xf - 1, yf - 1, zf), u);
    const y1 = lerp(x1, x2, v);
    const x3 = lerp(g(P[AA + 1], xf, yf, zf - 1), g(P[BA + 1], xf - 1, yf, zf - 1), u);
    const x4 = lerp(g(P[AB + 1], xf, yf - 1, zf - 1), g(P[BB + 1], xf - 1, yf - 1, zf - 1), u);
    const y2 = lerp(x3, x4, v);
    return lerp(y1, y2, w) * 1.16;
  }

  /** 分形叠加，输出约 -1..1 */
  function fbm2(x, y, oct = 5, lac = 2.03, gain = .5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * perlin2(x * f, y * f);
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  }
  function fbm3(x, y, z, oct = 4, lac = 2.03, gain = .5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * perlin3(x * f, y * f, z * f);
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  }
  /** 脊状噪声（山脊、峡谷），输出 0..1 */
  function ridged2(x, y, oct = 5, lac = 2.07, gain = .5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      const v = 1 - abs(perlin2(x * f, y * f));
      s += a * v * v;
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  }
  /** 域扭曲：把输入坐标推来推去，得到有机的边界 */
  function warp2(x, y, amp = 1, freq = 1, oct = 3, seed = 0) {
    const wx = fbm2(x * freq + seed * 11.3, y * freq - seed * 7.7, oct);
    const wy = fbm2(x * freq - seed * 5.9, y * freq + seed * 13.1, oct);
    return [x + wx * amp, y + wy * amp];
  }
  /** 1D 噪声（风、光斑用） */
  const per1 = x => perlin2(x, .371);

  /** Worley/Voronoi F1，返回 0..1 距离场 */
  function voronoi2(x, y, seed = 0) {
    const xi = floor(x), yi = floor(y);
    let best = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const h = (cx * 374761393 + cy * 668265263 + seed * 1442695040888963407) | 0;
      let hh = Math.imul(h ^ (h >>> 13), 1274126177);
      hh = hh ^ (hh >>> 16);
      const ox = ((hh >>> 0) % 1000) / 1000;
      hh = Math.imul(hh ^ (hh >>> 15), 2246822519);
      hh = hh ^ (hh >>> 13);
      const oy = ((hh >>> 0) % 1000) / 1000;
      const dx = cx + ox - x, dy = cy + oy - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return clamp01(sqrt(best));
  }

  return { perlin2, perlin3, fbm2, fbm3, ridged2, warp2, per1, voronoi2 };
})();

/* ---------- 其它小工具 ---------- */
/** 环形渐变缓动（用于波浪/呼吸） */
const wave = (t, freq = 1, phase = 0) => sin(t * freq * TAU + phase);
/** 稳定可复现的 hash（世界种子用） */
function hash2i(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** 生成一个字符串 id */
let _uid = 0;
const uid = (p = 'o') => p + '_' + (++_uid).toString(36);

/** 对象池 */
class Pool {
  constructor(make, reset, size = 64) {
    this.make = make; this.reset = reset; this.free = [];
    for (let i = 0; i < size; i++) this.free.push(make());
  }
  get() { return this.free.length ? this.free.pop() : this.make(); }
  put(o) { if (this.reset) this.reset(o); this.free.push(o); }
}

/** 颜色工具：从 HSL 得到 THREE.Color */
function hsl(h, s, l) { return new THREE.Color().setHSL(h, s, l); }
/** 亮度抖动，让程序化贴图不那么"塑料" */
function jitterColor(c, rnd, amt = .06) {
  const f = 1 + (rnd() * 2 - 1) * amt;
  c.r = clamp01(c.r * f); c.g = clamp01(c.g * f); c.b = clamp01(c.b * f);
  return c;
}
/** 色温（开尔文）→ 线性 RGB，用于昼夜光 */
function kelvinToRGB(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * log(t) - 161.1195681661; }
  else { r = 329.698727446 * pow(t - 60, -0.1332047592); g = 288.1221695283 * pow(t - 60, -0.0755148492); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * log(t - 10) - 305.0447927307;
  return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255)];
}

/** 3D 线段与球/胶囊的最近点（战斗命中判定用） */
function segPointDist(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const L2 = abx * abx + aby * aby + abz * abz;
  let t = L2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / L2 : 0;
  t = clamp01(t);
  const cx = a.x + abx * t - p.x, cy = a.y + aby * t - p.y, cz = a.z + abz * t - p.z;
  return { d: sqrt(cx * cx + cy * cy + cz * cz), t, p: { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t } };
}

/** 角度差归一到 -PI..PI */
const angDiff = (a, b) => mod(b - a + PI, TAU) - PI;

/** 把数组按 key 分桶 */
function groupBy(arr, keyFn) {
  const m = new Map();
  for (const a of arr) {
    const k = keyFn(a);
    let l = m.get(k); if (!l) { l = []; m.set(k, l); }
    l.push(a);
  }
  return m;
}

/** 简单的字符串格式化（HUD 用） */
function pad2(n) { return (n < 10 ? '0' : '') + (n | 0); }
function fmtClock(hours) {
  const h = floor(hours) % 24, m = floor((hours - floor(hours)) * 60);
  return pad2(h) + ':' + pad2(m);
}
