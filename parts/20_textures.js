/* =========================================================================
   20_textures.js — 程序化 PBR 贴图库
   全部离线生成（DataTexture / Canvas），无任何外部素材。
   每种材质产出 { map, normalMap, roughnessMap, aoMap }（按需裁减）。
   ========================================================================= */

const TexGen = (() => {

  /* ---------- 可无缝平铺的梯度噪声 ---------- */
  function hash3(x, y, s) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const fade5 = t => t * t * t * (t * (t * 6 - 15) + 10);

  /** 周期为 g 的 Perlin 噪声，输入 (x,y) 为格坐标，输出 -1..1 */
  function perlinT(x, y, g, seed) {
    const xi = floor(x), yi = floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade5(xf), v = fade5(yf);
    const wx0 = mod(xi, g), wx1 = mod(xi + 1, g);
    const wy0 = mod(yi, g), wy1 = mod(yi + 1, g);
    const a00 = hash3(wx0, wy0, seed) * TAU, a10 = hash3(wx1, wy0, seed) * TAU;
    const a01 = hash3(wx0, wy1, seed) * TAU, a11 = hash3(wx1, wy1, seed) * TAU;
    const n00 = cos(a00) * xf + sin(a00) * yf;
    const n10 = cos(a10) * (xf - 1) + sin(a10) * yf;
    const n01 = cos(a01) * xf + sin(a01) * (yf - 1);
    const n11 = cos(a11) * (xf - 1) + sin(a11) * (yf - 1);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.42;
  }

  /** 无缝 fBm。x,y ∈ [0,1) 的 uv；base 为基础格数 */
  function fbmT(x, y, base, oct, seed, lac = 2, gain = .5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * perlinT(x * base * f, y * base * f, base * f, seed + i * 131);
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  }
  /** 无缝脊状 */
  function ridgedT(x, y, base, oct, seed, lac = 2.03, gain = .5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      const vv = 1 - abs(perlinT(x * base * f, y * base * f, base * f, seed + i * 71));
      s += a * vv * vv; n += a; a *= gain; f *= lac;
    }
    return s / n;
  }
  /** 无缝 worley F1 (0..1)，cells = 每边格数 */
  function worleyT(x, y, cells, seed, jitter = 1) {
    const fx = x * cells, fy = y * cells;
    const xi = floor(fx), yi = floor(fy);
    let best = 9, best2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const wx = mod(cx, cells), wy = mod(cy, cells);
      const ox = hash3(wx, wy, seed), oy = hash3(wx, wy, seed + 977);
      const px = cx + .5 + (ox - .5) * jitter, py = cy + .5 + (oy - .5) * jitter;
      const dx = px - fx, dy = py - fy;
      const d = dx * dx + dy * dy;
      if (d < best) { best2 = best; best = d; } else if (d < best2) best2 = d;
    }
    return [sqrt(best), sqrt(best2)];
  }

  /* ---------- 缓冲区工具 ---------- */
  const newMap = n => new Float32Array(n);
  function addNoise(dst, size, base, oct, amp, seed, lac, gain) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv, row = y * size;
      for (let x = 0; x < size; x++) dst[row + x] += amp * fbmT(x * inv, v, base, oct, seed, lac, gain);
    }
    return dst;
  }
  function fillRidge(dst, size, base, oct, amp, seed) {
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv, row = y * size;
      for (let x = 0; x < size; x++) dst[row + x] += amp * ridgedT(x * inv, v, base, oct, seed);
    }
    return dst;
  }
  /** 由高度场生成法线贴图（Sobel，带环绕） */
  function normalMapFrom(h, size, strength = 1.6) {
    const out = new Uint8Array(size * size * 4);
    const idx = (x, y) => mod(y, size) * size + mod(x, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const hl = h[idx(x - 1, y)], hr = h[idx(x + 1, y)];
      const hu = h[idx(x, y - 1)], hd = h[idx(x, y + 1)];
      let nx = (hl - hr) * strength, ny = (hu - hd) * strength, nz = 1;
      const l = sqrt(nx * nx + ny * ny + 1);
      nx /= l; ny /= l; nz /= l;
      const o = (y * size + x) * 4;
      out[o] = (nx * .5 + .5) * 255;
      out[o + 1] = (ny * .5 + .5) * 255;
      out[o + 2] = (nz * .5 + .5) * 255;
      out[o + 3] = 255;
    }
    return out;
  }
  /** 由高度场粗略生成 AO（多尺度遮蔽） */
  function aoFrom(h, size, radius = 6, strength = .9) {
    const out = new Uint8Array(size * size * 4);
    const idx = (x, y) => mod(y, size) * size + mod(x, size);
    // 半径抽样的环形平均
    const offs = [];
    for (let r = 2; r <= radius; r += 2)
      for (let a = 0; a < 8; a++) offs.push([floor(cos(a / 8 * TAU) * r), floor(sin(a / 8 * TAU) * r)]);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const c = h[y * size + x];
      let occ = 0;
      for (let i = 0; i < offs.length; i++) {
        const d = h[idx(x + offs[i][0], y + offs[i][1])] - c;
        if (d > 0) occ += d;
      }
      const ao = clamp01(1 - occ / (offs.length * .55) * strength);
      const o = (y * size + x) * 4;
      const v = (60 + ao * 195) | 0;
      out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
    }
    return out;
  }
  function grayMap(v01) {
    const n = v01.length, out = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const v = (clamp01(v01[i]) * 255) | 0;
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
    }
    return out;
  }

  /* ---------- 打包 GL 纹理 ---------- */
  const _cache = new Map();
  function tex(data, size, { srgb = false, repeat = 1, aniso = 8, mips = true, wrap = THREE.RepeatWrapping } = {}) {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = wrap;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.generateMipmaps = mips;
    t.repeat.set(repeat, repeat);
    t.anisotropy = aniso;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  }

  /** 材质包：一次生成 albedo / normal / roughness / ao */
  function build(name, size, gen, opts = {}) {
    if (CFG.lite) size = max(64, size >> 1);
    const key = name + size;
    if (_cache.has(key)) return _cache.get(key);
    const h = newMap(size * size);
    const alb = new Uint8Array(size * size * 4);
    const rgh = newMap(size * size);
    const emi = opts.emissive ? new Float32Array(size * size * 3) : null;
    gen(size, { h, alb, rgh, emi });
    const set = {
      size,
      map: tex(alb, size, { srgb: true }),
      normalMap: tex(normalMapFrom(h, size, opts.normalStrength || 1.6), size),
      roughnessMap: opts.noRough ? null : tex(grayMap(rgh), size),
      aoMap: opts.noAO ? null : tex(aoFrom(h, size, opts.aoRadius || 6, opts.aoStrength || .85), size),
      emissiveMap: emi ? tex((() => {
        const o = new Uint8Array(size * size * 4);
        for (let i = 0; i < size * size; i++) {
          o[i * 4] = emi[i * 3] * 255; o[i * 4 + 1] = emi[i * 3 + 1] * 255;
          o[i * 4 + 2] = emi[i * 3 + 2] * 255; o[i * 4 + 3] = 255;
        }
        return o;
      })(), size, { srgb: true }) : null,
    };
    _cache.set(key, set);
    return set;
  }

  /* ---------- 材质定义 ---------- */
  const M = {};

  /* 岩石 / 崖壁 */
  M.rock = () => build('rock', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        let H = fbmT(u, v, 6, 5, 11) * .55;
        H += ridgedT(u, v, 14, 4, 21) * .35;
        H += worleyT(u, v, 22, 33)[0] * .22 - .1;
        H += fbmT(u, v, 90, 3, 41) * .07;
        h[row + x] = H;
        // 层理：水平色带偏移
        const strat = sin(H * 9 + fbmT(u, v, 3, 2, 55) * 3) * .5 + .5;
        const l = .40 + H * .34 + strat * .09;
        const warm = fbmT(u, v, 8, 3, 77) * .5 + .5;
        alb[(row + x) * 4] = clamp01(l * (1.0 + warm * .10)) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .965) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * (0.92 - warm * .06)) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.62 + fbmT(u, v, 40, 3, 88) * .28 - H * .12);
      }
    }
  }, { normalStrength: 2.6, aoRadius: 8, aoStrength: 1.0 });

  /* 崖壁（竖向节理，深色） */
  M.cliff = () => build('cliff', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        // 竖向拉伸的木纹式节理
        let H = fbmT(u * 3.4, v * .55, 7, 5, 201) * .6;
        H += ridgedT(u * 2.2, v * .4, 11, 4, 212) * .34;
        H += fbmT(u, v, 70, 3, 233) * .1;
        h[row + x] = H;
        const l = .30 + H * .30;
        alb[(row + x) * 4] = clamp01(l * 1.02) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .93) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .84) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.70 + fbmT(u, v, 34, 3, 244) * .24 - H * .1);
      }
    }
  }, { normalStrength: 3.2, aoRadius: 9, aoStrength: 1.05 });

  /* 草地（近景草皮） */
  M.grass = () => build('grass', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        // 细长草叶：把 y 拉伸
        let H = ridgedT(u * 1.0, v * .35, 9, 4, 301) * .5;
        H += fbmT(u, v, 26, 4, 312) * .4;
        H += fbmT(u, v, 110, 3, 323) * .18;
        h[row + x] = H;
        const clump = fbmT(u, v, 5, 3, 331) * .5 + .5;
        const dry = clamp01(fbmT(u, v, 3, 2, 341) * .5 + .5);
        // 第三层：小块色相差异，破掉"一片同色"
        const patch = fbmT(u, v, 13, 3, 361) * .5 + .5;
        const patch2 = fbmT(u, v, 48, 3, 371) * .5 + .5;
        let r = .13 + clump * .13 + dry * .34 + patch * .12;
        let g = .28 + clump * .34 - dry * .16 + patch * .07;
        let b = .09 + clump * .08 + patch2 * .05;
        const shade = .62 + H * .62 + patch2 * .22;
        alb[(row + x) * 4] = clamp01(r * shade) * 255;
        alb[(row + x) * 4 + 1] = clamp01(g * shade) * 255;
        alb[(row + x) * 4 + 2] = clamp01(b * shade) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.80 + fbmT(u, v, 60, 3, 355) * .18);
      }
    }
  }, { normalStrength: 2.2, aoRadius: 5 });

  /* 干草 / 秋色 */
  M.grassDry = () => build('grassDry', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        let H = ridgedT(u, v * .35, 9, 4, 401) * .5 + fbmT(u, v, 26, 4, 412) * .4;
        h[row + x] = H;
        const clump = fbmT(u, v, 5, 3, 421) * .5 + .5;
        const s = .78 + H * .4;
        alb[(row + x) * 4] = clamp01((.42 + clump * .22) * s) * 255;
        alb[(row + x) * 4 + 1] = clamp01((.36 + clump * .18) * s) * 255;
        alb[(row + x) * 4 + 2] = clamp01((.13 + clump * .07) * s) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = .84;
      }
    }
  }, { normalStrength: 2.0, aoRadius: 5 });

  /* 泥土 / 小径 */
  M.dirt = () => build('dirt', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        let H = fbmT(u, v, 10, 5, 501) * .5 + worleyT(u, v, 18, 511)[0] * .3;
        H += fbmT(u, v, 90, 3, 521) * .12;
        h[row + x] = H;
        const peb = clamp01(worleyT(u, v, 30, 531)[0] * -3 + 1.1);
        const s = .72 + H * .5;
        alb[(row + x) * 4] = clamp01((.30 + peb * .10) * s) * 255;
        alb[(row + x) * 4 + 1] = clamp01((.22 + peb * .09) * s) * 255;
        alb[(row + x) * 4 + 2] = clamp01((.14 + peb * .07) * s) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.86 + fbmT(u, v, 50, 2, 541) * .1);
      }
    }
  }, { normalStrength: 2.0, aoRadius: 6 });

  /* 沙 */
  M.sand = () => build('sand', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        // 沙纹：正弦 + 噪声抖动
        const ripple = sin((u * 26 + fbmT(u, v, 4, 3, 601) * 3.2) * TAU) * .5 + .5;
        let H = ripple * .45 + fbmT(u, v, 60, 4, 611) * .3 + fbmT(u, v, 200, 2, 621) * .1;
        h[row + x] = H;
        const s = .86 + H * .26;
        alb[(row + x) * 4] = clamp01(.82 * s) * 255;
        alb[(row + x) * 4 + 1] = clamp01(.73 * s) * 255;
        alb[(row + x) * 4 + 2] = clamp01(.53 * s) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.72 + fbmT(u, v, 120, 2, 631) * .2);
      }
    }
  }, { normalStrength: 1.5, aoRadius: 3 });

  /* 红砂岩（格鲁德） */
  M.sandstone = () => build('sandstone', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        let H = ridgedT(u, v, 8, 4, 701) * .55 + fbmT(u, v, 26, 4, 711) * .35;
        h[row + x] = H;
        const band = sin((v * 7 + fbmT(u, v, 3, 2, 721) * 2) * TAU) * .5 + .5;
        const l = .48 + H * .3 + band * .07;
        alb[(row + x) * 4] = clamp01(l * 1.05) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .80) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .60) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.68 + fbmT(u, v, 40, 3, 731) * .24);
      }
    }
  }, { normalStrength: 2.4, aoRadius: 7 });

  /* 雪 */
  M.snow = () => build('snow', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        // 风蚀雪脊
        let H = fbmT(u, v, 5, 4, 801) * .4 + fbmT(u, v, 30, 3, 811) * .22;
        H += ridgedT(u, v * .4, 8, 3, 821) * .3;
        h[row + x] = H;
        const s = .93 + H * .1;
        const blue = clamp01(fbmT(u, v, 6, 2, 831) * .5 + .5);
        alb[(row + x) * 4] = clamp01((.93 - blue * .05) * s) * 255;
        alb[(row + x) * 4 + 1] = clamp01((.95 - blue * .02) * s) * 255;
        alb[(row + x) * 4 + 2] = clamp01(1.0 * s) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.32 + fbmT(u, v, 80, 3, 841) * .22);
      }
    }
  }, { normalStrength: 1.4, aoRadius: 5 });

  /* 冰 */
  M.ice = () => build('ice', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        let H = ridgedT(u, v, 5, 4, 901) * .6 + fbmT(u, v, 18, 3, 911) * .3;
        h[row + x] = H;
        const crack = clamp01(1 - abs(fbmT(u, v, 9, 3, 921)) * 6);
        alb[(row + x) * 4] = clamp01(.62 + crack * .3) * 255;
        alb[(row + x) * 4 + 1] = clamp01(.78 + crack * .2) * 255;
        alb[(row + x) * 4 + 2] = clamp01(.90 + crack * .1) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.16 + crack * .35);
      }
    }
  }, { normalStrength: 2.0, aoRadius: 4 });

  /* 火山灰 */
  M.ash = () => build('ash', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        let H = fbmT(u, v, 12, 4, 1001) * .5 + worleyT(u, v, 26, 1011)[0] * .3;
        h[row + x] = H;
        const glow = clamp01((fbmT(u, v, 7, 3, 1021) * .5 + .5) - .62) * 2.6;
        const l = .14 + H * .12;
        alb[(row + x) * 4] = clamp01(l + glow * .8) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .96 + glow * .22) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .94) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.88 - glow * .4);
      }
    }
  }, { normalStrength: 1.8, aoRadius: 6 });

  /* 熔岩（自发光） */
  M.lava = () => build('lava', 512, (S, { h, alb, rgh, emi }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const w = fbmT(u, v, 4, 4, 1101);
        const cell = worleyT(u + w * .1, v + w * .1, 9, 1111);
        const crack = clamp01(1 - cell[0] * 1.9);      // 裂缝亮
        const hot = pow(crack, 1.6);
        h[row + x] = crack;
        alb[(row + x) * 4] = clamp01(.10 + hot * .95) * 255;
        alb[(row + x) * 4 + 1] = clamp01(.03 + hot * .42) * 255;
        alb[(row + x) * 4 + 2] = clamp01(.02 + hot * .06) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.85 - hot * .5);
        emi[(row + x) * 3] = hot * 1.8;
        emi[(row + x) * 3 + 1] = hot * .55;
        emi[(row + x) * 3 + 2] = hot * .08;
      }
    }
  }, { normalStrength: 2.2, aoRadius: 5, emissive: true });

  /* 砾石 */
  M.gravel = () => build('gravel', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const w = worleyT(u, v, 16, 1201);
        const w2 = worleyT(u, v, 34, 1211);
        let H = (1 - w[0]) * .6 + (1 - w2[0]) * .3;
        h[row + x] = H;
        const g = .22 + (1 - w[0]) * .4;
        const tint = hash3(floor(u * 16), floor(v * 16), 1221);
        alb[(row + x) * 4] = clamp01(g * (1 + tint * .18)) * 255;
        alb[(row + x) * 4 + 1] = clamp01(g * .98) * 255;
        alb[(row + x) * 4 + 2] = clamp01(g * (.9 - tint * .1)) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.78 + tint * .18);
      }
    }
  }, { normalStrength: 3.0, aoRadius: 6 });

  /* 树皮 */
  M.bark = () => build('bark', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        let H = ridgedT(u * 3.0, v * .35, 8, 5, 1301) * .68;
        H += fbmT(u, v, 40, 3, 1311) * .2;
        h[row + x] = H;
        const l = .26 + H * .40;
        const moss = clamp01((fbmT(u, v, 6, 3, 1321) * .5 + .5) - .5) * 2;
        alb[(row + x) * 4] = clamp01(l * 1.02) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * (.94 - moss * .16)) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * (.80 - moss * .22)) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.82 - moss * .18);
      }
    }
  }, { normalStrength: 3.4, aoRadius: 8 });

  /* 松树皮（更糙更红） */
  M.barkPine = () => build('barkPine', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        let H = ridgedT(u * 4.0, v * .25, 10, 5, 1401) * .7 + fbmT(u, v, 60, 3, 1411) * .18;
        h[row + x] = H;
        const l = .20 + H * .34;
        alb[(row + x) * 4] = clamp01((l + .10) * 1.05) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .86) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .68) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.86);
      }
    }
  }, { normalStrength: 3.6, aoRadius: 8 });

  /* 木板 */
  M.plank = () => build('plank', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    const boards = 6;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const bi = floor(v * boards), bv = (v * boards) % 1;
        const gap = smoothstep(0, .045, bv) * smoothstep(1, .955, bv);
        const grain = fbmT(u * 8, v * 2, 30, 4, 1501 + bi * 13);
        const wobble = fbmT(u, v, 3, 2, 1521) * .06;
        let H = grain * .3 + gap * .6 - .3 + wobble;
        h[row + x] = H;
        const tint = hash3(bi, 0, 1531);
        const l = .34 + grain * .16 + tint * .07;
        alb[(row + x) * 4] = clamp01(l * 1.08) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .80) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .52) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.76 + grain * .12);
      }
    }
  }, { normalStrength: 2.0, aoRadius: 5 });

  /* 原木截面 */
  M.logEnd = () => build('logEnd', 256, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const dx = u - .5, dy = v - .5;
        const r = sqrt(dx * dx + dy * dy) * 2;
        const rings = sin(r * 22 + fbmT(u, v, 4, 3, 1601) * 5) * .5 + .5;
        let H = rings * .4 - r * .2;
        h[row + x] = H;
        const l = .40 + rings * .14 - r * .05;
        alb[(row + x) * 4] = clamp01(l * 1.14) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .86) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .58) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = .74;
      }
    }
  }, { normalStrength: 1.4, aoRadius: 4 });

  /* 石砖（城堡/城镇） */
  M.stoneBrick = () => build('stoneBrick', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    const rows = 6, cols = 3;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      const ry = v * rows, ri = floor(ry), rv = ry - ri;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const off = (ri & 1) ? .5 : 0;
        const rx = u * cols + off, ci = floor(rx), cv = rx - ci;
        const joint = min(smoothstep(0, .035, cv), smoothstep(1, .965, cv)) *
          min(smoothstep(0, .06, rv), smoothstep(1, .94, rv));
        const grit = fbmT(u, v, 40, 4, 1701);
        const chip = clamp01((fbmT(u, v, 12, 3, 1711 + (hash3(ci, ri, 3) * 100 | 0)) * .5 + .5) - .70) * 3;
        let H = joint * .55 + grit * .18 - chip * .3 - .22;
        h[row + x] = H;
        const tone = hash3(ci, ri, 1721) * .14;
        const l = (.44 + grit * .12 + tone) * (.35 + joint * .65);
        alb[(row + x) * 4] = clamp01(l * 1.0) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .97) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .90) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.70 + fbmT(u, v, 60, 2, 1731) * .2);
      }
    }
  }, { normalStrength: 3.0, aoRadius: 7 });

  /* 废墟砖（破损、长苔） */
  M.ruinBrick = () => {
    return build('ruinBrick', 512, (S, { h, alb, rgh }) => {
      const inv = 1 / S;
      const rows = 6, cols = 3;
      for (let y = 0; y < S; y++) {
        const v = y * inv, row = y * S;
        const ry = v * rows, ri = floor(ry), rv = ry - ri;
        for (let x = 0; x < S; x++) {
          const u = x * inv;
          const off = (ri & 1) ? .5 : 0;
          const rx = u * cols + off, ci = floor(rx), cv = rx - ci;
          const joint = min(smoothstep(0, .04, cv), smoothstep(1, .96, cv)) *
            min(smoothstep(0, .07, rv), smoothstep(1, .93, rv));
          const grit = fbmT(u, v, 40, 4, 1801);
          const broken = clamp01(fbmT(u, v, 7, 4, 1811) * .5 + .5);
          const hole = broken > .74 ? smoothstep(.74, .82, broken) : 0;
          let H = (joint * (.5 - hole * .5)) + grit * .18 - hole * .5 - .22;
          h[row + x] = H;
          const moss = clamp01((fbmT(u, v, 8, 4, 1821) * .5 + .5) - .48) * 2;
          const tone = hash3(ci, ri, 1831) * .16;
          const l = (.40 + grit * .12 + tone) * (.3 + joint * .7);
          alb[(row + x) * 4] = clamp01(lerp(l, l * .55, moss)) * 255;
          alb[(row + x) * 4 + 1] = clamp01(lerp(l * .96, l * .92, moss) + moss * .1) * 255;
          alb[(row + x) * 4 + 2] = clamp01(lerp(l * .88, l * .5, moss)) * 255;
          alb[(row + x) * 4 + 3] = 255;
          rgh[row + x] = clamp01(.72 + fbmT(u, v, 60, 2, 1841) * .2 + moss * .06);
        }
      }
    }, { normalStrength: 3.2, aoRadius: 8 });
  };

  /* 希卡石（神庙，带发光纹路） */
  M.sheikahStone = () => build('sheikahStone', 512, (S, { h, alb, rgh, emi }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        // 大块面板 + 缝隙
        const px = u * 2, py = v * 4;
        const cx = px % 1, cy = py % 1;
        const seam = min(smoothstep(0, .02, cx), smoothstep(1, .98, cx),
          smoothstep(0, .03, cy), smoothstep(1, .97, cy));
        const grit = fbmT(u, v, 50, 4, 1901);
        // 发光刻线：细密的直角回路
        const gx = abs(fbmT(u * 1, v, 6, 3, 1911));
        const line = clamp01(1 - gx * 26) * (fbmT(u, v, 3, 2, 1921) > 0 ? 1 : 0);
        let H = seam * .5 + grit * .14 - .25;
        h[row + x] = H;
        const l = .44 + grit * .14 + seam * .12;
        const glow = line * .9;
        alb[(row + x) * 4] = clamp01(l * .94 + glow * .2) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .97 + glow * .8) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * 1.02 + glow * .9) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.56 - glow * .3);
        emi[(row + x) * 3] = glow * .55;
        emi[(row + x) * 3 + 1] = glow * 1.5;
        emi[(row + x) * 3 + 2] = glow * 1.7;
      }
    }
  }, { normalStrength: 2.2, aoRadius: 6, emissive: true });

  /* 希卡金属板（守护者外壳） */
  M.sheikahMetal = () => build('sheikahMetal', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const plate = fbmT(u, v, 4, 3, 2001);
        const brush = fbmT(u * 40, v * .6, 60, 3, 2011);
        const rivets = (() => {
          const gx = (u * 8) % 1, gy = (v * 8) % 1;
          const d = sqrt((gx - .5) * (gx - .5) + (gy - .5) * (gy - .5));
          return clamp01(1 - smoothstep(.05, .12, d));
        })();
        let H = plate * .12 + brush * .05 + rivets * .3;
        h[row + x] = H;
        const l = .30 + brush * .07 + rivets * .12;
        alb[(row + x) * 4] = clamp01(l * .92) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .95) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .98) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.42 + brush * .2 - rivets * .1);
      }
    }
  }, { normalStrength: 1.8, aoRadius: 5 });

  /* 铁 / 钢 */
  M.metal = () => build('metal', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const brush = fbmT(u * 60, v * .4, 80, 3, 2101);
        const dent = fbmT(u, v, 10, 3, 2111);
        const rust = clamp01((fbmT(u, v, 7, 4, 2121) * .5 + .5) - .58) * 2.4;
        let H = brush * .06 + dent * .18;
        h[row + x] = H;
        const l = .34 + brush * .07 + dent * .05;
        alb[(row + x) * 4] = clamp01(lerp(l, .32, rust)) * 255;
        alb[(row + x) * 4 + 1] = clamp01(lerp(l, .16, rust)) * 255;
        alb[(row + x) * 4 + 2] = clamp01(lerp(l, .08, rust)) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.40 + brush * .12 + rust * .45);
      }
    }
  }, { normalStrength: 1.6, aoRadius: 4 });

  /* 金 / 铜（神庙装饰、宝箱） */
  M.brass = () => build('brass', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const brush = fbmT(u * 50, v * .5, 70, 3, 2201);
        const patina = clamp01((fbmT(u, v, 6, 4, 2211) * .5 + .5) - .6) * 2.5;
        let H = brush * .08;
        h[row + x] = H;
        const l = .52 + brush * .1;
        alb[(row + x) * 4] = clamp01(l * (1 - patina * .3)) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .76 * (1 - patina * .2)) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .34 * (1 + patina * .4)) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.30 + patina * .4);
      }
    }
  }, { normalStrength: 1.4, aoRadius: 4 });

  /* 布（衣服） */
  M.cloth = () => build('cloth', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const weave = (sin(u * S / 4 * TAU) * sin(v * S / 4 * TAU)) * .5;
        const fuzz = fbmT(u, v, 90, 3, 2301);
        let H = weave * .35 + fuzz * .3;
        h[row + x] = H;
        const l = .40 + weave * .06 + fuzz * .08;
        alb[(row + x) * 4] = clamp01(l * 1.06) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .99) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .92) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.86 + fuzz * .1);
      }
    }
  }, { normalStrength: 1.6, aoRadius: 3 });

  /* 皮革 */
  M.leather = () => build('leather', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const grain = worleyT(u, v, 40, 2401)[0];
        const wrinkle = ridgedT(u, v, 9, 4, 2411);
        let H = (1 - grain) * .35 + wrinkle * .3;
        h[row + x] = H;
        const l = .28 + H * .22;
        alb[(row + x) * 4] = clamp01(l * 1.1) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .78) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .52) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.62 + grain * .2);
      }
    }
  }, { normalStrength: 2.4, aoRadius: 5 });

  /* 锁子甲 */
  M.chainmail = () => build('chainmail', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const rows = 40;
        const ry = v * rows, ri = floor(ry), rv = ry - ri;
        const off = (ri & 1) ? .5 : 0;
        const rx = u * rows + off, ci = floor(rx), cv = rx - ci;
        const d = sqrt((cv - .5) * (cv - .5) + (rv - .5) * (rv - .5) * 1.2);
        const ring = clamp01(1 - abs(d - .32) * 8);
        let H = ring;
        h[row + x] = H;
        const l = .18 + ring * .44;
        alb[(row + x) * 4] = clamp01(l * .95) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .97) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.30 + (1 - ring) * .4);
      }
    }
  }, { normalStrength: 2.6, aoRadius: 4 });

  /* 皮肤 */
  M.skin = () => build('skin', 256, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const pore = fbmT(u, v, 110, 3, 2501);
        const blotch = fbmT(u, v, 7, 3, 2511);
        let H = pore * .2;
        h[row + x] = H;
        const l = .74 + pore * .06 + blotch * .05;
        alb[(row + x) * 4] = clamp01(l * 1.0) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .82) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .70) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.55 + pore * .12);
      }
    }
  }, { normalStrength: 0.8, aoRadius: 2 });

  /* 茅草屋顶 */
  M.thatch = () => build('thatch', 512, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const straw = ridgedT(u * .6, v * 5, 30, 4, 2601);
        const sag = sin(v * 26 * TAU) * .5;
        let H = straw * .5 + sag * .2;
        h[row + x] = H;
        const l = .34 + straw * .22;
        alb[(row + x) * 4] = clamp01(l * 1.1) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .92) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .55) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = .9;
      }
    }
  }, { normalStrength: 2.6, aoRadius: 5 });

  /* 陶器 */
  M.pottery = () => build('pottery', 256, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const ring = sin(v * 60 * TAU) * .5;
        const grit = fbmT(u, v, 90, 3, 2701);
        let H = ring * .18 + grit * .3;
        h[row + x] = H;
        const l = .46 + grit * .14 + ring * .03;
        alb[(row + x) * 4] = clamp01(l * 1.08) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .70) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .48) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.60 + grit * .2);
      }
    }
  }, { normalStrength: 2.0, aoRadius: 4 });

  /* 骨头 */
  M.bone = () => build('bone', 256, (S, { h, alb, rgh }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const crack = clamp01(1 - abs(fbmT(u, v, 14, 4, 2801)) * 9);
        const pore = fbmT(u, v, 70, 3, 2811);
        h[row + x] = pore * .2 - crack * .4;
        const l = .78 + pore * .08 - crack * .35;
        alb[(row + x) * 4] = clamp01(l) * 255;
        alb[(row + x) * 4 + 1] = clamp01(l * .96) * 255;
        alb[(row + x) * 4 + 2] = clamp01(l * .84) * 255;
        alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = clamp01(.55 + pore * .15 + crack * .2);
      }
    }
  }, { normalStrength: 1.6, aoRadius: 4 });

  /* 符文发光纹（神庙墙、希卡门的自发光叠加层） */
  M.glyph = () => build('glyph', 512, (S, { h, alb, rgh, emi }) => {
    const inv = 1 / S;
    for (let y = 0; y < S; y++) {
      const v = y * inv, row = y * S;
      for (let x = 0; x < S; x++) {
        const u = x * inv;
        const g = abs(fbmT(u, v, 5, 4, 2901));
        const line = clamp01(1 - g * 22);
        const node = clamp01((fbmT(u, v, 9, 2, 2911) * .5 + .5) - .86) * 7;
        const glow = clamp01(line + node);
        h[row + x] = glow;
        alb[(row + x) * 4] = 200; alb[(row + x) * 4 + 1] = 255;
        alb[(row + x) * 4 + 2] = 255; alb[(row + x) * 4 + 3] = 255;
        rgh[row + x] = .4;
        emi[(row + x) * 3] = glow * .5;
        emi[(row + x) * 3 + 1] = glow * 2.1;
        emi[(row + x) * 3 + 2] = glow * 2.3;
      }
    }
  }, { normalStrength: .4, noAO: true, emissive: true, aoRadius: 2 });

  /* 水法线 */
  M.waterNormal = () => {
    const size = 512, n = size * size;
    const h = newMap(n);
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv, row = y * size;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        h[row + x] = fbmT(u, v, 8, 5, 3001) * .5 + fbmT(u, v, 22, 4, 3011) * .3 +
          fbmT(u, v, 48, 3, 3021) * .2;
      }
    }
    return { normalMap: tex(normalMapFrom(h, size, 1.5), size) };
  };

  /* ---------- Canvas 绘制的有机贴图 ---------- */
  function canvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return { c, x: c.getContext('2d') };
  }
  function cvsTex(c, { repeat = 1, mips = true, srgb = true } = {}) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.generateMipmaps = mips;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  }
  const C = {};

  /** 阔叶树叶簇 alpha 贴图 */
  C.leaf = (hue = .25, size = 256, seed = 1) => {
    const k = 'leaf' + hue + size + seed;
    if (_cache.has(k)) return _cache.get(k);
    const { c, x } = canvas(size);
    x.clearRect(0, 0, size, size);
    const r = new Rand(seed);
    const N = 64;
    for (let i = 0; i < N; i++) {
      const cx = size * .5 + r.gauss(0, size * .22);
      const cy = size * .5 + r.gauss(0, size * .22);
      const rr = size * r.f(.075, .15);
      const a = r.ang();
      const h = (hue + r.f(-.04, .04) + 1) % 1;
      const l = r.f(.22, .46), s = r.f(.35, .62);
      const col = new THREE.Color().setHSL(h, s, l);
      x.save();
      x.translate(cx, cy); x.rotate(a);
      x.fillStyle = '#' + col.getHexString();
      x.beginPath();
      // 叶片形状
      const L = rr * 1.9, W = rr * .85;
      x.moveTo(-L, 0);
      x.bezierCurveTo(-L * .3, -W, L * .5, -W * .8, L, 0);
      x.bezierCurveTo(L * .5, W * .8, -L * .3, W, -L, 0);
      x.fill();
      // 中脉
      x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = max(1, rr * .05);
      x.beginPath(); x.moveTo(-L * .9, 0); x.lineTo(L * .92, 0); x.stroke();
      x.restore();
    }
    // 边缘柔化
    const id = x.getImageData(0, 0, size, size), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) d[i + 3] = min(255, d[i + 3] * 1.0);
    }
    x.putImageData(id, 0, 0);
    const t = cvsTex(c, { mips: true });
    _cache.set(k, t);
    return t;
  };

  /** 松针簇 */
  C.needle = (size = 256, seed = 7) => {
    const k = 'needle' + size + seed;
    if (_cache.has(k)) return _cache.get(k);
    const { c, x } = canvas(size);
    const r = new Rand(seed);
    for (let i = 0; i < 90; i++) {
      const cx = size * .5 + r.gauss(0, size * .2);
      const cy = size * .5 + r.gauss(0, size * .2);
      const a = r.ang(), L = size * r.f(.10, .22), W = size * r.f(.006, .014);
      const col = new THREE.Color().setHSL(.30 + r.f(-.05, .03), r.f(.3, .55), r.f(.12, .28));
      x.save(); x.translate(cx, cy); x.rotate(a);
      x.fillStyle = '#' + col.getHexString();
      x.fillRect(0, -W, L, W * 2);
      x.restore();
    }
    const t = cvsTex(c);
    _cache.set(k, t);
    return t;
  };

  /** 棕榈叶 */
  C.frond = (size = 256, seed = 11) => {
    const k = 'frond' + size + seed;
    if (_cache.has(k)) return _cache.get(k);
    const { c, x } = canvas(size);
    const r = new Rand(seed);
    x.clearRect(0, 0, size, size);
    for (let f = 0; f < 3; f++) {
      const baseA = f / 3 * TAU + r.f(-.3, .3);
      const L = size * .44;
      x.save();
      x.translate(size / 2, size / 2); x.rotate(baseA);
      const g = x.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, 'hsl(95,42%,24%)'); g.addColorStop(1, 'hsl(88,48%,34%)');
      x.strokeStyle = g; x.lineWidth = size * .022;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(L, 0); x.stroke();
      // 羽片
      for (let i = 1; i < 22; i++) {
        const t = i / 22, px = L * t, w = size * .085 * (1 - t * .55) * sin(t * PI) * 2.2;
        x.strokeStyle = 'hsl(' + (86 + r.f(-8, 8)) + ',44%,' + (22 + t * 12 + r.f(-4, 4)) + '%)';
        x.lineWidth = size * .014;
        x.beginPath(); x.moveTo(px, 0);
        x.quadraticCurveTo(px + w * .4, -w * .7, px + w * .55, -w);
        x.stroke();
        x.beginPath(); x.moveTo(px, 0);
        x.quadraticCurveTo(px + w * .4, w * .7, px + w * .55, w);
        x.stroke();
      }
      x.restore();
    }
    const t = cvsTex(c);
    _cache.set(k, t);
    return t;
  };

  /** 草叶（单株，用于近景 billboard / 叶片网格 alpha） */
  C.grassBlade = (size = 128, seed = 3) => {
    const k = 'grassBlade' + size + seed;
    if (_cache.has(k)) return _cache.get(k);
    const { c, x } = canvas(size);
    const r = new Rand(seed);
    x.clearRect(0, 0, size, size);
    for (let i = 0; i < 44; i++) {
      const bx = size * r.f(.04, .96);
      const bw = size * r.f(.008, .019);
      const bh = size * r.f(.34, .96);
      const bend = size * r.f(-.20, .20);
      const hue = .23 + r.f(-.05, .05);
      const sat = r.f(.42, .78);
      const li = r.f(.10, .26);
      // 根深梢亮
      const g = x.createLinearGradient(0, size, 0, size - bh);
      g.addColorStop(0, 'hsl(' + (hue * 360) + ',' + (sat * 100) + '%,' + (li * 72) + '%)');
      g.addColorStop(1, 'hsl(' + ((hue + .03) * 360) + ',' + (sat * 92) + '%,' + (li * 150) + '%)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(bx - bw, size);
      x.quadraticCurveTo(bx - bw * .4 + bend * .4, size - bh * .6, bx + bend, size - bh);
      x.quadraticCurveTo(bx + bw * .4 + bend * .4, size - bh * .6, bx + bw, size);
      x.closePath(); x.fill();
    }
    const t = cvsTex(c, { mips: true });
    _cache.set(k, t);
    return t;
  };

  /** 花朵 */
  C.flower = (color = .96, size = 128, seed = 5) => {
    const k = 'flower' + color + size + seed;
    if (_cache.has(k)) return _cache.get(k);
    const { c, x } = canvas(size);
    const r = new Rand(seed);
    x.clearRect(0, 0, size, size);
    // 茎
    x.strokeStyle = 'hsl(100,40%,26%)'; x.lineWidth = size * .035;
    x.beginPath(); x.moveTo(size * .5, size); x.lineTo(size * .5, size * .48); x.stroke();
    // 花瓣
    const petals = 6;
    for (let i = 0; i < petals; i++) {
      const a = i / petals * TAU + r.f(-.1, .1);
      const col = new THREE.Color().setHSL(color + r.f(-.02, .02), .78, r.f(.55, .72));
      x.save(); x.translate(size * .5, size * .42); x.rotate(a);
      x.fillStyle = '#' + col.getHexString();
      x.beginPath(); x.ellipse(size * .15, 0, size * .16, size * .09, 0, 0, TAU); x.fill();
      x.restore();
    }
    x.fillStyle = 'hsl(48,85%,62%)';
    x.beginPath(); x.arc(size * .5, size * .42, size * .075, 0, TAU); x.fill();
    const t = cvsTex(c);
    _cache.set(k, t);
    return t;
  };

  /** 灌木/蕨 */
  C.bush = (size = 256, seed = 9) => {
    const k = 'bush' + size + seed;
    if (_cache.has(k)) return _cache.get(k);
    const { c, x } = canvas(size);
    const r = new Rand(seed);
    x.clearRect(0, 0, size, size);
    for (let i = 0; i < 40; i++) {
      const cx = size * .5 + r.gauss(0, size * .2);
      const cy = size * .55 + r.gauss(0, size * .16);
      const rr = size * r.f(.09, .19);
      const col = new THREE.Color().setHSL(.27 + r.f(-.05, .05), r.f(.35, .6), r.f(.14, .3));
      x.fillStyle = '#' + col.getHexString();
      x.beginPath();
      for (let k2 = 0; k2 < 7; k2++) {
        const a = k2 / 7 * TAU;
        const rad = rr * r.f(.7, 1.15);
        const px = cx + cos(a) * rad, py = cy + sin(a) * rad;
        if (k2 === 0) x.moveTo(px, py);
        else x.quadraticCurveTo(cx + cos(a - .3) * rad * 1.2, cy + sin(a - .3) * rad * 1.2, px, py);
      }
      x.closePath(); x.fill();
    }
    const t = cvsTex(c);
    _cache.set(k, t);
    return t;
  };

  /** 云（体积感噪声，用于天空层） */
  C.cloud = (size = 512, seed = 17) => {
    const k = 'cloud' + size + seed;
    if (_cache.has(k)) return _cache.get(k);
    const n = size * size;
    const data = new Uint8Array(n * 4);
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        let a = fbmT(u, v, 4, 6, 4001 + seed * 31) * .5 + .5;
        a = clamp01((a - .42) * 2.4);
        a = pow(a, 1.25);
        // 顶部亮、底部暗
        const o = (y * size + x) * 4;
        const shade = 190 + (1 - v) * 65;
        data[o] = shade * .98; data[o + 1] = shade; data[o + 2] = min(255, shade * 1.04);
        data[o + 3] = a * 255;
      }
    }
    const t = tex(data, size, { srgb: true });
    _cache.set(k, t);
    return t;
  };

  /** 通用径向光斑（粒子 / 光晕 / 影子） */
  C.radial = (inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, power = 2) => {
    const k = 'radial' + inner + outer + size + power;
    if (_cache.has(k)) return _cache.get(k);
    const { c, x } = canvas(size);
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = pow(1 - t, power);
      g.addColorStop(t, i === 0 ? inner : blendCss(inner, outer, 1 - a));
    }
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    const t = cvsTex(c, { mips: false });
    _cache.set(k, t);
    return t;
  };

  /** 软阴影斑（角色脚下的接触阴影） */
  C.blobShadow = (size = 128) => {
    const k = 'blobShadow' + size;
    if (_cache.has(k)) return _cache.get(k);
    const { c, x } = canvas(size);
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,.55)');
    g.addColorStop(.45, 'rgba(0,0,0,.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    const t = cvsTex(c, { mips: false, srgb: false });
    _cache.set(k, t);
    return t;
  };

  /** 烟雾 / 尘土 */
  C.smoke = (size = 128, seed = 23) => {
    const k = 'smoke' + size + seed;
    if (_cache.has(k)) return _cache.get(k);
    const { c, x } = canvas(size);
    x.clearRect(0, 0, size, size);
    const r = new Rand(seed);
    for (let i = 0; i < 26; i++) {
      const cx = size * .5 + r.gauss(0, size * .16);
      const cy = size * .5 + r.gauss(0, size * .16);
      const rr = size * r.f(.12, .3);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, 'rgba(255,255,255,.30)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr, 0, TAU); x.fill();
    }
    const t = cvsTex(c, { mips: false, srgb: false });
    _cache.set(k, t);
    return t;
  };

  /** 希卡符文图标（用于 UI 与投影） */
  C.runeIcon = (kind, size = 128) => {
    const k = 'rune' + kind + size;
    if (_cache.has(k)) return _cache.get(k);
    const { c, x } = canvas(size);
    x.clearRect(0, 0, size, size);
    x.strokeStyle = '#5ff0e6'; x.fillStyle = 'rgba(60,220,215,.18)';
    x.lineWidth = size * .05; x.lineJoin = 'round'; x.lineCap = 'round';
    const s = size, C2 = s / 2;
    x.beginPath();
    if (kind === 'magnesis') {            // 磁力：U 型磁铁
      x.arc(C2, C2 * .95, s * .26, PI, TAU);
      x.moveTo(C2 - s * .26, C2 * .95); x.lineTo(C2 - s * .26, C2 * 1.45);
      x.moveTo(C2 + s * .26, C2 * .95); x.lineTo(C2 + s * .26, C2 * 1.45);
    } else if (kind === 'stasis') {       // 静止器：沙漏
      x.moveTo(C2 - s * .24, C2 - s * .3); x.lineTo(C2 + s * .24, C2 - s * .3);
      x.lineTo(C2, C2); x.lineTo(C2 + s * .24, C2 + s * .3);
      x.lineTo(C2 - s * .24, C2 + s * .3); x.closePath();
    } else if (kind === 'cryonis') {      // 制冰器：六边形冰块
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU - PI / 2;
        const px = C2 + cos(a) * s * .3, py = C2 + sin(a) * s * .3;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.closePath();
    } else if (kind === 'bomb') {         // 炸弹：圆 + 引信
      x.arc(C2, C2 + s * .06, s * .26, 0, TAU);
      x.moveTo(C2 + s * .16, C2 - s * .2);
      x.quadraticCurveTo(C2 + s * .3, C2 - s * .34, C2 + s * .2, C2 - s * .42);
    } else if (kind === 'camera') {       // 照相机
      x.rect(C2 - s * .28, C2 - s * .16, s * .56, s * .38);
      x.moveTo(C2 - s * .1, C2 - s * .16); x.lineTo(C2 - s * .04, C2 - s * .27);
      x.lineTo(C2 + s * .12, C2 - s * .27); x.lineTo(C2 + s * .18, C2 - s * .16);
    }
    x.stroke();
    x.fill();
    const t = cvsTex(c);
    _cache.set(k, t);
    return t;
  };

  function blendCss(a, b, t) {
    const pa = parseCss(a), pb = parseCss(b);
    const r = floor(lerp(pa[0], pb[0], t)), g2 = floor(lerp(pa[1], pb[1], t)),
      bl = floor(lerp(pa[2], pb[2], t)), al = lerp(pa[3], pb[3], t);
    return 'rgba(' + r + ',' + g2 + ',' + bl + ',' + al.toFixed(3) + ')';
  }
  function parseCss(s) {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return [255, 255, 255, 1];
    const p = m[1].split(',').map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }

  return { build, M, C, tex, grayMap, normalMapFrom, aoFrom, fbmT, ridgedT, worleyT, hash3, canvas, cvsTex, cache: _cache };
})();

