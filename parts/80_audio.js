/* =========================================================================
   80_audio.js — WebAudio 现场合成音效与原创环境配乐（无任何外部音频素材）
   ========================================================================= */

const SND = (() => {
  let ctx = null, master = null, sfxBus = null, musBus = null, revBus = null;
  let enabled = true, started = false;
  let currentTrack = null, trackNode = null;
  let lastPlay = {};

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return; }
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = .62; master.connect(ctx.destination);
    // 简易混响（Schroeder）
    revBus = ctx.createGain(); revBus.gain.value = .28;
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(2.4, 3.2);
    revBus.connect(conv); conv.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = .9; sfxBus.connect(master); sfxBus.connect(revBus);
    musBus = ctx.createGain(); musBus.gain.value = .22; musBus.connect(master); musBus.connect(revBus);
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function setVolume(v) { if (master) master.gain.value = v; }
  function setMusicVolume(v) { if (musBus) musBus.gain.value = v; }

  function makeImpulse(dur, decay) {
    const rate = ctx.sampleRate, len = rate * dur;
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /* ---------- 基础发声 ---------- */
  function env(g, t0, a, d, peak, sus, rel) {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(max(0.0001, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(max(0.0001, sus), t0 + a + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + rel);
  }

  function tone(o) {
    if (!enabled || !ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(max(1, o.f2), t0 + (o.dur || .3));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    env(g, t0, o.a || .005, o.d || .04, (o.g || .3), (o.s || .0001), o.r || .12);
    const filt = ctx.createBiquadFilter();
    filt.type = o.filter || 'lowpass';
    filt.frequency.value = o.cut || 8000;
    if (o.q) filt.Q.value = o.q;
    osc.connect(filt); filt.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(t0 + (o.dur || .3) + .35);
  }

  function noise(o) {
    if (!enabled || !ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const len = floor(ctx.sampleRate * (o.dur || .2));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = o.filter || 'bandpass';
    filt.frequency.value = o.cut || 1200;
    filt.Q.value = o.q || 1.2;
    if (o.cut2) filt.frequency.exponentialRampToValueAtTime(max(40, o.cut2), t0 + (o.dur || .2));
    const g = ctx.createGain();
    env(g, t0, o.a || .004, o.d || .03, o.g || .3, o.s || .0001, o.r || .1);
    src.connect(filt); filt.connect(g); g.connect(sfxBus);
    src.start(t0); src.stop(t0 + (o.dur || .2) + .2);
  }

  /* ---------- 音效表 ---------- */
  const SFX = {
    swing: () => { noise({ cut: 2600, cut2: 500, q: .8, dur: .22, g: .28, filter: 'bandpass' }); },
    swingHeavy: () => { noise({ cut: 1400, cut2: 260, q: .7, dur: .35, g: .34 }); tone({ f: 180, f2: 60, type: 'triangle', dur: .25, g: .18 }); },
    hit: () => { noise({ cut: 3000, cut2: 900, dur: .12, g: .3, filter: 'bandpass', q: 2 }); tone({ f: 420, f2: 180, type: 'square', dur: .1, g: .12, cut: 3000 }); },
    hitFlesh: () => { noise({ cut: 700, cut2: 180, dur: .16, g: .3, filter: 'lowpass' }); },
    hurt: () => { tone({ f: 260, f2: 130, type: 'sawtooth', dur: .3, g: .22, cut: 1400 }); noise({ cut: 900, dur: .2, g: .16, filter: 'lowpass' }); },
    jump: () => { tone({ f: 320, f2: 620, type: 'triangle', dur: .18, g: .16, cut: 3000 }); },
    land: () => { noise({ cut: 400, cut2: 120, dur: .22, g: .28, filter: 'lowpass' }); },
    step: (v) => { noise({ cut: 500 + Math.random() * 600, cut2: 200, dur: .09, g: .10 * (v || 1), filter: 'bandpass', q: 1.6 }); },
    splash: () => { noise({ cut: 2200, cut2: 400, dur: .5, g: .3, filter: 'bandpass', q: .6 }); },
    glider: () => { noise({ cut: 700, cut2: 1500, dur: .7, g: .2, filter: 'bandpass', q: .5 }); },
    bow: () => { tone({ f: 900, f2: 300, type: 'triangle', dur: .16, g: .2, cut: 4000 }); noise({ cut: 3200, cut2: 1400, dur: .14, g: .14 }); },
    arrowHit: () => { noise({ cut: 2600, dur: .1, g: .22 }); },
    explode: () => {
      noise({ cut: 1800, cut2: 60, dur: .95, g: .5, filter: 'lowpass', q: .7 });
      tone({ f: 90, f2: 26, type: 'sine', dur: .8, g: .45 });
      noise({ cut: 4200, cut2: 800, dur: .35, g: .22 });
    },
    bombDrop: () => { tone({ f: 500, f2: 220, type: 'square', dur: .14, g: .18, cut: 2200 }); },
    ice: () => { tone({ f: 1400, f2: 2400, type: 'sine', dur: .35, g: .2 }); tone({ f: 2100, f2: 3200, type: 'sine', dur: .3, g: .12, delay: .05 }); },
    runeOn: () => { tone({ f: 700, f2: 1500, type: 'sine', dur: .3, g: .2 }); tone({ f: 1050, f2: 2100, type: 'sine', dur: .3, g: .12, delay: .06 }); },
    runeOff: () => { tone({ f: 1200, f2: 500, type: 'sine', dur: .25, g: .16 }); },
    shrine: () => {
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((f, i) => tone({ f, type: 'sine', dur: 1.4, g: .2, delay: i * .13, a: .01, d: .3, r: 1.0, cut: 6000 }));
    },
    tower: () => {
      const notes = [392, 523, 659, 784, 1047];
      notes.forEach((f, i) => tone({ f, type: 'triangle', dur: 1.8, g: .18, delay: i * .18, a: .01, d: .4, r: 1.2 }));
      noise({ cut: 600, cut2: 4000, dur: 1.4, g: .12, filter: 'bandpass', q: .4 });
    },
    ui: () => { tone({ f: 880, f2: 1320, type: 'sine', dur: .1, g: .14, cut: 6000 }); },
    uiBack: () => { tone({ f: 660, f2: 440, type: 'sine', dur: .1, g: .12 }); },
    chest: () => { tone({ f: 400, f2: 700, type: 'triangle', dur: .3, g: .2 }); tone({ f: 1200, type: 'sine', dur: .5, g: .12, delay: .16 }); },
    pickup: () => { tone({ f: 900, f2: 1600, type: 'sine', dur: .16, g: .16 }); },
    shieldBlock: () => { noise({ cut: 3600, cut2: 1200, dur: .2, g: .32, filter: 'bandpass', q: 2.5 }); tone({ f: 700, f2: 400, type: 'triangle', dur: .18, g: .18 }); },
    whistle: () => { tone({ f: 1500, f2: 2400, type: 'sine', dur: .28, g: .16 }); tone({ f: 2000, f2: 1700, type: 'sine', dur: .3, g: .12, delay: .16 }); },
    death: () => { tone({ f: 300, f2: 60, type: 'sawtooth', dur: 1.6, g: .3, cut: 900 }); },
    cook: () => { noise({ cut: 1800, cut2: 500, dur: .5, g: .2 }); tone({ f: 500, f2: 1100, type: 'triangle', dur: .5, g: .16 }); },
    thunder: () => {
      noise({ cut: 400, cut2: 40, dur: 2.2, g: .5, filter: 'lowpass', q: .5 });
      tone({ f: 60, f2: 20, type: 'sine', dur: 1.8, g: .35 });
    },
    cold: () => { noise({ cut: 4000, dur: 1.2, g: .08, filter: 'highpass' }); },
    guardianCharge: () => { tone({ f: 220, f2: 1400, type: 'sawtooth', dur: 1.2, g: .16, cut: 4000 }); },
    laser: () => { tone({ f: 2600, f2: 900, type: 'sawtooth', dur: .5, g: .22, cut: 6000 }); },
    menuOpen: () => { tone({ f: 520, f2: 780, type: 'triangle', dur: .22, g: .16 }); },
  };

  function play(name, v) {
    init(); resume();
    if (!enabled || !ctx) return;
    const now = performance.now();
    if (lastPlay[name] && now - lastPlay[name] < 32) return;
    lastPlay[name] = now;
    const f = SFX[name];
    if (f) { try { f(v); } catch (e) { } }
  }

  /* ---------- 环境配乐（原创，非任天堂原曲） ---------- */
  // 五声音阶 + 稀疏钢琴音型，模仿旷野的宁静感
  const SCALE = [0, 2, 4, 7, 9];
  const ROOTS = { field: 220, night: 174.6, volcano: 146.8, snow: 196, jungle: 233, cave: 130.8 };

  function noteFreq(root, semi) { return root * pow(2, semi / 12); }

  function playNote(f, t, dur, vel, bus) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = f * 2.003;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + .012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 2600;
    osc.connect(filt); osc2.connect(filt); filt.connect(g); g.connect(bus || musBus);
    osc.start(t); osc.stop(t + dur + .1);
    osc2.start(t); osc2.stop(t + dur + .1);
  }

  function pad(f, t, dur, vel) {
    for (const d of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = f; osc.detune.value = d;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + dur * .35);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 900;
      osc.connect(filt); filt.connect(g); g.connect(musBus);
      osc.start(t); osc.stop(t + dur + .1);
    }
  }

  let musTimer = null, musStep = 0, musMode = 'field';
  function musicStart(mode) {
    init(); resume();
    if (!enabled || !ctx) return;
    musMode = mode;
    if (musTimer) return;
    const beat = 60 / 52;
    musTimer = setInterval(() => {
      if (!enabled || !ctx || ctx.state !== 'running') return;
      const root = ROOTS[musMode] || 220;
      const t = ctx.currentTime + .02;
      // 低音铺底
      if (musStep % 8 === 0) pad(noteFreq(root, 0) / 2, t, beat * 8 * 1.1, .07);
      // 稀疏旋律
      if (Math.random() < (musMode === 'night' ? .45 : .34)) {
        const oct = (Math.random() < .4 ? 12 : 0) + (Math.random() < .2 ? 24 : 0);
        const semi = SCALE[(Math.random() * SCALE.length) | 0];
        playNote(noteFreq(root, semi + oct), t + Math.random() * beat * .5,
          beat * (1.5 + Math.random() * 2), .10 + Math.random() * .06);
      }
      // 偶尔的和声
      if (musStep % 16 === 8 && Math.random() < .5) {
        playNote(noteFreq(root, SCALE[(Math.random() * 5) | 0] + 12), t, beat * 3, .06);
      }
      musStep++;
    }, beat * 1000);
  }
  function musicStop() {
    if (musTimer) { clearInterval(musTimer); musTimer = null; }
  }
  function setMusicMode(m) { if (m !== musMode) musMode = m; }

  /** 由主循环按区域/时间切换 */
  function autoMusic(time, region, raining) {
    let m = 'field';
    if (time > 20 || time < 5) m = 'night';
    else if (region === 'snow') m = 'snow';
    else if (region === 'volcano') m = 'volcano';
    else if (region === 'jungle') m = 'jungle';
    if (raining && m === 'field') m = 'jungle';
    setMusicMode(m);
  }

  function toggle() { enabled = !enabled; if (master) master.gain.value = enabled ? .62 : 0; return enabled; }
  const isEnabled = () => enabled;

  return {
    init, resume, play, musicStart, musicStop, autoMusic, setVolume, setMusicVolume,
    toggle, isEnabled, get ctx() { return ctx; },
  };
})();
