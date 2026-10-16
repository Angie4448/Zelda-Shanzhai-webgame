/* =========================================================================
   60_character.js — 林克：刚性骨骼模型 + 完整程序化动画状态机
   ========================================================================= */

const CharMat = (() => {
  const M = {};
  function init() {
    M.skin = MatLib.std(TexGen.M.skin(), { roughness: .62, color: 0xffd9b8 });
    M.hair = new THREE.MeshStandardMaterial({
      map: TexGen.M.leather().map, color: 0xd9b866, roughness: .55, metalness: .05,
    });
    M.tunic = MatLib.std(TexGen.M.cloth(), { roughness: .82, color: 0x2f6fd0 });
    M.tunicDark = MatLib.std(TexGen.M.cloth(), { roughness: .85, color: 0x1b4a92 });
    M.pants = MatLib.std(TexGen.M.cloth(), { roughness: .88, color: 0xa8926a });
    M.boot = MatLib.std(TexGen.M.leather(), { roughness: .7, color: 0x6b4326 });
    M.glove = MatLib.std(TexGen.M.leather(), { roughness: .72, color: 0x8a5a33 });
    M.belt = MatLib.std(TexGen.M.leather(), { roughness: .6, color: 0x4a2f1a });
    M.metal = MatLib.std(TexGen.M.metal(), { roughness: .32, metalness: .85, color: 0xcfd8e2 });
    M.gold = MatLib.std(TexGen.M.brass(), { roughness: .3, metalness: .9, color: 0xd8b45a });
    M.sheikah = MatLib.std(TexGen.M.sheikahMetal(), { roughness: .35, metalness: .8, color: 0x2a3a44 });
    M.cloth2 = MatLib.std(TexGen.M.cloth(), { roughness: .9, color: 0xb8442f });
    M.eye = new THREE.MeshStandardMaterial({ color: 0x4a8fd0, roughness: .18, metalness: 0 });
    M.dark = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: .5 });
    M.leather = MatLib.std(TexGen.M.leather(), { roughness: .75, color: 0x6a4a2e });
  }
  return { M, init };
})();

