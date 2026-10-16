/* =========================================================================
   40_terrain.js — 海拉鲁大陆：地形生成 / 生物群系 / 四叉树 LOD / 七层混合材质
   ========================================================================= */

const WORLD = 8192;            // 世界边长（单位）
const HALF_W = WORLD / 2;
const SEA = 0;                 // 海平面高度

/* ---------- 区域定义（决定气候 / 天气 / 命名） ---------- */
const REGIONS = [
  { n: '海拉鲁平原', x: 0, z: 0, r: 1500, climate: 'field' },
  { n: '初始台地', x: -620, z: 560, r: 470, climate: 'field' },
  { n: '海拉鲁城堡', x: 40, z: -520, r: 300, climate: 'field' },
  { n: '死亡之山', x: 1420, z: -1150, r: 700, climate: 'volcano' },
  { n: '奥尔汀峡谷', x: 900, z: -760, r: 520, climate: 'volcano' },
  { n: '阿卡莱', x: 1880, z: -980, r: 640, climate: 'field' },
  { n: '拉聂尔', x: 1500, z: -140, r: 560, climate: 'field' },
  { n: '佐拉领地', x: 1660, z: -430, r: 400, climate: 'field' },
  { n: '内克鲁达', x: 1180, z: 660, r: 560, climate: 'field' },
  { n: '哈特诺村', x: 1480, z: 840, r: 340, climate: 'field' },
  { n: '法罗尼雨林', x: 860, z: 1520, r: 640, climate: 'jungle' },
  { n: '海拉鲁湖', x: 250, z: 1180, r: 520, climate: 'field' },
  { n: '格鲁德沙漠', x: -1780, z: 920, r: 780, climate: 'desert' },
  { n: '格鲁德高地', x: -1420, z: 200, r: 620, climate: 'desert' },
  { n: '塔邦挞', x: -1520, z: -560, r: 620, climate: 'field' },
  { n: '赫布拉雪山', x: -1450, z: -1520, r: 820, climate: 'snow' },
  { n: '海拉鲁山脊', x: -520, z: -1420, r: 700, climate: 'snow' },
  { n: '双子山', x: 700, z: -160, r: 300, climate: 'field' },
  { n: '初始台地北', x: -350, z: 250, r: 320, climate: 'field' },
];

/* ---------- 地标（地形塑形的显式修饰） ---------- */
const LANDMARKS = [
  // 初始台地：带断崖的台地
  { t: 'mesa', x: -620, z: 560, r: 400, h: 200, wall: 34, wob: 40 },
  // 海拉鲁城堡：中央高地
  { t: 'mesa', x: 40, z: -540, r: 210, h: 150, wall: 46, wob: 26 },
  // 死亡之山：大火山
  { t: 'volcano', x: 1420, z: -1150, r: 900, h: 700, crater: 110, cdepth: 130 },
  // 奥尔汀
  { t: 'cone', x: 980, z: -820, r: 420, h: 250 },
  // 双子山
  { t: 'cone', x: 620, z: -110, r: 210, h: 240 },
  { t: 'cone', x: 790, z: -230, r: 190, h: 215 },
  // 赫布拉山脉
  { t: 'cone', x: -1500, z: -1580, r: 780, h: 620 },
  { t: 'cone', x: -1180, z: -1300, r: 480, h: 400 },
  { t: 'cone', x: -1750, z: -1150, r: 520, h: 430 },
  // 海拉鲁山脊
  { t: 'cone', x: -560, z: -1480, r: 640, h: 470 },
  { t: 'cone', x: -100, z: -1520, r: 420, h: 300 },
  // 格鲁德高地
  { t: 'cone', x: -1400, z: 240, r: 520, h: 360 },
  { t: 'cone', x: -1850, z: 380, r: 420, h: 300 },
  // 塔邦挞峡谷：两壁 + 谷底
  { t: 'ridgeLine', x: -1560, z: -520, x2: -1180, z2: -1080, w: 150, h: 300 },
  { t: 'canyon', x: -1380, z: -800, x2: -900, z2: -1100, w: 90, depth: 130 },
  // 内克鲁达 / 拉聂尔山脉
  { t: 'cone', x: 1420, z: 120, r: 420, h: 300 },
  { t: 'cone', x: 1600, z: 900, r: 480, h: 330 },
  { t: 'cone', x: 1050, z: 1180, r: 400, h: 280 },
  // 阿卡莱
  { t: 'cone', x: 2050, z: -700, r: 380, h: 300 },
  // 法罗尼
  { t: 'cone', x: 620, z: 1750, r: 520, h: 260 },
  // 湖：海拉鲁湖
  { t: 'basin', x: 250, z: 1180, r: 480, depth: 120 },
  // 佐拉湖
  { t: 'basin', x: 1620, z: -380, r: 300, depth: 90 },
  // 赫布拉冰湖
  { t: 'basin', x: -1300, z: -1250, r: 260, depth: 60 },
  // 格鲁德沙漠盆地（低洼）
  { t: 'basin', x: -2050, z: 1100, r: 500, depth: 60 },
  // 海拉鲁平原低洼（护城河）
  { t: 'basin', x: 40, z: -350, r: 300, depth: 26 },
];

