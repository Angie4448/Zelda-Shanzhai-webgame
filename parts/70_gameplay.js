/* =========================================================================
   70_gameplay.js — 特效 / 玩家控制器 / 体力与攀爬滑翔 / 战斗 / 符文 /
   神庙与塔 / 料理 / 温度 / 存档 —— 整个游戏循环
   ========================================================================= */

/* =========================================================================
   FX — 粒子与特效
   ========================================================================= */
const FX = (() => {
  let scene;
  const parts = [];
  let dustMesh, rainMesh, snowMesh;
  const RAIN_N = 2600, SNOW_N = 2200;
  const rainData = [], snowData = [];

  const texSoft = () => TexGen.C.radial('rgba(255,255,255,.9)', 'rgba(255,255,255,0)', 64, 1.8);
  let softTex;

  function init(sc) {
    scene = sc;
    softTex = texSoft();

    // 雨
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(RAIN_N * 3);
    for (let i = 0; i < RAIN_N; i++) {
      rainData.push({ x: (Math.random() - .5) * 60, y: Math.random() * 30, z: (Math.random() - .5) * 60, v: 26 + Math.random() * 16 });
      pos[i * 3] = rainData[i].x; pos[i * 3 + 1] = rainData[i].y; pos[i * 3 + 2] = rainData[i].z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rainMesh = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xa8c8e8, size: .10, transparent: true, opacity: .55, depthWrite: false,
      sizeAttenuation: true,
    }));
    rainMesh.frustumCulled = false; rainMesh.visible = false;
    scene.add(rainMesh);

    // 雪
    const sgeo = new THREE.BufferGeometry();
    const spos = new Float32Array(SNOW_N * 3);
    for (let i = 0; i < SNOW_N; i++) {
      snowData.push({ x: (Math.random() - .5) * 70, y: Math.random() * 30, z: (Math.random() - .5) * 70, v: .8 + Math.random() * 1.4, ph: Math.random() * 10 });
      spos[i * 3] = snowData[i].x; spos[i * 3 + 1] = snowData[i].y; spos[i * 3 + 2] = snowData[i].z;
    }
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    snowMesh = new THREE.Points(sgeo, new THREE.PointsMaterial({
      map: softTex, color: 0xffffff, size: .34, transparent: true, opacity: .85,
      depthWrite: false, sizeAttenuation: true, alphaTest: .05,
    }));
    snowMesh.frustumCulled = false; snowMesh.visible = false;
    scene.add(snowMesh);
  }

  /** 一次性粒子爆发 */
  function burst(pos, opt) {
    const n = opt.count || 10;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const v = [];
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      v.push(new THREE.Vector3(
        (Math.random() - .5) * (opt.spread || 3),
        Math.random() * (opt.up || 3) + (opt.upBias || 0),
        (Math.random() - .5) * (opt.spread || 3)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = opt.map
      ? new THREE.PointsMaterial({ map: opt.map, color: opt.color, size: opt.size || .3, transparent: true, depthWrite: false, blending: opt.additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true })
      : new THREE.PointsMaterial({ color: opt.color, size: opt.size || .15, transparent: true, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    parts.push({ pts, v, life: opt.life || .8, t: 0, grav: opt.grav === undefined ? 9 : opt.grav, drag: opt.drag || .92 });
  }

  function hitSpark(pos, crit) {
    burst(pos, {
      count: crit ? 18 : 10, color: crit ? 0xffe66a : 0xffffff, size: crit ? .22 : .15,
      spread: crit ? 6 : 4, up: crit ? 5 : 3, additive: true, life: .35, grav: 6,
    });
  }
  function puff(pos, color, scale) {
    burst(pos, {
      count: 14, color: color, size: .5 * (scale || 1), spread: 2.4 * (scale || 1),
      up: 2.4 * (scale || 1), map: softTex, life: 1.0, grav: -0.6, drag: .93,
    });
  }
  function splash(pos) {
    burst(pos, {
      count: 16, color: 0xcfeaff, size: .22, spread: 3, up: 4.5, additive: false,
      life: .6, grav: 12, map: softTex,
    });
  }
  function dust(pos) {
    burst(pos, {
      count: 7, color: 0xb8a888, size: .3, spread: 1.4, up: 1.0, map: softTex,
      life: .7, grav: 1.5, drag: .9,
    });
  }

  function update(dt, camPos, env) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      const a = p.pts.geometry.attributes.position.array;
      for (let k = 0; k < p.v.length; k++) {
        const v = p.v[k];
        v.y -= p.grav * dt;
        v.multiplyScalar(p.drag);
        a[k * 3] += v.x * dt; a[k * 3 + 1] += v.y * dt; a[k * 3 + 2] += v.z * dt;
      }
      p.pts.geometry.attributes.position.needsUpdate = true;
      const alpha = 1 - p.t / p.life;
      p.pts.material.opacity = clamp01(alpha);
      if (p.t >= p.life) {
        scene.remove(p.pts); p.pts.geometry.dispose(); p.pts.material.dispose();
        parts.splice(i, 1);
      }
    }

    // 雨
    const rainAmt = clamp01(env.rain);
    rainMesh.visible = rainAmt > .02;
    if (rainMesh.visible) {
      const a = rainMesh.geometry.attributes.position.array;
      for (let i = 0; i < RAIN_N; i++) {
        const d = rainData[i];
        d.y -= d.v * dt;
        d.x += 3.4 * dt;
        if (d.y < -2) { d.y = 28 + Math.random() * 8; d.x = (Math.random() - .5) * 60; d.z = (Math.random() - .5) * 60; }
        a[i * 3] = camPos.x + d.x; a[i * 3 + 1] = camPos.y + d.y - 14; a[i * 3 + 2] = camPos.z + d.z;
      }
      rainMesh.geometry.attributes.position.needsUpdate = true;
      rainMesh.material.opacity = .5 * rainAmt;
    }
    // 雪
    const snowAmt = clamp01(env.snow);
    snowMesh.visible = snowAmt > .02;
    if (snowMesh.visible) {
      const t = performance.now() * .001;
      const a = snowMesh.geometry.attributes.position.array;
      for (let i = 0; i < SNOW_N; i++) {
        const d = snowData[i];
        d.y -= d.v * dt;
        if (d.y < -3) { d.y = 30 + Math.random() * 8; d.x = (Math.random() - .5) * 70; d.z = (Math.random() - .5) * 70; }
        a[i * 3] = camPos.x + d.x + sin(t * .8 + d.ph) * 1.2;
        a[i * 3 + 1] = camPos.y + d.y - 15;
        a[i * 3 + 2] = camPos.z + d.z + cos(t * .7 + d.ph) * 1.2;
      }
      snowMesh.geometry.attributes.position.needsUpdate = true;
      snowMesh.material.opacity = .8 * snowAmt;
    }
  }

  return { init, update, burst, hitSpark, puff, splash, dust };
})();

/* =========================================================================
   Game — 全局状态
   ========================================================================= */