const Link = (() => {
  const B = {};             // 骨骼 Object3D
  const PARTS = {};         // 部件网格
  let group, glider = null, sword = null, shield = null, bow = null, slate = null;
  const J = {};             // 当前关节角
  const T = {};             // 目标关节角
  const JKEYS = [
    'rootY', 'hipY', 'hipX', 'hipZ', 'spineX', 'spineY', 'spineZ',
    'chestX', 'chestY', 'chestZ', 'neckX', 'neckY', 'headX', 'headY', 'headZ',
    'armLX', 'armLY', 'armLZ', 'foreLX', 'handLX',
    'armRX', 'armRY', 'armRZ', 'foreRX', 'handRX',
    'thighLX', 'thighLY', 'thighLZ', 'shinLX', 'footLX',
    'thighRX', 'thighRY', 'thighRZ', 'shinRX', 'footRX',
  ];
  function resetPose(o) { for (const k of JKEYS) o[k] = 0; return o; }
  resetPose(J); resetPose(T);

  let state = 'idle';
  let phase = 0;
  let blinkTimer = 0, blink = 0;
  let equipment = { sword: 'master', shield: 'hylian', bow: false };

  const _v = new THREE.Vector3();

  /* ---------- 构建 ---------- */
  function limbMesh(len, r0, r1, mat, taper) {
    const g = new GeoBuilder();
    g.cylinder(0, 0, 0, 0, -len, 0, r0, r1, 10, .8);
    // 球形关节
    return new THREE.Mesh(g.toGeometry(), mat);
  }
  function sphereMesh(r, mat, seg) {
    return new THREE.Mesh(new THREE.SphereGeometry(r, seg || 12, (seg || 12) - 2), mat);
  }
  function bone(parent, x, y, z) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }

  function build() {
    const M = CharMat.M;
    group = new THREE.Group();

    // 髋
    B.root = bone(group, 0, 0, 0);
    B.hips = bone(B.root, 0, 1.02, 0);
    const hipMesh = new GeoBuilder();
    hipMesh.cylinder(0, 0, 0, 0, -.16, 0, .155, .145, 10, 1);
    const hm = new THREE.Mesh(hipMesh.toGeometry(), M.pants);
    B.hips.add(hm); PARTS.hips = hm;

    // 脊椎
    B.spine = bone(B.hips, 0, .02, 0);
    const sp = new GeoBuilder();
    sp.cylinder(0, 0, 0, 0, -.20, 0, .145, .165, 10, 1);
    const sm = new THREE.Mesh(sp.toGeometry(), M.tunic);
    B.spine.add(sm); PARTS.spine = sm;

    // 胸
    B.chest = bone(B.spine, 0, .0, 0);
    const ch = new GeoBuilder();
    ch.cylinder(0, .0, 0, 0, .30, 0, .175, .17, 12, 1);
    // 肩部拓宽
    ch.cylinder(0, .28, 0, 0, .30, 0, .20, .19, 12, 1);
    const cm = new THREE.Mesh(ch.toGeometry(), M.tunic);
    B.chest.add(cm); PARTS.chest = cm;
    // 腰带
    const beltG = new GeoBuilder();
    beltG.cylinder(0, -.02, 0, 0, .06, 0, .185, .185, 14, 1);
    const bm = new THREE.Mesh(beltG.toGeometry(), M.belt);
    B.spine.add(bm);
    // 腰带扣
    const buckle = sphereMesh(.045, M.gold, 8);
    buckle.scale.set(1.2, .8, .5); buckle.position.set(0, .02, .18);
    B.spine.add(buckle);
    // 胸口白色纹章
    const emb = new GeoBuilder();
    emb.cylinder(0, .16, .172, 0, .16, .176, .07, .07, 10, 1);
    const em = new THREE.Mesh(emb.toGeometry(), MatLib.std(TexGen.M.cloth(), { color: 0xf2f2ee, roughness: .8 }));
    B.chest.add(em);

    // 颈 / 头
    B.neck = bone(B.chest, 0, .30, 0);
    const nM = new THREE.Mesh(new THREE.CylinderGeometry(.048, .055, .10, 8), M.skin);
    nM.position.y = .05; B.neck.add(nM);
    B.head = bone(B.neck, 0, .105, 0);
    buildHead(M);

    // 手臂
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      B['shoulder' + side] = bone(B.chest, s * .20, .26, 0);
      B['upperArm' + side] = bone(B['shoulder' + side], 0, 0, 0);
      const ua = limbMesh(.26, .052, .045, M.skin);
      B['upperArm' + side].add(ua);
      B['foreArm' + side] = bone(B['upperArm' + side], 0, -.26, 0);
      const fa = limbMesh(.24, .046, .038, M.skin);
      B['foreArm' + side].add(fa);
      // 护腕
      const br = new GeoBuilder();
      br.cylinder(0, -.02, 0, 0, -.10, 0, .052, .048, 10, 1);
      B['foreArm' + side].add(new THREE.Mesh(br.toGeometry(), M.glove));
      B['hand' + side] = bone(B['foreArm' + side], 0, -.25, 0);
      const hd = sphereMesh(.048, M.glove, 8);
      hd.scale.set(1, 1.15, .75);
      B['hand' + side].add(hd);
      // 肩甲（蓝色）
      const pa = sphereMesh(.072, M.tunic, 10);
      pa.scale.set(1, .9, 1);
      B['shoulder' + side].add(pa);
    }
    B.armL = B.upperArmL; B.foreL = B.foreArmL;
    B.armR = B.upperArmR; B.foreR = B.foreArmR;

    // 腿
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      B['thigh' + side] = bone(B.hips, s * .085, -.14, 0);
      const th = limbMesh(.40, .082, .062, M.pants);
      B['thigh' + side].add(th);
      B['shin' + side] = bone(B['thigh' + side], 0, -.40, 0);
      const sh = limbMesh(.38, .060, .046, M.pants);
      B['shin' + side].add(sh);
      // 靴
      B['foot' + side] = bone(B['shin' + side], 0, -.38, 0);
      const ft = new GeoBuilder();
      ft.cylinder(0, -.04, 0, 0, -.10, 0, .062, .058, 10, 1);
      const foot = new THREE.Mesh(ft.toGeometry(), M.boot);
      B['foot' + side].add(foot);
      const toe = new GeoBuilder();
      toe.cylinder(0, -.08, .02, 0, -.09, .02, .058, .05, 8, 1);
      const tg = new THREE.Mesh(toe.toGeometry(), M.boot);
      tg.scale.set(1, 1, 1.9);
      tg.position.z = .06;
      B['foot' + side].add(tg);
    }

    // 装备：剑、盾（背在背上）
    buildEquipment(M);

    group.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    return group;
  }

  function buildHead(M) {
    // 头骨
    const hd = new THREE.Mesh(new THREE.SphereGeometry(.088, 16, 14), M.skin);
    hd.scale.set(1, 1.12, 1.02);
    hd.position.y = .085;
    B.head.add(hd);
    // 下巴
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(.062, 12, 10), M.skin);
    jaw.position.set(0, .045, .022); jaw.scale.set(1, .8, 1.05);
    B.head.add(jaw);
    // 尖耳
    for (const s of [1, -1]) {
      const eg = new GeoBuilder();
      eg.cylinder(0, 0, 0, 0, .07, 0, .026, .004, 6, 1);
      const ear = new THREE.Mesh(eg.toGeometry(), M.skin);
      ear.position.set(s * .088, .10, -.006);
      ear.rotation.z = s * -0.55;
      ear.rotation.x = -0.25;
      ear.scale.set(1, 1, .45);
      B.head.add(ear);
    }
    // 眼睛
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.018, 10, 8), M.eye);
      eye.position.set(s * .037, .092, .078);
      eye.scale.set(1, 1.05, .6);
      eye.name = 'eye' + s;
      B.head.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(.032, .007, .01), M.hair);
      brow.position.set(s * .037, .116, .080);
      brow.rotation.z = s * .12;
      B.head.add(brow);
    }
    // 嘴
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(.026, .006, .008), M.dark);
    mouth.position.set(0, .052, .084);
    B.head.add(mouth);
    // 头发
    const hairG = new THREE.SphereGeometry(.094, 16, 12, 0, TAU, 0, PI * .62);
    const hair = new THREE.Mesh(hairG, M.hair);
    hair.position.y = .088; hair.scale.set(1.03, 1.1, 1.05);
    B.head.add(hair);
    // 刘海
    for (let i = 0; i < 5; i++) {
      const t = (i / 4 - .5);
      const b = new THREE.Mesh(new THREE.BoxGeometry(.028, .07, .022), M.hair);
      b.position.set(t * .09, .142, .066 - abs(t) * .02);
      b.rotation.z = -t * .5;
      b.rotation.x = -.35;
      B.head.add(b);
    }
    // 发髻
    const bun = new THREE.Mesh(new THREE.SphereGeometry(.036, 10, 8), M.hair);
    bun.position.set(0, .16, -.055); bun.scale.set(1, .85, 1.15);
    B.head.add(bun);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(.022, .012, .17, 8), M.hair);
    tail.position.set(0, .09, -.10); tail.rotation.x = .95;
    B.head.add(tail);
  }

  function buildEquipment(M) {
    // 大师之剑（背在背上）
    sword = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.035, .74, .012), M.metal);
    blade.position.y = .40; sword.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.024, .1, 4), M.metal);
    tip.position.y = .81; tip.rotation.y = PI / 4; sword.add(tip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(.17, .028, .03), M.gold);
    guard.position.y = .03; sword.add(guard);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(.019, .017, .16, 8), M.tunicDark);
    grip.position.y = -.06; sword.add(grip);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(.024, 8, 6), M.gold);
    pommel.position.y = -.145; sword.add(pommel);
    sword.rotation.set(0, 0, PI * .72);
    sword.position.set(-.10, .16, -.20);
    B.chest.add(sword);

    // 海利亚盾
    shield = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.BoxGeometry(.40, .50, .035), M.metal);
    shield.add(sh);
    const shEdge = new THREE.Mesh(new THREE.BoxGeometry(.44, .54, .02), M.gold);
    shEdge.position.z = -.012; shield.add(shEdge);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(.10, .1, 3), M.gold);
    crest.position.set(0, .12, .026); crest.rotation.x = PI / 2; shield.add(crest);
    const crest2 = new THREE.Mesh(new THREE.ConeGeometry(.13, .1, 3), M.gold);
    crest2.position.set(0, -.02, .026); crest2.rotation.x = PI / 2; crest2.rotation.z = PI; shield.add(crest2);
    shield.rotation.set(0, 0, PI * .2);
    shield.position.set(.09, .10, -.24);
    B.chest.add(shield);

    // 希卡之石（腰间）
    slate = new THREE.Mesh(new THREE.BoxGeometry(.11, .07, .018), M.sheikah);
    slate.position.set(.18, .04, .02);
    slate.rotation.z = -.2;
    B.spine.add(slate);
    const eye = new THREE.Mesh(new THREE.CircleGeometry(.018, 12),
      new THREE.MeshBasicMaterial({ color: 0x5ff0e8 }));
    eye.position.set(0, 0, .011); slate.add(eye);

    // 箭袋
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(.045, .038, .34, 8), M.leather);
    quiver.position.set(.14, .16, -.19); quiver.rotation.z = -.35;
    B.chest.add(quiver);
    for (let i = 0; i < 4; i++) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .3, 5), M.leather);
      a.position.set(.10 + (i % 2) * .035, .36, -.20 + floor(i / 2) * .03);
      a.rotation.z = -.35;
      B.chest.add(a);
    }

    // 滑翔伞（默认隐藏）
    glider = new THREE.Group();
    const fab = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 10, 0, TAU, 0, PI * .38),
      new THREE.MeshStandardMaterial({
        map: TexGen.M.cloth().map, color: 0x8a3a2a, roughness: .85,
        side: THREE.DoubleSide,
      }));
    fab.scale.set(1, .62, .62);
    fab.position.y = .1;
    glider.add(fab);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .9, 8), M.wood || M.leather);
    pole.position.y = -.35;
    glider.add(pole);
    glider.visible = false;
    B.chest.add(glider);
  }

  /* ---------- 动画 ---------- */
  function applyPose(o) {
    B.root.position.y = o.rootY;
    B.hips.rotation.set(o.hipX, o.hipY, o.hipZ);
    B.spine.rotation.set(o.spineX, o.spineY, o.spineZ);
    B.chest.rotation.set(o.chestX, o.chestY, o.chestZ);
    B.neck.rotation.set(o.neckX, o.neckY, 0);
    B.head.rotation.set(o.headX, o.headY, o.headZ);

    B.armL.rotation.set(o.armLX, o.armLY, o.armLZ);
    B.foreL.rotation.x = o.foreLX;
    B.handL.rotation.x = o.handLX;
    B.armR.rotation.set(o.armRX, o.armRY, o.armRZ);
    B.foreR.rotation.x = o.foreRX;
    B.handR.rotation.x = o.handRX;

    B.thighL.rotation.set(o.thighLX, o.thighLY, o.thighLZ);
    B.shinL.rotation.x = o.shinLX;
    B.footL.rotation.x = o.footLX;
    B.thighR.rotation.set(o.thighRX, o.thighRY, o.thighRZ);
    B.shinR.rotation.x = o.shinRX;
    B.footR.rotation.x = o.footRX;
  }

  /* 行走 / 奔跑循环 */
  function locomotion(o, t, speed, run) {
    const A = run ? 0.95 : 0.52;
    const B2 = run ? 1.25 : 0.62;
    const armA = run ? 0.85 : 0.42;
    const s = sin(t), c = cos(t);
    o.thighLX = s * A;
    o.thighRX = -s * A;
    o.shinLX = max(0, -s) * B2 - (run ? .35 : .12) * (1 - abs(s));
    o.shinRX = max(0, s) * B2 - (run ? .35 : .12) * (1 - abs(s));
    o.footLX = -o.thighLX * .35 + (run ? .1 : .06);
    o.footRX = -o.thighRX * .35 + (run ? .1 : .06);
    o.armLX = -s * armA;
    o.armRX = s * armA;
    o.foreLX = -(run ? .95 : .32) - max(0, -s) * (run ? .5 : .25);
    o.foreRX = -(run ? .95 : .32) - max(0, s) * (run ? .5 : .25);
    o.armLZ = run ? .18 : .10;
    o.armRZ = run ? -.18 : -.10;
    o.spineX = run ? .22 : .06;
    o.chestX = run ? .12 : .04;
    o.chestY = -s * (run ? .18 : .10);
    o.hipY = s * (run ? .16 : .09);
    o.rootY = abs(c) * (run ? .09 : .035);
    o.headX = run ? -.18 : -.03;
    o.hipX = run ? .10 : .02;
  }

  /* 攀爬 */
  function climbPose(o, t, moving) {
    const s = sin(t), c = cos(t);
    const k = moving ? 1 : .25;
    o.armLX = -2.35 + s * .45 * k;
    o.armRX = -2.35 - s * .45 * k;
    o.armLZ = .30; o.armRZ = -.30;
    o.foreLX = -.55; o.foreRX = -.55;
    o.thighLX = .55 + s * .40 * k;
    o.thighRX = .55 - s * .40 * k;
    o.shinLX = -.75 - max(0, s) * .3 * k;
    o.shinRX = -.75 - max(0, -s) * .3 * k;
    o.footLX = .35; o.footRX = .35;
    o.spineX = -.22; o.chestX = -.12; o.headX = -.25;
    o.hipX = -.15;
  }

  /* 滑翔 */
  function glidePose(o, t) {
    o.armLX = -2.75; o.armRX = -2.75;
    o.armLZ = .22; o.armRZ = -.22;
    o.foreLX = -.18; o.foreRX = -.18;
    o.thighLX = .32; o.thighRX = .30;
    o.shinLX = -.42; o.shinRX = -.40;
    o.footLX = .28; o.footRX = .26;
    o.spineX = -.12; o.chestX = -.05; o.headX = -.1;
    o.rootY = .12;
  }

  /* 游泳 */
  function swimPose(o, t, moving) {
    const s = sin(t * 1.05), c = cos(t * 1.05);
    if (moving) {
      o.spineX = 1.15; o.chestX = .18; o.headX = -.72;
      o.armLX = -1.6 + s * 1.3;
      o.armRX = -1.6 - s * 1.3;
      o.armLZ = .45; o.armRZ = -.45;
      o.foreLX = -.5 - s * .5;
      o.foreRX = -.5 + s * .5;
      o.thighLX = s * .55 - .35; o.thighRX = -s * .55 - .35;
      o.shinLX = -.35 + max(0, -s) * .5;
      o.shinRX = -.35 + max(0, s) * .5;
    } else {
      o.spineX = .75; o.headX = -.55;
      o.armLX = -1.0 + s * .16; o.armRX = -1.0 - s * .16;
      o.armLZ = .7; o.armRZ = -.7;
      o.foreLX = -.9; o.foreRX = -.9;
      o.thighLX = s * .28 - .2; o.thighRX = -s * .28 - .2;
      o.shinLX = -.45; o.shinRX = -.45;
    }
  }

  /* 攻击（三段连击） */
  function attackPose(o, p, combo) {
    if (combo === 0) {
      const e = p < .28 ? Ease.outQuart(p / .28) : 1 - smoothstep(.28, 1, p);
      const wind = p < .28 ? Ease.outQuad(p / .28) : 0;
      o.armRX = lerp(.6, -3.5, e) + wind * .5;
      o.armRZ = lerp(-.6, .55, e);
      o.foreRX = lerp(-1.9, -.15, e);
      o.chestY = lerp(.75, -.95, e);
      o.hipY = lerp(.35, -.45, e);
      o.spineZ = lerp(0, .18, e);
      o.armLX = lerp(-.2, -.9, e);
      o.armLZ = .5;
      o.thighLX = lerp(.15, -.25, e);
      o.thighRX = lerp(-.15, .3, e);
    } else if (combo === 1) {
      const e = p < .26 ? Ease.outQuart(p / .26) : 1 - smoothstep(.26, 1, p);
      o.armRX = lerp(.3, -1.5, e);
      o.armRZ = lerp(-.4, 1.75, e);
      o.foreRX = lerp(-1.6, -.3, e);
      o.chestY = lerp(.5, 1.15, e);
      o.hipY = lerp(.25, .6, e);
      o.spineX = lerp(-.05, .12, e);
      o.armLX = lerp(0, .7, e); o.armLZ = .9;
    } else {
      // 突刺
      const e = p < .32 ? Ease.outExpo(p / .32) : 1 - smoothstep(.32, 1, p);
      o.armRX = lerp(-1.2, -2.05, e);
      o.armRZ = lerp(.2, -.05, e);
      o.foreRX = lerp(-1.5, .05, e);
      o.spineX = lerp(.05, .38, e);
      o.chestX = lerp(0, .18, e);
      o.hipY = lerp(.1, -.14, e);
      o.thighLX = lerp(0, -.42, e);
    }
  }

  /* 蓄力回旋斩 */
  function spinPose(o, p) {
    const charge = clamp01(p / .55);
    const swing = smoothstep(.55, 1, p);
    o.rootY = -0.05 - charge * .12;
    o.spineZ = charge * .35;
    o.armRX = -2.2 + charge * .8;
    o.armRZ = 1.4 - charge * .5;
    o.foreRX = -1.2;
    o.armLX = -1.9 + charge * .6;
    o.armLZ = -1.0;
    o.hipY = 0;
    o.thighLX = .1; o.thighRX = -.1;
  }
  function spinSwing(o, p) {
    o.hipY = p * TAU * 2.2;
    o.armRX = -1.7; o.armRZ = 1.5 - p * .2;
    o.foreRX = -.1;
    o.armLX = -1.5; o.armLZ = -1.3;
    o.spineX = .12;
    o.thighLX = -.2; o.thighRX = .2;
    o.shinLX = .3; o.shinRX = .3;
  }

  /* 拉弓 */
  function bowPose(o, p) {
    o.armLX = -1.62; o.armLZ = .28;
    o.foreLX = -.10;
    o.armRX = lerp(-1.1, -1.35, p); o.armRZ = lerp(-.4, -.95, p);
    o.foreRX = lerp(-.6, -1.85, p);
    o.chestY = -.42; o.spineY = -.16;
    o.headY = -.25; o.headX = -.05;
    o.thighLX = .12; o.thighRX = -.16;
    o.shinLX = .1;
  }

  /* 盾反 / 后跳 */
  function blockPose(o) {
    o.armLX = -1.05; o.armLZ = .95; o.foreLX = -1.75;
    o.armRX = -.55; o.armRZ = -.55; o.foreRX = -1.1;
    o.spineX = .16; o.chestX = .08; o.headX = -.12;
    o.thighLX = .22; o.thighRX = -.1; o.shinLX = .2;
    o.rootY = -.06;
  }
  function hitPose(o, p) {
    const e = 1 - p;
    o.spineX = -.35 * e; o.headX = -.45 * e;
    o.armLX = -1.1 * e; o.armRX = -1.1 * e;
    o.armLZ = .8 * e; o.armRZ = -.8 * e;
    o.thighLX = .3 * e; o.thighRX = .3 * e;
    o.rootY = -.12 * e;
  }

  /* 寒冷颤抖 */
  function coldIdle(o, t) {
    const sh = sin(t * 9.2) * .035 + sin(t * 13.7) * .02;
    idlePose(o, t);
    o.spineX += sh * 1.2; o.chestX -= sh;
    o.armLX += sh * 2.0; o.armRX += sh * 2.0;
    o.armLZ -= .38; o.armRZ += .38;
    o.foreLX -= .9; o.foreRX -= .9;
    o.headX -= .12;
  }

  /* 待机 */
  function idlePose(o, t) {
    const br = sin(t * 1.35) * .5 + .5;
    o.rootY = br * .012;
    o.spineX = -.02 + br * .02;
    o.chestX = br * .022;
    o.chestZ = sin(t * .85) * .015;
    o.armLX = -.04 + sin(t * 1.1) * .03;
    o.armRX = -.04 - sin(t * 1.1) * .03;
    o.armLZ = .10; o.armRZ = -.10;
    o.foreLX = -.14; o.foreRX = -.14;
    o.thighLX = .02; o.thighRX = -.02;
    o.headY = sin(t * .37) * .22;
    o.headX = sin(t * .53) * .06;
    o.hipY = sin(t * .29) * .06;
  }

  /* 蹲伏 */
  function crouchPose(o, moving, t) {
    const s = moving ? sin(t) : 0;
    o.rootY = -.42;
    o.spineX = .42; o.chestX = .18; o.headX = -.45;
    o.thighLX = 1.05 + s * .25; o.thighRX = 1.05 - s * .25;
    o.shinLX = -1.5 - max(0, s) * .2; o.shinRX = -1.5 - max(0, -s) * .2;
    o.footLX = .5; o.footRX = .5;
    o.armLX = -.5; o.armRX = -.5;
    o.armLZ = .32; o.armRZ = -.32;
    o.foreLX = -1.1; o.foreRX = -1.1;
  }

  /* 下落 */
  function fallPose(o, t) {
    o.armLX = -2.2; o.armRX = -2.2;
    o.armLZ = .55; o.armRZ = -.55;
    o.foreLX = -.6; o.foreRX = -.6;
    o.thighLX = .5; o.thighRX = -.42;
    o.shinLX = -.7; o.shinRX = -.25;
    o.spineX = -.12; o.chestX = .1; o.headX = -.2;
  }
  function jumpPose(o, t, rising) {
    o.armLX = -1.5; o.armRX = -1.5;
    o.armLZ = .6; o.armRZ = -.6;
    o.foreLX = -.4; o.foreRX = -.4;
    o.thighLX = rising ? .85 : .35; o.thighRX = rising ? .55 : -.3;
    o.shinLX = rising ? -1.3 : -.5; o.shinRX = -.3;
    o.spineX = rising ? .22 : -.1;
  }

  /* 拾取 / 食用 */
  function pickPose(o, p) {
    const down = sin(clamp01(p) * PI);
    o.spineX = down * .95;
    o.chestX = down * .3;
    o.headX = -down * .5;
    o.armRX = -down * 1.15; o.armRZ = -down * .3;
    o.foreRX = -down * .7;
    o.thighLX = down * .8; o.thighRX = down * .8;
    o.shinLX = -down * .7; o.shinRX = -down * .7;
    o.rootY = -down * .35;
  }
  function eatPose(o, p) {
    o.armRX = -1.5; o.armRZ = -.55; o.foreRX = -2.0 + sin(p * PI * 3) * .35;
    o.armLX = -.3; o.armLZ = .2;
    o.headX = -.14 + sin(p * PI * 3) * .1;
    o.spineX = .06;
  }

  /* ---------- 对外 ---------- */
  const _t2 = {};
  function update(dt, st) {
    // st: {state, speed, moving, t, ...}
    const t = st.t;
    const o = T;
    resetPose(o);
    switch (st.state) {
      case 'walk': locomotion(o, st.phase, st.speed, false); break;
      case 'run': locomotion(o, st.phase, st.speed, true); break;
      case 'climb': climbPose(o, st.phase, st.moving); break;
      case 'climbIdle': climbPose(o, st.phase, false); break;
      case 'glide': glidePose(o, t); break;
      case 'swim': swimPose(o, st.phase, st.moving); break;
      case 'crouch': crouchPose(o, st.moving, st.phase); break;
      case 'fall': fallPose(o, t); break;
      case 'jump': jumpPose(o, t, st.rising); break;
      case 'attack0': case 'attack1': case 'attack2':
        attackPose(o, st.p, st.state === 'attack1' ? 1 : (st.state === 'attack2' ? 2 : 0));
        break;
      case 'spinCharge': spinPose(o, st.p); break;
      case 'spin': spinSwing(o, st.p); break;
      case 'bow': bowPose(o, st.p); break;
      case 'block': blockPose(o); break;
      case 'parry': blockPose(o); o.spineZ = -.35 * sin(st.p * PI); break;
      case 'hit': hitPose(o, st.p); break;
      case 'pick': pickPose(o, st.p); break;
      case 'eat': eatPose(o, st.p); break;
      case 'dead': break;
      case 'cold': coldIdle(o, t); break;
      default: idlePose(o, t);
    }
    // 状态过渡（快速插值，但攻击类用较硬的手感）
    const hard = st.state.indexOf('attack') === 0 || st.state === 'spin' || st.state === 'parry';
    const k = hard ? 22 : 12;
    for (const key of JKEYS) J[key] = damp(J[key], T[key], k, dt);
    applyPose(J);

    // 眨眼
    blinkTimer -= dt;
    if (blinkTimer <= 0) { blinkTimer = 2.4 + Math.random() * 4; blink = 1; }
    blink = max(0, blink - dt * 7);
    const eyeL = B.head.getObjectByName('eye1'), eyeR = B.head.getObjectByName('eye-1');
    if (eyeL) { eyeL.scale.y = 1.05 * (1 - blink * .92); eyeR.scale.y = 1.05 * (1 - blink * .92); }
  }

  function setGlider(v) { if (glider) glider.visible = v; }
  function setWeapon(name) {
    equipment.sword = name;
    if (sword) sword.visible = !!name && name !== 'none';
  }
  function setShield(name) { if (shield) shield.visible = !!name && name !== 'none'; }

  /** 拔剑到手上 / 收回背后 */
  function weaponInHand(inHand) {
    if (!sword) return;
    if (inHand) {
      B.handR.add(sword);
      sword.position.set(0, -.06, 0);
      sword.rotation.set(PI * .5, 0, 0);
    } else {
      B.chest.add(sword);
      sword.position.set(-.10, .16, -.20);
      sword.rotation.set(0, 0, PI * .72);
    }
  }
  function shieldInHand(inHand) {
    if (!shield) return;
    if (inHand) {
      B.foreL.add(shield);
      shield.position.set(0, -.14, .07);
      shield.rotation.set(PI * .5, 0, 0);
      shield.scale.setScalar(.9);
    } else {
      B.chest.add(shield);
      shield.position.set(.09, .10, -.24);
      shield.rotation.set(0, 0, PI * .2);
      shield.scale.setScalar(1);
    }
  }

  function init() {
    CharMat.init();
    build();
    applyPose(J);
    return group;
  }

  return {
    init, update, setGlider, setWeapon, setShield, weaponInHand, shieldInHand,
    group: () => group, bones: B, pose: J,
  };
})();
