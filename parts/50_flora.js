/* =========================================================================
   50_flora.js — 植被：实例化草地 / 花丛 / 程序化树木 / 岩石 / 断木
   ========================================================================= */

/* ---------- 几何构建器（手工拼三角形，避免依赖 BufferGeometryUtils） ---------- */
class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
  addTransform(m) { this._m = m; return this; }
  _push(x, y, z, nx, ny, nz, u, v, col) {
    const m = this._m;
    if (m) {
      const w = m[12] * 0 + 1;
      const tx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const ty = m[1] * x + m[5] * y + m[9] * z + m[13];
      const tz = m[2] * x + m[6] * y + m[10] * z + m[14];
      x = tx; y = ty; z = tz;
      const tnx = m[0] * nx + m[4] * ny + m[8] * nz;
      const tny = m[1] * nx + m[5] * ny + m[9] * nz;
      const tnz = m[2] * nx + m[6] * ny + m[10] * nz;
      nx = tnx; ny = tny; nz = tnz;
    }
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v);
    this.c.push(col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1);
    return this.v++;
  }
  tri(a, b, c) { this.i.push(a, b, c); return this; }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); return this; }

  /** 圆柱（可锥化、可弯曲） */
  cylinder(x0, y0, z0, x1, y1, z1, r0, r1, segs, uvScale, col) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const L = hypot(dx, dy, dz) || 1e-5;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    let ax = 0, ay = 1, az = 0;
    if (abs(uy) > 0.95) { ax = 1; ay = 0; az = 0; }
    let tx = uy * az - uz * ay, ty = uz * ax - ux * az, tz = ux * ay - uy * ax;
    let tl = hypot(tx, ty, tz) || 1e-5; tx /= tl; ty /= tl; tz /= tl;
    const bx = uy * tz - uz * ty, by = uz * tx - ux * tz, bz = ux * ty - uy * tx;
    const base = this.v;
    for (let i = 0; i <= segs; i++) {
      const a = i / segs * TAU, ca = cos(a), sa = sin(a);
      const nx = tx * ca + bx * sa, ny = ty * ca + by * sa, nz = tz * ca + bz * sa;
      this._push(x0 + nx * r0, y0 + ny * r0, z0 + nz * r0, nx, ny, nz, i / segs * uvScale, 0, col);
      this._push(x1 + nx * r1, y1 + ny * r1, z1 + nz * r1, nx, ny, nz, i / segs * uvScale, L * uvScale, col);
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.tri(a, c, b); this.tri(b, c, d);
    }
    return this;
  }

  /** 变形的二十面体岩石 */
  rock(cx, cy, cz, r, seed, squash, detail) {
    const rnd = new Rand(seed);
    const t = (1 + sqrt(5)) / 2;
    let verts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(v => {
      const l = hypot(v[0], v[1], v[2]);
      return [v[0] / l, v[1] / l, v[2] / l];
    });
    let faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    // 一次细分
    for (let k = 0; k < (detail === undefined ? 1 : detail); k++) {
      const nf = [];
      const cache = new Map();
      const mid = (a, b) => {
        const key = min(a, b) + '_' + max(a, b);
        if (cache.has(key)) return cache.get(key);
        const m = [(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2, (verts[a][2] + verts[b][2]) / 2];
        const l = hypot(m[0], m[1], m[2]);
        verts.push([m[0] / l, m[1] / l, m[2] / l]);
        const idx = verts.length - 1;
        cache.set(key, idx);
        return idx;
      };
      for (const f of faces) {
        const a = mid(f[0], f[1]), b = mid(f[1], f[2]), c = mid(f[2], f[0]);
        nf.push([f[0], a, c], [f[1], b, a], [f[2], c, b], [a, b, c]);
      }
      faces = nf;
    }
    const disp = verts.map(v => {
      const d = Noise.fbm3(v[0] * 1.8 + seed * .1, v[1] * 1.8, v[2] * 1.8 + seed * .3, 3);
      return 1 + d * 0.30;
    });
    const base = this.v;
    for (const v of verts) {
      const i = verts.indexOf(v);
      const rr = r * disp[i];
      const nx = v[0], ny = v[1] * (squash || 1), nz = v[2];
      const nl = hypot(nx, ny, nz) || 1;
      this._push(cx + nx * rr, cy + v[1] * rr * (squash || 1), cz + nz * rr,
        nx / nl, ny / nl, nz / nl, (v[0] + 1) * .5 * 2, (v[2] + 1) * .5 * 2);
    }
    for (const f of faces) this.tri(base + f[0], base + f[2], base + f[1]);
    return this;
  }

  /** 叶片卡片（十字交叉或随机朝向） */
  card(cx, cy, cz, w, h, rot, tilt, col, cross) {
    const place = (ang) => {
      const ca = cos(ang), sa = sin(ang);
      const ct = cos(tilt || 0), st = sin(tilt || 0);
      const ux = ca, uz = sa;
      const b = this.v;
      const push = (sx, sy) => {
        const lx = sx * w, ly = sy * h;
        const px = cx + ux * lx, pz = cz + uz * lx;
        const py = cy + ly * ct;
        this._push(px, py, pz, -sa * 0.2, 0.8, ca * 0.2, sx + .5, sy + .5, col);
      };
      push(-.5, 0); push(.5, 0); push(.5, 1); push(-.5, 1);
      this.quad(b, b + 1, b + 2, b + 3);
    };
    place(rot);
    if (cross) place(rot + PI * .5);
    return this;
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

/* ---------- 程序化树木 ---------- */
const TreeGen = (() => {
  const matCache = {};

  function barkMat(kind) {
    const k = 'bark_' + kind;
    if (matCache[k]) return matCache[k];
    const set = kind === 'pine' ? TexGen.M.barkPine() : TexGen.M.bark();
    const m = MatLib.std(set, { roughness: .92, metalness: 0, vertexColors: true, normalScale: 1.1, color: 0xd8cdbb });
    matCache[k] = m;
    return m;
  }
  function leafMat(kind) {
    const k = 'leaf_' + kind;
    if (matCache[k]) return matCache[k];
    let tex;
    if (kind === 'pine') tex = TexGen.C.needle(256, 7);
    else if (kind === 'palm') tex = TexGen.C.frond(256, 11);
    else tex = TexGen.C.leaf(0.26, 256, kind === 'dark' ? 21 : 5);
    const m = new THREE.MeshStandardMaterial({
      map: tex, color: 0xffffff, roughness: .78, metalness: 0,
      transparent: false, alphaTest: .42, side: THREE.DoubleSide,
      vertexColors: true, depthWrite: true,
    });
    matCache[k] = m;
    return m;
  }

  /** 生成一棵树：{ trunk: geo, leaves: geo } */
  function make(kind, seed) {
    const rnd = new Rand(seed);
    const trunk = new GeoBuilder();
    const leaves = new GeoBuilder();

    if (kind === 'pine') {
      const H = rnd.f(11, 20) * 1.0;
      const r0 = H * 0.035;
      let x = 0, y = 0, z = 0;
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const t = i / segs, t2 = (i + 1) / segs;
        const nx = rnd.f(-.5, .5) * t * 1.4, nz = rnd.f(-.5, .5) * t * 1.4;
        const y1 = H * t2 * (0.72 + rnd.f(0, .12));
        trunk.cylinder(x, y, z, nx, y1, nz, r0 * (1 - t * .8), r0 * (1 - t2 * .88), 7, .5);
        // 层叠的枝叶
        if (i > 0) {
          const layers = 3;
          for (let L = 0; L < layers; L++) {
            const ly = lerp(y, y1, L / layers) + .3;
            const spread = H * (0.10 + 0.22 * t) * rnd.f(.8, 1.3);
            const n = 5 + (i | 0);
            for (let k = 0; k < n; k++) {
              const a = rnd.ang();
              const d = spread * rnd.f(.35, 1);
              leaves.card(nx + cos(a) * d, ly, nz + sin(a) * d,
                H * .085 * rnd.f(.7, 1.2), H * .07 * rnd.f(.7, 1.3),
                a, -rnd.f(.2, .75), [rnd.f(.55, .95), rnd.f(.6, 1.0), rnd.f(.5, .85)], true);
            }
          }
        }
        x = nx; y = y1; z = nz;
      }
      const tipY = y + H * .12;
      leaves.card(x, tipY, z, H * .07, H * .09, rnd.ang(), -.5, [.7, .8, .7], true);
    } else if (kind === 'palm') {
      const H = rnd.f(9, 15);
      const bend = rnd.f(-.22, .22);
      let x = 0, y = 0, z = 0;
      const N = 8;
      for (let i = 0; i < N; i++) {
        const t = i / N, t2 = (i + 1) / N;
        const nx = bend * H * t2 * t2, nz = rnd.f(-.1, .1) * t2;
        const y1 = H * t2;
        trunk.cylinder(x, y, z, nx, y1, nz, H * .026 * (1 - t * .35), H * .026 * (1 - t2 * .38), 8, .4);
        x = nx; y = y1; z = nz;
      }
      for (let k = 0; k < 11; k++) {
        const a = k / 11 * TAU + rnd.f(-.2, .2);
        leaves.card(x + cos(a) * 0.9, y - .3, z + sin(a) * 0.9,
          H * .26 * rnd.f(.85, 1.15), H * .15, a, -rnd.f(.05, .5),
          [rnd.f(.5, .85), rnd.f(.7, 1), rnd.f(.45, .8)], false);
      }
    } else if (kind === 'dead') {
      const H = rnd.f(5, 11) * .8;
      const r0 = H * .05;
      let x = 0, y = 0, z = 0;
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        const t = i / segs, t2 = (i + 1) / segs;
        const nx = rnd.f(-.6, .6) * t, nz = rnd.f(-.6, .6) * t;
        const y1 = H * t2;
        trunk.cylinder(x, y, z, nx, y1, nz, r0 * (1 - t * .75), r0 * (1 - t2 * .8), 6, .5);
        if (i >= 1) {
          const nb = rnd.i(2, 3);
          for (let b = 0; b < nb; b++) {
            const a = rnd.ang(), ln = H * rnd.f(.18, .38);
            const bx = nx + cos(a) * ln, bz = nz + sin(a) * ln;
            const by = y1 + ln * rnd.f(.2, .7);
            trunk.cylinder(nx, y1, nz, bx, by, bz, r0 * .34, r0 * .08, 5, .8);
          }
        }
        x = nx; y = y1; z = nz;
      }
    } else {
      // 阔叶树：递归分支
      const H = rnd.f(9, 17);
      const r0 = H * .038;
      const branch = (x, y, z, dx, dy, dz, len, r, depth) => {
        const x1 = x + dx * len, y1 = y + dy * len, z1 = z + dz * len;
        trunk.cylinder(x, y, z, x1, y1, z1, r, r * .68, 7, .55);
        if (depth <= 0 || len < .9) {
          const n = 4 + rnd.i(0, 3);
          for (let i = 0; i < n; i++) {
            leaves.card(x1 + rnd.f(-1.2, 1.2), y1 + rnd.f(-.6, .9), z1 + rnd.f(-1.2, 1.2),
              .9 + rnd.f(0, 1.3), .8 + rnd.f(0, 1.1), rnd.ang(),
              -rnd.f(.1, .6), [rnd.f(.6, 1), rnd.f(.65, 1.05), rnd.f(.5, .9)], true);
          }
          return;
        }
        const n = rnd.i(2, 3);
        for (let i = 0; i < n; i++) {
          const a = rnd.ang(), tilt = rnd.f(.35, .8);
          const ndx = dx + cos(a) * tilt, ndz = dz + sin(a) * tilt;
          const ndy = max(.1, dy * rnd.f(.5, .85));
          const nl = hypot(ndx, ndy, ndz);
          branch(x1, y1, z1, ndx / nl, ndy / nl, ndz / nl,
            len * rnd.f(.62, .82), r * .64, depth - 1);
        }
      };
      branch(0, 0, 0, rnd.f(-.09, .09), 1, rnd.f(-.09, .09), H * .42, r0, 3 + (rnd.bool(.4) ? 1 : 0));
    }
    return { trunk: trunk.toGeometry(), leaves: leaves.toGeometry() };
  }

  return { make, barkMat, leafMat };
})();