const Game = (() => {
  const G = {
    hearts: 3, maxHearts: 3, quarters: 0,
    stamina: 1, maxStamina: 1, extraStamina: 0,
    rupees: 0, orbs: 0,
    weapons: [], bows: [], shields: [], armors: [], materials: [], foods: [], keyItems: [],
    equipped: { weapon: -1, bow: -1, shield: -1, armor: -1 },
    shrinesDone: new Set(), towersDone: new Set(), chestsOpened: new Set(),
    playtime: 0, deaths: 0, kills: 0,
    quest: { title: '', text: '' },
    started: false, ended: false,
    difficulty: 1,
  };

  const ITEM_DB = {
    // 武器
    branch: { n: '树枝', ic: '🌿', atk: 2, dur: 8, kind: 'weapon', d: '旅者随手折下的树枝。' },
    club: { n: '波克棒', ic: '🏏', atk: 6, dur: 16, kind: 'weapon', d: '波克布林粗制的木棒。' },
    bokoClub: { n: '波克棍', ic: '🔨', atk: 8, dur: 20, kind: 'weapon' },
    soldierSword: { n: '士兵之剑', ic: '⚔️', atk: 12, dur: 26, kind: 'weapon' },
    knightSword: { n: '骑士之剑', ic: '🗡️', atk: 18, dur: 30, kind: 'weapon' },
    royalSword: { n: '王族之剑', ic: '⚔️', atk: 30, dur: 36, kind: 'weapon' },
    bokoSpear: { n: '波克枪', ic: '🔱', atk: 9, dur: 22, kind: 'weapon' },
    guardianSword: { n: '守护者之剑++', ic: '🟠', atk: 40, dur: 44, kind: 'weapon' },
    masterSword: { n: '大师之剑', ic: '✨', atk: 30, dur: 999, kind: 'weapon', d: '退魔之剑。' },
    lynelSword: { n: '莱尼尔之剑', ic: '🗡️', atk: 58, dur: 40, kind: 'weapon' },
    // 弓
    woodBow: { n: '木弓', ic: '🏹', atk: 4, dur: 20, kind: 'bow' },
    soldierBow: { n: '士兵之弓', ic: '🏹', atk: 11, dur: 28, kind: 'bow' },
    royalBow: { n: '王族之弓', ic: '🏹', atk: 22, dur: 34, kind: 'bow' },
    lynelBow: { n: '莱尼尔之弓', ic: '🏹', atk: 32, dur: 40, kind: 'bow' },
    // 盾
    potLid: { n: '锅盖', ic: '🛡', def: 2, dur: 8, kind: 'shield' },
    woodShield: { n: '木盾', ic: '🛡', def: 6, dur: 16, kind: 'shield' },
    soldierShield: { n: '士兵之盾', ic: '🛡', def: 14, dur: 24, kind: 'shield' },
    hylianShield: { n: '海利亚盾', ic: '🛡', def: 90, dur: 800, kind: 'shield' },
    // 防具
    warmDoublet: { n: '防寒服', ic: '🧥', def: 3, kind: 'armor', warm: 2 },
    climberGear: { n: '攀登者头巾', ic: '🧣', def: 3, kind: 'armor', climb: .35 },
    zoraArmor: { n: '佐拉铠甲', ic: '🐟', def: 3, kind: 'armor', swim: .4 },
    flamebreaker: { n: '耐火服', ic: '🔥', def: 3, kind: 'armor', heat: 2 },
    snowquill: { n: '雪羽服', ic: '🪶', def: 3, kind: 'armor', warm: 2 },
    barbarian: { n: '蛮族盔甲', ic: '🦴', def: 3, kind: 'armor', atk: 1.5 },
    // 素材
    apple: { n: '苹果', ic: '🍎', kind: 'material', heal: 1 },
    mushroom: { n: '蘑菇', ic: '🍄', kind: 'material', heal: 1 },
    meat: { n: '生肉', ic: '🥩', kind: 'material', heal: 1 },
    pepper: { n: '辣椒', ic: '🌶️', kind: 'material', warm: 1 },
    fish: { n: '鲜鱼', ic: '🐟', kind: 'material', heal: 1 },
    hyruleHerb: { n: '海拉鲁草', ic: '🌿', kind: 'material' },
    silentPrincess: { n: '静默公主', ic: '🌸', kind: 'material', stealth: 1 },
    bokoHorn: { n: '波克布林之角', ic: '🦴', kind: 'material', price: 5 },
    bokoFang: { n: '波克布林之牙', ic: '🦷', kind: 'material', price: 8 },
    chuchuJelly: { n: '丘丘胶', ic: '🟡', kind: 'material', price: 6 },
    ancientScrew: { n: '古代螺丝', ic: '🔩', kind: 'material', price: 12 },
    octorokTentacle: { n: '章鱼触手', ic: '🐙', kind: 'material', price: 6 },
    lynelHorn: { n: '莱尼尔之角', ic: '🐂', kind: 'material', price: 60 },
    starFragment: { n: '星星碎片', ic: '⭐', kind: 'material', price: 200 },
    flint: { n: '打火石', ic: '🪨', kind: 'material' },
    wood: { n: '木材', ic: '🪵', kind: 'material' },
    // 料理
    cookedMeat: { n: '烤肉', ic: '🍖', kind: 'food', heal: 3 },
    cookedFish: { n: '烤鱼', ic: '🐠', kind: 'food', heal: 2 },
    spicyMeat: { n: '辛辣烤肉', ic: '🍖', kind: 'food', heal: 3, warm: 2 },
    heartyStew: { n: '丰盛炖菜', ic: '🥘', kind: 'food', heal: 8 },
    elixir: { n: '精力药', ic: '🧪', kind: 'food', stamina: 1 },
    dubiousFood: { n: '奇怪的料理', ic: '🍲', kind: 'food', heal: .25 },
    // 重要
    slate: { n: '希卡之石', ic: '📱', kind: 'key', d: '古代希卡族的技术结晶。' },
    paraglider: { n: '滑翔伞', ic: '🪂', kind: 'key', d: '老人的遗物。' },
    spiritOrb: { n: '试炼之证', ic: '🔮', kind: 'key' },
    // 符文
    rune_magnesis: { n: '磁力', ic: '⌘', kind: 'rune' },
    rune_stasis: { n: '静止器', ic: '⏸', kind: 'rune' },
    rune_cryonis: { n: '制冰器', ic: '❄', kind: 'rune' },
    rune_bomb: { n: '炸弹', ic: '💣', kind: 'rune' },
  };

  function inv(tab) {
    switch (tab) {
      case 'weapon': return G.weapons;
      case 'bow': return G.bows;
      case 'shield': return G.shields;
      case 'armor': return G.armors;
      case 'material': return G.materials;
      case 'food': return G.foods;
      default: return G.keyItems;
    }
  }
  function addItem(tab, id, count) {
    const arr = inv(tab);
    const db = ITEM_DB[id] || { n: id, ic: '❔', kind: tab };
    if (db.kind === 'weapon' || db.kind === 'bow' || db.kind === 'shield') {
      for (let i = 0; i < (count || 1); i++) {
        arr.push({ id, dur: db.dur || 20, maxDur: db.dur || 20 });
        if (arr.length > 20) arr.shift();
      }
      return db;
    }
    let e = arr.find(a => a.id === id);
    if (!e) { e = { id, count: 0 }; arr.push(e); }
    e.count += (count || 1);
    return db;
  }
  function removeItem(tab, id, count) {
    const arr = inv(tab);
    const i = arr.findIndex(a => a.id === id);
    if (i < 0) return false;
    if (arr[i].count !== undefined) {
      arr[i].count -= (count || 1);
      if (arr[i].count <= 0) arr.splice(i, 1);
    } else arr.splice(i, 1);
    return true;
  }
  function countOf(tab, id) {
    const arr = inv(tab);
    let n = 0;
    for (const a of arr) if (a.id === id) n += (a.count || 1);
    return n;
  }
  function equippedItem(slot) {
    const tab = slot === 'weapon' ? 'weapon' : slot === 'bow' ? 'bow' : slot === 'shield' ? 'shield' : 'armor';
    const arr = inv(tab);
    const idx = G.equipped[slot];
    return (idx >= 0 && idx < arr.length) ? arr[idx] : null;
  }
  function equip(slot, idx) {
    G.equipped[slot] = idx;
    const it = equippedItem(slot);
    if (slot === 'weapon') {
      Link.setWeapon(it ? it.id : null);
      const def = it ? ITEM_DB[it.id] : null;
      if (def && def.atk > 20) Player.showToast('装备了 ' + def.n);
    } else if (slot === 'shield') Link.setShield(it ? it.id : null);
  }
  function healQ(n) {   // n 为心数（可小数）
    const total = G.maxHearts * 4;
    let cur = G.hearts * 4 + G.quarters;
    cur = min(total, cur + n * 4);
    G.hearts = floor(cur / 4); G.quarters = cur % 4;
  }
  function fullHeal() { G.hearts = G.maxHearts; G.quarters = 0; }
  function addOrb() {
    G.orbs++;
    if (G.orbs >= 4) { G.orbs -= 4; G.maxHearts += 1; G.hearts += 1; Player.showToast('心之容器 +1'); }
  }

  function onEnemyKilled(e) {
    G.kills++;
    const T = EnemyMgr.TIERS[e.tier] || { rupee: 1 };
    const rolls = [];
    if (e.type === 'bokoblin') { rolls.push(['material', 'bokoHorn', 1], ['material', 'bokoFang', 1]); }
    else if (e.type === 'moblin') { rolls.push(['material', 'bokoHorn', 2], ['material', 'bokoFang', 2]); }
    else if (e.type === 'chuchu') { rolls.push(['material', 'chuchuJelly', 1]); }
    else if (e.type === 'lizal') { rolls.push(['material', 'bokoFang', 1]); }
    else if (e.type === 'octo') { rolls.push(['material', 'octorokTentacle', 1]); }
    else if (e.type === 'guardian') { rolls.push(['material', 'ancientScrew', 2]); }
    else if (e.type === 'lynel') { rolls.push(['material', 'lynelHorn', 1]); }
    for (const [tab, id, n] of rolls) {
      if (Math.random() < .72) {
        addItem(tab, id, n);
        Player.showToast('获得 ' + (ITEM_DB[id].n) + ' ×' + n, ITEM_DB[id].ic);
      }
    }
    const r = 1 + floor(Math.random() * T.rupee * 3);
    G.rupees += r;
    // 武器掉落
    if (Math.random() < .35) {
      const pool = e.type === 'lynel' ? ['lynelSword', 'lynelBow'] :
        e.type === 'guardian' ? ['guardianSword'] :
          e.type === 'moblin' ? ['bokoClub', 'bokoSpear'] : ['club', 'branch', 'bokoClub', 'soldierSword'];
      const id = pool[(Math.random() * pool.length) | 0];
      addItem(ITEM_DB[id].kind === 'bow' ? 'bow' : 'weapon', id, 1);
      Player.showToast('掉落 ' + ITEM_DB[id].n, ITEM_DB[id].ic);
    }
  }

  function newGame() {
    G.hearts = 3; G.maxHearts = 3; G.quarters = 0;
    G.stamina = 1; G.maxStamina = 1; G.extraStamina = 0;
    G.rupees = 0; G.orbs = 0; G.kills = 0; G.deaths = 0; G.playtime = 0;
    G.weapons = []; G.bows = []; G.shields = []; G.armors = []; G.materials = []; G.foods = []; G.keyItems = [];
    G.shrinesDone = new Set(); G.towersDone = new Set(); G.chestsOpened = new Set();
    addItem('weapon', 'branch', 1);
    addItem('weapon', 'soldierSword', 1);
    addItem('bow', 'woodBow', 1);
    addItem('shield', 'potLid', 1);
    addItem('armor', 'warmDoublet', 1);
    addItem('key', 'slate', 1);
    addItem('key', 'paraglider', 1);
    addItem('material', 'apple', 3);
    addItem('material', 'mushroom', 2);
    G.equipped = { weapon: 1, bow: 0, shield: 0, armor: 0 };
    quest('苏醒', '离开复苏神庙，前往初始台地的希卡塔。');
  }

  function quest(title, text) {
    G.quest.title = title; G.quest.text = text;
    if (typeof UI !== 'undefined' && UI.setQuest) UI.setQuest(title, text);
  }

  function save() {
    const d = {
      hearts: G.hearts, maxHearts: G.maxHearts, quarters: G.quarters,
      stamina: G.stamina, maxStamina: G.maxStamina, extraStamina: G.extraStamina,
      rupees: G.rupees, orbs: G.orbs, kills: G.kills, playtime: G.playtime,
      weapons: G.weapons, bows: G.bows, shields: G.shields, armors: G.armors,
      materials: G.materials, foods: G.foods, keyItems: G.keyItems,
      equipped: G.equipped,
      shrinesDone: [...G.shrinesDone], towersDone: [...G.towersDone], chestsOpened: [...G.chestsOpened],
      pos: [Player.pos.x, Player.pos.y, Player.pos.z],
      time: Env.E.time, day: Env.E.day,
    };
    try { localStorage.setItem('botw3save', JSON.stringify(d)); return true; }
    catch (e) { return false; }
  }
  function load() {
    try {
      const raw = localStorage.getItem('botw3save');
      if (!raw) return false;
      const d = JSON.parse(raw);
      Object.assign(G, {
        hearts: d.hearts, maxHearts: d.maxHearts, quarters: d.quarters,
        stamina: d.stamina, maxStamina: d.maxStamina, extraStamina: d.extraStamina,
        rupees: d.rupees, orbs: d.orbs, kills: d.kills, playtime: d.playtime,
        weapons: d.weapons, bows: d.bows, shields: d.shields, armors: d.armors,
        materials: d.materials, foods: d.foods, keyItems: d.keyItems,
        equipped: d.equipped,
        shrinesDone: new Set(d.shrinesDone), towersDone: new Set(d.towersDone),
        chestsOpened: new Set(d.chestsOpened),
      });
      Env.E.time = d.time || 7.6; Env.E.day = d.day || 1;
      if (d.pos) Player.teleport(d.pos[0], d.pos[2]);
      return true;
    } catch (e) { return false; }
  }
  const hasSave = () => !!localStorage.getItem('botw3save');

  return {
    G, ITEM_DB, inv, addItem, removeItem, countOf, equippedItem, equip,
    healQ, fullHeal, addOrb, onEnemyKilled, newGame, quest, save, load, hasSave,
  };
})();

