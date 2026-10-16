/* =========================================================================
   90_ui.js — HUD / 小地图 / 世界地图 / 背包 / 菜单 / 料理 / 轮盘
   ========================================================================= */

const UI = (() => {
  const $ = s => document.querySelector(s);
  let heartsEl, mini, miniCtx, mapCanvas, mapCtx, mapBase = null;
  let lastHearts = -1, lastStam = -1;
  let toastQueue = [];
  let activeWheel = null, wheelSel = 0;
  let anyScreen = false;
  let cookState = null;
  const _c = new THREE.Color();

  const MAP_SIZE = CFG.lite ? 150 : 440;      // 世界地图底图分辨率

  /* ---------- 心 ---------- */
  function heartSVG(fill) {
    // fill: 0..1
    return '<svg viewBox="0 0 32 30">' +
      '<defs><clipPath id="hc"><rect x="0" y="0" width="' + (32 * fill) + '" height="30"/></clipPath></defs>' +
      '<path d="M16 27C6 19 1 14 1 8.6 1 4.6 4.2 1.5 8.2 1.5c3 0 5.6 1.7 7.8 4.6 2.2-2.9 4.8-4.6 7.8-4.6 4 0 7.2 3.1 7.2 7.1C31 14 26 19 16 27z" ' +
      'fill="#3b1210" stroke="#0a0508" stroke-width="1.6"/>' +
      '<g clip-path="url(#hc)"><path d="M16 27C6 19 1 14 1 8.6 1 4.6 4.2 1.5 8.2 1.5c3 0 5.6 1.7 7.8 4.6 2.2-2.9 4.8-4.6 7.8-4.6 4 0 7.2 3.1 7.2 7.1C31 14 26 19 16 27z" ' +
      'fill="#e8433a"/><path d="M16 27C6 19 1 14 1 8.6 1 4.6 4.2 1.5 8.2 1.5c3 0 5.6 1.7 7.8 4.6 2.2-2.9 4.8-4.6 7.8-4.6 4 0 7.2 3.1 7.2 7.1C31 14 26 19 16 27z" ' +
      'fill="none" stroke="#ff8f86" stroke-width="1.2" opacity=".55"/></g></svg>';
  }
  function renderHearts() {
    const G = Game.G;
    const total = G.maxHearts;
    const val = G.hearts * 4 + G.quarters;
    let html = '';
    for (let i = 0; i < total; i++) {
      const q = clamp01((val - i * 4) / 4);
      html += '<div class="heart">' + heartSVG(q) + '</div>';
    }
    heartsEl.innerHTML = html;
  }
  function updateHearts() {
    const G = Game.G;
    const v = G.hearts * 4 + G.quarters;
    if (v === lastHearts) return;
    lastHearts = v;
    renderHearts();
  }

  /* ---------- 体力环 ---------- */
  function updateStamina(p) {
    const ring = $('#staminaRing'), wrap = $('#staminaWrap'), extra = $('#staminaExtra');
    if (!ring) return;
    const C = 2 * PI * 41;
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C * (1 - clamp01(p));
    const ex = clamp01((Game.G.extraStamina || 0) * .2);
    if (extra) {
      const C2 = 2 * PI * 33;
      extra.style.strokeDasharray = C2;
      extra.style.strokeDashoffset = C2 * (1 - (p > 1 ? (p - 1) / max(.001, ex) : 0));
    }
    const vis = p < .999 ? 1 : 0;
    wrap.style.opacity = vis;
    wrap.classList.toggle('low', p < .25);
    wrap.classList.toggle('flash', p < .12);
  }

  /* ---------- 温度计 ---------- */
  function setTemp(t, cold, heat) {
    const n = $('#tempNeedle'), ic = $('#tempIcon');
    if (!n) return;
    const p = clamp01((t + 40) / 100);
    n.style.bottom = (p * 100) + '%';
    if (ic) ic.textContent = heat > .5 ? '🔥' : (cold > .5 ? '❄' : (t > 32 ? '☀' : '🌡'));
  }
  function setUnderwater(v) {
    const el = $('#vWater');
    if (el) el.style.opacity = v ? .85 : 0;
  }

  /* ---------- 小地图 ---------- */
  function buildMapBase() {
    const c = document.createElement('canvas');
    c.width = c.height = MAP_SIZE;
    const x = c.getContext('2d');
    const img = x.createImageData(MAP_SIZE, MAP_SIZE);
    const d = img.data;
    for (let j = 0; j < MAP_SIZE; j++) {
      const z = (j / MAP_SIZE - .5) * WORLD;
      for (let i = 0; i < MAP_SIZE; i++) {
        const wx = (i / MAP_SIZE - .5) * WORLD;
        const h = terrainHeight(wx, z);
        const cl = climateAt(wx, z);
        let r, g, b;
        if (h < SEA) {
          const dp = clamp01((SEA - h) / 60);
          r = lerp(58, 12, dp); g = lerp(130, 40, dp); b = lerp(170, 92, dp);
        } else {
          const t = clamp01(h / 620);
          const slope = terrainSlope(wx, z, 8);
          // 基础色：草地绿
          r = lerp(72, 108, t); g = lerp(118, 104, t); b = lerp(56, 92, t);
          if (cl === 'desert') { r = lerp(206, 226, t); g = lerp(186, 200, t); b = lerp(132, 148, t); }
          if (cl === 'snow') { r = lerp(214, 246, t); g = lerp(224, 248, t); b = lerp(238, 252, t); }
          if (cl === 'volcano') { r = lerp(70, 96, t); g = lerp(58, 62, t); b = lerp(54, 58, t); }
          if (cl === 'jungle') { r = lerp(46, 66, t); g = lerp(102, 96, t); b = lerp(44, 52, t); }
          if (slope > 1.0) { const k = clamp01((slope - 1) / 1.6); r = lerp(r, 128, k); g = lerp(g, 118, k); b = lerp(b, 108, k); }
          if (h > 430) { const k = clamp01((h - 430) / 200); r = lerp(r, 240, k); g = lerp(g, 244, k); b = lerp(b, 250, k); }
        }
        const o = (j * MAP_SIZE + i) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    // 描出河流与湖泊的亮边
    return c;
  }
  const world2map = (x, z) => [(x / WORLD + .5) * MAP_SIZE, (z / WORLD + .5) * MAP_SIZE];

  function drawMinimap() {
    if (!miniCtx || !mapBase) return;
    const S = mini.width;
    const cx = S / 2, cy = S / 2;
    const zoom = 2.6;
    miniCtx.clearRect(0, 0, S, S);
    miniCtx.save();
    miniCtx.beginPath(); miniCtx.arc(cx, cy, S / 2 - 4, 0, TAU); miniCtx.clip();
    const px = (Player.P.pos.x / WORLD + .5) * MAP_SIZE;
    const pz = (Player.P.pos.z / WORLD + .5) * MAP_SIZE;
    const view = MAP_SIZE / zoom;
    miniCtx.drawImage(mapBase, px - view / 2, pz - view / 2, view, view, 0, 0, S, S);
    miniCtx.restore();

    // 标记
    miniCtx.save();
    miniCtx.beginPath(); miniCtx.arc(cx, cy, S / 2 - 4, 0, TAU); miniCtx.clip();
    const k = S / view;       // 每底图像素对应的屏幕像素
    for (const p of Props.POI) {
      const px2 = (p.x / WORLD + .5) * MAP_SIZE;
      const pz2 = (p.z / WORLD + .5) * MAP_SIZE;
      const sxx = cx + (px2 - px) * k;
      const szz = cy + (pz2 - pz) * k;
      if (sxx < -10 || sxx > S + 10 || szz < -10 || szz > S + 10) continue;
      miniCtx.fillStyle = p.type === 'shrine' ? '#4ff0e8' : (p.type === 'tower' ? '#c8a8ff' : (p.type === 'village' ? '#ffe08a' : '#ff8080'));
      miniCtx.beginPath(); miniCtx.arc(sxx, szz, 4, 0, TAU); miniCtx.fill();
      miniCtx.strokeStyle = 'rgba(0,0,0,.55)'; miniCtx.lineWidth = 1; miniCtx.stroke();
    }
    miniCtx.restore();
    // 玩家箭头
    miniCtx.save();
    miniCtx.translate(cx, cy); miniCtx.rotate(Player.P.yaw);
    miniCtx.fillStyle = '#fff';
    miniCtx.beginPath();
    miniCtx.moveTo(0, 14); miniCtx.lineTo(-9, -9); miniCtx.lineTo(0, -3); miniCtx.lineTo(9, -9);
    miniCtx.closePath(); miniCtx.fill();
    miniCtx.strokeStyle = '#000'; miniCtx.lineWidth = 1.4; miniCtx.stroke();
    miniCtx.restore();
  }

  /* ---------- 全屏地图 ---------- */
  function drawFullMap() {
    if (!mapCtx || !mapBase) return;
    const W2 = mapCanvas.width, H2 = mapCanvas.height;
    mapCtx.clearRect(0, 0, W2, H2);
    mapCtx.imageSmoothingEnabled = true;
    mapCtx.drawImage(mapBase, 0, 0, W2, H2);
    mapCtx.save();
    const k = W2 / WORLD;
    for (const p of Props.POI) {
      const sx = (p.x / WORLD + .5) * W2, sz = (p.z / WORLD + .5) * H2;
      mapCtx.beginPath();
      if (p.type === 'shrine') {
        const done = Game.G.shrinesDone.has(p.name);
        mapCtx.fillStyle = done ? '#8ff8ef' : '#2ab8b0';
        mapCtx.arc(sx, sz, 7, 0, TAU); mapCtx.fill();
        mapCtx.strokeStyle = '#06282a'; mapCtx.lineWidth = 2; mapCtx.stroke();
      } else if (p.type === 'tower') {
        mapCtx.fillStyle = Game.G.towersDone.has(p.name) ? '#d8b8ff' : '#7a6a9a';
        mapCtx.moveTo(sx, sz - 9); mapCtx.lineTo(sx + 9, sz + 7); mapCtx.lineTo(sx - 9, sz + 7);
        mapCtx.closePath(); mapCtx.fill();
      } else if (p.type === 'village') {
        mapCtx.fillStyle = '#ffe08a';
        mapCtx.arc(sx, sz, 9, 0, TAU); mapCtx.fill();
      } else if (p.type === 'stable') {
        mapCtx.fillStyle = '#d8c090';
        mapCtx.fillRect(sx - 7, sz - 7, 14, 14);
      } else if (p.type === 'fairy') {
        mapCtx.fillStyle = '#ffb8e8';
        mapCtx.arc(sx, sz, 8, 0, TAU); mapCtx.fill();
      } else if (p.type === 'castle') {
        mapCtx.fillStyle = '#ff5a7a';
        mapCtx.arc(sx, sz, 13, 0, TAU); mapCtx.fill();
        mapCtx.strokeStyle = '#fff'; mapCtx.lineWidth = 2; mapCtx.stroke();
      }
    }
    // 玩家
    const px = (Player.P.pos.x / WORLD + .5) * W2, pz = (Player.P.pos.z / WORLD + .5) * H2;
    mapCtx.translate(px, pz); mapCtx.rotate(Player.P.yaw);
    mapCtx.fillStyle = '#fff';
    mapCtx.beginPath(); mapCtx.moveTo(0, 16); mapCtx.lineTo(-11, -11); mapCtx.lineTo(0, -4); mapCtx.lineTo(11, -11);
    mapCtx.closePath(); mapCtx.fill();
    mapCtx.strokeStyle = '#000'; mapCtx.lineWidth = 2; mapCtx.stroke();
    mapCtx.restore();
  }

  /* ---------- 快速栏 ---------- */
  function renderQuickbar() {
    const el = $('#quickbar');
    if (!el) return;
    const slots = [
      { k: 'weapon', key: '1', tab: 'weapon' },
      { k: 'bow', key: '2', tab: 'bow' },
      { k: 'shield', key: '3', tab: 'shield' },
      { k: 'armor', key: '4', tab: 'armor' },
    ];
    let html = '';
    for (const s of slots) {
      const it = Game.equippedItem(s.k);
      const db = it ? Game.ITEM_DB[it.id] : null;
      const pct = it && it.maxDur ? clamp01(it.dur / it.maxDur) : 1;
      const col = pct > .5 ? '#8fd66a' : (pct > .2 ? '#e8c85a' : '#e85a4a');
      html += '<div class="slot"><div class="key">' + s.key + '</div>' +
        '<div class="ic">' + (db ? db.ic : '—') + '</div>' +
        (it && it.maxDur ? '<div class="durab"><i style="width:' + (pct * 100) + '%;background:' + col + '"></i></div>' : '') +
        '</div>';
    }
    el.innerHTML = html;
  }
  function setRune(name) {
    const el = $('#runeBadge');
    if (!el) return;
    const db = Game.ITEM_DB['rune_' + name];
    el.innerHTML = '<div class="ic" style="font-size:26px">' + (db ? db.ic : '⌘') + '</div>' +
      '<div class="name">' + (db ? db.n : '') + '</div>';
  }

  /* ---------- 时钟 / 天气 ---------- */
  function updateClock() {
    const el = $('.time');
    if (el) el.textContent = fmtClock(Env.E.time);
    const d = $('#dayLbl');
    if (d) d.textContent = '· 第' + Env.E.day + '天';
    $('#rupees').textContent = Game.G.rupees;
    const wi = $('#wIcon'), wt = $('#wTxt');
    if (wi) {
      const w = Env.E.weather;
      wi.textContent = w === 'clear' ? '☀' : w === 'partly' ? '🌤' : w === 'cloudy' ? '☁' :
        w === 'rain' ? '🌧' : w === 'storm' ? '⛈' : w === 'snow' ? '🌨' : '🌫';
      wt.textContent = { clear: '晴', partly: '少云', cloudy: '多云', rain: '雨', storm: '暴雨', snow: '雪', foggy: '雾' }[w] || '晴';
    }
  }
  function setShrines(n) { const e = $('#shrineCnt'); if (e) e.textContent = n + ' / 120'; }
  function setTowers(n) { const e = $('#mTowers'); if (e) e.textContent = n; }
  function setRegion(name) { const e = $('#minimapLbl'); if (e) e.textContent = name; }

  function setQuest(title, text) {
    const box = $('#questBox');
    if (!box) return;
    box.querySelector('.t').textContent = title;
    box.querySelector('.d').textContent = text;
    box.style.opacity = 1;
  }

  function dialogue(who, text, cb) {
    const d = $('#dialogue');
    d.querySelector('.who').textContent = who;
    d.querySelector('.txt').textContent = '';
    d.style.opacity = 1;
    anyScreen = true;
    let i = 0;
    const full = text;
    const timer = setInterval(() => {
      i += 2;
      d.querySelector('.txt').textContent = full.slice(0, i);
      if (i >= full.length) clearInterval(timer);
    }, 18);
    const close = () => {
      clearInterval(timer);
      d.querySelector('.txt').textContent = full;
      setTimeout(() => {
        d.style.opacity = 0; anyScreen = false;
        window.removeEventListener('keydown', keyH);
        d.removeEventListener('click', close);
        if (cb) cb();
      }, 60);
    };
    const keyH = e => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { close(); } };
    setTimeout(() => {
      window.addEventListener('keydown', keyH);
      d.addEventListener('click', close);
    }, 120);
  }

  function vignette(id, strength, ms) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.opacity = strength;
    setTimeout(() => { el.style.opacity = 0; }, ms || 400);
  }
  function hitMarker() {
    const c = $('#crosshair');
    if (!c) return;
    c.style.opacity = 1;
    clearTimeout(c._t);
    c._t = setTimeout(() => { c.style.opacity = Player.P.aiming ? 1 : 0; }, 120);
  }
  function showDeath() { const e = $('#vDeath'); if (e) e.style.opacity = 1; }
  function hideDeath() { const e = $('#vDeath'); if (e) e.style.opacity = 0; }

  /* ---------- 轮盘 ---------- */
  function openWheel(kind) {
    const wheel = kind === 'rune' ? $('#runeWheel') : $('#itemWheel');
    const inner = kind === 'rune' ? $('#runeWheelInner') : $('#itemWheelInner');
    const items = kind === 'rune'
      ? Player.P.runes.map((r, i) => ({
        ic: Game.ITEM_DB['rune_' + r].ic, nm: Game.ITEM_DB['rune_' + r].n, i,
      }))
      : ['weapon', 'bow', 'shield', 'armor'].map((t, i) => {
        const it = Game.equippedItem(t); const db = it ? Game.ITEM_DB[it.id] : null;
        return { ic: db ? db.ic : '—', nm: db ? db.n : '空', i, tab: t };
      });
    // 清除除中心外的元素
    [...inner.querySelectorAll('.wheelItem')].forEach(n => n.remove());
    const R = 150;
    items.forEach((it, k) => {
      const a = k / items.length * TAU - PI / 2;
      const div = document.createElement('div');
      div.className = 'wheelItem' + (k === wheelSel ? ' sel' : '');
      div.style.left = (230 + cos(a) * R) + 'px';
      div.style.top = (230 + sin(a) * R) + 'px';
      div.innerHTML = '<div class="ic">' + it.ic + '</div><div class="nm">' + it.nm + '</div>';
      div.onclick = () => { wheelSel = k; confirmWheel(kind); };
      inner.appendChild(div);
    });
    wheel.classList.add('on');
    activeWheel = kind;
    anyScreen = true;
  }
  function confirmWheel(kind) {
    if (kind === 'rune') {
      Player.P.currentRune = wheelSel % Player.P.runes.length;
      setRune(Player.P.runes[Player.P.currentRune]);
      Player.showToast('符文：' + Game.ITEM_DB['rune_' + Player.P.runes[Player.P.currentRune]].n);
    } else {
      const tabs = ['weapon', 'bow', 'shield', 'armor'];
      const tab = tabs[wheelSel % 4];
      const arr = Game.inv(tab);
      if (arr.length) {
        Game.equipped[tab] = (Game.equipped[tab] + 1) % arr.length;
        Game.equip(tab, Game.equipped[tab]);
        const it = Game.equippedItem(tab);
        Player.showToast('装备 ' + Game.ITEM_DB[it.id].n, Game.ITEM_DB[it.id].ic);
      }
    }
    renderQuickbar();
    closeWheel();
  }
  function closeWheel() {
    if (activeWheel) {
      $('#' + (activeWheel === 'rune' ? 'runeWheel' : 'itemWheel')).classList.remove('on');
      activeWheel = null;
    }
    anyScreen = false;
  }
  function moveWheel(dir) {
    if (!activeWheel) return;
    const n = activeWheel === 'rune' ? Player.P.runes.length : 4;
    wheelSel = (wheelSel + dir + n) % n;
    const inner = $(activeWheel === 'rune' ? '#runeWheelInner' : '#itemWheelInner');
    [...inner.querySelectorAll('.wheelItem')].forEach((n2, k) => {
      n2.classList.toggle('sel', k === wheelSel);
    });
  }

  /* ---------- 屏幕 ---------- */
  function openScreen(id) {
    $('#' + id).classList.add('on');
    anyScreen = true;
    document.exitPointerLock && document.exitPointerLock();
    SND.play('menuOpen');
    if (id === 'mapScreen') { drawFullMap(); $('#mShrines').textContent = Game.G.shrinesDone.size; $('#mapOpened').textContent = Game.G.towersDone.size; }
    if (id === 'invScreen') renderInv();
  }
  function closeScreens() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
    anyScreen = false;
    SND.play('uiBack');
  }
  const anyScreenOpen = () => anyScreen || !!activeWheel;

  /* ---------- 背包 ---------- */
  let invTab = 'weapon', invSel = 0;
  function renderInv() {
    const grid = $('#invGrid');
    if (!grid) return;
    const arr = Game.inv(invTab);
    let html = '';
    arr.forEach((it, i) => {
      const db = Game.ITEM_DB[it.id] || { n: it.id, ic: '❔' };
      const eq = Game.equipped[invTab] === i ? '<div class="eq">装备中</div>' : '';
      html += '<div class="cell' + (i === invSel ? ' sel' : '') + '" data-i="' + i + '">' + eq +
        '<div class="ic">' + db.ic + '</div><div class="nm">' + db.n + '</div>' +
        (it.count !== undefined ? '<div class="st">×' + it.count + '</div>' :
          (it.maxDur ? '<div class="st">耐久 ' + it.dur + '/' + it.maxDur + '</div>' : '')) +
        '</div>';
    });
    if (!arr.length) html = '<div style="color:#7f9096;padding:20px">空</div>';
    grid.innerHTML = html;
    grid.querySelectorAll('.cell').forEach(c => {
      c.onclick = () => { invSel = +c.dataset.i; renderInv(); };
      c.ondblclick = () => {
        invSel = +c.dataset.i;
        Game.equip(invTab, invSel);
        renderInv(); renderQuickbar();
        Player.showToast('装备 ' + Game.ITEM_DB[arr[invSel].id].n);
      };
    });
    renderInvDetail(arr[invSel]);
  }
  function renderInvDetail(it) {
    const d = $('#invDetail');
    if (!d) return;
    if (!it) { d.innerHTML = '<h3>—</h3><div class="tag">—</div><p>选择一个物品查看详情。</p>'; return; }
    const db = Game.ITEM_DB[it.id] || { n: it.id, ic: '❔' };
    let stats = '';
    if (db.atk) stats += '<div class="stat"><span>攻击力</span><b>' + db.atk + '</b></div>';
    if (db.def) stats += '<div class="stat"><span>防御力</span><b>' + db.def + '</b></div>';
    if (it.maxDur) stats += '<div class="stat"><span>耐久</span><b>' + it.dur + ' / ' + it.maxDur + '</b></div>';
    if (db.heal) stats += '<div class="stat"><span>回复心数</span><b>' + db.heal + '</b></div>';
    if (db.warm) stats += '<div class="stat"><span>耐寒</span><b>+' + db.warm + '</b></div>';
    if (db.heat) stats += '<div class="stat"><span>耐火</span><b>+' + db.heat + '</b></div>';
    if (db.climb) stats += '<div class="stat"><span>攀爬加速</span><b>+' + floor(db.climb * 100) + '%</b></div>';
    if (db.swim) stats += '<div class="stat"><span>游泳加速</span><b>+' + floor(db.swim * 100) + '%</b></div>';
    d.innerHTML = '<h3>' + db.ic + ' ' + db.n + '</h3><div class="tag">' +
      ({ weapon: 'WEAPON', bow: 'BOW', shield: 'SHIELD', armor: 'ARMOR', material: 'MATERIAL', food: 'FOOD', key: 'KEY ITEM' }[db.kind] || 'ITEM') +
      '</div>' + (db.d ? '<p>' + db.d + '</p>' : '') + stats +
      (['weapon', 'bow', 'shield', 'armor'].indexOf(db.kind) >= 0 ? '<p style="color:#39e0d8;cursor:pointer" id="invEquip">▶ 装备（或双击）</p>' : '') +
      (db.kind === 'food' || db.kind === 'material' ? '<p style="color:#39e0d8;cursor:pointer" id="invEat">▶ ' + (db.kind === 'food' ? '食用' : '生吃') + '</p>' : '');
    const eq = document.getElementById('invEquip');
    if (eq) eq.onclick = () => { Game.equip(invTab, invSel); renderInv(); renderQuickbar(); };
    const eat = document.getElementById('invEat');
    if (eat) eat.onclick = () => {
      if (db.heal) Game.healQ(db.heal);
      if (db.stamina) Game.G.stamina = min(1, Game.G.stamina + .5);
      Game.removeItem(invTab, it.id, 1);
      SND.play('cook');
      Player.showToast('食用了 ' + db.n);
      renderInv();
    };
  }

  /* ---------- 料理 ---------- */
  function openCook(data) {
    cookState = { picked: [], data };
    const pane = document.createElement('div');
    pane.className = 'screen on';
    pane.id = 'cookScreen';
    pane.innerHTML = '<div class="screenHead"><h2>料理锅</h2><span class="k">选择最多 5 种食材 · Esc 关闭</span></div>' +
      '<div class="screenBody"><div class="pane"><div class="grid" id="cookGrid"></div>' +
      '<div style="margin-top:20px;display:flex;gap:14px;align-items:center">' +
      '<div id="cookPick" style="color:#e8cf8d;font-size:15px"></div>' +
      '<div class="mbtn sm" id="cookDo" style="pointer-events:auto">开 始 烹 饪</div></div></div></div>';
    document.body.appendChild(pane);
    anyScreen = true;
    const render = () => {
      const grid = pane.querySelector('#cookGrid');
      let html = '';
      for (const m of Game.G.materials) {
        const db = Game.ITEM_DB[m.id];
        const sel = cookState.picked.indexOf(m.id) >= 0;
        html += '<div class="cell' + (sel ? ' sel' : '') + '" data-id="' + m.id + '">' +
          '<div class="ic">' + db.ic + '</div><div class="nm">' + db.n + '</div><div class="st">×' + m.count + '</div></div>';
      }
      grid.innerHTML = html || '<div style="color:#7f9096">没有食材</div>';
      grid.querySelectorAll('.cell').forEach(c => c.onclick = () => {
        const id = c.dataset.id;
        const i = cookState.picked.indexOf(id);
        if (i >= 0) cookState.picked.splice(i, 1);
        else if (cookState.picked.length < 5) cookState.picked.push(id);
        render();
      });
      pane.querySelector('#cookPick').textContent = '已选：' +
        (cookState.picked.map(i => Game.ITEM_DB[i].ic).join(' ') || '无');
    };
    render();
    pane.querySelector('#cookDo').onclick = () => {
      if (!cookState.picked.length) { Player.showToast('至少选择一种食材'); return; }
      const res = cook(cookState.picked);
      for (const id of cookState.picked) Game.removeItem('material', id, 1);
      Game.addItem('food', res, 1);
      SND.play('cook');
      Player.showToast('做好了 ' + Game.ITEM_DB[res].n + '！', Game.ITEM_DB[res].ic);
      cookState.picked = [];
      render();
    };
    pane._close = () => { pane.remove(); anyScreen = false; cookState = null; };
    document.addEventListener('keydown', function esc(e) {
      if (e.code === 'Escape') { pane._close(); document.removeEventListener('keydown', esc); }
    });
  }

  function cook(ids) {
    const counts = {};
    for (const i of ids) counts[i] = (counts[i] || 0) + 1;
    if (counts.pepper) return 'spicyMeat';
    if (counts.meat && ids.length >= 3) return 'heartyStew';
    if (counts.meat) return 'cookedMeat';
    if (counts.fish) return 'cookedFish';
    if (counts.mushroom && counts.apple) return 'elixir';
    return ids.length === 1 ? (Math.random() < .4 ? 'dubiousFood' : 'cookedFish') :
      (Math.random() < .3 ? 'dubiousFood' : 'heartyStew');
  }

  /* ---------- 暂停 / 设置 ---------- */
  const SET = {
    post: false, renderScale: 0.85, quality: 1, bloom: 0.13, ssao: true, godray: 0.20,
    volume: 0.62, music: 0.22, fov: 62, showFps: true, invertY: false,
  };
  function renderPause(tab) {
    const pane = $('#pausePane');
    if (!pane) return;
    if (tab === 'settings') {
      pane.innerHTML = [
        (SET.post ? row('渲染倍率', 'rs', SET.renderScale, 0.4, 1.3, 0.05) : ''),
        row('画质档位', 'q', SET.quality, 0, 2, 1),
        row('泛光强度', 'bloom', SET.bloom, 0, 1.2, .05),
        row('体积光', 'godray', SET.godray, 0, 1.2, .05),
        row('视野 FOV', 'fov', SET.fov, 45, 100, 1),
        row('音效音量', 'vol', SET.volume, 0, 1, .05),
        row('音乐音量', 'mus', SET.music, 0, 1, .05),
        toggleRow('显示帧率', 'fps', SET.showFps),
        toggleRow('后处理管线（泛光 / SSAO / 色调映射）', 'post', SET.post),
      ].join('');
      bindRows(pane);
    } else if (tab === 'help') {
      pane.innerHTML = `<div style="line-height:2.2;font-size:15px;color:#d7d1bf;max-width:720px">
        <p><b style="color:#e8cf8d">移动</b> W A S D · <b style="color:#e8cf8d">冲刺</b> Shift（消耗体力）· <b style="color:#e8cf8d">蹲伏</b> Ctrl / C</p>
        <p><b style="color:#e8cf8d">跳跃</b> 空格 · 空中再按一次展开<b>滑翔伞</b></p>
        <p><b style="color:#e8cf8d">攻击</b> 鼠标左键（三段连击）· <b style="color:#e8cf8d">盾</b> 鼠标右键（举盾瞬间为盾反）</p>
        <p><b style="color:#e8cf8d">弓箭</b> 按住 F 瞄准，左键射击</p>
        <p><b style="color:#e8cf8d">符文</b> Q 使用 · R 切换 · Tab 打开符文轮盘 · 1~4 切换装备</p>
        <p><b style="color:#e8cf8d">攀爬</b> 面向崖壁前行即可攀爬，雨天会打滑</p>
        <p><b style="color:#e8cf8d">交互</b> E · <b style="color:#e8cf8d">地图</b> M · <b style="color:#e8cf8d">背包</b> I · <b style="color:#e8cf8d">口哨</b> Z</p>
        <p><b style="color:#e8cf8d">暂停</b> Esc</p>
        <p style="color:#7f9096;margin-top:18px">目标：唤醒四神兽之前，先探索 120 座神庙与 15 座希卡塔；体温、体力、武器耐久都会影响你的旅程。</p>
      </div>`;
    } else if (tab === 'save') {
      const ok = Game.save();
      pane.innerHTML = '<p style="font-size:16px;color:#8fd66a">' + (ok ? '进度已保存到本地。' : '保存失败（浏览器禁用了本地存储）。') + '</p>';
    } else if (tab === 'load') {
      const ok = Game.load();
      pane.innerHTML = '<p style="font-size:16px;color:' + (ok ? '#8fd66a' : '#e85a4a') + '">' + (ok ? '读取成功。' : '没有找到存档。') + '</p>';
      if (ok) { renderQuickbar(); updateHearts(); }
    } else if (tab === 'quit') {
      closeScreens();
      $('#menu').classList.remove('hide');
      $('#hud').style.opacity = 0;
      Game.G.started = false;
    } else {
      closeScreens();
    }
  }
  function row(label, key, val, mn, mx, step) {
    return '<div class="row"><label>' + label + '</label><input type="range" data-k="' + key + '" min="' + mn + '" max="' + mx + '" step="' + step + '" value="' + val + '"><span class="val">' + val + '</span></div>';
  }
  function toggleRow(label, key, on) {
    return '<div class="row"><label>' + label + '</label><div class="tg' + (on ? ' on' : '') + '" data-t="' + key + '"><i></i></div></div>';
  }
  function bindRows(pane) {
    pane.querySelectorAll('input[type=range]').forEach(inp => {
      inp.oninput = () => {
        const k = inp.dataset.k;
        const v = parseFloat(inp.value);
        SET[k] = v;
        inp.parentNode.querySelector('.val').textContent = v;
        applySetting(k, v);
      };
    });
    pane.querySelectorAll('.tg').forEach(tg => {
      tg.onclick = () => {
        const k = tg.dataset.t;
        SET[k] = !SET[k];
        tg.classList.toggle('on', SET[k]);
        applySetting(k, SET[k]);
      };
    });
  }
  let onSetting = null;
  function applySetting(k, v) {
    if (k === 'vol') SND.setVolume(v);
    if (k === 'mus') SND.setMusicVolume(v);
    if (k === 'bloom') Post.U.uBloomA.value = v;
    if (k === 'godray') Post.U.uGodrayA.value = v;
    if (k === 'fov') onSetting && onSetting('fov', v);
    if (k === 'fps') { const e = $('#fps'); if (e) e.style.display = v ? '' : 'none'; }
  }

  /* ---------- 初始化 ---------- */
  function init(renderer) {
    heartsEl = $('#hearts');
    mini = $('#minimap'); miniCtx = mini.getContext('2d');
    mapCanvas = $('#mapCanvas'); mapCtx = mapCanvas.getContext('2d');

    renderHearts();
    renderQuickbar();
    setShrines(0); setTowers(0);

    // 地图底图
    try { mapBase = buildMapBase(); } catch (e) { console.warn('地图生成失败', e); }

    // 标签切换
    $('#invTabs').querySelectorAll('.tab').forEach(t => {
      t.onclick = () => {
        $('#invTabs').querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
        t.classList.add('on');
        invTab = t.dataset.t; invSel = 0; renderInv();
      };
    });
    $('#pauseTabs').querySelectorAll('.tab').forEach(t => {
      t.onclick = () => {
        $('#pauseTabs').querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
        t.classList.add('on');
        renderPause(t.dataset.t);
      };
    });

    // 菜单
    const startGame = (fresh) => {
      SND.init(); SND.resume();
      $('#menu').classList.add('hide');
      $('#hud').style.opacity = 1;
      if (fresh) Game.newGame();
      Game.G.started = true;
      renderQuickbar(); updateHearts();
      showTitleCard(regionNameAt(Player.P.pos.x, Player.P.pos.z));
      SND.musicStart('field');
      document.querySelector('#gl').requestPointerLock && document.querySelector('#gl').requestPointerLock();
    };
    $('#btnStart').onclick = () => startGame(true);
    $('#btnFree').onclick = () => {
      startGame(true);
      Player.showToast('自由模式：已解锁全部符文与滑翔伞');
    };
    $('#btnLoad').onclick = () => {
      if (!Game.hasSave()) { alert('没有找到存档'); return; }
      startGame(false);
      Game.load();
      renderQuickbar(); updateHearts();
    };
    $('#btnSet').onclick = () => { $('#menu').classList.add('hide'); openScreen('pauseScreen'); renderPause('settings'); $('#pauseTabs').querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.t === 'settings')); };
    $('#btnHelp').onclick = () => { $('#menu').classList.add('hide'); openScreen('pauseScreen'); renderPause('help'); $('#pauseTabs').querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.t === 'help')); };

    // 快捷栏点击
    $('#quickbar').onclick = (e) => {
      const idx = [...$('#quickbar').children].indexOf(e.target.closest('.slot'));
      const tabs = ['weapon', 'bow', 'shield', 'armor'];
      if (idx >= 0) {
        const tab = tabs[idx];
        const arr = Game.inv(tab);
        if (arr.length) {
          Game.equipped[tab] = (Game.equipped[tab] + 1) % arr.length;
          Game.equip(tab, Game.equipped[tab]);
          renderQuickbar();
        }
      }
    };
  }

  function showTitleCard(region) {
    const el = $('#titleCard');
    if (!el) return;
    el.querySelector('.b').textContent = region;
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 3200);
  }

  function setFps(v, extra) {
    const f = $('#fps'), p = $('#perf');
    if (!SET.showFps) { if (f) f.style.display = 'none'; if (p) p.style.display = 'none'; return; }
    if (f) { f.style.display = ''; f.textContent = v.toFixed(0) + ' FPS'; }
    if (p && extra) { p.style.display = ''; p.textContent = extra; }
  }

  /* ---------- 每帧 ---------- */
  function update(dt) {
    updateHearts();
    updateStamina(Game.G.stamina);
    updateClock();
    drawMinimap();
    const c = $('#crosshair');
    if (c) c.style.opacity = Player.P.aiming ? 1 : 0;
    const mc = $('#miniCoords');
    if (mc) mc.textContent = floor(Player.P.pos.x) + ' · ' + floor(Player.P.pos.z);
  }

  /* ---------- 全局按键 ---------- */
  window.addEventListener('keydown', e => {
    if (!Game.G.started) return;
    if (e.code === 'Escape') {
      if (activeWheel) { closeWheel(); return; }
      if (cookState) return;
      if (document.querySelector('.screen.on')) { closeScreens(); return; }
      if (Player.P.dead) return;
      openScreen('pauseScreen'); renderPause('resume');
    }
    if (document.querySelector('.screen.on')) return;
    if (e.code === 'KeyM') {
      if ($('#mapScreen').classList.contains('on')) closeScreens(); else openScreen('mapScreen');
    }
    if (e.code === 'KeyI') {
      if ($('#invScreen').classList.contains('on')) closeScreens(); else openScreen('invScreen');
    }
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
      const tabs = ['weapon', 'bow', 'shield', 'armor'];
      const tab = tabs[+e.code.slice(-1) - 1];
      const arr = Game.inv(tab);
      if (arr.length) {
        Game.equipped[tab] = (Game.equipped[tab] + 1) % arr.length;
        Game.equip(tab, Game.equipped[tab]);
        renderQuickbar();
        const it = Game.equippedItem(tab);
        Player.showToast('装备 ' + Game.ITEM_DB[it.id].n, Game.ITEM_DB[it.id].ic);
      }
    }
  });

  return {
    init, update, renderQuickbar, renderInv, setRune, setTemp, setShrines, setTowers,
    setRegion, setQuest, dialogue, vignette, hitMarker, showDeath, hideDeath,
    openScreen, closeScreens, anyScreenOpen, openRuneWheel: () => openWheel('rune'),
    closeRuneWheel: () => { if (activeWheel === 'rune') closeWheel(); },
    moveWheel, openCook, setUnderwater, showTitleCard, setFps,
    SET, applySetting, bindSetting: fn => { onSetting = fn; },
  };
})();
