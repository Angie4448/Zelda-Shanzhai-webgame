/* =========================================================================
   99_main.js — 启动、主循环、画质自适应、世界状态驱动
   ========================================================================= */

const App = (() => {
  let renderer, scene, camera, clock;
  let elapsed = 0, frames = 0, fpsAcc = 0, fpsTimer = 0, fps = 60;
  let lastRegion = '', regionTimer = 0, weatherTimer = 0;
  let lightning = 0, lightningTimer = 20;
  let quality = 1;
  let lowCount = 0, highCount = 0;
  let postReady = false;

  const bootBar = () => document.getElementById('bootBar');
  const bootMsg = () => document.getElementById('bootMsg');
  function progress(p, msg) {
    const b = bootBar(); if (b) b.style.width = (p * 100) + '%';
    const m = bootMsg(); if (m && msg) m.textContent = msg;
  }
  const nextFrame = () => new Promise(r => setTimeout(r, 8));

  async function boot() {
    try {
      progress(.02, '创建 WebGL 上下文…');
      await nextFrame();
      const canvas = document.getElementById('gl');
      renderer = new THREE.WebGLRenderer({
        canvas, antialias: false, alpha: false, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: !!CFG.shot,
      });
      renderer.setPixelRatio(min(window.devicePixelRatio || 1, 1.35));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.shadowMap.enabled = !CFG.noShadow;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = true;
      renderer.autoClear = true;
      if (CFG.clearmag) renderer.setClearColor(0xff00ff, 1);
      if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

      scene = new THREE.Scene();
      // 距离雾交给 three 自带实现（所有材质通用，且不依赖深度贴图）
      scene.fog = CFG.noscenefog ? null : new THREE.FogExp2(0xbfd4e8, 0.0016);
      camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.35, 5200);
      camera.position.set(0, 20, 0);

      progress(.10, '生成天空与大气…');
      await nextFrame();
      Env.init(renderer, scene);

      progress(.20, '生成地形材质（岩石 / 草地 / 雪 / 沙 / 火山灰）…');
      await nextFrame();
      Water.init();
      Terrain.init(scene, Water.material());

      progress(.42, '雕刻海拉鲁大陆与生物群系…');
      await nextFrame();
      Props.init(scene);

      progress(.58, '种植森林与草地…');
      await nextFrame();
      Flora.init(scene);

      progress(.74, '唤醒魔物…');
      await nextFrame();
      FX.init(scene);
      EnemyMgr.init(scene);

      progress(.84, '唤醒勇者…');
      await nextFrame();
      Player.init(scene, camera);

      progress(.92, '编译后处理管线…');
      await nextFrame();
      Post.init(renderer, renderer.domElement.width, renderer.domElement.height, quality);
      Post.U.uBloomA.value = UI.SET.bloom;
      Post.U.uGodrayA.value = UI.SET.godray;
      postReady = true;

      progress(.97, '生成世界地图…');
      await nextFrame();
      UI.init(renderer);
      UI.bindSetting((k, v) => { if (k === 'fov') { camera.fov = v; camera.updateProjectionMatrix(); } });

      progress(1, '准备完成');
      await nextFrame();

      // 统一压低环境贴图强度（IBL 只做柔和环境光）
      scene.traverse(o => {
        if (!o.material) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m.envMapIntensity !== undefined) { m.envMapIntensity = 0.42; m.needsUpdate = true; }
      });

      // 天空环境贴图强制刷新一次
      Env.forceEnv();
      Terrain.update(SPAWN.x, SPAWN.z, true);

      const boot = document.getElementById('boot');
      boot.style.transition = 'opacity .7s'; boot.style.opacity = 0;
      setTimeout(() => boot.classList.add('hide'), 720);
      const menu = document.getElementById('menu');
      menu.classList.remove('hide');
      document.getElementById('hud').style.opacity = 0;

      clock = new THREE.Clock();
      bindGlobal();
      if (CFG.smoke || CFG.autostart) {
        const b = document.getElementById('btnStart');
        if (b) b.click();
        const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
        setTimeout(() => { key('KeyW', 'keydown'); }, 200);
        setTimeout(() => { key('Space', 'keydown'); }, 900);
        setTimeout(() => { key('Space', 'keyup'); }, 1000);
        setTimeout(() => { key('ShiftLeft', 'keydown'); }, 1400);
      }
      schedule(loop);
    } catch (err) {
      console.error(err);
      const m = bootMsg();
      if (m) { m.style.color = '#ff6a5a'; m.textContent = '启动失败：' + err.message; }
    }
  }

  function bindGlobal() {
    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', e => {
      if (UI.anyScreenOpen()) return;
    }, { passive: true });
    window.addEventListener('keydown', e => {
      if (!UI.anyScreenOpen()) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') UI.moveWheel(1);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') UI.moveWheel(-1);
      if (e.code === 'ArrowUp' || e.code === 'KeyW') UI.moveWheel(-1);
      if (e.code === 'ArrowDown' || e.code === 'KeyS') UI.moveWheel(1);
    });
    // 渲染设置变更
    UI.applySetting('bloom', UI.SET.bloom);
    UI.applySetting('godray', UI.SET.godray);
    UI.applySetting('vol', UI.SET.volume);
    UI.applySetting('mus', UI.SET.music);
    UI.applySetting('fps', UI.SET.showFps);
    camera.fov = UI.SET.fov; camera.updateProjectionMatrix();
  }

  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const db = renderer.getDrawingBufferSize(new THREE.Vector2());
      Post.resize(renderer, db.x, db.y);
    }, 120);
  }

  /* ---------- 画质自适应 ---------- */
  function adaptQuality(dt) {
    fpsTimer += dt;
    if (fpsTimer < 1.0) return;
    fpsTimer = 0;
    fps = frames; frames = 0;
    if (fps < 34) { lowCount++; highCount = 0; } else if (fps > 56) { highCount++; lowCount = 0; }
    if (lowCount >= 3 && quality > 0) {
      quality--; lowCount = 0;
      applyQuality();
      Player.showToast && Player.showToast('画质已自动降低到 ' + ['流畅', '均衡', '极致'][quality]);
    } else if (highCount >= 8 && quality < 1) {
      quality++; highCount = 0;
      applyQuality();
    }
  }
  function applyQuality() {
    Post.setQuality(quality);
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    Post.resize(renderer, db.x, db.y);
    Env.configureShadow ? Env.configureShadow(quality === 0 ? 2048 : (quality === 1 ? 3072 : 4096), quality === 0 ? 180 : 260) : 0;
  }

  /* ---------- 世界状态 ---------- */
  function worldTick(dt) {
    regionTimer -= dt;
    const P = Player.P;
    if (regionTimer <= 0) {
      regionTimer = 3.0;
      const clim = climateAt(P.pos.x, P.pos.z);
      const rn = regionNameAt(P.pos.x, P.pos.z);
      if (rn !== lastRegion) {
        lastRegion = rn;
        UI.setRegion(rn);
        UI.showTitleCard(rn);
      }
      weatherTimer -= 3.0;
      if (weatherTimer <= 0) {
        weatherTimer = 120 + Math.random() * 240;
        Env.rollWeather(clim);
      }
      SND.autoMusic(Env.E.time, clim, Env.E.rain > .4);
      if (CFG.forceWeather) Env.setWeather(CFG.forceWeather);
    }
    // 雷暴闪电
    if (Env.E.weather === 'storm' || (Env.E.weather === 'rain' && Math.random() < .2)) {
      lightningTimer -= dt;
      if (lightningTimer <= 0) {
        lightningTimer = 6 + Math.random() * 22;
        lightning = 1;
        SND.play('thunder');
        const l = new THREE.DirectionalLight(0xcfe0ff, 0);
        scene.add(l);
        l.position.copy(Player.P.pos).add(new THREE.Vector3(200, 400, 200));
        Player._lightningLight = l;
      }
    }
    if (lightning > 0) {
      lightning = max(0, lightning - dt * 3.2);
      if (Player._lightningLight) {
        Player._lightningLight.intensity = lightning * 3.4 * (Math.random() > .3 ? 1 : .2);
        if (lightning <= 0) { scene.remove(Player._lightningLight); Player._lightningLight = null; }
      }
    }
  }

  /* ---------- 主循环 ---------- */
  let frameCount = 0;
  function finishTest() {
    const d = document.createElement('div');
    d.id = 'teststatus';
    d.style.display = 'none';
    d.textContent = 'frames=' + frameCount + ' sceneTris=' + (window.__sceneTris||0) + ' calls=' + (renderer ? renderer.info.render.calls : 0) +
      ' tris=' + (renderer ? renderer.info.render.triangles : 0) +
      ' progs=' + (renderer ? renderer.info.programs.length : 0);
    document.body.appendChild(d);
    const s = document.getElementById('bootMsg');
    if (s) s.textContent = 'TESTDONE frames=' + frameCount + ' errs=' + (window.__errs ? window.__errs.length : 0);
    if (CFG.dumplights) {
      const L = [];
      let np = 0;
      scene.traverse(o => {
        if (o.isDirectionalLight) L.push('DIR ' + o.color.getHexString() + ' i=' + o.intensity.toFixed(3) + ' vis=' + o.visible);
        else if (o.isHemisphereLight) L.push('HEMI sky=' + o.color.getHexString() + ' gnd=' + o.groundColor.getHexString() + ' i=' + o.intensity.toFixed(3));
        else if (o.isAmbientLight) L.push('AMB ' + o.color.getHexString() + ' i=' + o.intensity.toFixed(3));
        else if (o.isPointLight) np++;
      });
      L.push('POINT=' + np);
      L.push('sunColor=' + Env.E.sunColor.getHexString() + ' sunI=' + Env.E.sunIntensity.toFixed(3));
      L.push('skyLight=' + Env.E.skyLight.getHexString() + ' dayF=' + (Env.E.dayF === undefined ? 'undef' : Env.E.dayF.toFixed(3)));
      L.push('env=' + (scene.environment ? 'yes' : 'no') + ' tres=' + renderer.getDrawingBufferSize(new THREE.Vector2()).x + 'x' + renderer.getDrawingBufferSize(new THREE.Vector2()).y);
      L.push('legacy=' + (THREE.ColorManagement ? THREE.ColorManagement.legacyMode : 'n/a'));
      const d = document.createElement('div'); d.id = 'lightdump'; d.style.display = 'none';
      d.textContent = L.join(' || ');
      document.body.appendChild(d);
    }
    if (CFG.shot) grabFrame(renderer);
  }
  function loop() {
    window.__sceneTris = 0;
    if (CFG.frames && frameCount > CFG.frames) return;
    frameCount++;
    if (CFG.frames && frameCount === CFG.frames) { schedule(() => { renderFrame(0); finishTest(); }); return; }
    schedule(loop);
    const dt = min(clock.getDelta(), 0.05);
    elapsed += dt;
    frames++;

    if (!Game.G.started) {
      // 标题界面也渲染场景（缓慢环绕）
      if (postReady) {
        camera.position.set(SPAWN.x + sin(elapsed * .05) * 30, SPAWN.y + 24, SPAWN.z + cos(elapsed * .05) * 30);
        if (CFG.lookup) camera.lookAt(SPAWN.x + 40, SPAWN.y + 160, SPAWN.z + 5);
        else camera.lookAt(SPAWN.x, SPAWN.y + 6, SPAWN.z);
        Env.update(dt, camera.position);
        Terrain.update(SPAWN.x, SPAWN.z, false);
        Terrain.refreshUniforms();
        Water.update(dt, camera.position);
        Flora.update(camera.position, dt);
        Props.update(dt, elapsed);
        UI.update(dt);
        renderFrame(dt);
      }
      return;
    }

    Game.G.playtime += dt;

    // 环境
    Env.update(dt, Player.P.pos);
    Terrain.update(Player.P.pos.x, Player.P.pos.z, false);
    Terrain.refreshUniforms();
    Water.update(dt, camera.position);
    Flora.update(Player.P.pos, dt);
    Props.update(dt, elapsed);
    EnemyMgr.update(dt, Player.P);
    FX.update(dt, camera.position, Env.E);
    Player.update(dt, elapsed);
    worldTick(dt);
    UI.update(dt);
    // 同步雾色/浓度（与天空地平线一致）
    if (scene.fog) {
      const fp = Env.fogParams();
      scene.fog.color.copy(fp.color);
      scene.fog.density = fp.density;
    }

    if (CFG.smoke && !window.__smokeDump && Game.G.playtime > 3.0) {
      window.__smokeDump = true;
      const P = Player.P;
      const d = document.createElement('div');
      d.id = 'smokedump';
      d.style.display = 'none';
      d.textContent = JSON.stringify({
        playtime: +Game.G.playtime.toFixed(2),
        pos: [+P.pos.x.toFixed(1), +P.pos.y.toFixed(1), +P.pos.z.toFixed(1)],
        state: P.state, onGround: P.onGround, stamina: +P.stamina.toFixed(2),
        hearts: Game.G.hearts, maxHearts: Game.G.maxHearts,
        enemies: EnemyMgr.list().length,
        weapons: Game.G.weapons.length, materials: Game.G.materials.length,
        kills: Game.G.kills, rupees: Game.G.rupees,
        hour: +Env.E.time.toFixed(2), region: regionNameAt(P.pos.x, P.pos.z),
        quest: Game.G.quest.text,
        htmlHearts: document.getElementById('hearts').children.length,
        hudOpacity: document.getElementById('hud').style.opacity,
        errs: window.__errs.length,
      });
      document.body.appendChild(d);
    }
    adaptQuality(dt);
    UI.setFps(fps, 'draw ' + renderer.info.render.calls + '  tri ' + (renderer.info.render.triangles / 1000).toFixed(0) + 'k');

    renderFrame(dt);
  }

  function renderFrame(dt) {
    // 默认走直出渲染（无后处理）：在各类设备/软件渲染器上都稳定
    if (!UI.SET.post) {
      renderer.setRenderTarget(null);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
      return;
    }
    const fp = Env.fogParams();
    Post.render(renderer, scene, camera, {
      sunDir: Env.E.sunDir,
      sunColor: Env.E.sunColor,
      sunIntensity: Env.E.sunIntensity * (1 - lightning * .7),
      fogColor: fp.color,
      fogDensity: fp.density,
      time: elapsed,
      rain: Env.E.rain,
      snow: Env.E.snow,
      underwater: Player.P.underwater,
      damage: Player.P.damageFlash || 0,
      exposure: (UI.SET.exposure !== undefined ? UI.SET.exposure : 0.6) * (1 + lightning * 0.6),
      renderSky: Env.renderSkyPass,
    });
  }

  /** 无头调试：回读默认帧缓冲（--screenshot 抓不到 WebGL 图层） */
  function grabFrame(r) {
    try {
      const gl = r.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      // 转成 base64（自写，避免大数组 spread 爆栈）
      let bin = '';
      const CH = 8192;
      for (let i = 0; i < buf.length; i += CH) {
        bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
      }
      const div = document.createElement('div');
      div.id = 'shot';
      div.style.display = 'none';
      div.dataset.w = w; div.dataset.h = h;
      div.textContent = btoa(bin);
      document.body.appendChild(div);
    } catch (e) { __logErr('shot: ' + e.message); }
  }

  return { boot, loop, get renderer() { return renderer; }, get camera() { return camera; }, get scene() { return scene; } };
})();

// 启动
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.boot());
else App.boot();