/* =========================================================================
   Player — 林克控制器
   ========================================================================= */
const Player = (() => {
  const P = {
    pos: new THREE.Vector3(0, 0, 0),
    vel: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    onGround: true, swimming: false, climbing: false, gliding: false,
    crouching: false, sprinting: false, dead: false,
    stamina: 1, maxStamina: 1, extra: 0,
    state: 'idle', phase: 0,
    hp: 3, maxHp: 3,
    action: null, actionT: 0, actionDur: 0,
    iframes: 0, invuln: 0,
    camYaw: 0, camPitch: -0.22, camDist: 6.2, camDistTarget: 6.2,
    aiming: false, blocking: false, chargeT: 0, comboIdx: 0, comboT: 0,
    flurry: 0, flurryT: 0,
    runes: [], currentRune: 0,
    temperature: 18, coldLv: 0, heatLv: 0,
    wet: 0, climbSlip: 0,
    noise: 0,
    lastDust: 0, lastFoot: 0,
    shrineTarget: null,
    inShrine: null,
    camera: null,
    attached: null, stasisTargets: [], bombs: [], iceBlocks: [],
  };
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  let scene, camera, group;
  let prompt = null;
  const keys = {};
  const mouse = { dx: 0, dy: 0, left: false, right: false };
  let lastPromptTarget = null;

  const GRAV = 26;
  const WALK = 3.4, RUN = 6.4, SPRINT = 9.2, SWIM = 3.4, CLIMB = 2.1;
  const EYE = 1.55;

  /* ---------- 初始化 ---------- */
  function init(sc, cam) {
    scene = sc; camera = cam;
    group = Link.init();
    scene.add(group);
    teleport(SPAWN.x, SPAWN.z);
    P.yaw = PI; P.camYaw = PI; P.camPitch = -0.16;   // 面向复苏神庙
    P.hp = Game.G.hearts; P.maxHp = Game.G.maxHearts;
    P.runes = ['magnesis', 'stasis', 'cryonis', 'bomb'];
    P.currentRune = 0;
    UI.setRune(P.runes[0]);
    bindInput();
  }

  function bindInput() {
    const c = document.querySelector('#gl');
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    c.addEventListener('mousedown', e => {
      if (e.button === 0) mouse.left = true;
      if (e.button === 2) mouse.right = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) mouse.left = false;
      if (e.button === 2) mouse.right = false;
    });
    c.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement === c || (typeof UI !== 'undefined' && !UI.anyScreenOpen())) {
        mouse.dx += e.movementX || 0; mouse.dy += e.movementY || 0;
      }
    });
    c.addEventListener('click', () => { if (!UI.anyScreenOpen()) c.requestPointerLock && c.requestPointerLock(); });
    window.addEventListener('wheel', e => {
      P.camDistTarget = clamp(P.camDistTarget + e.deltaY * 0.006, 2.2, 14);
    }, { passive: true });
    window.addEventListener('resize', () => { });
  }

  function teleport(x, z) {
    P.pos.set(x, terrainHeight(x, z) + 0.1, z);
    P.vel.set(0, 0, 0);
    if (group) { group.position.copy(P.pos); }
    Env.forceEnv();
  }

  /* ---------- 提示 ---------- */
  function showToast(text, icon) {
    const el = document.getElementById('toasts');
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = (icon ? '<span style="margin-right:8px">' + icon + '</span>' : '') + text;
    el.appendChild(d);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, 2400);
  }
  function setPrompt(text) {
    const el = document.getElementById('prompt');
    if (!el) return;
    if (!text) { el.style.opacity = 0; return; }
    if (el.dataset.t === text) return;
    el.dataset.t = text;
    el.innerHTML = text;
    el.style.opacity = 1;
  }

  /* ---------- 伤害/死亡 ---------- */
  function hurt(amount, srcPos, kind) {
    if (P.iframes > 0 || P.dead || P.invuln > 0) return;
    // 盾牌格挡
    if (P.blocking && srcPos) {
      const fx = sin(P.yaw), fz = cos(P.yaw);
      const tx = srcPos.x - P.pos.x, tz = srcPos.z - P.pos.z;
      const dot = (tx * fx + tz * fz) / max(1e-4, hypot(tx, tz));
      if (dot > .3) {
        const sh = Game.equippedItem('shield');
        const def = sh ? (Game.ITEM_DB[sh.id].def || 5) : 2;
        FX.hitSpark(_v.set(P.pos.x + fx * 1, P.pos.y + 1.2, P.pos.z + fz * 1), false);
        SND.play('shieldBlock');
        if (P.parryWindow > 0) { P.parrySuccess = 1; Game.G.stamina = min(1, Game.G.stamina + .1); }
        sh.dur = max(0, sh.dur - 1);
        if (sh.dur <= 0) { Game.removeItem('shield', sh.id); showToast('盾牌损毁了'); }
        P.vel.x -= fx * 6; P.vel.z -= fz * 6;
        P.iframes = 0.35;
        return;
      }
    }
    const dmg = amount / 4;   // 转成心
    Game.healQ(-dmg);
    P.hp = Game.G.hearts;
    P.iframes = 0.9;
    P.damageFlash = 1;
    SND.play('hurt');
    UI.vignette('vDmg', 0.85, 500);
    if (srcPos) {
      const dx = P.pos.x - srcPos.x, dz = P.pos.z - srcPos.z;
      const l = hypot(dx, dz) || 1;
      P.vel.x += dx / l * 7; P.vel.z += dz / l * 7;
      P.vel.y = max(P.vel.y, 4);
      P.onGround = false;
    }
    setState('hit', .45);
    if (Game.G.hearts <= 0) die();
  }

  function die() {
    P.dead = true;
    Game.G.deaths++;
    setState('dead', 9999);
    UI.showDeath();
    setTimeout(() => {
      P.dead = false;
      Game.fullHeal();
      const s = SPAWN;
      teleport(s.x, s.z);
      UI.hideDeath();
      setState('idle', 0);
    }, 3200);
  }

  /* ---------- 状态 ---------- */
  function setState(name, dur) {
    if (P.action && P.action !== 'hit' && name === 'hit' && P.actionT < P.actionDur * .5) return;
    P.state = name;
    P.action = ['attack0', 'attack1', 'attack2', 'spin', 'spinCharge', 'bow', 'pick', 'eat', 'parry'].indexOf(name) >= 0 ? name : null;
    P.actionT = 0;
    P.actionDur = dur || 0;
  }
  const busy = () => P.action !== null && P.actionT < P.actionDur;

  /* ---------- 攻击 ---------- */
  function attack() {
    if (busy() || P.dead) return;
    if (P.climbing) { P.climbing = false; P.vel.y = 3; return; }
    const w = Game.equippedItem('weapon');
    if (!w) { showToast('没有可用的武器'); return; }
    const def = Game.ITEM_DB[w.id];
    P.comboIdx = (P.comboT > 0) ? (P.comboIdx + 1) % 3 : 0;
    P.comboT = 0.75;
    setState('attack' + P.comboIdx, 0.62);
    P.attackDone = false;
    P.attackDmg = def.atk;
    Link.weaponInHand(true);
    Link.shieldInHand(false);
    SND.play('swing');
  }

  function resolveSwing() {
    if (P.attackDone) return;
    P.attackDone = true;
    const fx = sin(P.yaw), fz = cos(P.yaw);
    const c = _v.set(P.pos.x + fx * 1.2, P.pos.y + 1.0, P.pos.z + fz * 1.2);
    const res = EnemyMgr.applyDamage(c, 2.0, P.attackDmg, P.pos, 'slash');
    if (res.hits) {
      SND.play('hit');
      SND.play('hitFlesh');
      UI.hitMarker();
    }
    // 砍树 / 草丛
    tryCut(c, 1.8);
    const w = Game.equippedItem('weapon');
    if (w && w.id !== 'masterSword') {
      w.dur = max(0, w.dur - 1);
      if (w.dur <= 0) { showToast(def_n(w.id) + ' 损毁了'); Game.removeItem('weapon', w.id); Link.setWeapon(null); }
    }
  }
  const def_n = id => (Game.ITEM_DB[id] ? Game.ITEM_DB[id].n : id);

  function tryCut(c, r) {
    // 砍草
    FX.dust(_v2.copy(c).setY(c.y - 1));
  }

  function shootArrow() {
    const b = Game.equippedItem('bow');
    if (!b) return;
    const def = Game.ITEM_DB[b.id];
    const dir = _v.set(0, 0, -1).applyEuler(new THREE.Euler(P.pitch, P.yaw, 0, 'YXZ'));
    const start = _v2.set(P.pos.x, P.pos.y + 1.4, P.pos.z).addScaledVector(dir, .6);
    EnemyMgr.spawnProjectile('arrow', start.x, start.y, start.z,
      dir.clone().multiplyScalar(72), def.atk * 1.6, 0);
    SND.play('bow');
    b.dur = max(0, b.dur - 1);
    if (b.dur <= 0) { showToast(def_n(b.id) + ' 损毁了'); Game.removeItem('bow', b.id); }
  }

  /* ---------- 符文 ---------- */
  function useRune() {
    const r = P.runes[P.currentRune];
    if (!r) return;
    if (r === 'magnesis') {
      if (P.attached) { P.attached = null; showToast('松开磁力'); return; }
      // 找最近的金属物体（用敌人/宝箱半径粗判）
      const t = EnemyMgr.nearest(P.pos.x, P.pos.z, 18);
      if (t && (t.type === 'guardian')) { P.attached = t; showToast('磁力锁定'); SND.play('runeOn'); }
      else showToast('附近没有可吸附的金属');
    } else if (r === 'stasis') {
      const t = EnemyMgr.nearest(P.pos.x, P.pos.z, 22);
      if (t) { t.stasisT = 6; t.frozen = true; FX.burst(t.pos.clone().setY(t.pos.y + 1), { count: 20, color: 0xffe066, size: .3, additive: true, spread: 3, up: 3, life: .8 }); showToast('静止器：锁定 ' + Math.round(6 * 10) / 10 + ' 秒'); SND.play('runeOn'); }
      else showToast('附近没有目标');
    } else if (r === 'cryonis') {
      const dir = _v.set(sin(P.yaw), 0, cos(P.yaw));
      const tx = P.pos.x + dir.x * 4, tz = P.pos.z + dir.z * 4;
      const h = terrainHeight(tx, tz);
      if (h < SEA + .2) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(2, 3.2, 2),
          new THREE.MeshPhysicalMaterial({ color: 0x9fd8f0, roughness: .1, metalness: 0, transparent: true, opacity: .82, transmission: .6, thickness: 1 }));
        g.position.set(tx, SEA + 1.6, tz);
        scene.add(g);
        P.iceBlocks.push({ mesh: g, t: 0 });
        showToast('制冰器：生成冰柱'); SND.play('ice');
      } else showToast('必须在水中使用');
    } else if (r === 'bomb') {
      const dir = _v.set(sin(P.yaw), 0, cos(P.yaw));
      const g = new THREE.Mesh(new THREE.SphereGeometry(.42, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x2a3a44, metalness: .6, roughness: .4, emissive: 0x1a5a6a, emissiveIntensity: .8 }));
      g.position.set(P.pos.x + dir.x * 2, P.pos.y + 1.2, P.pos.z + dir.z * 2);
      g.castShadow = true;
      scene.add(g);
      const l = new THREE.PointLight(0x40e0ff, 1.4, 10, 2);
      g.add(l);
      P.bombs.push({ mesh: g, t: 0, fuse: 2.4, vy: 3 });
      showToast('炸弹已放置'); SND.play('bombDrop');
    }
  }

  /* ---------- 交互 ---------- */
  function interact() {
    if (P.pendingInteract) { P.pendingInteract(); P.pendingInteract = null; }
  }

  /* ---------- 主更新 ---------- */
  function update(dt, t) {
    // 输入 → 相机
    const sens = 0.0022;
    if (!UI.anyScreenOpen()) {
      P.camYaw -= mouse.dx * sens;
      P.camPitch = clamp(P.camPitch - mouse.dy * sens, -1.35, 1.1);
    }
    mouse.dx = 0; mouse.dy = 0;

    if (P.dead) { Link.update(dt, { state: 'dead', t }); group.position.copy(P.pos); updateCamera(dt); return; }

    P.iframes = max(0, P.iframes - dt);
    P.damageFlash = max(0, (P.damageFlash || 0) - dt * 1.6);
    P.comboT = max(0, P.comboT - dt);
    P.parryWindow = max(0, (P.parryWindow || 0) - dt);
    if (P.action) {
      P.actionT += dt;
      if (P.actionT >= P.actionDur) {
        if (P.action === 'attack0' || P.action === 'attack1' || P.action === 'attack2') {
          Link.weaponInHand(false);
        }
        P.action = null; P.state = 'idle';
      }
    }

    /* ---- 移动输入 ---- */
    let ix = 0, iz = 0;
    if (keys['KeyW']) iz -= 1;
    if (keys['KeyS']) iz += 1;
    if (keys['KeyA']) ix -= 1;
    if (keys['KeyD']) ix += 1;
    const inputLen = hypot(ix, iz);
    if (inputLen > 0) { ix /= inputLen; iz /= inputLen; }
    P.crouching = !!keys['ControlLeft'] || !!keys['KeyC'];
    const wantJump = !!keys['Space'];

    // 世界方向：相机前向 = (sin(camYaw), cos(camYaw))
    const cy = P.camYaw;
    const fx = sin(cy), fz = cos(cy);
    let mx = -iz * fx - ix * fz;
    let mz = -iz * fz + ix * fx;
    const ml = hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    P.moveInput = { x: mx, z: mz, len: inputLen };

    /* ---- 动作触发 ---- */
    P.aiming = !!keys['KeyF'] && !P.swimming && !P.climbing;
    if (P.aiming) Link.setGlider(false);

    if (mouse.left && !busy()) {
      if (P.aiming) shootArrow();
      else attack();
    }
    if (mouse.right && !busy() && !P.aiming) {
      if (!P.blocking) { P.blockT = 0; P.parryWindow = 0.22; }
      P.blocking = true;
      P.blockT = (P.blockT || 0) + dt;
      if (P.blockT > 0.22) P.parryWindow = 0;
      Link.shieldInHand(true);
    } else {
      if (P.blocking) { P.blocking = false; Link.shieldInHand(false); P.blockT = 0; }
    }
    if (keys['KeyE'] && !keys['_eHeld']) { keys['_eHeld'] = true; interact(); }
    if (!keys['KeyE']) keys['_eHeld'] = false;
    if (keys['Tab'] && !keys['_tabHeld']) { keys['_tabHeld'] = true; UI.openRuneWheel(); }
    if (!keys['Tab'] && keys['_tabHeld']) { keys['_tabHeld'] = false; UI.closeRuneWheel(); }
    if (keys['KeyQ'] && !keys['_qHeld']) { keys['_qHeld'] = true; if (P.runes.length) useRune(); }
    if (!keys['KeyQ']) keys['_qHeld'] = false;
    if (keys['KeyR'] && !keys['_rHeld']) {
      keys['_rHeld'] = true;
      P.currentRune = (P.currentRune + 1) % P.runes.length;
      UI.setRune(P.runes[P.currentRune]);
      showToast('符文：' + Game.ITEM_DB['rune_' + P.runes[P.currentRune]].n);
    }
    if (!keys['KeyR']) keys['_rHeld'] = false;
    if (keys['KeyZ'] && !keys['_zHeld']) { keys['_zHeld'] = true; SND.play('whistle'); showToast('吹口哨…'); }
    if (!keys['KeyZ']) keys['_zHeld'] = false;

    /* ---- 环境判定 ---- */
    const groundY = terrainHeight(P.pos.x, P.pos.z);
    const waterDepth = SEA - groundY;
    const inWaterBody = groundY < SEA - 0.4;
    const headUnder = inWaterBody && P.pos.y < SEA - 0.2;

    P.temperature = temperatureAt(P.pos.x, P.pos.z, P.pos.y);
    const armor = Game.equippedItem('armor');
    const def = armor ? Game.ITEM_DB[armor.id] : null;
    const warmBonus = def ? (def.warm || 0) * 8 : 0;
    const heatBonus = def ? (def.heat || 0) * 10 : 0;
    P.coldLv = clamp((0 - (P.temperature + warmBonus)) / 12, 0, 1);
    P.heatLv = clamp(((P.temperature - heatBonus) - 42) / 18, 0, 1);
    P.wet = Env.E.wetness;

    const nearFire = Props.fires.some(f => f.x && hypot(f.x - P.pos.x, f.z - P.pos.z) < 8);
    if (nearFire) { P.coldLv = 0; }

    /* ---- 状态机 ---- */
    let target = 'idle';
    const maxStam = 1 + Game.G.extraStamina * .2;
    P.maxStamina = maxStam;

    // 攀爬判定
    const wallInfo = detectWall(groundY);
    const wantClimb = P.climbing || (wallInfo && inputLen > 0.2 && !P.swimming && P.stamina > 0.02 &&
      (wantJump || true) && P.vel.y < 6 && !P.gliding);

    if (P.swimming) {
      // 游泳
      target = 'swim';
      P.stamina -= dt * 0.075 * (1 - (def && def.swim ? def.swim : 0));
      if (MouseOrKey('Space') && P.vel.y > -1) { }
      const sSpeed = SWIM * (1 + (def && def.swim ? def.swim : 0));
      P.vel.x = damp(P.vel.x, mx * sSpeed, 4, dt);
      P.vel.z = damp(P.vel.z, mz * sSpeed, 4, dt);
      P.vel.y = damp(P.vel.y, headUnder ? 1.8 : 0, 3, dt);
      if (headUnder) {
        P.stamina -= dt * 0.28;
        if (P.stamina <= 0) { P.hp = 0; Game.G.hearts = 0; die(); }
      }
      P.pos.y += P.vel.y * dt;
      P.pos.y = clamp(P.pos.y, SEA - 3.2, SEA + 0.9);
      if (P.onGround && P.pos.y < SEA - 2.0 && inputLen > 0) P.pos.y = SEA - 2.0;
      if (mx || mz) P.yaw = dampAngle(P.yaw, atan2(mx, mz), 6, dt);
      P.climbing = false; P.gliding = false;
      if (inputLen < .05) P.stamina = min(maxStam, P.stamina + dt * .12);
      Link.setGlider(false);
    } else if (P.climbing || (wallInfo && inputLen > .2 && P.stamina > .02 && !P.onGround)) {
      // 攀爬
      P.climbing = true;
      P.gliding = false;
      target = inputLen > .2 ? 'climb' : 'climbIdle';
      const slipMul = P.wet > .5 ? 2.4 : 1;
      P.stamina -= dt * 0.085 * slipMul * (1 - (def && def.climb ? def.climb : 0));
      if (P.wet > .5 && Math.random() < dt * 0.7) { P.climbing = false; P.vel.y = -2; }
      const climbSpeed = CLIMB * (1 + (def && def.climb ? def.climb : 0)) * (keys['ShiftLeft'] ? 1.6 : 1);
      P.pos.x += mx * climbSpeed * dt * .7;
      P.pos.z += mz * climbSpeed * dt * .7;
      const wantUp = iz < -0.2 || keys['Space'] || keys['KeyW'];
      P.vel.y = damp(P.vel.y, wantUp ? climbSpeed : (iz > 0.2 || keys['KeyS'] ? -climbSpeed : 0), 6, dt);
      P.pos.y += P.vel.y * dt;
      const gy = terrainHeight(P.pos.x, P.pos.z);
      if (P.pos.y < gy) { P.pos.y = gy; P.climbing = false; P.onGround = true; }
      // 登顶
      const topY = terrainHeight(P.pos.x, P.pos.z);
      if (P.pos.y >= topY - .05 && !wallInfo) { P.climbing = false; }
      if (P.yaw !== null && inputLen > 0) { /* 面壁 */ }
      if (P.stamina <= 0) { P.climbing = false; P.vel.y = -3; P.vel.x = -mx * 3; P.vel.z = -mz * 3; }
      Link.setGlider(false);
    } else if (P.gliding) {
      target = 'glide';
      P.stamina -= dt * 0.045;
      const sp = 11 + P.vel.y * -.4;
      P.vel.x = damp(P.vel.x, mx * 8, 1.4, dt);
      P.vel.z = damp(P.vel.z, mz * 8, 1.4, dt);
      P.vel.y = damp(P.vel.y, -3.2, 1.6, dt);
      if (P.stamina <= 0) { P.gliding = false; }
      Link.setGlider(true);
    } else {
      Link.setGlider(false);
      // 地面 / 空中
      const speedMul = P.crouching ? .45 : 1;
      const canSprint = keys['ShiftLeft'] && iz < -0.2 && !P.crouching && P.stamina > .02;
      P.sprinting = canSprint;
      let base = P.crouching ? WALK * .5 : (canSprint ? SPRINT : (inputLen > .2 ? (inputLen > .7 ? RUN : WALK) : 0));
      if (P.blocking) base *= .45;
      if (P.aiming) base *= .35;
      const accel = P.onGround ? 11 : 3.2;
      P.vel.x = damp(P.vel.x, mx * base, accel, dt);
      P.vel.z = damp(P.vel.z, mz * base, accel, dt);
      if (canSprint) P.stamina -= dt * 0.062;

      // 跳跃 / 滑翔
      if (wantJump && !keys['_spHeld']) {
        keys['_spHeld'] = true;
        if (P.onGround) { P.vel.y = 8.4; P.onGround = false; SND.play('jump'); FX.dust(P.pos.clone()); }
        else if (extraSlots() || Game.G.keyItems.some(k => k.id === 'paraglider')) {
          P.gliding = !P.gliding;
          if (P.gliding) SND.play('glider');
        }
      }
      if (!wantJump) keys['_spHeld'] = false;

      // 重力
      P.vel.y -= GRAV * dt;
      P.onGround = false;

      if (P.sprinting) target = 'run';
      else if (inputLen > .2) target = (P.sprinting ? 'run' : (P.crouching ? 'crouch' : (inputLen > .7 ? 'walk' : 'walk')));
      if (P.crouching) target = 'crouch';
      if (!P.onGround) target = (P.vel.y > 1 ? 'jump' : 'fall');
      if (inputLen < .05 && P.onGround) target = P.coldLv > .4 ? 'cold' : 'idle';
      if (P.aiming) target = 'bow';
      if (P.blocking && inputLen < .1) target = 'block';
    }

    /* ---- 物理积分 ---- */
    if (!P.swimming) {
      P.pos.x += P.vel.x * dt;
      P.pos.z += P.vel.z * dt;
      P.pos.y += P.vel.y * dt;
    } else {
      P.pos.x += P.vel.x * dt;
      P.pos.z += P.vel.z * dt;
    }

    resolveCollisions(dt);

    // 地面吸附
    if (!P.climbing) {
      const gy = terrainHeight(P.pos.x, P.pos.z);
      const inWater = gy < SEA - 0.35;
      if (!inWater) {
        if (P.pos.y <= gy + 0.05) {
          if (!P.onGround && P.vel.y < -12) { SND.play('land'); FX.dust(P.pos.clone()); }
          if (!P.onGround && P.vel.y < -18) hurt(6, null);
          P.pos.y = gy; P.vel.y = 0; P.onGround = true;
          P.gliding = false;
        } else P.onGround = false;
      } else {
        // 入水
        if (P.pos.y <= SEA + .1 && !P.swimming && P.vel.y < -1) {
          P.swimming = true; FX.splash(_v.copy(P.pos).setY(SEA)); SND.play('splash');
        }
        if (P.pos.y < gy) { P.pos.y = gy + .05; P.vel.y = 0; P.onGround = true; }
      }
      if (P.swimming && P.pos.y > SEA + 1.1 && gy > SEA - .3) P.swimming = false;
    }

    // 体力恢复
    const recovering = P.onGround && !P.sprinting && !P.climbing && !P.gliding && inputLen < .1;
    if (recovering && P.stamina < maxStam) P.stamina = min(maxStam, P.stamina + dt * .34);
    else if (!P.climbing && !P.gliding && !P.sprinting && P.stamina < maxStam && P.onGround)
      P.stamina = min(maxStam, P.stamina + dt * .08);
    P.stamina = clamp(P.stamina, 0, maxStam);
    Game.G.stamina = P.stamina / maxStam;

    /* ---- 温度伤害 ---- */
    P.tempTick = (P.tempTick || 0) + dt;
    if (P.coldLv > .55 || P.heatLv > .55) {
      if (P.tempTick > 3.0) {
        P.tempTick = 0;
        Game.healQ(-0.5);
        UI.vignette(P.coldLv > .55 ? 'vCold' : 'vHeat', .7, 900);
        SND.play('hurt');
        if (Game.G.hearts <= 0) { Game.G.hearts = 0; die(); }
      }
    }
    UI.setTemp(P.temperature, P.coldLv, P.heatLv);

    /* ---- 相机 ---- */
    if (P.aiming) P.camPitch = clamp(P.camPitch, -.6, .5);
    updateCamera(dt);

    /* ---- 角色朝向 ---- */
    if (!P.climbing && !P.aiming && !busy()) {
      if (P.swimming || inputLen > .2) {
        if (inputLen > .2) P.yaw = dampAngle(P.yaw, atan2(mx, mz), 10, dt);
      } else if (P.blocking || mouse.left) {
        P.yaw = dampAngle(P.yaw, P.camYaw, 12, dt);
      } else {
        P.yaw = dampAngle(P.yaw, P.camYaw, 4, dt);
      }
    }
    if (P.aiming) P.yaw = dampAngle(P.yaw, P.camYaw, 16, dt);
    if (P.climbing && wallInfo) P.yaw = dampAngle(P.yaw, atan2(-wallInfo.nx, -wallInfo.nz), 10, dt);
    if (busy() && (P.action === 'attack0' || P.action === 'attack1' || P.action === 'attack2')) {
      // 攻击时轻微前冲
      P.vel.x += sin(P.yaw) * 5 * dt; P.vel.z += cos(P.yaw) * 5 * dt;
    }

    /* ---- 攻击判定帧 ---- */
    if (P.action && P.action.indexOf('attack') === 0) {
      const p = P.actionT / P.actionDur;
      if (p > .28 && p < .5) resolveSwing();
    }
    if (mouse.left && P.action && P.action.indexOf('attack') === 0 && P.actionT > P.actionDur * .62) {
      // 连击衔接
    }

    /* ---- 符文逻辑 ---- */
    updateRunes(dt, t);

    /* ---- 交互检测 ---- */
    findInteractable();

    /* ---- 脚步声 ---- */
    if (P.onGround && !P.climbing && !P.swimming) {
      const sp = hypot(P.vel.x, P.vel.z);
      if (sp > 1.2) {
        P.lastFoot = (P.lastFoot || 0) - dt * sp;
        if (P.lastFoot <= 0) {
          P.lastFoot = 0.62;
          SND.play('step', 0.6 + Math.random() * .3);
          if (P.sprinting) FX.dust(_v.copy(P.pos));
        }
      }
    }
    // 冷的时候呼出白气
    if (P.coldLv > .3 && Math.random() < dt * 2.4) {
      FX.burst(_v.copy(P.pos).setY(P.pos.y + 1.5), { count: 2, color: 0xffffff, size: .3, map: null, spread: .3, up: .6, life: .9, grav: -.4, drag: .95 });
    }

    /* ---- 同步模型 ---- */
    group.position.copy(P.pos);
    group.rotation.y = P.yaw;
    group.visible = !(P.inShrine);

    // 状态给骨骼
    P.phase += dt * (target === 'run' ? 9.0 : 6.4) * (P.onGround ? 1 : .4);
    Link.update(dt, {
      state: target, t: t, phase: P.phase,
      speed: hypot(P.vel.x, P.vel.z),
      moving: inputLen > .2,
      p: P.action ? P.actionT / max(0.0001, P.actionDur) : 0,
      rising: P.vel.y > 0,
    });

    // 攻击时面向相机
    if (busy()) {
      const atk = P.action;
      if (atk && atk.indexOf('attack') === 0 && P.camYaw !== null) P.yaw = dampAngle(P.yaw, P.camYaw, 8, dt);
    }

    // 下雨时湿身
    if (Env.E.rain > .3) P.wet = 1;

    // 呼吸白气 / 高温扭曲由后处理负责
    UI.setUnderwater(headUnder);
  }

  function extraSlots() { return false; }
  function MouseOrKey() { return false; }

  /* ---------- 墙体检测（攀爬） ---------- */
  function detectWall(groundY) {
    const d = 0.75;
    const probes = [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]];
    let best = null;
    for (const [px, pz] of probes) {
      const tx = P.pos.x + px * d, tz = P.pos.z + pz * d;
      const h = terrainHeight(tx, tz);
      const rise = h - P.pos.y;
      if (rise > .55 && rise < 5.2) {
        if (!best || rise > best.rise) {
          best = { rise, nx: -px, nz: -pz, h };
        }
      }
    }
    return best;
  }

  /* ---------- 碰撞 ---------- */
  function resolveCollisions(dt) {
    const r = 0.38;
    // 建筑
    for (const c of Props.colliders) {
      if (P.pos.y + 1.6 < c.y0 || P.pos.y > c.y1) continue;
      const dx = P.pos.x - c.x, dz = P.pos.z - c.z;
      const d = hypot(dx, dz);
      const minD = c.r + r;
      if (d < minD && d > 1e-4) {
        const push = (minD - d);
        P.pos.x += dx / d * push; P.pos.z += dz / d * push;
        P.vel.x *= .5; P.vel.z *= .5;
      }
    }
    for (const b of Props.boxColliders) {
      if (P.pos.y + 1.6 < b.y0 || P.pos.y > b.y1) continue;
      let lx = P.pos.x - b.x, lz = P.pos.z - b.z;
      if (b.ry) {
        const ca = cos(-b.ry), sa = sin(-b.ry);
        const nx = lx * ca - lz * sa, nz = lx * sa + lz * ca;
        lx = nx; lz = nz;
      }
      const ox = b.hx + r - abs(lx), oz = b.hz + r - abs(lz);
      if (ox > 0 && oz > 0) {
        let px = 0, pz = 0;
        if (ox < oz) px = sign(lx) * ox; else pz = sign(lz) * oz;
        if (b.ry) {
          const ca = cos(b.ry), sa = sin(b.ry);
          const nx = px * ca - pz * sa, nz = px * sa + pz * ca;
          px = nx; pz = nz;
        }
        P.pos.x += px; P.pos.z += pz;
      }
    }
    // 树（粗判）
    const near = Flora.treesNear(P.pos.x, P.pos.z, 2.0);
    for (const t of near) {
      const dx = P.pos.x - t.x, dz = P.pos.z - t.z;
      const d = hypot(dx, dz);
      const rr = 0.5 * t.s;
      if (d < rr && d > 1e-4) {
        P.pos.x += dx / d * (rr - d); P.pos.z += dz / d * (rr - d);
      }
    }
    if (abs(P.pos.x) > HALF_W - 8) P.pos.x = clamp(P.pos.x, -HALF_W + 8, HALF_W - 8);
    if (abs(P.pos.z) > HALF_W - 8) P.pos.z = clamp(P.pos.z, -HALF_W + 8, HALF_W - 8);
  }

  /* ---------- 相机 ---------- */
  function updateCamera(dt) {
    P.camDist = damp(P.camDist, P.aiming ? 2.4 : P.camDistTarget, 5, dt);
    const target = _v.copy(P.pos).add(_v2.set(0, P.aiming ? 1.42 : 1.5, 0));
    const cp = P.camPitch, cy = P.camYaw;
    // 视线方向（与角色朝向同约定）：水平 (sin cy, cos cy)，俯仰 camPitch>0 为抬头
    const dir = _v2.set(
      sin(cy) * cos(cp),
      sin(cp),
      cos(cy) * cos(cp)
    ).normalize();
    let want = _v3.copy(target).addScaledVector(dir, -P.camDist);   // 相机在视线反方向
    // 相机不要穿地
    const gy = terrainHeight(want.x, want.z);
    if (want.y < gy + 0.9) want.y = gy + 0.9;
    // 相机不要穿墙（粗略）
    for (const c of Props.colliders) {
      const d = hypot(want.x - c.x, want.z - c.z);
      if (d < c.r + .4 && want.y > c.y0 && want.y < c.y1) {
        want.x = c.x + (want.x - c.x) / max(d, .001) * (c.r + .5);
        want.z = c.z + (want.z - c.z) / max(d, .001) * (c.r + .5);
      }
    }
    if (!P._camInit) { camera.position.copy(want); P._camInit = true; }
    else camera.position.lerp(want, 1 - exp(-18 * dt));
    const look = target.clone();
    camera.lookAt(look);
    // 水下视角
    const headUnder = terrainHeight(P.pos.x, P.pos.z) < SEA - .35 && P.pos.y < SEA - .1;
    P.underwater = headUnder;
  }

  /* ---------- 符文更新 ---------- */
  function updateRunes(dt, t) {
    // 磁力
    if (P.attached) {
      const a = P.attached;
      a.frozen = true; a.stasisT = 1;
      const dir = _v.set(sin(P.camYaw), 0, cos(P.camYaw));
      const dist = 5 + Math.sin(t * 2) * 2 + P.camPitch * 4;
      a.pos.x = damp(a.pos.x, P.pos.x + dir.x * dist, 3, dt);
      a.pos.z = damp(a.pos.z, P.pos.z + dir.z * dist, 3, dt);
      a.pos.y = damp(a.pos.y, P.pos.y + 3 + P.camPitch * 3, 3, dt);
      if (mouse.left) { P.attached = null; }
      P.stamina -= dt * .05;
      if (P.stamina <= 0) P.attached = null;
    }
    // 静止器
    for (const e of EnemyMgr.list()) {
      if (e.stasisT > 0) {
        e.stasisT -= dt;
        e.frozen = true;
        e.vel.set(0, 0, 0);
        if (e.stasisT <= 0) { e.frozen = false; e.vel.x = sin(e.yaw) * 26; e.vel.z = cos(e.yaw) * 26; }
      }
    }
    // 冰柱
    for (let i = P.iceBlocks.length - 1; i >= 0; i--) {
      const b = P.iceBlocks[i];
      b.t += dt;
      if (b.t > 18) { scene.remove(b.mesh); P.iceBlocks.splice(i, 1); }
    }
    // 炸弹
    for (let i = P.bombs.length - 1; i >= 0; i--) {
      const b = P.bombs[i];
      b.t += dt;
      b.vy -= 22 * dt;
      b.mesh.position.y += b.vy * dt;
      const gy = terrainHeight(b.mesh.position.x, b.mesh.position.z);
      if (b.mesh.position.y < gy + .42) { b.mesh.position.y = gy + .42; b.vy = 0; }
      b.mesh.rotation.x += dt * 2; b.mesh.rotation.z += dt * 1.4;
      b.mesh.children[0].intensity = 1.4 + sin(b.t * 22) * .8;
      if (b.t > b.fuse) {
        FX.burst(b.mesh.position, { count: 44, color: 0xffb347, size: .7, spread: 9, up: 8, additive: true, life: .6, grav: -3 });
        FX.burst(b.mesh.position, { count: 24, color: 0x66d8ff, size: .9, spread: 6, up: 5, life: 1.1, grav: -1 });
        SND.play('explode');
        EnemyMgr.applyDamage(b.mesh.position, 6.5, 42, b.mesh.position, 'bomb');
        scene.remove(b.mesh);
        P.bombs.splice(i, 1);
      }
    }
  }

  /* ---------- 交互 ---------- */
  let interactCd = 0;
  function findInteractable() {
    interactCd -= 0.016;
    let best = null, bd = 4.0;
    for (const it of Props.interactables) {
      const d = it.pos.distanceTo(P.pos);
      if (d < max(bd, it.radius)) {
        if (!best || d < bd) { best = it; bd = d; }
      }
    }
    if (best) {
      setPrompt('<b>' + (best.kind === 'sign' ? 'E' : 'E') + '</b>' + best.label);
      P.pendingInteract = () => doInteract(best);
      lastPromptTarget = best;
    } else {
      setPrompt('');
      P.pendingInteract = null;
    }
  }

  function doInteract(it) {
    SND.play('ui');
    if (it.kind === 'chest') {
      if (it.data.opened) { showToast('空的'); return; }
      it.data.opened = true;
      it.data.lid.rotation.x = -1.3;
      it.data.lid.position.y += .1;
      const r = it.data.rarity;
      const pool = r === 1 ? ['apple', 'mushroom', 'club', 'woodBow']
        : r === 2 ? ['soldierSword', 'soldierBow', 'soldierShield', 'meat']
          : ['knightSword', 'royalBow', 'hylianShield', 'starFragment'];
      const id = pool[(Math.random() * pool.length) | 0];
      const db = Game.ITEM_DB[id];
      Game.addItem(db.kind === 'bow' ? 'bow' : db.kind === 'shield' ? 'shield' : db.kind === 'weapon' ? 'weapon' : 'material', id, 1);
      showToast('获得 ' + db.n, db.ic);
      FX.burst(it.pos.clone(), { count: 22, color: 0xffe08a, size: .3, additive: true, spread: 2.5, up: 3.5, life: .9, grav: -1 });
    } else if (it.kind === 'shrine') {
      const n = it.data.n;
      if (Game.G.shrinesDone.has(n)) { showToast(n + ' 已经完成'); return; }
      Game.G.shrinesDone.add(n);
      FX.burst(it.pos.clone(), { count: 60, color: 0x4ff0e8, size: .5, additive: true, spread: 5, up: 6, life: 1.4, grav: -2 });
      Game.addOrb();
      SND.play('shrine');
      showToast('完成 ' + n + '，获得试炼之证');
      UI.setShrines(Game.G.shrinesDone.size);
      Game.quest('海拉鲁的试炼', '已通过 ' + Game.G.shrinesDone.size + ' 座神庙，继续探索。');
    } else if (it.kind === 'tower') {
      const n = it.data.n;
      Game.G.towersDone.add(n);
      UI.setTowers(Game.G.towersDone.size);
      UI.setRegion(regionNameAt(P.pos.x, P.pos.z));
      showToast('解锁 ' + n + '，地图已更新');
      FX.burst(it.pos.clone(), { count: 50, color: 0x4ff0e8, size: .5, additive: true, spread: 6, up: 8, life: 1.6, grav: -2 });
      SND.play('tower');
      Game.quest('海拉鲁的试炼', '前往海拉鲁城堡，面对灾厄盖侬。');
    } else if (it.kind === 'cook') {
      UI.openCook(it.data);
    } else if (it.kind === 'village') {
      UI.dialogue(it.data.n, '欢迎来到' + it.data.n + '。旅者，需要补给吗？', () => { });
    } else if (it.kind === 'stable') {
      UI.dialogue(it.data.n, '这里可以登记你的马匹。（当前版本马匹尚未实装）', () => { });
    } else if (it.kind === 'sign') {
      UI.dialogue('路牌', it.data.text, () => { });
    }
  }

  /* 供敌人 / 投射物调用的统一接口 */
  P.hurt = hurt;
  P.hurtAt = (amount, x, y, z) => hurt(amount, new THREE.Vector3(x, y, z));

  return {
    P, init, update, teleport, hurt, showToast, setPrompt, doInteract,
    group: () => group, camera: () => camera,
    setState, attack, shootArrow, useRune, aim: v => { P.aiming = v; },
    busy,
  };
})();
