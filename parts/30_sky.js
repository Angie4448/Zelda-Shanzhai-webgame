/* =========================================================================
   30_sky.js — 大气散射天空 / 昼夜循环 / 星空 / 云 / 天气 / 环境光照
   ========================================================================= */

const SKY_U = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
  uSunColor: { value: new THREE.Color(1, .97, .92) },
  uSunI: { value: 1 },
  uTime: { value: 0 },
  uTurbidity: { value: 1 },
  uCloudTex: { value: null },
  uCloudCover: { value: .42 },
  uCloudSpeed: { value: .0022 },
  uStarI: { value: 1 },
  uMoonPhase: { value: .92 },
  uAurora: { value: 0 },
  uRainbow: { value: 0 },
  uFrame: { value: 0 },
};

const SKY_VERT = /* glsl */`
varying vec3 vWorldDir;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/* 单次散射大气 + 太阳/月亮圆盘 + 星空 + 云层 */
const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vWorldDir;
uniform vec3 uSunDir, uMoonDir, uSunColor;
uniform float uSunI, uTime, uTurbidity, uCloudCover, uCloudSpeed, uStarI, uMoonPhase, uAurora, uRainbow;
uniform sampler2D uCloudTex;

const float PI = 3.14159265359;
const float Rg = 6360e3;      // 地面半径
const float Rt = 6420e3;      // 大气顶
const float Hr = 7994.0;      // 瑞利标高
const float Hm = 1200.0;      // 米氏标高
const vec3  BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const float BM = 21e-6;
const float gM = 0.758;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash31(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void rayleighMie(vec3 ro, vec3 rd, out vec3 rayleigh, out vec3 mie){
  rayleigh = vec3(0.0); mie = vec3(0.0);
  float tMax = 1.0e9;
  float dRg = dot(rd, -ro);
  if (dRg > 0.0){
    float d2 = dot(ro, ro) - Rg * Rg;
    float disc = dRg * dRg - d2;
    if (disc > 0.0) tMax = -dRg - sqrt(disc);
  }
  // 大气顶：解 t^2 + 2t*dot(ro,rd) + |ro|^2 - Rt^2 = 0
  float dRt = dot(rd, -ro);                 // = -dot(ro, rd)
  float d2t = dot(ro, ro) - Rt * Rt;
  float discT = dRt * dRt - d2t;
  if (discT > 0.0) tMax = min(tMax, dRt + sqrt(discT));
  tMax = min(tMax, 4.0e5);

  const int N = 12;
  float dt = tMax / float(N);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  float mu = dot(rd, uSunDir);
  for (int i = 0; i < N; i++){
    vec3 p = ro + rd * (float(i) + 0.5) * dt;
    float h = max(0.0, length(p) - Rg);
    float hr = exp(-h / Hr) * dt;
    float hm = exp(-h / Hm) * dt;
    odR += hr; odM += hm;

    // 到太阳的光学厚度（近似：按高度线性比例，省一次积分）
    float hSun = max(0.0, length(p) - Rg);
    float sr = exp(-hSun / Hr);
    float sm = exp(-hSun / Hm);
    float sunUp = smoothstep(-0.12, 0.06, uSunDir.y);
    vec3 tau = BR * (odR + sr * 9000.0) + vec3(BM * 1.1) * (odM + sm * 1600.0);
    vec3 attn = exp(-tau) * sunUp;
    sumR += hr * attn;
    sumM += hm * attn;
  }
  float muR = mu;
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + muR * muR);
  float g2 = gM * gM;
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + muR * muR)) /
    ((2.0 + g2) * pow(max(0.0, 1.0 + g2 - 2.0 * gM * muR), 1.5));
  rayleigh = BR * phaseR * sumR * 22.0;
  mie = vec3(BM) * phaseM * sumM * 22.0 * uTurbidity;
}

/* 云层：射线与高度 hPlane 的平面相交，采样噪声纹理 */
float cloudLayer(vec3 rd, float hPlane, float scale, float offset, float cover, float sharp){
  if (rd.y < 0.012) return 0.0;
  float t = hPlane / rd.y;
  if (t > 90000.0) return 0.0;
  vec2 uv = (rd.xz / rd.y) * scale + vec2(uTime * uCloudSpeed * (1.0 + offset), offset * 3.0);
  float n = texture2D(uCloudTex, uv * 0.5).a;
  float n2 = texture2D(uCloudTex, uv * 1.31 + vec2(uTime * uCloudSpeed * 1.7, 0.31)).a;
  float c = n * 0.66 + n2 * 0.44;
  c = smoothstep(cover - 0.10, cover + sharp, c);
  // 地平线附近拉长并淡出
  c *= smoothstep(0.012, 0.16, rd.y);
  return clamp(c, 0.0, 1.0);
}

void main(){
  vec3 rd = normalize(vWorldDir);
  vec3 ro = vec3(0.0, Rg + 2.0, 0.0);

  vec3 rayleigh, mie;
  rayleighMie(ro, rd, rayleigh, mie);
  vec3 col = rayleigh + mie;

  // 太阳圆盘 + 光晕
  float mu = dot(rd, uSunDir);
  float sunDisc = smoothstep(0.99975, 0.99995, mu);
  float sunGlow = pow(max(0.0, mu), 220.0) * 0.55 + pow(max(0.0, mu), 14.0) * 0.10;
  vec3 sunTint = mix(vec3(1.0, 0.52, 0.20), vec3(1.0, 0.96, 0.88),
    smoothstep(0.0, 0.35, uSunDir.y));
  col += sunTint * (sunDisc * 26.0 + sunGlow) * uSunI;

  // 月亮：带相位
  float mm = dot(rd, uMoonDir);
  float moonUp = smoothstep(-0.06, 0.10, uMoonDir.y);
  if (moonUp > 0.001){
    vec3 up = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0001)));
    vec3 right = normalize(cross(up, uMoonDir));
    vec2 mp = vec2(dot(rd, right), dot(rd, up)) / 0.0155;
    float r = length(mp);
    float disc = 1.0 - smoothstep(0.94, 1.0, r);
    // 相位：把圆盘与偏移圆做差
    float ph = uMoonPhase;
    vec2 off = vec2(1.15 * (1.0 - ph) * 2.0, 0.0);
    float sphere = 1.0 - smoothstep(0.94, 1.0, length(mp - off * 0.65));
    float lit = clamp(disc - sphere * step(0.02, 1.0 - ph), 0.0, 1.0);
    float craters = 0.82 + 0.18 * hash21(floor(mp * 5.0));
    vec3 moonCol = vec3(0.92, 0.95, 1.0);
    col += moonCol * lit * craters * 3.4 * moonUp;
    col += moonCol * pow(max(0.0, mm), 400.0) * 0.5 * moonUp;
    col += vec3(0.28, 0.36, 0.55) * pow(max(0.0, mm), 5.0) * 0.035 * moonUp;
  }

  // 星空
  float night = clamp(1.0 - smoothstep(-0.10, 0.10, uSunDir.y), 0.0, 1.0);
  if (night > 0.004 && uStarI > 0.004){
    float i = uStarI * night;
    // 三层不同密度的星点
    vec2 sp = rd.xz / max(0.08, rd.y + 0.55);
    for (int k = 0; k < 3; k++){
      float f = 26.0 + float(k) * 61.0;
      float h = hash21(floor(sp * f) + float(k) * 37.0);
      vec2 g = fract(sp * f) - 0.5;
      float star = smoothstep(0.5, 0.0, length(g) * 5.0) * step(0.9865 - float(k) * 0.0016, h);
      float tw = 0.65 + 0.35 * sin(uTime * (2.2 + h * 5.0) + h * 99.0);
      vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.88, 0.72), hash21(floor(sp * f) + 11.0));
      col += tint * star * tw * i * 2.6;
    }
    // 银河带
    float band = 1.0 - smoothstep(0.0, 0.30, abs(dot(normalize(rd), normalize(vec3(0.42, 0.36, -0.83)))));
    float mw = band * (0.5 + 0.5 * hash21(floor(sp * 140.0)));
    mw *= 0.4 + 0.6 * smoothstep(0.35, 0.85, hash21(floor(sp * 44.0)));
    col += vec3(0.42, 0.48, 0.70) * mw * 0.055 * i;
  }

  // 极光（赫布拉之夜）
  if (uAurora > 0.01 && night > 0.02){
    float band = exp(-pow((rd.y - 0.34) * 3.2, 2.0));
    float w = 0.5 + 0.5 * sin(atan(rd.z, rd.x) * 3.0 + uTime * 0.22);
    float a = band * w * (0.4 + 0.6 * hash21(floor(rd.xz * 90.0)));
    col += vec3(0.12, 0.95, 0.55) * a * uAurora * night * 0.55;
    col += vec3(0.35, 0.55, 1.0) * a * uAurora * night * 0.22;
  }

  // 云层（两层视差）
  float cl1 = cloudLayer(rd, 2600.0, 0.30, 0.13, 0.74 - uCloudCover * 0.42, 0.30);
  float cl2 = cloudLayer(rd, 1500.0, 0.55, 0.71, 0.80 - uCloudCover * 0.30, 0.42);
  float cloudA = clamp(cl1 * 0.72 + cl2 * 0.55, 0.0, 1.0);

  // 云受日照：面向太阳一侧更亮
  vec3 sunUpDir = normalize(uSunDir + vec3(0.0, 0.32, 0.0));
  float cloudLit = 0.5 + 0.5 * dot(rd, sunUpDir);
  float dayF = clamp(uSunDir.y * 3.4 + 0.22, 0.0, 1.0);
  vec3 cloudWhite = mix(vec3(0.72, 0.74, 0.80), sunTint * 1.06, dayF * 0.85);
  vec3 cloudDark = mix(vec3(0.13, 0.15, 0.22), vec3(0.42, 0.44, 0.52), dayF);
  vec3 cloudCol = mix(cloudDark, cloudWhite, pow(cloudLit, 1.5));
  // 日落时云底染红
  cloudCol += sunTint * pow(max(0.0, dot(rd, uSunDir)), 3.0) * 0.45 * (1.0 - dayF * 0.4);
  col = mix(col, cloudCol, cloudA * 0.92);

  // 彩虹
  if (uRainbow > 0.01){
    float a = acos(clamp(dot(rd, -uSunDir), -1.0, 1.0));
    float d = a - 0.72;
    float band = exp(-d * d * 340.0);
    float hue = clamp((a - 0.68) / 0.16, 0.0, 1.0);
    vec3 rb = vec3(0.5) + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    col += rb * band * uRainbow * 0.45 * clamp(uSunDir.y * 4.0, 0.0, 1.0);
  }

  // 地面方向压暗（避免地平线以下穿帮）
  col *= mix(0.42, 1.0, smoothstep(-0.09, 0.02, rd.y));

  gl_FragColor = vec4(col, 1.0);
}`;

