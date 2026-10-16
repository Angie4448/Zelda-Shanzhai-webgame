/* =========================================================================
   65_enemies.js — 敌人：波克布林 / 丘丘 / 蝙蝠 / 蜥蜴战士 / 独眼巨人 /
   守护者 / 莱尼尔 / 章鱼怪 —— 群体 AI、巡逻、警戒、战斗、掉落
   ========================================================================= */

const EnemyMgr = (() => {
  let scene;
  const _v1 = new THREE.Vector3();
  const list = [];
  const camps = [];
  const projectiles = [];
  const MAT = {};
  const TIERS = {
    1: { hp: 13, dmg: 5, color: 0xb5462f, name: '红色', rupee: 1 },
    2: { hp: 26, dmg: 9, color: 0x2f6fd0, name: '蓝色', rupee: 5 },
    3: { hp: 45, dmg: 14, color: 0x2b2b33, name: '黑色', rupee: 20 },
    4: { hp: 80, dmg: 20, color: 0xd8d8de, name: '白银', rupee: 50 },
  };

  function mkMats() {
    MAT.body = (c) => new THREE.MeshStandardMaterial({
      map: TexGen.M.skin().map, color: c, roughness: .78, metalness: 0,
    });
    MAT.cloth = MatLib.std(TexGen.M.cloth(), { roughness: .9, color: 0x6b5a3a });
    MAT.horn = MatLib.std(TexGen.M.bone(), { roughness: .6 });
    MAT.metal = MatLib.std(TexGen.M.metal(), { roughness: .35, metalness: .8 });
    MAT.eye = new THREE.MeshStandardMaterial({ color: 0xffe07a, emissive: 0xffaa33, emissiveIntensity: 1.4, roughness: .3 });
    MAT.eyeBlue = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x35c8ff, emissiveIntensity: 1.6, roughness: .3 });
    MAT.chuchu = (c) => new THREE.MeshPhysicalMaterial({
      color: c, roughness: .12, metalness: 0, transmission: 0, clearcoat: 1, clearcoatRoughness: .12,
      emissive: c, emissiveIntensity: .12,
    });
    MAT.sheikahM = MatLib.std(TexGen.M.sheikahMetal(), { roughness: .45, metalness: .75, color: 0x3a4550 });
    MAT.dark = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: .6 });
  }

  /* ---------- 通用敌人骨架（刚性部件） ---------- */
  function buildHumanoid(cfg) {
    const g = new THREE.Group();
    const B = {};
    const bm = MAT.body(cfg.color);
    const scale = cfg.scale || 1;
    B.hips = new THREE.Object3D(); B.hips.position.y = 0.78 * scale; g.add(B.hips);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(.18 * scale, 12, 10), bm);
    pelvis.scale.set(1, .85, .9); B.hips.add(pelvis);
    B.spine = new THREE.Object3D(); B.hips.add(B.spine);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(.26 * scale, 14, 12), bm);
    torso.position.y = .22 * scale; torso.scale.set(1, 1.05, .84); B.spine.add(torso);
    B.chest = new THREE.Object3D(); B.chest.position.y = .44 * scale; B.spine.add(B.chest);
    // 腰布
    const loin = new THREE.Mesh(new THREE.CylinderGeometry(.24 * scale, .26 * scale, .22 * scale, 10), MAT.cloth);
    loin.position.y = .04 * scale; B.hips.add(loin);
    B.head = new THREE.Object3D(); B.head.position.y = .16 * scale; B.chest.add(B.head);
    // 头：长鼻 + 尖耳
    const head = new THREE.Mesh(new THREE.SphereGeometry(.20 * scale, 14, 12), bm);
    head.position.y = .12 * scale; head.scale.set(1, .95, 1.05); B.head.add(head);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(.075 * scale, .10 * scale, .26 * scale, 8), bm);
    snout.position.set(0, .07 * scale, .19 * scale); snout.rotation.x = PI * .5; B.head.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(.07 * scale, 8, 6), bm);
    nose.position.set(0, .07 * scale, .32 * scale); B.head.add(nose);
    for (const s of [1, -1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(.055 * scale, .19 * scale, 6), bm);
      ear.position.set(s * .19 * scale, .13 * scale, -.02 * scale);
      ear.rotation.z = s * -1.2; B.head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.036 * scale, 8, 6), MAT.eye);
      eye.position.set(s * .085 * scale, .15 * scale, .15 * scale); B.head.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(.08 * scale, .02 * scale, .02 * scale), MAT.dark);
      brow.position.set(s * .085 * scale, .195 * scale, .16 * scale);
      brow.rotation.z = s * .25; B.head.add(brow);
      // 角
      if (cfg.horns) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(.035 * scale, .22 * scale, 6), MAT.horn);
        h.position.set(s * .12 * scale, .28 * scale, 0);
        h.rotation.z = s * .5; B.head.add(h);
      }
    }
    // 发辫
    const mane = new THREE.Mesh(new THREE.CylinderGeometry(.035 * scale, .02 * scale, .22 * scale, 6), MAT.dark);
    mane.position.set(0, .18 * scale, -.20 * scale); mane.rotation.x = .9; B.head.add(mane);

    // 手臂
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      B['sh' + side] = new THREE.Object3D();
      B['sh' + side].position.set(s * .30 * scale, .40 * scale, 0);
      B.chest.add(B['sh' + side]);
      B['arm' + side] = new THREE.Object3D(); B['sh' + side].add(B['arm' + side]);
      const ua = new THREE.Mesh(new THREE.CylinderGeometry(.075 * scale, .06 * scale, .34 * scale, 8), bm);
      ua.position.y = -.17 * scale; B['arm' + side].add(ua);
      B['fore' + side] = new THREE.Object3D(); B['fore' + side].position.y = -.34 * scale; B['arm' + side].add(B['fore' + side]);
      const fa = new THREE.Mesh(new THREE.CylinderGeometry(.06 * scale, .05 * scale, .30 * scale, 8), bm);
      fa.position.y = -.15 * scale; B['fore' + side].add(fa);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(.065 * scale, 8, 6), bm);
      hand.position.y = -.32 * scale; B['fore' + side].add(hand);
      B['hand' + side] = hand;
      const pauld = new THREE.Mesh(new THREE.SphereGeometry(.11 * scale, 10, 8), MAT.cloth);
      pauld.scale.set(1, .8, 1); B['sh' + side].add(pauld);
    }
    // 腿
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      B['thigh' + side] = new THREE.Object3D();
      B['thigh' + side].position.set(s * .12 * scale, -.06 * scale, 0);
      B.hips.add(B['thigh' + side]);
      const th = new THREE.Mesh(new THREE.CylinderGeometry(.085 * scale, .07 * scale, .38 * scale, 8), bm);
      th.position.y = -.19 * scale; B['thigh' + side].add(th);
      B['shin' + side] = new THREE.Object3D(); B['shin' + side].position.y = -.38 * scale; B['thigh' + side].add(B['shin' + side]);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(.07 * scale, .055 * scale, .34 * scale, 8), bm);
      sh.position.y = -.17 * scale; B['shin' + side].add(sh);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(.13 * scale, .07 * scale, .24 * scale), bm);
      foot.position.set(0, -.36 * scale, .05 * scale); B['shin' + side].add(foot);
      B['foot' + side] = B['shin' + side];
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { group: g, B, scale };
  }

  function buildChuchu(color) {
    const g = new THREE.Group();
    const B = {};
    const body = new THREE.Mesh(new THREE.SphereGeometry(.42, 18, 14), MAT.chuchu(color));
    body.position.y = .42; body.scale.set(1, .88, 1);
    g.add(body); B.body = body;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.075, 8, 6), MAT.dark);
    eye.position.set(0, .62, .34); g.add(eye);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { group: g, B, scale: 1 };
  }

  function buildKeese(color) {
    const g = new THREE.Group(); const B = {};
    const body = new THREE.Mesh(new THREE.SphereGeometry(.19, 10, 8), MAT.body(color));
    body.scale.set(1, .9, 1.25); g.add(body); B.body = body;
    B.wingL = new THREE.Object3D(); B.wingL.position.set(.14, .04, 0); body.add(B.wingL);
    B.wingR = new THREE.Object3D(); B.wingR.position.set(-.14, .04, 0); body.add(B.wingR);
    const wg = new THREE.PlaneGeometry(.52, .24);
    const wL = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x2a2230, side: THREE.DoubleSide, roughness: .8 }));
    wL.position.x = .26; B.wingL.add(wL);
    const wR = new THREE.Mesh(wg, wL.material);
    wR.position.x = -.26; wR.rotation.y = PI; B.wingR.add(wR);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), MAT.eye);
    eye.position.set(0, .04, .2); g.add(eye);
    return { group: g, B, scale: 1 };
  }

  function buildGuardian() {
    const g = new THREE.Group(); const B = {};
    const body = new THREE.Mesh(new THREE.SphereGeometry(.9, 16, 12), MAT.sheikahM);
    body.position.y = 1.5; g.add(body); B.body = body;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.5, 14, 12, 0, TAU, 0, PI * .62), MAT.sheikahM);
    head.position.y = 2.0; g.add(head);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff5030 }));
    eye.position.set(0, 2.0, .45); g.add(eye); B.eye = eye;
    B.legs = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + .3;
      const leg = new THREE.Object3D();
      leg.position.set(cos(a) * .7, 1.35, sin(a) * .7);
      g.add(leg);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(.13, .1, 1.1, 6), MAT.sheikahM);
      upper.position.set(cos(a) * .5, -.2, sin(a) * .5);
      upper.rotation.z = cos(a) * -.9; upper.rotation.x = sin(a) * .9;
      leg.add(upper);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(.1, .05, 1.3, 6), MAT.sheikahM);
      lower.position.set(cos(a) * 1.15, -1.0, sin(a) * 1.15);
      lower.rotation.z = cos(a) * -.55; lower.rotation.x = sin(a) * .55;
      leg.add(lower);
      B.legs.push(leg);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { group: g, B, scale: 1 };
  }

  function buildOcto() {
    const g = new THREE.Group(); const B = {};
    const body = new THREE.Mesh(new THREE.SphereGeometry(.55, 14, 12), MAT.body(0xc8703a));
    body.position.y = .45; body.scale.set(1, 1.15, 1); g.add(body); B.body = body;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), MAT.eye);
    eye.position.set(0, .72, .45); g.add(eye);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.08, .04, .5, 6), MAT.body(0xa85a2c));
      t.position.set(cos(a) * .45, .18, sin(a) * .45);
      t.rotation.z = cos(a) * .8; t.rotation.x = -sin(a) * .8;
      g.add(t);
    }
    return { group: g, B, scale: 1 };
  }

  /* ---------- 敌人实例 ---------- */
  class Enemy {
    constructor(type, x, z, tier) {
      this.type = type;
      this.tier = tier || 1;
      this.hpMax = 20; this.hp = 20; this.dmg = 5;
      this.speed = 3.4; this.radius = .5; this.height = 1.8;
      this.state = 'idle';
      this.t = 0; this.phase = Math.random() * 10;
      this.vy = 0; this.y = terrainHeight(x, z);
      this.pos = new THREE.Vector3(x, this.y, z);
      this.vel = new THREE.Vector3();
      this.yaw = Math.random() * TAU;
      this.target = null;
      this.attackCd = 0; this.stagger = 0; this.alertT = 0;
      this.homeX = x; this.homeZ = z;
      this.dead = false; this.deadT = 0;
      this.aggro = false;
      this.build();
    }

    build() {
      const t = this.tier;
      const T = TIERS[t] || TIERS[1];
      let rig;
      if (this.type === 'bokoblin') {
        rig = buildHumanoid({ color: T.color, scale: 1.0, horns: t >= 3 });
        this.hpMax = T.hp; this.dmg = T.dmg; this.speed = 3.6 + t * .25;
        this.radius = .55; this.height = 1.7;
      } else if (this.type === 'moblin') {
        rig = buildHumanoid({ color: T.color, scale: 1.62, horns: true });
        this.hpMax = T.hp * 2.2; this.dmg = T.dmg * 1.6; this.speed = 3.0 + t * .2;
        this.radius = .95; this.height = 2.9;
      } else if (this.type === 'lizal') {
        rig = buildHumanoid({ color: 0x4f8a3a, scale: 1.05, horns: false });
        this.hpMax = T.hp * 1.3; this.dmg = T.dmg * 1.2; this.speed = 4.6 + t * .4;
        this.radius = .5; this.height = 1.8;
      } else if (this.type === 'chuchu') {
        rig = buildChuchu(this.elemColor());
        this.hpMax = T.hp * .7; this.dmg = T.dmg * .6; this.speed = 2.4;
        this.radius = .5; this.height = .85;
      } else if (this.type === 'keese') {
        rig = buildKeese(0x40304a);
        this.hpMax = max(4, T.hp * .35); this.dmg = max(2, T.dmg * .4); this.speed = 6.5;
        this.radius = .35; this.height = .5;
      } else if (this.type === 'guardian') {
        rig = buildGuardian();
        this.hpMax = 240; this.dmg = 22; this.speed = 2.6;
        this.radius = 1.5; this.height = 3.0;
      } else if (this.type === 'octo') {
        rig = buildOcto();
        this.hpMax = T.hp * .8; this.dmg = T.dmg * .7; this.speed = 1.2;
        this.radius = .7; this.height = 1.0;
      } else if (this.type === 'lynel') {
        rig = buildHumanoid({ color: T.color, scale: 1.75, horns: true });
        this.hpMax = T.hp * 5; this.dmg = T.dmg * 2.4; this.speed = 5.6;
        this.radius = 1.1; this.height = 3.1;
      }
      this.rig = rig;
      this.group = rig.group;
      this.group.position.copy(this.pos);
      scene.add(this.group);
      this.hp = this.hpMax;

      // 武器
      this.weapon = null;
      if (this.type === 'bokoblin' || this.type === 'moblin' || this.type === 'lizal' || this.type === 'lynel') {
        const kind = Math.random();
        const wg = new THREE.Group();
        if (kind < .5) {
          const club = new THREE.Mesh(new THREE.CylinderGeometry(.07, .11, 1.2, 7), MAT.horn);
          club.position.y = .6; wg.add(club);
          const head2 = new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 8), MAT.horn);
          head2.position.y = 1.2; head2.scale.y = 1.5; wg.add(head2);
        } else if (kind < .8) {
          const sp = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 2.2, 6), MAT.metal);
          sp.position.y = 1.1; wg.add(sp);
          const tip = new THREE.Mesh(new THREE.ConeGeometry(.09, .3, 6), MAT.metal);
          tip.position.y = 2.3; wg.add(tip);
        } else {
          const sw = new THREE.Mesh(new THREE.BoxGeometry(.11, 1.35, .03), MAT.metal);
          sw.position.y = .95; wg.add(sw);
          const gd = new THREE.Mesh(new THREE.BoxGeometry(.3, .06, .07), MAT.metal);
          gd.position.y = .28; wg.add(gd);
        }
        wg.rotation.x = -PI * .5;
        this.rig.B.handR.add(wg);
        this.weapon = wg;
      }
      if (this.type === 'guardian') { /* 激光眼 */ }
    }

    elemColor() {
      const c = [0x62c8e8, 0xe85a3a, 0xd8e05a, 0x8f6fd0, 0x6fe0a0];
      return c[(Math.random() * c.length) | 0];
    }

    /** 简化的人形动画 */
    animate(dt) {
      const B = this.rig.B;
      const sc = this.rig.scale;
      if (!B.hips) return;
      const moving = this.vel.lengthSq() > 0.4;
      const t = this.t;
      const sp = moving ? this.speed * .42 : 0;
      const s = sin(t * (moving ? this.speed * 0.9 : 1.2));
      const c = cos(t * (moving ? this.speed * 0.9 : 1.2));
      const A = moving ? .78 : 0;
      B.thighL.rotation.x = s * A;
      B.thighR.rotation.x = -s * A;
      B.shinL.rotation.x = max(0, -s) * A - (moving ? .25 : .05);
      B.shinR.rotation.x = max(0, s) * A - (moving ? .25 : .05);
      B.armL.rotation.x = -s * A * .8 - .15;
      B.armR.rotation.x = s * A * .8 - .15;
      B.armL.rotation.z = .22; B.armR.rotation.z = -.22;
      B.foreL.rotation.x = -.5; B.foreR.rotation.x = -.35;
      B.hips.position.y = (0.78 + abs(c) * (moving ? .06 : .012)) * sc;
      B.spine.rotation.x = moving ? .12 : (sin(t * 1.3) * .03);
      B.head.rotation.y = sin(t * .7 + this.phase) * .25;
      // 攻击动作
      if (this.state === 'attack' && this.atkT < .55) {
        const p = this.atkT / .55;
        const e = p < .5 ? Ease.outQuad(p * 2) : 1 - (p - .5) * 2;
        B.armR.rotation.x = -2.4 * e;
        B.spine.rotation.x = .3 * e;
        B.armL.rotation.x = -1.0 * e;
      }
      if (this.state === 'stagger') {
        B.spine.rotation.x = -.4 * (this.stagger / .5);
        B.armL.rotation.x = -1.2 * (this.stagger / .5);
        B.armR.rotation.x = -1.2 * (this.stagger / .5);
      }
    }

    update(dt, player, world) {
      this.t += dt;
      if (this.dead) {
        this.deadT += dt;
        const p = clamp01(this.deadT / .9);
        this.group.rotation.z = lerp(0, PI * .46, Ease.outQuad(p));
        this.group.position.y = this.y - p * .25;
        if (this.deadT > 3.0) {
          this.group.position.y -= dt * 1.4;
          this.group.scale.setScalar(max(0.001, 1 - (this.deadT - 3.0) * .9));
        }
        if (this.deadT > 4.2) this.remove = true;
        return;
      }
      if (this.stagger > 0) {
        this.stagger -= dt;
        this.state = 'stagger';
      }
      this.attackCd = max(0, this.attackCd - dt);

      const toP = _v1.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
      const dist = toP.length();

      // 感知
      const sight = this.type === 'guardian' ? 70 : (this.type === 'lynel' ? 36 : 22);
      if (dist < sight && !player.dead) {
        // 视线（简化：不看遮挡）
        this.aggro = true; this.alertT = 2.5;
      }
      if (this.aggro && dist > sight * 1.8) { this.aggro = false; }

      if (this.aggro) {
        this.target = player;
        const want = toP.clone().normalize();
        // 保持在攻击距离
        const desired = this.type === 'guardian' ? 26 :
          (this.type === 'octo' ? 16 : (this.type === 'keese' ? 3.5 : 1.8 + this.radius));
        let mv = 0;
        if (dist > desired + .5) mv = 1;
        else if (dist < desired - 2.5) mv = -1;

        this.vel.x = damp(this.vel.x, want.x * this.speed * mv, 5, dt);
        this.vel.z = damp(this.vel.z, want.z * this.speed * mv, 5, dt);
        this.yaw = dampAngle(this.yaw, atan2(want.x, want.z), 8, dt);

        // 攻击
        if (this.attackCd <= 0 && this.state !== 'attack' && this.stagger <= 0) {
          if (this.type === 'guardian') {
            if (dist < 40 && dist > 6) this.startAttack(2.6);
          } else if (this.type === 'octo' || this.type === 'keese') {
            if (dist < (this.type === 'keese' ? 6 : 26)) this.startAttack(1.6);
          } else if (dist < 2.4 + this.radius * 2) {
            this.startAttack(.9);
          }
        }
      } else {
        // 巡逻 / 返回营地
        if (this.patrolT === undefined) { this.patrolT = 0; this.patrolDir = Math.random() * TAU; }
        this.patrolT -= dt;
        if (this.patrolT <= 0) { this.patrolT = 2 + Math.random() * 4; this.patrolDir = Math.random() * TAU; }
        const dHome = hypot(this.pos.x - this.homeX, this.pos.z - this.homeZ);
        const dir = dHome > 26 ? atan2(this.homeX - this.pos.x, this.homeZ - this.pos.z) : this.patrolDir;
        const walk = dHome > 26 ? 1 : .45;
        this.vel.x = damp(this.vel.x, sin(dir) * this.speed * walk, 2, dt);
        this.vel.z = damp(this.vel.z, cos(dir) * this.speed * walk, 2, dt);
        this.yaw = dampAngle(this.yaw, dir, 3, dt);
      }

      if (this.state === 'attack') {
        this.atkT += dt;
        const dur = this.atkDur || .9;
        // 命中判定
        if (!this.didHit && this.atkT > dur * .45) {
          this.didHit = true;
          this.resolveAttack(player, world);
        }
        if (this.atkT >= dur) { this.state = 'idle'; this.didHit = false; }
        this.vel.multiplyScalar(.25);
      }
      if (this.stagger > 0) this.vel.multiplyScalar(.15);

      // 移动积分（贴地 + 简单墙体）
      const nx = this.pos.x + this.vel.x * dt;
      const nz = this.pos.z + this.vel.z * dt;
      const gh = terrainHeight(nx, nz);
      const cur = terrainHeight(this.pos.x, this.pos.z);
      const step = gh - cur;
      if (step < 1.6 || this.type === 'keese') {
        this.pos.x = nx; this.pos.z = nz;
      } else {
        this.vel.multiplyScalar(.4);
      }
      this.y = terrainHeight(this.pos.x, this.pos.z);

      // 飞行单位
      if (this.type === 'keese') {
        this.hover = (this.hover || 2.4);
        this.pos.y = this.y + this.hover + sin(this.t * 2.2) * .3;
      } else {
        this.pos.y = this.y;
      }

      this.group.position.copy(this.pos);
      this.group.rotation.y = this.yaw;

      if (this.rig.B.hips) this.animate(dt);
      else if (this.type === 'chuchu') {
        const sq = 1 + sin(this.t * 3.2 + this.phase) * .07;
        this.rig.B.body.scale.set(1 / sq, .88 * sq, 1 / sq);
      } else if (this.type === 'keese') {
        const f = sin(this.t * 16) * .7;
        this.rig.B.wingL.rotation.z = f; this.rig.B.wingR.rotation.z = -f;
      }
      this.updateType(dt, player);
    }

    updateType(dt, player) {
      if (this.type === 'guardian') {
        const e = this.rig.B.eye;
        const dist = this.pos.distanceTo(player.pos);
        const charged = this.aggro;
        e.material.color.setHex(charged ? 0xff3010 : 0x66aaff);
        e.scale.setScalar(charged ? 1 + sin(this.t * 12) * .18 : 1);
        // 腿部起伏
        for (let i = 0; i < this.rig.B.legs.length; i++) {
          const L = this.rig.B.legs[i];
          L.rotation.y = sin(this.t * 3 + i * 1.05) * .12;
        }
        if (this.beam) {
          this.beam.t += dt;
          if (this.beam.t > 0.55) { this.beam.mesh.geometry.dispose(); scene.remove(this.beam.mesh); this.beam = null; }
          else { this.beam.mesh.material.opacity = .85 * (1 - this.beam.t / .55); }
        }
      }
      if (this.type === 'octo') {
        if (this.state === 'attack' && this.atkT > this.atkDur * .5 && !this.didHit) {
          this.didHit = true;
          spawnProjectile('rock', this.pos.x, this.pos.y + .8, this.pos.z,
            _v1.copy(player.pos).sub(this.pos).normalize().multiplyScalar(24),
            8, this.dmg);
        }
      }
      if (this.type === 'keese' && this.state === 'attack' && this.atkT > this.atkDur * .5 && !this.didHit) {
        this.didHit = true;
        if (this.pos.distanceTo(player.pos) < 2.2) player.hurt(this.dmg, this.pos);
      }
      if ((this.type === 'lizal' || this.type === 'lynel') && this.state === 'attack' && this.atkT > this.atkDur * .5 && !this.didHit) {
        this.didHit = true;
        // 火焰吐息 / 冲击波
        if (Math.random() < .4) {
          spawnProjectile('fire', this.pos.x, this.pos.y + 1.2, this.pos.z,
            _v1.copy(player.pos).sub(this.pos).setY(0).normalize().multiplyScalar(26),
            6, this.dmg * .8);
        }
      }
    }

    startAttack(dur) {
      this.state = 'attack';
      this.atkT = 0; this.atkDur = dur; this.didHit = false;
    }

    resolveAttack(player, world) {
      if (this.type === 'guardian') {
        // 充能激光：从眼睛射向玩家，命中为窄锥判定
        const from = new THREE.Vector3(this.pos.x, this.pos.y + 2.0, this.pos.z);
        const dir = new THREE.Vector3().subVectors(player.pos, from);
        const len = dir.length();
        dir.normalize();
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.30, .16, len, 8, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xff5020, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }));
        mesh.position.copy(from).addScaledVector(dir, len * .5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        scene.add(mesh);
        this.beam = { mesh, t: 0 };
        const l = new THREE.PointLight(0xff6020, 4, 40, 2);
        l.position.copy(from); scene.add(l); mesh.add(l); l.position.set(0, 0, 0);
        // 判定
        if (len < 90) player.hurt(this.dmg, this.pos, 'laser');
        FX.puff(from, 0xff7a30, 1.6);
        return;
      }
      const d = this.pos.distanceTo(player.pos);
      const reach = (this.type === 'lynel' ? 3.6 : (this.type === 'moblin' ? 3.0 : 2.4));
      if (d < reach + this.radius) {
        // 玩家在正面锥内？
        const fx = sin(this.yaw), fz = cos(this.yaw);
        const tx = player.pos.x - this.pos.x, tz = player.pos.z - this.pos.z;
        const dot = (tx * fx + tz * fz) / max(1e-4, hypot(tx, tz));
        if (dot > .1) player.hurt(this.dmg, this.pos);
      }
    }

    damage(amount, srcPos, kind) {
      if (this.dead) return 0;
      const crit = Math.random() < .12;
      const dmg = amount * (crit ? 2 : 1);
      this.hp -= dmg;
      this.aggro = true;
      this.stagger = Math.min(.5, .18 + dmg * .006);
      FX.hitSpark(new THREE.Vector3(this.pos.x, this.pos.y + this.height * .6, this.pos.z), crit);
      if (this.hp <= 0) { this.die(srcPos); return dmg; }
      // 击退
      if (srcPos) {
        const dx = this.pos.x - srcPos.x, dz = this.pos.z - srcPos.z;
        const l = hypot(dx, dz) || 1;
        const push = clamp(1.4 + dmg * .03, 1.4, 7) * (this.type === 'guardian' || this.type === 'lynel' ? .25 : 1);
        this.vel.x += dx / l * push; this.vel.z += dz / l * push;
      }
      return { dmg, crit };
    }

    die(srcPos) {
      this.dead = true; this.deadT = 0;
      FX.puff(new THREE.Vector3(this.pos.x, this.pos.y + this.height * .5, this.pos.z),
        this.type === 'chuchu' ? 0x8fd0ff : 0x3a2a22, this.type === 'guardian' ? 3 : 1.2);
      Game.onEnemyKilled(this);
      if (this.beam) { scene.remove(this.beam.mesh); this.beam = null; }
    }
  }

  /* ---------- 投射物 ---------- */
  function spawnProjectile(kind, x, y, z, vel, dmg, dmg2) {
    let mesh;
    if (kind === 'arrow') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .8, 5), MAT.metal);
      mesh.rotation.x = PI * .5;
    } else if (kind === 'rock') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), MAT.horn);
    } else if (kind === 'fire') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8030 }));
      const l = new THREE.PointLight(0xff7030, 2.0, 14, 2);
      mesh.add(l);
    } else if (kind === 'beam') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 60, 8),
        new THREE.MeshBasicMaterial({ color: 0xff5020, transparent: true, opacity: .9, blending: THREE.AdditiveBlending }));
    } else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), MAT.eye);
    }
    mesh.position.set(x, y, z);
    scene.add(mesh);
    projectiles.push({
      mesh, kind, vel: vel.clone(), life: kind === 'beam' ? .1 : 4.0,
      dmg: dmg, grav: kind === 'rock' ? 20 : (kind === 'arrow' ? 8 : 2),
    });
  }

  function updateProjectiles(dt, player) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      p.vel.y -= p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.kind === 'arrow' || p.kind === 'fire') {
        p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
      }
      const d = p.mesh.position.distanceTo(player.pos);
      if (d < 1.2 && !player.dead) {
        player.hurt(p.dmg, p.mesh.position, p.kind);
        p.life = -1;
      }
      const gy = terrainHeight(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.y < gy || p.life <= 0) {
        if (p.kind === 'fire') FX.puff(p.mesh.position, 0xff7a30, .8);
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
      }
    }
  }

  /* ---------- 营地与世界生成 ---------- */
  function makeCamp(x, z) {
    const tier = Math.random() < .5 ? 1 : (Math.random() < .68 ? 2 : 3);
    const n = 2 + (Math.random() * 4 | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = 3 + Math.random() * 9;
      const ex = x + cos(a) * d, ez = z + sin(a) * d;
      if (terrainHeight(ex, ez) < SEA + 1) continue;
      add(new Enemy('bokoblin', ex, ez, Math.random() < .25 ? min(4, tier + 1) : tier));
    }
    if (Math.random() < .3) add(new Enemy('moblin', x + 2, z + 2, tier));
    // 营地篝火
    Props.buildCampfire(x, z, false);
    camps.push({ x, z, cleared: false });
  }

  function add(e) { list.push(e); }

  function spawnNear(px, pz, dt) {
    // 已有敌人数量控制
    let alive = 0;
    for (const e of list) if (!e.dead) alive++;
    if (alive > 46) return;
    if (Math.random() > dt * 0.42) return;
    const a = Math.random() * TAU;
    const d = 90 + Math.random() * 90;
    const x = px + cos(a) * d, z = pz + sin(a) * d;
    if (abs(x) > 3200 || abs(z) > 3200) return;
    const y = terrainHeight(x, z);
    if (y < SEA + 1) return;
    const clim = climateAt(x, z);
    const r = Math.random();
    let type = 'bokoblin';
    if (clim === 'snow') type = r < .4 ? 'bokoblin' : (r < .7 ? 'lizal' : 'keese');
    else if (clim === 'volcano') type = r < .4 ? 'lizal' : (r < .7 ? 'bokoblin' : 'chuchu');
    else if (clim === 'desert') type = r < .45 ? 'lizal' : (r < .75 ? 'bokoblin' : 'octo');
    else if (clim === 'jungle') type = r < .35 ? 'lizal' : (r < .6 ? 'bokoblin' : (r < .85 ? 'keese' : 'chuchu'));
    else type = r < .55 ? 'bokoblin' : (r < .7 ? 'keese' : (r < .85 ? 'chuchu' : 'lizal'));
    const tier = 1 + (Math.random() < .35 ? 1 : 0) + (Math.random() < .12 ? 1 : 0);
    add(new Enemy(type, x, z, min(3, tier)));
  }

  function init(sc) {
    scene = sc;
    mkMats();
    // 初始营地
    const rnd = new Rand(20260814);
    for (let i = 0; i < (CFG.lite ? 10 : 70); i++) {
      const x = rnd.f(-2800, 2800), z = rnd.f(-2800, 2800);
      const y = terrainHeight(x, z);
      if (y < SEA + 2 || terrainSlope(x, z, 4) > .9) continue;
      makeCamp(x, z);
    }
    // 守护者
    for (let i = 0; i < (CFG.lite ? 2 : 16); i++) {
      const x = rnd.f(-2600, 2600), z = rnd.f(-2600, 2600);
      const y = terrainHeight(x, z);
      if (y < SEA + 2) continue;
      add(new Enemy('guardian', x, z, 1));
    }
    // 莱尼尔
    for (let i = 0; i < (CFG.lite ? 1 : 6); i++) {
      const x = rnd.f(-2400, 2400), z = rnd.f(-2400, 2400);
      const y = terrainHeight(x, z);
      if (y < SEA + 3 || terrainSlope(x, z, 6) > .7) continue;
      add(new Enemy('lynel', x, z, rnd.i(2, 3)));
    }
  }

  function update(dt, player) {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      const d = hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d > 620) {
        // 远处休眠
        if (!e.dead) { e.group.visible = false; continue; }
      }
      e.group.visible = true;
      if (d > 900) { scene.remove(e.group); list.splice(i, 1); continue; }
      e.update(dt, player);
      if (e.remove) { scene.remove(e.group); list.splice(i, 1); }
    }
    updateProjectiles(dt, player);
    spawnNear(player.pos.x, player.pos.z, dt);
  }

  /** 查询近处的敌人并造成伤害 */
  function applyDamage(center, radius, dmg, knockDir, kind) {
    let hits = 0, total = 0;
    for (const e of list) {
      if (e.dead) continue;
      const d = hypot(e.pos.x - center.x, e.pos.z - center.z);
      const dy = abs(e.pos.y + e.height * .5 - center.y);
      if (d < radius + e.radius && dy < e.height) {
        const r = e.damage(dmg, knockDir, kind);
        hits++; total += (typeof r === 'object' ? r.dmg : r);
      }
    }
    return { hits, total };
  }

  function nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const e of list) {
      if (e.dead) continue;
      const d = hypot(e.pos.x - x, e.pos.z - z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  return {
    init, update, add, applyDamage, nearest, spawnProjectile,
    list: () => list, TIERS,
  };
})();