/* ---------- 河流（沿折线刻蚀河谷） ---------- */
const RIVERS = [
  // 从死亡之山流向海拉鲁平原
  { pts: [[1300, -1050], [1080, -820], [820, -620], [560, -430], [280, -230], [140, -80]], w: 46, d: 30 },
  // 拉聂尔河
  { pts: [[1560, -300], [1280, -150], [1000, 60], [760, 320], [560, 620], [420, 900]], w: 42, d: 26 },
  // 法罗尼河
  { pts: [[900, 1400], [640, 1280], [420, 1120], [300, 940]], w: 36, d: 22 },
];

/* 生成河流折线的包围盒，用于快速剔除 */
for (const R of RIVERS) {
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const p of R.pts) { x0 = min(x0, p[0]); z0 = min(z0, p[1]); x1 = max(x1, p[0]); z1 = max(z1, p[1]); }
  R.bb = [x0 - R.w * 4, z0 - R.w * 4, x1 + R.w * 4, z1 + R.w * 4];
}

/* =========================================================================
   高度场
   ========================================================================= */
function terrainHeight(x, z) {
  const r = hypot(x, z);
  // 大陆度：外圈沉入海底
  const cont = 1 - smoothstep(2950, 3720, r);

  // 基础起伏
  let h = 24;
  h += Noise.fbm2(x * 0.000265, z * 0.000265, 4) * 96;
  h += Noise.fbm2(x * 0.00092, z * 0.00092, 5) * 30;
  h += Noise.fbm2(x * 0.0034, z * 0.0034, 4) * 7.5;

  // 山地遮罩 + 脊状噪声
  let mm = Noise.fbm2(x * 0.00040 + 31.7, z * 0.00040 - 12.3, 3) * 1.55 + 0.30;
  mm = clamp01(mm);
  const ridgeRaw = Noise.ridged2(x * 0.00098 + 5.1, z * 0.00098 - 2.7, 5);
  const ridge = ridgeRaw * ridgeRaw * ridgeRaw;
  h += ridge * 300 * mm;

  // 次级山脊（更细）
  h += Noise.ridged2(x * 0.0031, z * 0.0031, 3) * 9 * mm;

  // 地标
  for (let i = 0; i < LANDMARKS.length; i++) h = applyLandmark(LANDMARKS[i], x, z, h);

  // 河谷刻蚀
  for (let i = 0; i < RIVERS.length; i++) h = carveRiver(RIVERS[i], x, z, h);

  // 海岸带压平（0..12 之间平缓）
  h = lerp(seaFloorAt(x, z), h, cont);
  return h;
}

function seaFloorAt(x, z) {
  return -52 - Noise.fbm2(x * 0.0011, z * 0.0011, 3) * 34;
}

function applyLandmark(L, x, z, h) {
  switch (L.t) {
    case 'mesa': {
      // 圆角方形台地，带断崖
      const dx = abs(x - L.x), dz = abs(z - L.z);
      const wob = Noise.fbm2(x * 0.006, z * 0.006, 2) * (L.wob || 0);
      const r = L.r + wob;
      // 圆角：用切比雪夫与欧氏的混合
      const d = lerp(max(dx, dz), hypot(dx, dz), 0.45);
      const e = smoothstep(r, r - L.wall, d);
      const top = L.h + Noise.fbm2(x * 0.004, z * 0.004, 3) * 14;
      return lerp(h, max(h, top), e);
    }
    case 'cone': {
      const d = hypot(x - L.x, z - L.z);
      if (d > L.r * 1.9) return h;
      const t = clamp01(1 - d / L.r);
      const shape = pow(t, 1.85);
      const rough = 1 + Noise.fbm2(x * 0.0021, z * 0.0021, 3) * 0.42;
      const add = L.h * shape * rough;
      return h + add * smoothstep(L.r * 1.9, L.r * 0.55, d);
    }
    case 'volcano': {
      const d = hypot(x - L.x, z - L.z);
      if (d > L.r * 1.7) return h;
      const t = clamp01(1 - d / L.r);
      const cone = pow(t, 1.42) * L.h;
      const gully = 1 + Noise.ridged2(x * 0.0032, z * 0.0032, 3) * 0.30;
      let y = h + cone * gully * smoothstep(L.r * 1.7, L.r * .5, d);
      // 火山口
      const cr = smoothstep(L.crater * 1.6, L.crater * .55, d);
      y = lerp(y, y - L.cdepth, cr);
      return y;
    }
    case 'ridgeLine': {
      const d = distToSeg(x, z, L.x, L.z, L.x2, L.z2);
      if (d > L.w * 3.2) return h;
      const t = clamp01(1 - d / L.w);
      const rough = 1 + Noise.ridged2(x * 0.0040, z * 0.0040, 3) * 0.35;
      return h + pow(t, 1.5) * L.h * rough;
    }
    case 'canyon': {
      const d = distToSeg(x, z, L.x, L.z, L.x2, L.z2);
      if (d > L.w * 3.0) return h;
      const t = smoothstep(L.w * 2.1, L.w * .35, d);
      const wob = Noise.fbm2(x * 0.004, z * 0.004, 2) * L.w * .5;
      const t2 = smoothstep(L.w * 2.1 + wob, L.w * .35 + wob, d);
      return h - L.depth * t2;
    }
    case 'basin': {
      const d = hypot(x - L.x, z - L.z);
      if (d > L.r * 1.5) return h;
      const wob = Noise.fbm2(x * 0.005, z * 0.005, 2) * L.r * .18;
      const t = smoothstep(L.r + wob, L.r * .25 + wob, d);
      return h - L.depth * t;
    }
  }
  return h;
}

