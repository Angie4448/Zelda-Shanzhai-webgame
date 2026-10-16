/* =========================================================================
   55_props.js — 建筑与道具：神庙 / 希卡塔 / 村落 / 城堡 / 废墟 / 营地 / 宝箱
   ========================================================================= */

const Props = (() => {
  let scene;
  const POI = [];                 // 兴趣点 {type,name,x,z,y,kind}
  const colliders = [];           // {x,z,r,y0,y1} 圆柱碰撞
  const boxColliders = [];        // {x,z,hx,hz,y0,y1}
  const lights = [];              // 动态点光 {obj, base}
  const fires = [];               // 篝火 {pos, light, fuel}
  const interactables = [];       // 可交互物 {pos, radius, label, action, kind, data}
  const dynamic = [];             // 每帧更新 {update(dt)}

  /* ---------- 固定地标坐标 ---------- */
  const SHRINES = [
    { n: '复苏神庙', x: -640, z: 480, story: true },
    { n: '奥曼·奥神庙', x: -320, z: 700 },
    { n: '加·巴伊神庙', x: -880, z: 300 },
    { n: '图米·恩科神庙', x: 220, z: 300 },
    { n: '奥瓦·达因神庙', x: 700, z: -430 },
    { n: '卡·奥·马卡神庙', x: 1180, z: 1180 },
    { n: '希·达戈兹神庙', x: 1620, z: 480 },
    { n: '纳姆卡神庙', x: -1180, z: -620 },
    { n: '凯·诺伊神庙', x: -1620, z: 620 },
    { n: '鲁姆·萨神庙', x: 560, z: 1500 },
    { n: '瓦·莫达神庙', x: -1460, z: -1080 },
    { n: '谢·卡拉神庙', x: 320, z: -1320 },
    { n: '达·卡索神庙', x: 1900, z: -1250 },
    { n: '米·阿玛神庙', x: 1900, z: 900 },
    { n: '托·卡尤神庙', x: -620, z: -900 },
    { n: '耶·加拉神庙', x: 980, z: 320 },
  ];
  const TOWERS = [
    { n: '初始台地塔', x: -560, z: 640 },
    { n: '海拉鲁平原塔', x: 140, z: 60 },
    { n: '双子山塔', x: 720, z: -60 },
    { n: '拉聂尔塔', x: 1480, z: -260 },
    { n: '阿卡莱塔', x: 1860, z: -1080 },
    { n: '死亡之山塔', x: 1180, z: -1360 },
    { n: '赫布拉塔', x: -1560, z: -1360 },
    { n: '塔邦挞塔', x: -1900, z: -420 },
    { n: '格鲁德塔', x: -2100, z: 780 },
    { n: '格鲁德高地塔', x: -1260, z: 60 },
    { n: '海拉鲁山脊塔', x: -420, z: -1560 },
    { n: '内克鲁达塔', x: 1060, z: 520 },
    { n: '法罗尼塔', x: 940, z: 1180 },
    { n: '海拉鲁湖塔', x: 380, z: 1000 },
    { n: '哈特诺塔', x: 1520, z: 1060 },
  ];
  const VILLAGES = [
    { n: '哈特诺村', x: 1480, z: 840, size: 1.0, style: 'hateno' },
    { n: '卡卡利科村', x: 1120, z: 700, size: .9, style: 'kakariko' },
    { n: '格鲁德小镇', x: -2060, z: 1120, size: 1.15, style: 'gerudo' },
    { n: '利特村', x: -1580, z: -520, size: .85, style: 'rito' },
    { n: '佐拉领地', x: 1680, z: -420, size: .95, style: 'zora' },
    { n: '古隆城', x: 1460, z: -1120, size: 1.0, style: 'goron' },
    { n: '渔村', x: 760, z: 1720, size: .8, style: 'hateno' },
    { n: '塔雷镇', x: 2060, z: -1020, size: .8, style: 'hateno' },
  ];
  const STABLES = [
    { n: '平原驿站', x: -180, z: -140 },
    { n: '双子驿站', x: 880, z: -460 },
    { n: '湖畔驿站', x: 610, z: 940 },
    { n: '雪原驿站', x: -1120, z: -1160 },
    { n: '峡谷驿站', x: -1720, z: -180 },
    { n: '湿地驿站', x: 780, z: 1160 },
  ];
  const GREAT_FAIRIES = [
    { n: '大妖精之泉·花', x: 1720, z: 940 },
    { n: '大妖精之泉·蕾', x: -1080, z: 640 },
    { n: '大妖精之泉·丝', x: 300, z: 1560 },
    { n: '大妖精之泉·卡', x: -1500, z: -780 },
  ];

  /* ---------- 材质 ---------- */
  const MAT = {};
  function buildMaterials() {
    MAT.stone = MatLib.std(TexGen.M.stoneBrick(), { roughness: .86, color: 0xc2bcae, normalScale: 1.0 });
    MAT.ruin = MatLib.std(TexGen.M.ruinBrick(), { roughness: .9, color: 0xb9b2a4 });
    MAT.plank = MatLib.std(TexGen.M.plank(), { roughness: .85 });
    MAT.thatch = MatLib.std(TexGen.M.thatch(), { roughness: .95 });
    MAT.sheikah = MatLib.std(TexGen.M.sheikahStone(), {
      roughness: .55, metalness: .15, color: 0x9fb0b8,
      emissive: 0x36e8e0, emissiveIntensity: .85,
    });
    MAT.sheikahMetal = MatLib.std(TexGen.M.sheikahMetal(), {
      roughness: .42, metalness: .55, color: 0x7d8f9c, envMapIntensity: .8,
      emissive: 0x1d3a44, emissiveIntensity: .55,
    });
    MAT.wood = MatLib.std(TexGen.M.logEnd(), { roughness: .85, color: 0xc9a878 });
    MAT.pottery = MatLib.std(TexGen.M.pottery(), { roughness: .7 });
    MAT.brass = MatLib.std(TexGen.M.brass(), { roughness: .35, metalness: .85 });
    MAT.glyph = MatLib.std(TexGen.M.glyph(), {
      roughness: .4, emissive: 0x3ff0e8, emissiveIntensity: 1.4, transparent: true,
    });
  }

  /* ---------- 建筑构件 ---------- */
  function meshFrom(geo, mat, x, y, z, ry) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  function addCyl(x, z, r, y0, y1) { colliders.push({ x, z, r, y0, y1 }); }
  function addBox(x, z, hx, hz, y0, y1, ry) {
    boxColliders.push({ x, z, hx, hz, y0, y1, ry: ry || 0 });
  }

  /* 神庙：希卡石穹顶 + 发光纹路 + 门 */
  function buildShrine(S, idx) {
    const y = terrainHeight(S.x, S.z);
    const g = new THREE.Group();
    const R = 11, H = 9;
    const base = new GeoBuilder();
    base.cylinder(0, 0, 0, 0, 1.1, 0, R * 1.18, R * 1.22, 20, .7);
    base.cylinder(0, 1.1, 0, 0, H * .55, 0, R, R * .96, 20, .8);
    // 穹顶
    const domeSeg = 10;
    for (let i = 0; i < domeSeg; i++) {
      const t = i / domeSeg, t2 = (i + 1) / domeSeg;
      const r1 = R * .96 * cos(t * PI / 2), r2 = R * .96 * cos(t2 * PI / 2);
      const y1 = H * .55 + R * .96 * sin(t * PI / 2) * .78;
      const y2 = H * .55 + R * .96 * sin(t2 * PI / 2) * .78;
      base.cylinder(0, y1, 0, 0, y2, 0, r1, r2, 20, .7);
    }
    // 顶饰
    base.cylinder(0, H * .55 + R * .78, 0, 0, H * .55 + R * .78 + 2.4, 0, 1.5, .3, 8, 1);
    const bm = meshFrom(base.toGeometry(), MAT.sheikah, S.x, y, S.z);
    bm.receiveShadow = true;

    // 发光门
    const dg = new GeoBuilder();
    dg.cylinder(0, 0, R * .98, 0, 0, R * 1.0, 1.9, 1.9, 14, 1);
    const door = new THREE.Mesh(dg.toGeometry(), MAT.glyph);
    door.position.set(S.x, y + 1.0, S.z);
    door.renderOrder = 6;
    scene.add(door);

    // 绕柱
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + PI / 4;
      const cx = S.x + cos(a) * R * 1.35, cz = S.z + sin(a) * R * 1.35;
      const cg = new GeoBuilder();
      cg.cylinder(0, 0, 0, 0, 7.5, 0, .9, .7, 8, .8);
      meshFrom(cg.toGeometry(), MAT.sheikahMetal, cx, terrainHeight(cx, cz), cz);
      addCyl(cx, cz, 1.4, terrainHeight(cx, cz), terrainHeight(cx, cz) + 7.5);
    }

    addCyl(S.x, S.z, R * 1.3, y, y + H);
    POI.push({ type: 'shrine', name: S.n, x: S.x, z: S.z, y, idx });
    interactables.push({
      pos: new THREE.Vector3(S.x, y + 1.5, S.z + R * 1.6), radius: 5.5,
      label: '进入 ' + S.n, kind: 'shrine', data: S,
    });
    // 神庙的橙色光
    const l = new THREE.PointLight(0xffb347, 1.4, 60, 2);
    l.position.set(S.x, y + 5, S.z + R * 1.2);
    scene.add(l);
    lights.push({ obj: l, base: 1.4 });
    return bm;
  }

  /* 希卡塔 */
  function buildTower(T) {
    const y = terrainHeight(T.x, T.z);
    const H = 62;
    const g = new GeoBuilder();
    // 底座
    g.cylinder(0, 0, 0, 0, 4.5, 0, 9.5, 7.6, 16, .6);
    // 主塔（上细下粗，带分段）
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      const t = i / segs, t2 = (i + 1) / segs;
      const r1 = lerp(7.4, 4.4, pow(t, .8)), r2 = lerp(7.4, 4.4, pow(t2, .8));
      const y1 = 4.5 + t * H * .84;
      const y2 = 4.5 + t2 * H * .84;
      // 每段有棱角
      const gg = new GeoBuilder();
      gg.cylinder(0, y1 - y, 0, 0, y2 - y, 0, r1, r2, 14, .5);
      g.p.push.apply(g.p, gg.p); g.n.push.apply(g.n, gg.n); g.u.push.apply(g.u, gg.u);
      for (let k = 0; k < gg.v; k++) g.c.push(1, 1, 1);
      const base = g.v;
      for (const ix of gg.i) g.i.push(base + ix);
      g.v += gg.v;
    }
    // 中部发光环
    const ring = new GeoBuilder();
    ring.cylinder(0, H * .48, 0, 0, H * .48 + .7, 0, 5.6, 5.6, 20, 3);
    const rm = new THREE.Mesh(ring.toGeometry(), MAT.glyph);
    rm.position.set(T.x, y, T.z);
    scene.add(rm);
    // 顶部平台
    g.cylinder(0, 4.5 + H * .84, 0, 0, 4.5 + H * .84 + 1.1, 0, 7.2, 7.4, 14, .6);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      g.cylinder(cos(a) * 6.4, 4.5 + H * .84 + 1.1, sin(a) * 6.4,
        cos(a) * 7.0, 4.5 + H * .84 + 3.2, sin(a) * 7.0, .42, .3, 6, 1);
    }
    g.cylinder(0, 4.5 + H * .84 + 1.1, 0, 0, 4.5 + H * .84 + 4.6, 0, 1.5, .7, 8, 1);

    meshFrom(g.toGeometry(), MAT.sheikahMetal, T.x, y, T.z);
    // 碰撞：一个圆柱
    addCyl(T.x, T.z, 8.0, y, y + 4.5 + H * .84 + 1.1);

    // 顶部橙色台座
    const pd = new GeoBuilder();
    pd.cylinder(0, 0, 0, 0, 1.1, 0, 1.6, 1.5, 10, 1);
    const pm = new THREE.Mesh(pd.toGeometry(), MAT.glyph);
    pm.position.set(T.x, y + 4.5 + H * .84 + 1.1, T.z);
    scene.add(pm);
    const l = new THREE.PointLight(0x4fe8e0, 1.6, 90, 2);
    l.position.set(T.x, y + H * .7, T.z);
    scene.add(l);
    lights.push({ obj: l, base: 1.6 });

    POI.push({ type: 'tower', name: T.n, x: T.x, z: T.z, y });
    interactables.push({
      pos: new THREE.Vector3(T.x, y + 4.5 + H * .84 + 2.6, T.z), radius: 4.5,
      label: '调查 ' + T.n, kind: 'tower', data: T,
    });
    return T;
  }

  /* 民居 */
  function buildHouse(x, z, ry, style, scale) {
    const y = terrainHeight(x, z);
    const W = 5.4 * scale, D = 4.4 * scale, H = 3.2 * scale;
    const g = new GeoBuilder();
    const wall = style === 'gerudo' ? MAT.stone : (style === 'zora' ? MAT.stone : MAT.plank);
    // 墙
    g.cylinder(0, 0, 0, 0, .4, 0, W * 1.15, W * 1.15, 4, 1);
    // 用一个盒子
    const bg = new GeoBuilder();
    box(bg, 0, .4, 0, W * 2, H, D * 2);
    mergeInto(g, bg);
    // 屋顶（茅草，人字）
    const rg = new GeoBuilder();
    const rh = 2.3 * scale, ov = .55 * scale;
    roofPrism(rg, 0, .4 + H, 0, W * 2 + ov, D * 2 + ov, rh);
    mergeInto(g, rg);
    // 屋脊
    const wm = new THREE.Mesh(g.toGeometry(), wall);
    wm.position.set(x, y, z); wm.rotation.y = ry;
    wm.castShadow = true; wm.receiveShadow = true;
    scene.add(wm);
    const rm = new THREE.Mesh(rg.toGeometry(), MAT.thatch);
    rm.position.set(x, y, z); rm.rotation.y = ry;
    rm.castShadow = true; rm.receiveShadow = true;
    scene.add(rm);

    // 门 + 窗
    const dg = new GeoBuilder();
    box(dg, 0, .4, D + .02, 1.5 * scale, 2.6 * scale, .18, .55);
    const dm = new THREE.Mesh(dg.toGeometry(), MAT.wood);
    dm.position.set(x, y, z); dm.rotation.y = ry;
    scene.add(dm);

    addBox(x, z, W + .4, D + .4, y, y + H + rh, ry);
    return wm;
  }

  /* 轴对齐盒：按 (法线轴, 符号, u 轴, v 轴) 生成正确的逆时针面 */
  const BOX_FACES = [
    { n: [1, 0, 0], u: 1, v: 2, s: 1 },      // +X: u=Y v=Z (Y×Z=X)
    { n: [-1, 0, 0], u: 2, v: 1, s: -1 },    // -X: u=Z v=Y
    { n: [0, 1, 0], u: 2, v: 0, s: 1 },      // +Y: u=Z v=X
    { n: [0, -1, 0], u: 0, v: 2, s: -1 },    // -Y: u=X v=Z
    { n: [0, 0, 1], u: 0, v: 1, s: 1 },      // +Z: u=X v=Y
    { n: [0, 0, -1], u: 1, v: 0, s: -1 },    // -Z: u=Y v=X
  ];
  function box(g, cx, cy, cz, w, h, d, col) {
    const hh = [w / 2, h / 2, d / 2];
    const c = col || [1, 1, 1];
    for (const f of BOX_FACES) {
      const ui = f.u, vi2 = f.v;
      const su = f.s > 0 ? 1 : -1;
      // 面的四个角：(-u,-v) (+u,-v) (+u,+v) (-u,+v)
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const start = g.v;
      for (let i = 0; i < 4; i++) {
        const [su_, sv_] = corners[i];
        const p = [0, 0, 0];
        p[ui] = su_ * hh[ui];
        p[vi2] = sv_ * hh[vi2];
        // 法线轴分量
        for (let k = 0; k < 3; k++) if (k !== ui && k !== vi2) p[k] = f.n[k] * hh[k];
        g._push(cx + p[0], cy + p[1], cz + p[2], f.n[0], f.n[1], f.n[2],
          (su_ + 1) * .5 * 2, (sv_ + 1) * .5 * 2, c);
      }
      g.quad(start, start + 1, start + 2, start + 3);
    }
    return g;
  }

  /* 人字屋顶棱柱 */
  function roofPrism(g, cx, cy, cz, w, d, h, col) {
    const hx = w / 2, hz = d / 2;
    const c = col || [1, 1, 1];
    const A = [cx - hx, cy, cz - hz], B = [cx + hx, cy, cz - hz];
    const C = [cx + hx, cy, cz + hz], D = [cx - hx, cy, cz + hz];
    const R1 = [cx, cy + h, cz - hz], R2 = [cx, cy + h, cz + hz];
    const P = (v, n) => g._push(v[0], v[1], v[2], n[0], n[1], n[2],
      v[0] * .3, v[2] * .3, c);
    const slR = [0.55, 0.58, 0], slL = [-0.55, 0.58, 0], gf = [0, .55, -.84];
    // 右坡
    const b3 = P(B, slR), r1 = P(R1, slR), c3 = P(C, slR), r2 = P(R2, slR);
    g.tri(b3, r2, c3); g.tri(b3, r1, r2);
    // 左坡
    const d3 = P(D, slL), a3 = P(A, slL), r1b = P(R1, slL), r2b = P(R2, slL);
    g.tri(d3, r1b, a3); g.tri(d3, r2b, r1b);
    // 前山墙 (-Z)
    const a4 = P(A, gf), b4 = P(B, gf), r1c = P(R1, gf);
    g.tri(a4, r1c, b4);
    // 后山墙 (+Z)
    const c4 = P(C, gf), d4 = P(D, gf), r2c = P(R2, gf);
    g.tri(c4, r2c, d4);
    return g;
  }
  function mergeInto(dst, src) {
    const base = dst.v;
    dst.p.push.apply(dst.p, src.p);
    dst.n.push.apply(dst.n, src.n);
    dst.u.push.apply(dst.u, src.u);
    dst.c.push.apply(dst.c, src.c);
    for (const i of src.i) dst.i.push(base + i);
    dst.v += src.v;
    return dst;
  }

  /* 营地 / 篝火 */
  function buildCampfire(x, z, withPot) {
    const y = terrainHeight(x, z);
    const g = new GeoBuilder();
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU;
      g.rock(cos(a) * .95, .18, sin(a) * .95, .34, 900 + i, .8, 0);
    }
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      const m = new THREE.Matrix4().makeRotationZ(.62).setPosition(cos(a) * .3, .26, sin(a) * .3);
      const tg = new GeoBuilder();
      tg.cylinder(0, 0, 0, 0, 1.5, 0, .09, .06, 5, 1);
      const wx = new THREE.Vector3(cos(a), 0, sin(a));
      tg._m = m.elements;
      mergeInto(g, tg);
      tg._m = null;
    }
    meshFrom(g.toGeometry(), MAT.wood, x, y, z);

    // 火焰（自发光公告板）
    const flameMat = new THREE.SpriteMaterial({
      map: TexGen.C.radial('rgba(255,215,120,.95)', 'rgba(255,90,10,0)', 128, 1.4),
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fl = new THREE.Sprite(flameMat);
    fl.position.set(x, y + .72, z);
    fl.scale.setScalar(1.75);
    scene.add(fl);
    const light = new THREE.PointLight(0xffa447, 2.6, 26, 2);
    light.position.set(x, y + 1.1, z);
    light.castShadow = false;
    scene.add(light);
    const f = { x, y, z, sprite: fl, light, phase: Math.random() * 10, kind: 'fire' };
    fires.push(f);
    dynamic.push({
      update(dt, t) {
        const pulse = .82 + sin(t * 7.3 + f.phase) * .12 + sin(t * 17.1 + f.phase * 2) * .06;
        light.intensity = 2.6 * pulse;
        fl.scale.setScalar(1.6 * pulse + .2);
        fl.material.rotation = sin(t * 2 + f.phase) * .1;
      }
    });
    light.userData.base = 2.6;
    lights.push({ obj: light, base: 2.6, flicker: true, phase: f.phase });

    if (withPot) {
      const pg = new GeoBuilder();
      pg.cylinder(0, 0, 0, 0, .85, 0, .62, .78, 12, 1);
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU;
        pg.cylinder(cos(a) * .8, 0, sin(a) * .8, cos(a) * .45, 1.2, sin(a) * .45, .09, .08, 5, 1);
      }
      const pm = meshFrom(pg.toGeometry(), MAT.pottery, x + 2.4, y, z);
      addCyl(x + 2.4, z, .9, y, y + .9);
      interactables.push({
        pos: new THREE.Vector3(x + 2.4, y + .8, z), radius: 2.4,
        label: '使用料理锅', kind: 'cook', data: { x: x + 2.4, y, z },
      });
    }
    addCyl(x, z, 1.1, y, y + .5);
    return f;
  }

  /* 宝箱 */
  function buildChest(x, z, ry, rarity) {
    const y = terrainHeight(x, z);
    const g = new GeoBuilder();
    box(g, 0, .34, 0, 1.15, .68, .78);
    const lid = new GeoBuilder();
    box(lid, 0, .17, 0, 1.19, .34, .82);
    const bm = meshFrom(g.toGeometry(), MAT.wood, x, y, z, ry);
    const lm = new THREE.Mesh(lid.toGeometry(), MAT.brass);
    lm.position.set(x, y + .78, z); lm.rotation.y = ry;
    lm.castShadow = true; scene.add(lm);
    const item = { pos: new THREE.Vector3(x, y + .9, z), radius: 2.4, label: '打开宝箱', kind: 'chest', data: { opened: false, rarity, lid: lm } };
    interactables.push(item);
    addBox(x, z, .7, .55, y, y + 1.0, ry);
    return item;
  }

  /* 废墟柱 / 断墙 */
  function buildRuin(x, z, seed, big) {
    const r = new Rand(seed);
    const y = terrainHeight(x, z);
    const g = new GeoBuilder();
    const n = big ? r.i(3, 6) : r.i(1, 3);
    for (let i = 0; i < n; i++) {
      const a = r.ang(), d = r.f(.6, 4.2);
      const h = r.f(1.2, big ? 7.5 : 4.5);
      const cx = x + cos(a) * d, cz = z + sin(a) * d;
      const cy = terrainHeight(cx, cz);
      const cg = new GeoBuilder();
      cg.cylinder(0, 0, 0, 0, h, 0, r.f(.5, .9), r.f(.42, .78), 9, .7);
      const m = meshFrom(cg.toGeometry(), r.bool(.5) ? MAT.stone : MAT.ruin, cx, cy, cz, r.ang());
      addCyl(cx, cz, .9, cy, cy + h);
    }
    return g;
  }

  /* 城堡 */
  function buildCastle(x, z) {
    const y = terrainHeight(x, z);
    const g = new GeoBuilder();
    // 主堡
    box(g, 0, 12, 0, 26, 24, 20);
    box(g, 0, 27, 0, 18, 8, 14);
    // 四角塔
    for (const [dx, dz] of [[-12, -9], [12, -9], [-12, 9], [12, 9]]) {
      const tg = new GeoBuilder();
      tg.cylinder(0, 0, 0, 0, 32, 0, 3.6, 3.2, 12, .55);
      tg.cylinder(0, 32, 0, 0, 35.5, 0, 4.4, 4.2, 12, .55);
      mergeInto(g, tg);
      const cg = new GeoBuilder();
      cg.cylinder(0, 0, 0, 0, 34, 0, 1.2, 1.0, 8, 1);
      const m = new THREE.Mesh(cg.toGeometry(), MAT.brass);
      m.position.set(x + dx, y, z + dz); scene.add(m);
    }
    // 城垛
    for (let i = 0; i < 16; i++) {
      const t = i / 16;
      const px = -12 + t * 24;
      box(g, px, 24.8, -9.6, 1.4, 1.6, 1.0);
      box(g, px, 24.8, 9.6, 1.4, 1.6, 1.0);
    }
    // 大门
    const dg = new GeoBuilder();
    box(dg, 0, 3.5, 10.2, 7, 7, .8);
    const dm = new THREE.Mesh(dg.toGeometry(), MAT.brass);
    dm.position.set(x, y, z); scene.add(dm);

    const m = meshFrom(g.toGeometry(), MAT.stone, x, y, z);
    addBox(x, z, 16, 13, y, y + 35);

    // 城堡的灾厄红光
    const l = new THREE.PointLight(0xff2b5e, 3.0, 220, 2);
    l.position.set(x, y + 34, z);
    scene.add(l);
    lights.push({ obj: l, base: 3.0, pulse: true });

    // 灾厄盖侬的能量柱
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 6.5, 90, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff2b5e, transparent: true, opacity: .18,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      }));
    beam.position.set(x, y + 60, z);
    scene.add(beam);
    dynamic.push({
      update(dt, t) {
        beam.rotation.y = t * .18;
        beam.material.opacity = .13 + sin(t * 1.7) * .05;
        beam.scale.x = 1 + sin(t * .9) * .12;
      }
    });

    POI.push({ type: 'castle', name: '海拉鲁城堡', x, z, y });
    return m;
  }

  /* 马厩 */
  function buildStable(S) {
    const y = terrainHeight(S.x, S.z);
    const g = new GeoBuilder();
    box(g, 0, 2.6, 0, 22, 5.2, 9);
    const rg = new GeoBuilder();
    roofPrism(rg, 0, 5.2, 0, 24, 11, 3.4);
    const wm = meshFrom(g.toGeometry(), MAT.plank, S.x, y, S.z);
    const rm = new THREE.Mesh(rg.toGeometry(), MAT.thatch);
    rm.position.set(S.x, y, S.z); rm.castShadow = true; scene.add(rm);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + .6;
      const cx = S.x + cos(a) * 13, cz = S.z + sin(a) * 11;
      const cg = new GeoBuilder();
      cg.cylinder(0, 0, 0, 0, 6, 0, .45, .4, 8, .8);
      meshFrom(cg.toGeometry(), MAT.wood, cx, terrainHeight(cx, cz), cz);
    }
    addBox(S.x, S.z, 11.5, 5, y, y + 8.6);
    buildCampfire(S.x + 12, S.z + 6, true);
    POI.push({ type: 'stable', name: S.n, x: S.x, z: S.z, y });
    interactables.push({
      pos: new THREE.Vector3(S.x, y + 2, S.z + 6), radius: 6,
      label: '在 ' + S.n + " 登记马匹", kind: 'stable', data: S,
    });
  }

  /* 大妖精泉 */
  function buildFairyFountain(F) {
    const y = terrainHeight(F.x, F.z);
    const g = new GeoBuilder();
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU;
      const h = 2.2 + sin(a * 3) * .8;
      g.cylinder(cos(a) * 7.2, 0, sin(a) * 7.2, cos(a) * 7.2, h, sin(a) * 7.2, .85, .75, 6, .8);
    }
    meshFrom(g.toGeometry(), MAT.stone, F.x, y, F.z);
    // 花苞
    const bud = new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 14), MAT.pottery);
    bud.position.set(F.x, y + 3.2, F.z);
    bud.scale.y = 1.5;
    bud.castShadow = true;
    scene.add(bud);
    const l = new THREE.PointLight(0xffd0f0, 2.2, 60, 2);
    l.position.set(F.x, y + 7, F.z);
    scene.add(l);
    lights.push({ obj: l, base: 2.2, pulse: true });
    // 花瓣
    const petals = new THREE.Mesh(new THREE.SphereGeometry(5.6, 20, 12, 0, TAU, 0, PI * .5),
      new THREE.MeshStandardMaterial({ color: 0xffc0e8, roughness: .5, side: THREE.DoubleSide }));
    petals.position.set(F.x, y + 5.4, F.z);
    petals.scale.set(1.6, .8, 1.6);
    scene.add(petals);
    POI.push({ type: 'fairy', name: F.n, x: F.x, z: F.z, y });
  }

  /* 村庄 */
  function buildVillage(V) {
    const r = new Rand(V.n.length * 977 + 13);
    const n = floor(5 * V.size + 4);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r.f(-.3, .3);
      const d = r.f(11, 26) * V.size;
      const hx = V.x + cos(a) * d, hz = V.z + sin(a) * d;
      buildHouse(hx, hz, r.ang(), V.style, V.size * r.f(.85, 1.15));
    }
    // 中央篝火
    buildCampfire(V.x, V.z + 4, true);
    POI.push({ type: 'village', name: V.n, x: V.x, z: V.z, y: terrainHeight(V.x, V.z) });
    interactables.push({
      pos: new THREE.Vector3(V.x, terrainHeight(V.x, V.z) + 2, V.z - 3), radius: 8,
      label: V.n, kind: 'village', data: V,
    });
  }

  /* 路牌 / 木桩 */
  function buildSign(x, z, text) {
    const y = terrainHeight(x, z);
    const g = new GeoBuilder();
    g.cylinder(0, 0, 0, 0, 1.7, 0, .1, .09, 6, 1);
    box(g, 0, 1.95, 0, 1.3, .7, .1);
    meshFrom(g.toGeometry(), MAT.wood, x, y, z);
    addCyl(x, z, .3, y, y + 2.2);
    interactables.push({
      pos: new THREE.Vector3(x, y + 1.8, z), radius: 2.6,
      label: '阅读路牌', kind: 'sign', data: { text },
    });
  }

  /* 破败的守护者残骸 */
  function buildGuardianRemains(x, z) {
    const y = terrainHeight(x, z);
    const g = new GeoBuilder();
    g.rock(0, 1.6, 0, 2.1, 4242, .75, 1);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      const l = 2.6;
      const m = new THREE.Matrix4().makeRotationZ(-.7).setPosition(cos(a) * 1.6, .8, sin(a) * 1.6);
      const lg = new GeoBuilder();
      lg.cylinder(0, 0, 0, 0, l, 0, .26, .14, 6, .8);
      lg._m = m.elements; mergeInto(g, lg); lg._m = null;
    }
    g.cylinder(0, 3.4, 0, 0, 4.2, 0, 1.1, .75, 10, .8);
    meshFrom(g.toGeometry(), MAT.sheikahMetal, x, y, z);
    addCyl(x, z, 2.4, y, y + 4);
    // 微弱红光眼
    const l = new THREE.PointLight(0xff4040, .5, 18, 2);
    l.position.set(x, y + 3.6, z);
    scene.add(l);
    lights.push({ obj: l, base: .5, pulse: true });
  }

  /* ---------- 初始化 ---------- */
  function init(sc) {
    scene = sc;
    buildMaterials();

    buildCastle(40, -540);

    for (const S of SHRINES) buildShrine(S, SHRINES.indexOf(S));
    for (const T of TOWERS) buildTower(T);
    for (const V of VILLAGES) buildVillage(V);
    for (const S of STABLES) buildStable(S);
    for (const F of GREAT_FAIRIES) buildFairyFountain(F);

    // 废墟（用确定性 hash 撒在平原上）
    const r = new Rand(31337);
    for (let i = 0; i < (CFG.lite ? 10 : 90); i++) {
      const x = r.f(-2600, 2600), z = r.f(-2600, 2600);
      const y = terrainHeight(x, z);
      if (y < SEA + 2 || y > 300) continue;
      if (terrainSlope(x, z, 4) > .8) continue;
      buildRuin(x, z, 8000 + i * 137, r.bool(.3));
    }
    // 宝箱
    const r2 = new Rand(4242);
    for (let i = 0; i < (CFG.lite ? 12 : 120); i++) {
      const x = r2.f(-3000, 3000), z = r2.f(-3000, 3000);
      const y = terrainHeight(x, z);
      if (y < SEA + 1 || terrainSlope(x, z, 4) > 1.0) continue;
      buildChest(x, z, r2.ang(), r2.weighted([[1, 5], [2, 3], [3, 1]]));
    }
    // 守护者残骸
    const r3 = new Rand(777);
    for (let i = 0; i < (CFG.lite ? 4 : 45); i++) {
      const x = r3.f(-2400, 2400), z = r3.f(-2400, 2400);
      const y = terrainHeight(x, z);
      if (y < SEA + 2 || y > 260) continue;
      buildGuardianRemains(x, z);
    }
    // 路牌
    buildSign(-180, -120, '← 海拉鲁城堡　海拉鲁平原 →');
    buildSign(880, -440, '↑ 双子山　死亡之山 →');
    buildSign(610, 960, '← 海拉鲁湖　内克鲁达 →');
    buildSign(-682, 540, '初始台地 · 你醒来的地方');
    buildSign(1480, 880, '哈特诺村');
    buildSign(1120, 740, '卡卡利科村');

    // 平原上的零散篝火
    const r4 = new Rand(1919);
    for (let i = 0; i < (CFG.lite ? 4 : 26); i++) {
      const x = r4.f(-2600, 2600), z = r4.f(-2600, 2600);
      const y = terrainHeight(x, z);
      if (y < SEA + 1.5 || terrainSlope(x, z, 4) > 1.0) continue;
      buildCampfire(x, z, r4.bool(.4));
    }
  }

  function update(dt, t) {
    for (let i = 0; i < dynamic.length; i++) dynamic[i].update(dt, t);
    // 夜间点亮固定光源
    const night = 1 - Env.E.dayF;
    for (const L of lights) {
      if (L.flicker) continue;                  // 篝火由 dynamic 驱动
      L.obj.intensity = L.base * (0.35 + night * 0.75) *
        (L.pulse ? (0.8 + 0.2 * sin(t * 1.1 + L.base * 7)) : 1);
    }
  }

  return {
    init, update, POI, colliders, boxColliders, interactables, fires, lights,
    buildChest, buildCampfire, buildSign, terrainHeight,
  };
})();