/* 环境贴图专用天空：结构简单、数值安全，专供 PMREM 生成 IBL */
const ENV_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ENV_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir, uSunColor;
uniform float uSunI, uCloudCover;
void main(){
  vec3 d = normalize(vDir);
  float dayF = smoothstep(-0.12, 0.28, uSunDir.y);
  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 zenith  = mix(vec3(0.035, 0.055, 0.15), vec3(0.14, 0.30, 0.62), dayF);
  vec3 horizon = mix(vec3(0.045, 0.065, 0.14), vec3(0.58, 0.70, 0.84), dayF);
  vec3 sunTint = mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.95, 0.88),
                     smoothstep(0.0, 0.38, uSunDir.y));
  float dusk = 1.0 - smoothstep(0.03, 0.42, abs(uSunDir.y));
  horizon = mix(horizon, sunTint * 0.9, dusk * 0.62);
  vec3 col = mix(horizon, zenith, pow(up, 0.62));
  col = mix(col, vec3(0.085, 0.10, 0.075), smoothstep(0.0, -0.30, d.y));
  float mu = max(dot(d, uSunDir), 0.0);
  col += sunTint * pow(mu, 10.0) * 0.22 * dayF;
  col += sunTint * pow(mu, 260.0) * 2.2 * dayF;
  col *= mix(1.0, 0.55, clamp(uCloudCover, 0.0, 1.0) * 0.8);
  gl_FragColor = vec4(clamp(col, 0.0, 6.0), 1.0);
}`;

/* =========================================================================
   Env — 环境总控
   ========================================================================= */
const Env = (() => {
  const E = {
    time: 7.6,              // 游戏内小时 0..24
    dayLength: 24 * 60,     // 一个游戏日 = 24 分钟真实时间（与原作一致：1 分钟 = 1 小时）
    day: 1,
    sunDir: new THREE.Vector3(),
    moonDir: new THREE.Vector3(),
    sunColor: new THREE.Color(1, .96, .9),
    sunIntensity: 1,
    moonIntensity: 0,
    skyLight: new THREE.Color(.5, .62, .8),
    rain: 0, snow: 0, cloudCover: .42, fogBoost: 0, wind: 1,
    wetness: 0, temperature: 18,
    weather: 'clear', weatherTimer: 300,
    bloodMoon: false,
    quality: 1,
  };

  let scene, skyMat, envMat, skyMesh, skyScene, skyPassScene, skyPassMesh, envMesh, envRT, pmrem, renderer, skyCubeRT, skyCubeCam;
  let lastEnvTime = -999;
  const _v = new THREE.Vector3();

  function sunDirFor(t) {
    // t: 0..24 小时。日出 5:00，日落 19:00
    const f = clamp01((t - 5) / 14);              // 0 日出，1 日落
    const elev = sin(f * PI) * 1.32 - 0.06;        // 弧度（略高，热带感）
    const azim = lerp(-1.95, 1.95, f);             // 东 → 西
    const ce = cos(elev);
    return new THREE.Vector3(sin(azim) * ce, sin(elev), cos(azim) * ce * 0.86).normalize();
  }

  function updateSun() {
    const t = E.time;
    E.sunDir.copy(sunDirFor(t));
    // 月亮：与太阳大致相对，带一点倾角
    const mf = clamp01((t - 19) / 10) || clamp01((t + 5) / 10);
    E.moonDir.copy(sunDirFor(mod(t + 12, 24)));
    E.moonDir.y = abs(E.moonDir.y) * .92 + .04;
    E.moonDir.normalize();
  }

  function evalLighting() {
    const sy = E.sunDir.y;
    const dayF = smoothstep(-0.13, 0.22, sy);
    const duskF = 1 - smoothstep(0.02, 0.42, abs(sy));
    // 太阳颜色：低角度红橙，高角度暖白
    const k = lerp(1900, 6200, smoothstep(-0.02, 0.55, sy));
    const c = kelvinToRGB(k);
    E.sunColor.setRGB(c[0], c[1], c[2]);
    const weatherDim = 1 - E.cloudCover * 0.42 - E.rain * 0.30 - E.snow * 0.22;
    E.sunIntensity = clamp01(dayF * 3.4) * (1.0 + E.cloudCover * .08) * weatherDim * 0.95;
    E.moonIntensity = clamp01((1 - dayF)) * 0.115 * (1 - E.cloudCover * .5);
    // 环境（天光）：白天偏蓝、黄昏偏紫、夜晚深蓝
    const skyDay = new THREE.Color(.36, .52, .78);
    const skyDusk = new THREE.Color(.52, .32, .34);
    const skyNight = new THREE.Color(.05, .08, .20);
    const c2 = skyNight.clone().lerp(skyDay, dayF);
    c2.lerp(skyDusk, duskF * .55);
    E.skyLight.copy(c2);
    E.dayF = dayF;
    E.duskF = duskF;
  }

  function init(rnd, sc) {
    renderer = rnd; scene = sc;
    E.quality = 1;

    SKY_U.uCloudTex.value = TexGen.C.cloud(512, 3);
    SKY_U.uCloudTex.value.wrapS = SKY_U.uCloudTex.value.wrapT = THREE.RepeatWrapping;

    skyMat = new THREE.ShaderMaterial({
      uniforms: SKY_U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      fog: false, toneMapped: false,
    });

    // 用于 PMREM 的独立场景（球心必须在原点，方向才对）
    skyScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(10, 24, 16);
    envMesh = new THREE.Mesh(envGeo, envMat);
    envMesh.frustumCulled = false;
    skyScene.add(envMesh);

    // 屏幕空间天空专用场景（球跟着相机走，供大气雾取色）
    skyPassScene = new THREE.Scene();
    skyPassMesh = new THREE.Mesh(envGeo, skyMat);
    skyPassMesh.frustumCulled = false;
    skyPassMesh.renderOrder = -1000;
    skyPassScene.add(skyPassMesh);

    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    envRT = pmrem.fromScene(skyScene, 0, 0.1, 100);
    scene.environment = envRT.texture;

    envMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: SKY_U.uSunDir, uSunColor: SKY_U.uSunColor,
        uSunI: SKY_U.uSunI, uCloudCover: SKY_U.uCloudCover,
      },
      vertexShader: ENV_VERT, fragmentShader: ENV_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    });

    // 天空立方体贴图（水面反射用）
    skyCubeRT = new THREE.WebGLCubeRenderTarget(128, {
      format: THREE.RGBAFormat, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    skyCubeCam = new THREE.CubeCamera(0.5, 400, skyCubeRT);
    skyCubeCam.update(renderer, skyScene);

    // 天空穹顶：以相机为中心的小球（BackSide），只做背景
    const geo = new THREE.SphereGeometry(10, 32, 20);
    skyMesh = new THREE.Mesh(geo, skyMat);
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -1000;
    scene.add(skyMesh);

    // 太阳光
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    E.sun = sun;
    scene.add(sun);
    scene.add(sun.target);

    // 月亮光
    const moon = new THREE.DirectionalLight(0x88aaff, 0);
    E.moon = moon;
    scene.add(moon);
    scene.add(moon.target);

    // 半球光（天空/地面反射）
    const hemi = new THREE.HemisphereLight(0x8fb8ff, 0x3a3020, .30);
    E.hemi = hemi;
    scene.add(hemi);

    // 环境光兜底（防止完全漆黑）
    const amb = new THREE.AmbientLight(0x2a3550, .12);
    E.amb = amb;
    scene.add(amb);

    configureShadow(4096 * (E.quality ? 1 : .5), 260);
    updateSun();
    evalLighting();
    return E;
  }

  function configureShadow(size, range) {
    const s = E.sun;
    if (!s) return;
    s.shadow.mapSize.set(size, size);
    s.shadow.camera.left = -range; s.shadow.camera.right = range;
    s.shadow.camera.top = range; s.shadow.camera.bottom = -range;
    s.shadow.camera.near = 1; s.shadow.camera.far = 900;
    s.shadow.bias = -0.0006;
    s.shadow.normalBias = 0.22;
    s.shadow.radius = 2.2;
    if (s.shadow.map) { s.shadow.map.dispose(); s.shadow.map = null; }
  }

  const RAIN_STATES = {
    clear: { cloud: .30, rain: 0, fog: 0, snow: 0 },
    partly: { cloud: .55, rain: 0, fog: .1, snow: 0 },
    cloudy: { cloud: .82, rain: 0, fog: .35, snow: 0 },
    rain: { cloud: .95, rain: .85, fog: .7, snow: 0 },
    storm: { cloud: 1.0, rain: 1.0, fog: .95, snow: 0 },
    snow: { cloud: .9, rain: 0, fog: .6, snow: .85 },
    foggy: { cloud: .5, rain: 0, fog: 1.0, snow: 0 },
  };

  function setWeather(name, instant) {
    const w = RAIN_STATES[name] || RAIN_STATES.clear;
    E.weather = name;
    E._target = w;
    if (instant) { E.cloudCover = w.cloud; E.rain = w.rain; E.fogBoost = w.fog; E.snow = w.snow; }
    E.weatherTimer = 180 + Math.random() * 420;
  }

  /** 按区域气候漂移天气（每次调用可能换天气） */
  function rollWeather(climate) {
    const roll = Math.random();
    let name = 'clear';
    if (climate === 'snow') name = roll < .5 ? 'snow' : (roll < .78 ? 'cloudy' : 'clear');
    else if (climate === 'volcano') name = roll < .45 ? 'foggy' : (roll < .7 ? 'cloudy' : 'clear');
    else if (climate === 'desert') name = roll < .72 ? 'clear' : (roll < .92 ? 'partly' : 'cloudy');
    else if (climate === 'jungle') name = roll < .45 ? 'rain' : (roll < .7 ? 'cloudy' : 'partly');
    else name = roll < .5 ? 'clear' : (roll < .74 ? 'partly' : (roll < .9 ? 'cloudy' : 'rain'));
    setWeather(name);
  }

  function update(dt, camPos) {
    E.time += dt * (24 / E.dayLength);
    if (E.time >= 24) { E.time -= 24; E.day++; }
    E.weatherTimer -= dt;

    // 天气缓动
    const tg = E._target;
    if (tg) {
      E.cloudCover = damp(E.cloudCover, tg.cloud, .28, dt);
      E.rain = damp(E.rain, tg.rain, .35, dt);
      E.fogBoost = damp(E.fogBoost, tg.fog, .3, dt);
      E.snow = damp(E.snow, tg.snow, .35, dt);
    }
    // 雨后湿滑
    E.wetness = damp(E.wetness, E.rain > .25 ? 1 : 0, .06, dt);

    updateSun();
    evalLighting();

    SKY_U.uSunDir.value.copy(E.sunDir);
    SKY_U.uMoonDir.value.copy(E.moonDir);
    SKY_U.uSunColor.value.copy(E.sunColor);
    SKY_U.uSunI.value = E.sunIntensity * .9 + .04;
    SKY_U.uTime.value += dt;
    SKY_U.uCloudCover.value = E.cloudCover;
    SKY_U.uTurbidity.value = 1 + E.fogBoost * 1.6 + E.rain * .8;
    SKY_U.uStarI.value = 1 - E.cloudCover * .85;
    SKY_U.uMoonPhase.value = .62 + .34 * sin(E.day * 1.7);
    SKY_U.uAurora.value = (E.temperature < -6 ? smoothstep(-6, -18, E.temperature) : 0) * .9;
    SKY_U.uRainbow.value = damp(SKY_U.uRainbow.value, (E.rain > .1 && E.rain < .7 &&
      E.sunDir.y > .05) ? .5 : 0, .5, dt);

    // 光源跟随相机（阴影级联简化：把阴影相机绑在玩家身上）
    if (camPos) {
      E.sun.target.position.set(camPos.x, camPos.y - 20, camPos.z);
      E.sun.position.set(camPos.x, camPos.y - 20, camPos.z).addScaledVector(E.sunDir, 320);
      E.sun.target.updateMatrixWorld();
      E.moon.target.position.set(camPos.x, camPos.y, camPos.z);
      E.moon.position.set(camPos.x, camPos.y, camPos.z).addScaledVector(E.moonDir, 300);
      E.moon.target.updateMatrixWorld();
      if (skyMesh) skyMesh.position.copy(camPos);
    }

    E.sun.color.copy(E.sunColor);
    E.sun.intensity = E.sunIntensity;
    E.sun.visible = E.sunIntensity > 0.005;
    E.moon.color.setRGB(.62, .72, 1.0);
    E.moon.intensity = E.moonIntensity;
    E.moon.visible = E.moonIntensity > 0.002;
    E.hemi.color.copy(E.skyLight).multiplyScalar(1.2);
    // 地面反照：草地/沙/雪会反射不同颜色
    E.hemi.groundColor.setRGB(.10, .10, .07);
    E.hemi.intensity = .26 + E.dayF * .26;
    E.amb.intensity = .09 + (1 - E.dayF) * .12;

    // 环境贴图刷新（每 1.5 秒游戏时间）
    if (E.time - lastEnvTime > 0.35 || E.time < lastEnvTime) {
      lastEnvTime = E.time;
      refreshEnv();
    }
  }

  let envSkip = 0;
  function refreshEnv() {
    if (!pmrem) return;
    if (envSkip++ % 2) return;
    if (envMesh) envMesh.position.set(0, 0, 0);   // 必须回到原点，否则环境贴图方向全错
    const old = envRT;
    envRT = pmrem.fromScene(skyScene, 0, 0.1, 100);
    scene.environment = envRT.texture;
    if (old) old.dispose();
    if (skyCubeCam) skyCubeCam.update(renderer, skyScene);
  }
  const skyCube = () => skyCubeRT ? skyCubeRT.texture : null;

  /** 后处理专用：把纯天空渲染到指定目标（供大气雾取色） */
  function renderSkyPass(rnd, cam, target) {
    if (!skyPassScene) return;
    skyPassMesh.position.copy(cam.position);
    rnd.setRenderTarget(target);
    rnd.clear(true, false, false);
    rnd.render(skyPassScene, cam);
  }

  function forceEnv() { lastEnvTime = -999; refreshEnv(); }

  /** 为后处理提供：地平线雾颜色 & 密度 */
  function fogParams() {
    const sy = E.sunDir.y;
    const horizon = new THREE.Color(
      Math.max(0.03, E.skyLight.r * .34),
      Math.max(0.04, E.skyLight.g * .40),
      Math.max(0.05, E.skyLight.b * .52));
    horizon.lerp(new THREE.Color(.55, .52, .48), E.cloudCover * .18 + E.fogBoost * .25);
    const density = 0.00034 + E.fogBoost * 0.0013 + E.rain * 0.0015 + E.snow * 0.0012;
    return { color: horizon, density };
  }

  return {
    E, init, update, setWeather, rollWeather, fogParams, forceEnv, sunDirFor,
    SKY_U, refreshEnv, skyCube, renderSkyPass, skyMat: () => skyMat, configureShadow,
  };
})();