/* ---------- 材质工厂：把贴图包成 three 材质 ---------- */
const MatLib = (() => {
  const opts = { aniso: 8, repeat: 1 };
  const made = new Map();

  function std(set, o = {}) {
    const m = new THREE.MeshStandardMaterial(Object.assign({
      map: set.map, normalMap: set.normalMap,
      roughnessMap: set.roughnessMap,
      roughness: o.roughness !== undefined ? o.roughness : 1.0,
      metalness: o.metalness !== undefined ? o.metalness : 0.0,
      color: o.color !== undefined ? o.color : 0xffffff,
      normalScale: new THREE.Vector2(o.normalScale || 1, o.normalScale || 1),
      side: o.side || THREE.FrontSide,
      transparent: !!o.transparent,
      alphaTest: o.alphaTest || 0,
      emissive: o.emissive !== undefined ? o.emissive : 0x000000,
      emissiveIntensity: o.emissiveIntensity !== undefined ? o.emissiveIntensity : 1,
      emissiveMap: set.emissiveMap || null,
      vertexColors: !!o.vertexColors,
      flatShading: !!o.flatShading,
      depthWrite: o.depthWrite !== undefined ? o.depthWrite : true,
    }, o.extra || {}));
    if (o.repeat) {
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.aoMap]) {
        if (t && t !== set.map) t.repeat.set(o.repeat, o.repeat);
      }
    }
    return m;
  }

  return { std, made };
})();