function carveRiver(R, x, z, h) {
  const bb = R.bb;
  if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) return h;
  let best = 1e9;
  const p = R.pts;
  for (let i = 0; i < p.length - 1; i++) {
    const d = distToSeg(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
    if (d < best) best = d;
  }
  const w = R.w;
  if (best > w * 2.6) return h;
  const wob = Noise.fbm2(x * 0.006, z * 0.006, 2) * w * .5;
  const t = smoothstep(w * 2.6 + wob, w * .3 + wob, best);
  return h - R.d * t;
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const apx = px - ax, apz = pz - az;
  const L2 = abx * abx + abz * abz;
  let t = L2 > 1e-6 ? (apx * abx + apz * abz) / L2 : 0;
  t = clamp01(t);
  const cx = ax + abx * t - px, cz = az + abz * t - pz;
  return sqrt(cx * cx + cz * cz);
}

/* ---------- 法线 / 坡度 ---------- */
const _tn = new THREE.Vector3();
function terrainNormal(x, z, eps = 1.6) {
  const hl = terrainHeight(x - eps, z), hr = terrainHeight(x + eps, z);
  const hd = terrainHeight(x, z - eps), hu = terrainHeight(x, z + eps);
  _tn.set(hl - hr, 2 * eps, hd - hu).normalize();
  return _tn;
}
function terrainSlope(x, z, eps = 2.0) {
  const hl = terrainHeight(x - eps, z), hr = terrainHeight(x + eps, z);
  const hd = terrainHeight(x, z - eps), hu = terrainHeight(x, z + eps);
  const gx = (hr - hl) / (2 * eps), gz = (hu - hd) / (2 * eps);
  return sqrt(gx * gx + gz * gz);
}

/* ---------- 气候 ---------- */
/** 温度：纬度 + 海拔 + 区域；用于雪线、天气、UI 温度计 */
function temperatureAt(x, z, y) {
  const lat = -z / HALF_W;                      // -1(南) .. 1(北)
  let t = 30 - lat * 5;                          // 纬度
  t -= max(0, y) * 0.030;                        // 海拔递减
  t += Noise.fbm2(x * 0.00035, z * 0.00035, 3) * 6;
  // 区域修正
  const c = climateAt(x, z);
  if (c === 'desert') t += 12;
  else if (c === 'snow') t -= 22;
  else if (c === 'volcano') t += 30;
  else if (c === 'jungle') t += 6;
  return t;
}
function moistureAt(x, z) {
  return clamp01(Noise.fbm2(x * 0.00048 - 88.1, z * 0.00048 + 44.7, 4) * .5 + .5);
}
/** 最近的区域气候 */
function climateAt(x, z) {
  let best = 1e18, bc = 'field';
  for (let i = 0; i < REGIONS.length; i++) {
    const R = REGIONS[i];
    const d = (x - R.x) * (x - R.x) + (z - R.z) * (z - R.z);
    if (d < best) { best = d; bc = R.climate; }
  }
  return bc;
}
function regionNameAt(x, z) {
  let best = 1e18, bn = '海拉鲁';
  for (let i = 0; i < REGIONS.length; i++) {
    const R = REGIONS[i];
    const d = (x - R.x) * (x - R.x) + (z - R.z) * (z - R.z);
    if (d < best) { best = d; bn = R.n; }
  }
  return bn;
}

/** CPU 端生物群系权重（撒植被 / 放怪时用） */
function biomeMix(x, z, y, slope) {
  const temp = temperatureAt(x, z, y);
  const moist = moistureAt(x, z);
  const snow = clamp01((0 - temp) / 9) * smoothstep(0.25, 0.75, 1 - slope * .35);
  const sand = clamp01((temp - 26) / 8) * (1 - moist) * smoothstep(14, 4, y);
  let ash = 0;
  const dV = hypot(x - 1420, z + 1150);
  if (dV < 1000) ash = smoothstep(1000, 620, dV) * clamp01((y - 120) / 200);
  const rock = clamp01(slope * 1.5 - 0.32);
  let grass = clamp01(1 - snow - sand - ash - rock) * clamp01(moist * 1.5);
  let dry = clamp01(1 - snow - sand - ash - rock) * clamp01((1 - moist) * 1.4);
  const dirt = clamp01(1 - snow - sand - ash - rock) * 0.35;
  const tot = grass + dry + dirt + sand + rock + snow + ash + 1e-5;
  return {
    grass: grass / tot, dry: dry / tot, dirt: dirt / tot, sand: sand / tot,
    rock: rock / tot, snow: snow / tot, ash: ash / tot,
    temp, moist,
  };
}