/* =========================================================================
   场景散布与实例渲染
   ========================================================================= */
const Flora = (() => {
  const SPECIES = [
    { id: 'oak', kind: 'oak', biome: ['field', 'jungle'], density: .55 },
    { id: 'dark', kind: 'dark', biome: ['jungle'], density: .70 },
    { id: 'pine', kind: 'pine', biome: ['snow', 'field'], density: .62 },
    { id: 'palm', kind: 'palm', biome: ['desert', 'coast'], density: .42 },
    { id: 'dead', kind: 'dead', biome: ['desert', 'volcano'], density: .22 },
  ];
  const VARIANTS = 3;
  const CELL = CFG.lite ? 48 : 24;       // 散布格
  const RENDER_R = CFG.lite ? 180 : 620; // 树木渲染半径
  const GRASS_R = CFG.lite ? 26 : 64;    // 草渲染半径
  const GRASS_CAP = CFG.lite ? 3200 : 52000;

  let scene;
  const trees = [];                      // {x,y,z,s,ry,sp,v}
  const treeGrid = new Map();
  const rocks = [];
  const rockGrid = new Map();
  const stumps = [];
  let treeGeo = null;       // [sp][v] -> {trunk, leaves}
  let trunkMeshes = [], leafMeshes = [];
  let rockMesh = null;
  let grassMesh = null, flowerMesh = null, pebbleMesh = null;
  const _c2 = new THREE.Color();
  const grassInst = [];
  const flowerInst = [];
  let grassCells = new Map();
  let lastCellX = 1e9, lastCellZ = 1e9;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const _e = new THREE.Euler();

  /* ---------- 世界散布（一次性生成） ---------- */
  function scatterWorld() {
    const step = CELL;
    const lim = 3400;
    for (let z = -lim; z <= lim; z += step) {
      for (let x = -lim; x <= lim; x += step) {
        const h0 = hash2i(x / step | 0, z / step | 0, 7);
        if (h0 > .55) continue;
        const jx = x + (hash2i(x / step | 0, z / step | 0, 13) - .5) * step * .9;
        const jz = z + (hash2i(x / step | 0, z / step | 0, 29) - .5) * step * .9;
        const y = terrainHeight(jx, jz);
        if (y < SEA + .8) continue;
        const slope = terrainSlope(jx, jz, 3);
        if (slope > 0.95) continue;
        const bm = biomeMix(jx, jz, y, slope);
        const clim = climateAt(jx, jz);
        // 森林密度场
        let forest = Noise.fbm2(jx * 0.0016 + 12.5, jz * 0.0016 - 4.2, 3) * .5 + .5;
        forest = forest * forest * 1.9;
        const temp = bm.temp;
        if (temp < -12) forest *= .35;
        if (bm.sand > .55) { forest *= (clim === 'desert') ? .40 : .8; }
        if (y > 430) forest *= .25;
        if (y < 0) forest *= .2;
        const p = clamp01(forest);
        if (p > .06 && hash2i(x / step | 0, z / step | 0, 41) < p * 1.25) {
          // 选物种
          let best = null, bestW = -1;
          for (const S of SPECIES) {
            let w = S.density;
            if (S.biome.indexOf(clim) >= 0) w *= 3.0;
            if (S.id === 'pine') w *= clamp01((10 - temp) / 26) * 2.2 + .15;
            if (S.id === 'oak' || S.id === 'dark') w *= clamp01((temp + 4) / 20);
            if (S.id === 'palm') w *= clamp01((temp - 18) / 12);
            if (S.id === 'dead') w *= clamp01((temp - 28) / 10);
            if (S.id === 'dark') w *= clamp01(Noise.fbm2(jx * .0022, jz * .0022, 2) * .5 + .6);
            w *= .35 + hash2i(jx | 0, jz | 0, 53) * 1.3;
            if (w > bestW) { bestW = w; best = S; }
          }
          const sp = SPECIES.indexOf(best);
          const v = (hash2i(jx | 0, jz | 0, 61) * VARIANTS) | 0;
          trees.push({
            x: jx, y, z: jz,
            s: 0.8 + hash2i(jx | 0, jz | 0, 67) * 0.55,
            ry: hash2i(jx | 0, jz | 0, 71) * TAU,
            sp, v: v % VARIANTS,
          });
        }
        // 岩石
        if (hash2i(x / step | 0, z / step | 0, 83) < .16 + bm.rock * .5) {
          const rx = x + (hash2i(x | 0, z | 0, 91) - .5) * step * 1.4;
          const rz = z + (hash2i(x | 0, z | 0, 97) - .5) * step * 1.4;
          const ry = terrainHeight(rx, rz);
          if (ry > SEA - 3) {
            rocks.push({
              x: rx, y: ry, z: rz,
              r: 0.7 + pow(hash2i(rx | 0, rz | 0, 101), 2.6) * 8,
              s: .55 + hash2i(rx | 0, rz | 0, 103) * .7,
              ry: hash2i(rx | 0, rz | 0, 107) * TAU,
              seed: (rx * 7919 + rz * 104729) | 0,
            });
          }
        }
      }
    }
    // 空间网格
    indexInto(trees, treeGrid);
    indexInto(rocks, rockGrid);
  }

  function indexInto(list, grid) {
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const k = (floor(o.x / 64)) + ',' + (floor(o.z / 64));
      let a = grid.get(k); if (!a) { a = []; grid.set(k, a); }
      a.push(i);
    }
  }

  /* ---------- 资源 ---------- */
  let grassMat = null, flowerMats = [];
  function buildAssets() {
    // 树
    treeGeo = [];
    for (let s = 0; s < SPECIES.length; s++) {
      const arr = [];
      for (let v = 0; v < VARIANTS; v++) {
        arr.push(TreeGen.make(SPECIES[s].kind, 1000 + s * 97 + v * 131));
      }
      treeGeo.push(arr);
    }
    const barkKinds = ['oak', 'oak', 'pine', 'palm', 'dead'];
    for (let s = 0; s < SPECIES.length; s++) {
      const kind = barkKinds[s];
      for (let v = 0; v < VARIANTS; v++) {
        const g = treeGeo[s][v];
        const tm = new THREE.InstancedMesh(g.trunk, TreeGen.barkMat(kind), 900);
        tm.visible = !CFG.notrees;
        tm.castShadow = true; tm.receiveShadow = true;
        tm.count = 0; tm.frustumCulled = false;
        tm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(tm);
        trunkMeshes.push(tm);
        const lm = new THREE.InstancedMesh(g.leaves, TreeGen.leafMat(SPECIES[s].kind), 900);
        lm.visible = !CFG.notrees;
        lm.castShadow = true; lm.receiveShadow = true;
        lm.count = 0; lm.frustumCulled = false;
        lm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(lm);
        leafMeshes.push(lm);
      }
    }

    // 岩石
    const rb = new GeoBuilder();
    for (let i = 0; i < 4; i++) {
      const g = new GeoBuilder();
      g.rock(0, 0, 0, 1, 500 + i * 37, 0.62 + i * .1, 1);
      const gi = g.toGeometry();
      gi.translate((i - 1.5) * 3, 0, 0);
      rb.p.push.apply(rb.p, gi.attributes.position.array);
      rb.n.push.apply(rb.n, gi.attributes.normal.array);
      rb.u.push.apply(rb.u, gi.attributes.uv.array);
      const ccount = gi.attributes.position.count;
      for (let k = 0; k < ccount; k++) rb.c.push(1, 1, 1);
      const base = rb.v;
      const idx = gi.index.array;
      for (let k = 0; k < idx.length; k++) rb.i.push(base + idx[k]);
      rb.v += ccount;
    }
    const rockGeo = rb.toGeometry();
    const rset = TexGen.M.rock();
    const rockMat = MatLib.std(rset, { roughness: .9, vertexColors: true, normalScale: 1.0, color: 0xcfc7b8 });
    rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, 1200);
    rockMesh.castShadow = true; rockMesh.receiveShadow = true;
    rockMesh.count = 0; rockMesh.frustumCulled = false;
    rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rockMesh.visible = !CFG.notrees;
    scene.add(rockMesh);

    // 草（十字两片）
    const gg = new GeoBuilder();
    const c = [1, 1, 1];
    gg.card(0, 0, 0, 1.05, 1.0, 0, 0, c, true);
    const grassGeo = gg.toGeometry();
    grassMat = new THREE.MeshStandardMaterial({
      map: TexGen.C.grassBlade(256, 3), alphaTest: .34, side: THREE.DoubleSide,
      roughness: .92, metalness: 0, color: 0xdfe4cf, vertexColors: true,
    });
    grassMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', `
          uniform float uTime;
          uniform float uWind;
          ` + 'void main() {')
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 iw = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float ph = iw.x * 0.31 + iw.z * 0.27;
            float hgt = clamp(position.y, 0.0, 1.0);
            float w1 = sin(uTime * 1.6 + ph) * 0.5 + sin(uTime * 3.1 + ph * 1.7) * 0.25;
            float gust = sin(uTime * 0.42 + iw.x * 0.012 + iw.z * 0.009) * 0.5 + 0.5;
            vec2 dir = vec2(0.86, 0.51);
            transformed.xz += dir * w1 * hgt * hgt * (0.10 + gust * 0.28) * uWind;
            transformed.y -= abs(w1) * hgt * hgt * 0.03 * uWind;
          #endif
        `);
      sh.uniforms.uTime = Flora._uTime;
      sh.uniforms.uWind = Flora._uWind;
    };
    grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_CAP);
    grassMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRASS_CAP * 3), 3);
    grassMesh.visible = !CFG.nograss;
    grassMesh.count = 0; grassMesh.frustumCulled = false;
    grassMesh.receiveShadow = false;   // 草叶太薄，收阴影会整片变黑
    grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(grassMesh);

    // 近景小碎石（贴地实例，加地表质感）
    {
      const pg = new GeoBuilder();
      for (let i = 0; i < 3; i++) {
        const gg2 = new GeoBuilder();
        gg2.rock(0, 0, 0, 1, 9900 + i * 37, 0.5 + i * .14, 1);
        const gi2 = gg2.toGeometry();
        gi2.translate((i - 1) * 2.6, 0, 0);
        pg.p.push.apply(pg.p, gi2.attributes.position.array);
        pg.n.push.apply(pg.n, gi2.attributes.normal.array);
        pg.u.push.apply(pg.u, gi2.attributes.uv.array);
        const cc = gi2.attributes.position.count;
        for (let k = 0; k < cc; k++) pg.c.push(1, 1, 1);
        const b0 = pg.v;
        for (const ix of gi2.index.array) pg.i.push(b0 + ix);
        pg.v += cc;
      }
      pebbleMesh = new THREE.InstancedMesh(pg.toGeometry(),
        MatLib.std(TexGen.M.gravel(), { roughness: .88, vertexColors: true, color: 0xbcb4a4 }), 2600);
      pebbleMesh.castShadow = true; pebbleMesh.receiveShadow = true;
      pebbleMesh.count = 0; pebbleMesh.frustumCulled = false;
      pebbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      pebbleMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(2600 * 3), 3);
      scene.add(pebbleMesh);
    }

    // 花
    const fg = new GeoBuilder();
    fg.card(0, 0, 0, .55, .55, 0, 0, c, true);
    const flowerGeo = fg.toGeometry();
    const flowerCols = [.96, .58, .78, .12, .88];
    for (let i = 0; i < flowerCols.length; i++) {
      const m = new THREE.MeshStandardMaterial({
        map: TexGen.C.flower(flowerCols[i], 128, 5 + i * 7),
        alphaTest: .4, side: THREE.DoubleSide, roughness: .7, metalness: 0,
      });
      m.onBeforeCompile = grassMat.onBeforeCompile;
      const im = new THREE.InstancedMesh(flowerGeo, m, 4200);
      im.visible = !CFG.nograss;
      im.count = 0; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(im);
      flowerMats.push(im);
    }
  }

  const _uTime = { value: 0 };
  const _uWind = { value: 1 };

  /* ---------- 每帧：按半径挑选实例 ---------- */
  function refresh(camPos) {
    const cx = camPos.x, cz = camPos.z;
    const cellKey = floor(cx / 64) + ',' + floor(cz / 64);
    if (cellKey === lastCellX + ',' + lastCellZ) return;
    lastCellX = floor(cx / 64); lastCellZ = floor(cz / 64);

    // 树
    const counts = new Array(trunkMeshes.length).fill(0);
    const R2 = RENDER_R * RENDER_R;
    const gx0 = floor((cx - RENDER_R) / 64), gx1 = floor((cx + RENDER_R) / 64);
    const gz0 = floor((cz - RENDER_R) / 64), gz1 = floor((cz + RENDER_R) / 64);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const a = treeGrid.get(gx + ',' + gz);
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const t = trees[a[i]];
        const dx = t.x - cx, dz = t.z - cz;
        if (dx * dx + dz * dz > R2) continue;
        const idx = t.sp * VARIANTS + t.v;
        const n = counts[idx];
        if (n >= 900) continue;
        _p.set(t.x, t.y - .4, t.z);
        _e.set(0, t.ry, 0);
        _q.setFromEuler(_e);
        _s.set(t.s, t.s, t.s);
        _m.compose(_p, _q, _s);
        trunkMeshes[idx].setMatrixAt(n, _m);
        leafMeshes[idx].setMatrixAt(n, _m);
        counts[idx] = n + 1;
      }
    }
    for (let i = 0; i < trunkMeshes.length; i++) {
      trunkMeshes[i].count = counts[i];
      leafMeshes[i].count = counts[i];
      trunkMeshes[i].instanceMatrix.needsUpdate = true;
      leafMeshes[i].instanceMatrix.needsUpdate = true;
    }

    // 岩石
    let rn = 0;
    const RR = 700;
    const rx0 = floor((cx - RR) / 64), rx1 = floor((cx + RR) / 64);
    const rz0 = floor((cz - RR) / 64), rz1 = floor((cz + RR) / 64);
    for (let gz = rz0; gz <= rz1; gz++) for (let gx = rx0; gx <= rx1; gx++) {
      const a = rockGrid.get(gx + ',' + gz);
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const r = rocks[a[i]];
        const dx = r.x - cx, dz = r.z - cz;
        if (dx * dx + dz * dz > RR * RR) continue;
        if (rn >= 1200) break;
        _p.set(r.x, r.y - r.r * .35 * r.s, r.z);
        _e.set(0, r.ry, 0); _q.setFromEuler(_e);
        _s.set(r.r * r.s, r.r * r.s * .85, r.r * r.s);
        _m.compose(_p, _q, _s);
        rockMesh.setMatrixAt(rn++, _m);
      }
    }
    rockMesh.count = rn;
    rockMesh.instanceMatrix.needsUpdate = true;

    // 草 + 花：按 4 单位格填充
    buildGrassField(cx, cz);
  }

  function buildGrassField(cx, cz) {
    const cell = 4;
    let n = 0, fn = 0;
    const fnCounts = new Array(flowerMats.length).fill(0);
    const R2 = GRASS_R * GRASS_R;
    const gx0 = floor((cx - GRASS_R) / cell), gx1 = floor((cx + GRASS_R) / cell);
    const gz0 = floor((cz - GRASS_R) / cell), gz1 = floor((cz + GRASS_R) / cell);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const h = hash2i(gx, gz, 211);
      const dd = ((gx * cell + cell * .5) - cx) ** 2 + ((gz * cell + cell * .5) - cz) ** 2;
      if (dd > R2) continue;
      const nBlades = 10 + floor(h * 8);
      for (let i = 0; i < nBlades; i++) {
        const h2 = hash2i(gx * 7 + i, gz * 13 + i, 223);
        const px = gx * cell + hash2i(gx + i, gz, 227) * cell;
        const pz = gz * cell + hash2i(gx, gz + i, 229) * cell;
        const dx = px - cx, dz = pz - cz;
        if (dx * dx + dz * dz > R2) continue;
        const y = terrainHeight(px, pz);
        if (y < SEA + .3) continue;
        const slope = terrainSlope(px, pz, 2.5);
        if (slope > 1.4) continue;
        const bm = biomeMix(px, pz, y, slope);
        if (bm.grass + bm.dry < .12) continue;
        if (n >= GRASS_CAP) break;
        const sc = 0.10 + h2 * 0.32;
        _p.set(px, y + .02, pz);
        _e.set(0, h2 * TAU, 0); _q.setFromEuler(_e);
        _s.set(sc * .9, sc, sc);
        _m.compose(_p, _q, _s);
        const gi = n++;
        grassMesh.setMatrixAt(gi, _m);
        // 每株独立色调：黄绿 / 深绿 / 偏干随机
        const hv = hash2i(gx * 31 + gi, gz * 17 + gi, 401);
        const hv2 = hash2i(gx * 13 + gi, gz * 53 + gi, 409);
        grassMesh.setColorAt(gi, _c2.setRGB(
          0.58 + hv * 0.62 + hv2 * 0.20,
          0.72 + hv2 * 0.52,
          0.38 + hv * 0.34));
        // 花
        if (h2 > .93 && fn < 3000) {
          const fi = (h2 * 977 | 0) % flowerMats.length;
          if (fnCounts[fi] < 4200) {
            _p.set(px, y + .18 * sc, pz);
            _e.set(0, (h2 * 31) % TAU, 0); _q.setFromEuler(_e);
            _s.set(sc, sc + .35, sc);
            _m.compose(_p, _q, _s);
            flowerMats[fi].setMatrixAt(fnCounts[fi]++, _m);
            fn++;
          }
        }
      }
    }
    // 碎石
    let pn = 0;
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const hp = hash2i(gx, gz, 613);
      if (hp > 0.30) continue;
      const px = gx * cell + hash2i(gx, gz, 617) * cell;
      const pz = gz * cell + hash2i(gx + 5, gz, 619) * cell;
      const dx = px - cx, dz = pz - cz;
      if (dx * dx + dz * dz > R2) continue;
      const y = terrainHeight(px, pz);
      if (y < SEA + .3) continue;
      if (pn >= 2600) break;
      const s2 = 0.05 + hp * 0.85;
      _p.set(px, y - s2 * .3, pz);
      _e.set(hash2i(gx, gz, 631) * 0.5, hash2i(gx, gz, 641) * TAU, 0); _q.setFromEuler(_e);
      _s.set(s2, s2 * .7, s2);
      _m.compose(_p, _q, _s);
      pebbleMesh.setMatrixAt(pn, _m);
      const pv = hash2i(gx * 7, gz * 3, 647);
      pebbleMesh.setColorAt(pn, _c2.setRGB(0.72 + pv * .5, 0.70 + pv * .45, 0.62 + pv * .35));
      pn++;
    }
    pebbleMesh.count = pn;
    pebbleMesh.instanceMatrix.needsUpdate = true;
    if (pebbleMesh.instanceColor) pebbleMesh.instanceColor.needsUpdate = true;

    grassMesh.count = n;
    grassMesh.instanceMatrix.needsUpdate = true;
    if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
    for (let i = 0; i < flowerMats.length; i++) {
      flowerMats[i].count = fnCounts[i];
      flowerMats[i].instanceMatrix.needsUpdate = true;
    }
  }

  function init(sc) {
    scene = sc;
    scatterWorld();
    buildAssets();
  }

  function update(camPos, dt) {
    _uTime.value += dt;
    _uWind.value = damp(_uWind.value, clamp(1 + Env.E.rain * 1.2 + Env.E.snow * .5, .4, 2.6), 1.2, dt);
    refresh(camPos);
  }

  /** 附近的树木（碰撞 / 砍伐用） */
  function treesNear(x, z, r) {
    const out = [];
    const g0x = floor((x - r) / 64), g1x = floor((x + r) / 64);
    const g0z = floor((z - r) / 64), g1z = floor((z + r) / 64);
    for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
      const a = treeGrid.get(gx + ',' + gz);
      if (!a) continue;
      for (const i of a) {
        const t = trees[i];
        const d = hypot(t.x - x, t.z - z);
        if (d < r) out.push(t);
      }
    }
    return out;
  }

  return {
    init, update, treesNear,
    treeCount: () => trees.length, rockCount: () => rocks.length,
    _uTime, _uWind,
    GeoBuilder,
  };
})();