/* ---------- 出生点：初始台地上的复苏神庙 ---------- */
const SPAWN = { x: CFG.px === null ? -640 : CFG.px, z: CFG.pz === null ? 514 : CFG.pz, y: 0 };
function computeSpawn() {
  SPAWN.y = CFG.py === null ? terrainHeight(SPAWN.x, SPAWN.z) + 1.0 : CFG.py;
  return SPAWN;
}
computeSpawn();

/* =========================================================================
   地形渲染：四叉树 LOD
   ========================================================================= */
const Terrain = (() => {
  const MAX_DEPTH = 9;
  const SEGS = 12;                 // 每个节点 12x12 格
  const SPLIT_K = 1.22;
  const SKIRT = 0.0;               // 裙边高度按节点尺寸算

  let scene, root;
  const geoCache = new Map();
  const cacheOrder = [];
  const CACHE_MAX = 900;
  const leafSet = new Map();       // key -> mesh
  let material = null, layerTex = null, layerNorm = null;
  const bodySet = new Map();       // 水体：同 LOD 的叶子
  let waterMat = null;

  const TERRAIN_LAYERS = ['grass', 'grassDry', 'dirt', 'sand', 'rock', 'snow', 'ash'];

  function buildArrayTexture(names, kind) {
    const L = names.length;
    const sets = names.map(n => TexGen.M[n]());
    const N = sets[0].size;
    const data = new Uint8Array(N * N * L * 4);
    for (let i = 0; i < L; i++) {
      const set = sets[i];
      const src = kind === 'map' ? set.map.image.data : set.normalMap.image.data;
      data.set(src, i * N * N * 4);
    }
    const t = new THREE.DataArrayTexture(data, N, N, L);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }

  /* ---- 顶点着色器注入 ---- */
  const VERT_HEAD = /* glsl */`
    varying vec3 vWP;
    varying vec3 vGN;
    varying float vWave;
  `;
  const VERT_BODY = /* glsl */`
    vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vGN = normalize(mat3(modelMatrix) * objectNormal);
    vWave = 0.0;
  `;

  /* ---- 片段着色器：七层混合 ---- */
  const FRAG_HEAD = /* glsl */`
    precision highp float;
    precision highp sampler2DArray;
    varying vec3 vWP;
    varying vec3 vGN;
    uniform sampler2DArray uLayerA;
    uniform sampler2DArray uLayerN;
    uniform float uTime;
    uniform float uWet;
    uniform float uSnowCov;
    uniform float uBumpStrength;
    uniform float uNoDetail;
    uniform float uDbg;
    uniform float uLavaPulse;
    uniform vec3 uSunDirW;
    uniform vec3 uSunColW;
    uniform float uAmbBoost;

    float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      float a = h21(i), b = h21(i+vec2(1,0)), c = h21(i+vec2(0,1)), d = h21(i+vec2(1,1));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
    }
    float fbm2s(vec2 p){
      float s = 0.0, a = 0.5;
      for (int i=0;i<4;i++){ s += a*vnoise(p); p *= 2.03; a *= 0.5; }
      return s;
    }
  `;

  /** 在 map_fragment 处替换，接管漫反射颜色 */
  const PATCH_MAP = /* glsl */`
    float terrH = vWP.y;
    float slope = 1.0 - clamp(vGN.y, 0.0, 1.0);
    vec2 wp2 = vWP.xz;

    // 气候场
    float climT = fbm2s(wp2 * 0.00035) * 2.0 - 1.0;
    float moist = clamp(fbm2s(wp2 * 0.00048 + 13.7) * 1.5, 0.0, 1.0);
    float regSnow = fbm2s(wp2 * 0.00022 - 5.0);
    float regDesert = fbm2s(wp2 * 0.00030 + 71.0);
    float regAsh = fbm2s(wp2 * 0.00042 - 31.0);

    // 区域中心场（与 CPU REGIONS 近似对齐）
    vec2 pc = wp2 - vec2(1420.0, -1150.0);
    float dVolcano = length(pc);
    float pc2 = length(wp2 - vec2(-1780.0, 920.0));
    float pc3 = length(wp2 - vec2(-1450.0, -1520.0));

    float ashM = smoothstep(1000.0, 560.0, dVolcano) * smoothstep(60.0, 260.0, terrH);
    float sandM = smoothstep(1150.0, 620.0, pc2) * (1.0 - moist) * smoothstep(120.0, 20.0, terrH);
    sandM = max(sandM, clamp(regDesert * 1.8, 0.0, 1.0) * smoothstep(90.0, 10.0, terrH) * (1.0 - moist));

    // 雪线：纬度 + 海拔 + 区域
    float lat = -vWP.z / 4096.0;
    float temp = 30.0 - lat * 5.0 - max(0.0, terrH) * 0.030 + climT * 6.0;
    temp += smoothstep(1400.0, 400.0, pc3) * -22.0;
    temp -= smoothstep(1000.0, 400.0, dVolcano) * -30.0;
    float snowM = clamp((1.0 - temp / 9.0), 0.0, 1.0) * (1.0 - slope * 1.5);
    snowM = clamp(snowM, 0.0, 1.0);
    snowM *= smoothstep(0.0, 0.55, regSnow + 0.35);

    float rockM = clamp(slope * 2.6 - 0.42, 0.0, 1.0);

    // 剩余分给草 / 干草 / 土
    float used = clamp(snowM + sandM + ashM, 0.0, 1.0);
    float rest = 1.0 - used;
    float dryBias = clamp(1.0 - moist * 1.35, 0.0, 1.0);
    float wGrass = rest * (1.0 - dryBias) * (1.0 - rockM);
    float wDry = rest * dryBias * (1.0 - rockM);
    float wDirt = rest * rockM * 0.55;
    float wRock = rockM * rest * 1.0 + clamp(slope * 3.0 - 0.9, 0.0, 1.0) * 0.45;

    // 分层索引: 0 grass 1 dry 2 dirt 3 sand 4 rock 5 snow 6 ash
    float ws[7];
    ws[0] = wGrass; ws[1] = wDry; ws[2] = wDirt; ws[3] = sandM;
    ws[4] = min(wRock, 1.0); ws[5] = snowM; ws[6] = ashM;
    float tot = 1e-5;
    for (int i=0;i<7;i++) tot += ws[i];
    for (int i=0;i<7;i++) ws[i] /= tot;

    // 细节尺度随距离衰减（远处不再叠细节，避免闪烁）
    float dist = length(vWP - cameraPosition);
    float detFade = (1.0 - smoothstep(45.0, 340.0, dist)) * (1.0 - uNoDetail);
    float midFade = 1.0 - smoothstep(600.0, 2400.0, dist);

    vec3 albedo = vec3(0.0);
    vec3 nrmT = vec3(0.0, 0.0, 1.0);
    float rough = 0.0;
    vec3 an = pow(abs(vGN), vec3(4.0));
    an /= (an.x + an.y + an.z + 1e-4);

    for (int i=0;i<7;i++){
      float w = ws[i];
      if (w < 0.003) continue;
      vec3 a1 = texture(uLayerA, vec3(vWP.zy * 0.34, float(i))).rgb;
      vec3 a2 = texture(uLayerA, vec3(vWP.xz * 0.34, float(i))).rgb;
      vec3 a3 = texture(uLayerA, vec3(vWP.xy * 0.34, float(i))).rgb;
      vec3 A = a1*an.x + a2*an.y + a3*an.z;
      vec3 n1 = texture(uLayerN, vec3(vWP.zy * 0.34, float(i))).rgb;
      vec3 n2 = texture(uLayerN, vec3(vWP.xz * 0.34, float(i))).rgb;
      vec3 n3 = texture(uLayerN, vec3(vWP.xy * 0.34, float(i))).rgb;
      vec3 N = n1*an.x + n2*an.y + n3*an.z;
      // 细节层（近距离，两层不同频率）
      if (detFade > 0.01){
        vec3 d1 = texture(uLayerA, vec3(vWP.xz * 1.15, float(i))).rgb;
        A = mix(A, A * 0.46 + d1 * 0.66, detFade * 0.55);
        vec3 d2 = texture(uLayerA, vec3(vWP.xz * 3.10, float(i))).rgb;
        A = mix(A, A * 0.52 + d2 * 0.58, detFade * 0.34);
      }
      albedo += A * w;
      nrmT += (N * 2.0 - 1.0) * w * mix(0.55, 1.0, detFade);
      rough += w * (0.90 + float(i==4) * 0.06 + float(i==5) * -0.28 + float(i==3) * 0.04);
    }

    // 宏观色彩扰动（打破平铺感）
    float macro = fbm2s(wp2 * 0.0025);
    albedo *= mix(0.68, 1.16, macro);
    // 去灰：拉开通道差异
    float al = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
    albedo = mix(vec3(al), albedo, 1.35);
    albedo = clamp(albedo, vec3(0.0), vec3(1.0));   // 过饱和外推会产生负值 → 渲染成纯黑
    // 细粒度的明暗斑块（草地的"脏"感）
    float speck = fbm2s(wp2 * 0.05) * 0.42 + fbm2s(wp2 * 0.18) * 0.34 + fbm2s(wp2 * 0.55) * 0.24;
    albedo *= mix(0.80, 1.26, speck);
    albedo *= 0.78;
    albedo = clamp(albedo, vec3(0.0), vec3(1.0));
    // 大尺度色相偏移
    albedo *= vec3(1.0 + (fbm2s(wp2*0.0011+8.0)-0.5)*0.16,
                   1.0 + (fbm2s(wp2*0.0011+19.0)-0.5)*0.14,
                   1.0 + (fbm2s(wp2*0.0011+27.0)-0.5)*0.12);

    // 熔岩脉（死亡之山）
    float lava = 0.0;
    if (ashM > 0.05 && terrH > 180.0){
      float lv = fbm2s(wp2 * 0.012);
      lava = smoothstep(0.62, 0.78, lv) * ashM * smoothstep(200.0, 380.0, terrH);
      albedo = mix(albedo, vec3(1.0, 0.30, 0.05), lava);
    }

    // 湿度变暗 + 水淹痕迹
    albedo *= mix(0.88, 1.05, moist);
    // 湿滑
    albedo *= mix(1.0, 0.72, uWet);
    rough = mix(rough, 0.45, uWet * 0.55);
    // 积雪覆盖（动态）
    if (uSnowCov > 0.01){
      float sc = uSnowCov * clamp(snowM * 2.0 + 0.25, 0.0, 1.0);
      albedo = mix(albedo, vec3(0.92, 0.94, 1.0), sc);
      rough = mix(rough, 0.35, sc);
    }

    if (uDbg > 0.5 && uDbg < 1.5) { albedo = vec3(0.65, 0.62, 0.55); rough = 0.85; nrmT = vec3(0.0, 0.0, 1.0); }
    if (uDbg > 1.5 && uDbg < 2.5) { albedo = texture(uLayerA, vec3(vWP.xz * 0.15, 0.0)).rgb; }
    if (uDbg > 2.5 && uDbg < 3.5) { albedo = texture(uLayerA, vec3(vWP.xz * 0.15, 4.0)).rgb; }
    if (uDbg > 3.5) { albedo = vec3(abs(vGN.x), abs(vGN.y), abs(vGN.z)); }
    // 空气透视：远处混入冷调，拉开纵深
    float aeria = 1.0 - exp(-dist * 0.00020);
    albedo = mix(albedo, albedo * vec3(0.76, 0.88, 1.07) + vec3(0.015, 0.03, 0.055), aeria * 0.7);
    diffuseColor.rgb *= albedo;
  `;

  /* 世界空间法线扰动：绕开 three 的 tbn（地形没有 uv 切线） */
  const PATCH_NORMAL_WORLD = /* glsl */`
    {
      vec3 gn = normalize(vGN);
      vec3 T = normalize(cross(abs(gn.y) < 0.98 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0), gn));
      vec3 B = cross(gn, T);
      vec2 bump = clamp(nrmT.xy, vec2(-0.55), vec2(0.55));
      vec3 wn = normalize(gn + (T * bump.x + B * bump.y) * uBumpStrength);
      normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
    }
  `;

  function makeMaterial() {
    if (CFG.dbg === 5) return new THREE.MeshBasicMaterial({ color: 0x33ff77, side: THREE.DoubleSide });
    if (CFG.dbg === 6) return new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: .8, metalness: 0, side: THREE.DoubleSide });
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1.0, metalness: 0.0,
      dithering: true,
    });
    mat.userData.u = {
      uLayerA: { value: layerTex },
      uLayerN: { value: layerNorm },
      uTime: { value: 0 },
      uWet: { value: 0 },
      uSnowCov: { value: 0 },
      uBumpStrength: { value: 0.30 },
      uNoDetail: { value: CFG.nodetail ? 1 : 0 },
      uDbg: { value: CFG.dbg === 4 ? 1 : (CFG.dbg === 10 ? 2 : (CFG.dbg === 11 ? 3 : (CFG.dbg === 12 ? 4 : 0))) },
      uLavaPulse: { value: 0 },
      uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
      uSunColW: { value: new THREE.Color(1, 1, 1) },
      uAmbBoost: { value: 0 },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mat.userData.u);
      if (CFG.dbg === 14) {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <map_fragment>', 'diffuseColor.rgb *= vec3(0.65, 0.62, 0.55);')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = 0.85;');
        return;
      }
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', VERT_HEAD + '\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', FRAG_HEAD + '\nvoid main() {')
        .replace('#include <map_fragment>', PATCH_MAP)
        .replace('#include <normal_fragment_maps>', CFG.nn ? '' : PATCH_NORMAL_WORLD)
        .replace('#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n\troughnessFactor = clamp(rough * 1.0, 0.05, 1.0);');
    };
    mat.customProgramCacheKey = () => 'terrain7layer';
    return mat;
  }

  /* ---- 几何构建 ---- */
  const _c = new THREE.Color();
  function buildGeometry(x0, z0, size) {
    const segs = SEGS;
    const n = segs + 1;
    const nv = n * n;
    const skirtN = 4 * n;                    // 四边裙边
    const total = nv + skirtN;
    const pos = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const hGrid = new Float32Array(nv);
    const step = size / segs;

    // 高度缓存（相邻节点共享边时数值一致，因为都是解析函数）
    for (let j = 0; j < n; j++) {
      const z = z0 + j * step;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * step;
        const h = terrainHeight(x, z);
        const k = j * n + i;
        hGrid[k] = h;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        uv[k * 2] = x / 16; uv[k * 2 + 1] = z / 16;
      }
    }

    const skirtH = clamp(size * 0.30, 5, 90);
    const lean = 0.42;                     // 裙边向块内倾斜，正常视角下完全埋进地表
    let vi = nv;
    function addSkirtVertex(k, ix, iz) {
      pos[vi * 3] = pos[k * 3] + ix * skirtH * lean;
      pos[vi * 3 + 1] = pos[k * 3 + 1] - skirtH;
      pos[vi * 3 + 2] = pos[k * 3 + 2] + iz * skirtH * lean;
      uv[vi * 2] = uv[k * 2]; uv[vi * 2 + 1] = uv[k * 2 + 1];
      return vi++;
    }
    let e0 = []; for (let i = 0; i < n; i++) e0.push(addSkirtVertex(i, 0, 1));
    let e1 = []; for (let i = 0; i < n; i++) e1.push(addSkirtVertex((n - 1) * n + i, 0, -1));
    let e2 = []; for (let j = 0; j < n; j++) e2.push(addSkirtVertex(j * n, 1, 0));
    let e3 = []; for (let j = 0; j < n; j++) e3.push(addSkirtVertex(j * n + n - 1, -1, 0));

    const tri = [];
    for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      tri.push(a, c, b, b, c, d);
    }
    // 裙边三角形（朝外，填补 LOD 缝隙）
    if (CFG.skirt) {
    const e0b = 0, e1b = n, e2b = 2 * n, e3b = 3 * n;
    for (let i = 0; i < n - 1; i++) {
      const t0 = i, t1 = i + 1;
      const s0 = nv + e0b + i, s1 = nv + e0b + i + 1;
      tri.push(t0, t1, s0, t1, s1, s0);                       // -Z 边

      const u0 = (n - 1) * n + i, u1 = u0 + 1;
      const v0 = nv + e1b + i, v1 = v0 + 1;
      tri.push(u0, v0, u1, u1, v0, v1);                       // +Z 边

      const w0 = i * n, w1 = (i + 1) * n;
      const z0 = nv + e2b + i, z1 = z0 + 1;
      tri.push(w0, z0, w1, w1, z0, z1);                       // -X 边

      const y0 = i * n + n - 1, y1 = (i + 1) * n + n - 1;
      const x0 = nv + e3b + i, x1 = x0 + 1;
      tri.push(y0, y1, x0, y1, x1, x0);                       // +X 边
    }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(tri.length > 65535 ? new THREE.Uint32BufferAttribute(tri, 1) : new THREE.Uint16BufferAttribute(tri, 1));
    g.computeVertexNormals();
    // 裙边法线沿用对应顶面顶点，避免边缝出现深色描边
    const nrm = g.attributes.normal.array;
    const pairs = [e0, e1, e2, e3];
    const tops = [];
    for (let i = 0; i < n; i++) tops.push(e0[i] === undefined ? 0 : 0);
    const topIdx = [];
    for (let i = 0; i < n; i++) topIdx.push(i);                       // e0 -> 行 j=0
    for (let i = 0; i < n; i++) topIdx.push((n - 1) * n + i);         // e1 -> 行 j=n-1
    for (let j = 0; j < n; j++) topIdx.push(j * n);                   // e2 -> 列 i=0
    for (let j = 0; j < n; j++) topIdx.push(j * n + n - 1);           // e3 -> 列 i=n-1
    for (let k = 0; k < skirtN; k++) {
      const src = topIdx[k], dst = nv + k;
      nrm[dst * 3] = nrm[src * 3];
      nrm[dst * 3 + 1] = nrm[src * 3 + 1];
      nrm[dst * 3 + 2] = nrm[src * 3 + 2];
    }
    g.attributes.normal.needsUpdate = true;
    // 包围球必须由真实顶点算出来：早期手写的球心在 y=0、半径不含地形高度，
    // 在高海拔区域包不住几何体，会被视锥剔除误删 → 地形出现黑色空洞
    g.computeBoundingSphere();
    return { geo: g, hGrid, n, step, x0, z0, size };
  }

  /* ---- 水体几何（同一格网，y=0，附带深度属性） ---- */
  function buildWaterGeometry(x0, z0, size, hGrid, n, step) {
    // 判断是否含水面
    let hasWater = false, minH = 1e9;
    for (let i = 0; i < n * n; i++) { if (hGrid[i] < SEA + 0.6) { hasWater = true; } if (hGrid[i] < minH) minH = hGrid[i]; }
    if (!hasWater) return null;
    const pos = new Float32Array(n * n * 3);
    const dep = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = x0 + i * step, z = z0 + j * step;
      pos[k * 3] = x; pos[k * 3 + 1] = SEA; pos[k * 3 + 2] = z;
      dep[k] = max(0, SEA - hGrid[k]);
    }
    const tri = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      tri.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    g.setIndex(new THREE.Uint32BufferAttribute(tri, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0 + size / 2, 0, z0 + size / 2), size);
    return g;
  }

  function getChunk(depth, x0, z0, size) {
    const key = depth + ':' + x0 + ':' + z0;
    let c = geoCache.get(key);
    if (c) return c;
    c = buildGeometry(x0, z0, size);
    c.key = key;
    c.water = buildWaterGeometry(x0, z0, size, c.hGrid, c.n, c.step);
    if (c.water) c.waterMesh = null;
    geoCache.set(key, c);
    cacheOrder.push(key);
    if (geoCache.size > CACHE_MAX) evict();
    return c;
  }

  function evict() {
    const target = floor(CACHE_MAX * 0.75);
    for (let i = 0; i < cacheOrder.length && geoCache.size > target; i++) {
      const k = cacheOrder[i];
      if (leafSet.has(k) || k === undefined) continue;
      const old = geoCache.get(k);
      if (old) {
        old.geo.dispose();
        if (old.water) old.water.dispose();
      }
      geoCache.delete(k);
      cacheOrder.splice(i, 1); i--;
    }
    if (cacheOrder.length > CACHE_MAX * 4) cacheOrder.splice(0, CACHE_MAX * 2);
  }

  /* ---- 四叉树选取 ---- */
  const leaves = [];
  function select(x0, z0, size, depth, cx, cz, out) {
    const half = size / 2;
    const dx = max(abs(cx - (x0 + half)) - half, 0);
    const dz = max(abs(cz - (z0 + half)) - half, 0);
    const dist = sqrt(dx * dx + dz * dz);
    const split = depth < MAX_DEPTH && dist < size * SPLIT_K;
    if (!split) { out.push([depth, x0, z0, size, dist]); return; }
    const h = size / 2;
    select(x0, z0, h, depth + 1, cx, cz, out);
    select(x0 + h, z0, h, depth + 1, cx, cz, out);
    select(x0, z0 + h, h, depth + 1, cx, cz, out);
    select(x0 + h, z0 + h, h, depth + 1, cx, cz, out);
  }

  let lastCX = 1e9, lastCZ = 1e9;
  function update(cx, cz, force) {
    if (!force && abs(cx - lastCX) < 6 && abs(cz - lastCZ) < 6) return false;
    lastCX = cx; lastCZ = cz;
    leaves.length = 0;
    select(-HALF_W, -HALF_W, WORLD, 0, cx, cz, leaves);

    const want = new Set();
    for (const L of leaves) want.add(L[0] + ':' + L[1] + ':' + L[2]);

    // 移除不再需要的
    for (const [key, mesh] of leafSet) {
      if (!want.has(key)) {
        scene.remove(mesh);
        if (mesh.userData.water) { scene.remove(mesh.userData.water); }
        leafSet.delete(key);
      }
    }
    // 添加新的
    for (const L of leaves) {
      const key = L[0] + ':' + L[1] + ':' + L[2];
      if (leafSet.has(key)) continue;
      const c = getChunk(L[0], L[1], L[2], L[3]);
      const m = new THREE.Mesh(c.geo, material);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.key = key;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      scene.add(m);
      if (c.water && waterMat && !CFG.nowater) {
        const wm = new THREE.Mesh(c.water, waterMat);
        wm.renderOrder = 5; wm.matrixAutoUpdate = false; wm.updateMatrix();
        m.userData.water = wm;
        scene.add(wm);
      }
      leafSet.set(key, m);
    }
    return true;
  }

  function init(sc, wm) {
    scene = sc; waterMat = wm;
    layerTex = buildArrayTexture(TERRAIN_LAYERS, 'map');
    layerNorm = buildArrayTexture(TERRAIN_LAYERS, 'normal');
    material = makeMaterial();
    if (waterMat) { /* 水体由 Water 模块单独初始化 */ }
  }

  function refreshUniforms() {
    if (!material) return;
    const u = material && material.userData && material.userData.u;
    if (!u) return;
    u.uTime.value = performance.now() * 0.001;
    u.uWet.value = Env.E.wetness;
    u.uSnowCov.value = clamp01(Env.E.snow) * 0.85;
    u.uSunDirW.value.copy(Env.E.sunDir);
    u.uSunColW.value.copy(Env.E.sunColor);
  }

  return {
    init, update, refreshUniforms,
    height: terrainHeight, normal: terrainNormal, slope: terrainSlope,
    material: () => material,
    layerTexture: () => layerTex,
    leaves: () => leaves,
    leafMeshes: () => leafSet,
    getChunk,
    buildGeometry,
    setWaterMaterial: m => { waterMat = m; },
  };
})();
