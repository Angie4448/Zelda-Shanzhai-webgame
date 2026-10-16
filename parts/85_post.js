/* =========================================================================
   85_post.js — 自研后处理管线
   大气透视雾 / SSAO / Bloom / 体积光 / FXAA / ACES / 调色
   ========================================================================= */

const Post = (() => {
  let W = 2, H = 2, pr = 1, quality = 1;
  let sceneRT, skyRT, pingA, pingB, godRT, bloomRT = [], accA, accB, passCopyHDR;
  let quad, quadCam, quadScene;

  const U = {
    uColor: { value: null },
    uSky: { value: null },
    uDepth: { value: null },
    uSrc: { value: null },
    uAdd: { value: null },
    uBloomTex: { value: null },
    uGodTex: { value: null },
    uHorizonY: { value: 0.5 },
    uDepthDbg: { value: CFG.depthview ? 1 : 0 },
    uHaze: { value: 0.22 },
    uNoAces: { value: CFG.noaces ? 1 : 0 },
    uEnv: { value: null },
    uNear: { value: 0.3 },
    uFar: { value: 4000 },
    uInvViewProj: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uTexel: { value: new THREE.Vector2(1 / 2, 1 / 2) },
    uDir: { value: new THREE.Vector2(1, 0) },
    uFogColor: { value: new THREE.Color(0.5, 0.6, 0.75) },
    uFogDensity: { value: 0.0012 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSunI: { value: 1 },
    uSunScreen: { value: new THREE.Vector2(.5, .5) },
    uTime: { value: 0 },
    uThreshold: { value: 0.95 },
    uRadius: { value: 1.0 },
    uExposure: { value: 0.60 },
    uBloomA: { value: 0.16 },
    uGodrayA: { value: 0.28 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.016 },
    uChroma: { value: 0.0014 },
    uGrade: { value: new THREE.Vector3(1, 1, 1) },
    uSaturation: { value: 1.24 },
    uContrast: { value: 1.06 },
    uUnderwater: { value: 0 },
    uDamage: { value: 0 },
    uRain: { value: 0 },
    uSnow: { value: 0 },
    uFxaa: { value: 1 },
  };

  const VERT = `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  const COMMON = `
    precision highp float;
    varying vec2 vUv;
    uniform vec2 uTexel;
    uniform sampler2D uDepth;
    uniform float uNear, uFar;
    uniform mat4 uInvViewProj;
    uniform vec3 uCamPos;

    float rawDepth(vec2 uv){ return texture2D(uDepth, uv).x; }
    float linearDepth(float d){
      float z = d * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }
    vec3 worldFromDepth(vec2 uv, float d){
      vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      vec4 wp = uInvViewProj * ndc;
      return wp.xyz / wp.w;
    }
    float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float vn(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y);
    }
    float fb(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=0.5;} return s; }
  `;

  /* ---------- 大气透视雾 ---------- */
  const FOG_FRAG = COMMON + `
    uniform sampler2D uColor, uSky;
    uniform vec3 uFogColor, uSunDir, uSunColor;
    uniform float uFogDensity, uSunI, uTime, uRain, uSnow, uUnderwater;

    uniform float uHorizonY;
    uniform float uDepthDbg;
    uniform float uHaze;
    void main(){
      vec4 c = texture2D(uColor, vUv);
      float d = rawDepth(vUv);
      if (!(d == d)) d = 1.0;
      if (uDepthDbg > 0.5) { gl_FragColor = vec4(vec3(d, clamp(linearDepth(d) / 200.0, 0.0, 1.0), 0.0), 1.0); return; }
      if (d >= 0.9995){ gl_FragColor = vec4(c.rgb, 1.0); return; }
      float dist = linearDepth(d);
      vec3 wp = worldFromDepth(vUv, d);
      vec3 V = normalize(wp - uCamPos);
      // 距离雾已由 three 的 scene.fog 处理；这里只做方向性的太阳内散射

      float t = clamp(uHaze * (1.0 - smoothstep(0.0, 900.0, dist)), 0.0, 1.0);

      // 解析地平线天光：不做纹理依赖，数值绝对稳定
      vec3 hdir = normalize(vec3(V.x, 0.0, V.z) + vec3(1e-5, 0.0, 0.0));
      float hmu = max(dot(hdir, vec3(uSunDir.x, 0.0, uSunDir.z) /
                          max(0.0001, length(vec3(uSunDir.x, 0.0, uSunDir.z)))), 0.0);
      float sunUp = clamp(uSunDir.y * 3.2, 0.0, 1.0);
      vec3 horizonCol = uFogColor * (0.92 + 0.20 * sunUp);
      horizonCol += uSunColor * pow(hmu, 5.0) * 0.42 * uSunI * (1.0 - sunUp * 0.45);
      horizonCol += uSunColor * pow(hmu, 48.0) * 0.75 * uSunI;

      float mu = max(dot(V, uSunDir), 0.0);
      float g = 0.76;
      float hg = (1.0 - g * g) / (4.0 * 3.14159265 * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
      float mie = clamp(hg * 0.10 + pow(mu, 20.0) * 0.16, 0.0, 0.30);
      vec3 inscatter = horizonCol + uSunColor * mie * uSunI;
      inscatter = mix(inscatter, uFogColor, uRain * 0.22 + uSnow * 0.28);
      inscatter = min(inscatter, vec3(1.25));

      vec3 col = mix(c.rgb, inscatter, t);

      // 雨雪在场：近处加湿气
      if (uRain > 0.05 || uSnow > 0.05){
        float near = 1.0 - exp(-dist * 0.010 * (uRain + uSnow));
        col = mix(col, uFogColor * 1.15, near * 0.25 * (uRain + uSnow));
      }
      if (uUnderwater > 0.01){
        vec3 uw = vec3(0.035, 0.20, 0.30);
        float ut = 1.0 - exp(-dist * 0.055);
        col = mix(col, uw, ut * uUnderwater);
      }
      gl_FragColor = vec4(col, 1.0);
    }`;

  /* ---------- SSAO ---------- */
  const AO_FRAG = COMMON + `
    uniform sampler2D uColor;
    uniform float uTime;
    float hash31(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
    void main(){
      float d = rawDepth(vUv);
      vec4 base = texture2D(uColor, vUv);
      // 深度不可用（NaN / 远平面）时直接跳过 AO
      if (!(d == d) || d >= 0.9995){ gl_FragColor = base; return; }
      vec3 P = worldFromDepth(vUv, d);
      vec3 px = worldFromDepth(vUv + vec2(uTexel.x, 0.0), rawDepth(vUv + vec2(uTexel.x, 0.0)));
      vec3 py = worldFromDepth(vUv + vec2(0.0, uTexel.y), rawDepth(vUv + vec2(0.0, uTexel.y)));
      vec3 N = normalize(cross(px - P, py - P));
      if (N.y < 0.0) N = -N;

      float dist = linearDepth(d);
      float radius = clamp(1.8 + dist * 0.028, 1.2, 16.0);
      float occ = 0.0;
      float seed = hash31(vec3(vUv * 713.0, fract(uTime)));
      for (int i = 0; i < 8; i++){
        float fi = float(i);
        float a = (fi + seed * 8.0) * 2.39996;
        float r = radius * sqrt((fi + 0.5) / 8.0);
        vec2 off = vec2(cos(a), sin(a)) * r;
        vec2 suv = vUv + off * uTexel;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
        float sd = rawDepth(suv);
        if (sd >= 0.99995) continue;
        vec3 SP = worldFromDepth(suv, sd);
        vec3 diff = SP - P;
        float dl = length(diff);
        if (dl < 0.001) continue;
        float ndl = max(0.0, dot(N, diff / dl));
        float range = smoothstep(0.0, 1.0, radius / max(dl, 0.001));
        occ += ndl * range;
      }
      float ao = clamp(1.0 - occ / 8.0 * 1.7, 0.0, 1.0);
      ao = pow(ao, 1.2);
      gl_FragColor = vec4(base.rgb * mix(1.0, ao, 0.8), 1.0);
    }`;

  /* ---------- 亮度提取 ---------- */
  const BRIGHT_FRAG = COMMON + `
    uniform sampler2D uSrc;
    uniform float uThreshold;
    void main(){
      vec3 c = texture2D(uSrc, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float k = max(0.0, l - uThreshold) / max(l, 0.0001);
      gl_FragColor = vec4(c * k * smoothstep(0.0, 0.08, l), 1.0);
    }`;

  const DOWN_FRAG = COMMON + `
    uniform sampler2D uSrc;
    uniform vec2 uDir;
    void main(){
      vec2 t = uTexel * uDir;
      vec3 s = texture2D(uSrc, vUv).rgb * 0.1964825501511404;
      s += (texture2D(uSrc, vUv + t * 1.411764705882353).rgb + texture2D(uSrc, vUv - t * 1.411764705882353).rgb) * 0.2969069646728344;
      s += (texture2D(uSrc, vUv + t * 3.2941176470588234).rgb + texture2D(uSrc, vUv - t * 3.2941176470588234).rgb) * 0.09447039785044732;
      s += (texture2D(uSrc, vUv + t * 5.176470588235294).rgb + texture2D(uSrc, vUv - t * 5.176470588235294).rgb) * 0.010381362401148057;
      gl_FragColor = vec4(s, 1.0);
    }`;

  const UP_FRAG = COMMON + `
    uniform sampler2D uSrc, uAdd;
    uniform float uRadius;
    void main(){
      vec2 t = uTexel * uRadius;
      vec3 s = texture2D(uSrc, vUv).rgb * 0.25;
      s += (texture2D(uSrc, vUv + vec2(t.x,0.0)).rgb + texture2D(uSrc, vUv - vec2(t.x,0.0)).rgb +
            texture2D(uSrc, vUv + vec2(0.0,t.y)).rgb + texture2D(uSrc, vUv - vec2(0.0,t.y)).rgb) * 0.125;
      s += (texture2D(uSrc, vUv + t).rgb + texture2D(uSrc, vUv - t).rgb +
            texture2D(uSrc, vUv + vec2(t.x,-t.y)).rgb + texture2D(uSrc, vUv + vec2(-t.x,t.y)).rgb) * 0.0625;
      gl_FragColor = vec4(texture2D(uAdd, vUv).rgb + s, 1.0);
    }`;

  const GOD_FRAG = COMMON + `
    uniform sampler2D uSrc;
    uniform vec2 uSunScreen;
    uniform float uSunI;
    void main(){
      vec2 dir = uSunScreen - vUv;
      float len = length(dir);
      if (len < 0.001 || uSunI < 0.01){ gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
      dir /= len;
      float w = 1.0, tot = 0.0;
      vec3 acc = vec3(0.0);
      vec2 uv = vUv;
      float stepLen = min(len, 0.9) / 22.0;
      for (int i = 0; i < 22; i++){
        uv += dir * stepLen;
        acc += texture2D(uSrc, clamp(uv, 0.0, 1.0)).rgb * w;
        tot += w; w *= 0.957;
      }
      acc /= max(tot, 0.0001);
      float fade = smoothstep(1.0, 0.15, len);
      gl_FragColor = vec4(acc * fade * uSunI, 1.0);
    }`;

  /* ---------- HDR 纯拷贝 ---------- */
  const COPY_HDR_FRAG = COMMON + `
    uniform sampler2D uSrc;
    void main(){ gl_FragColor = vec4(texture2D(uSrc, vUv).rgb, 1.0); }`;

  /* ---------- 环境贴图检视 ---------- */
  const ENVVIEW_FRAG = `
    precision highp float;
    #define ENVMAP_TYPE_CUBE_UV
    varying vec2 vUv;
    uniform sampler2D uEnv;
    #include <cube_uv_reflection_fragment>
    void main(){
      float az = vUv.x * 6.2831853;
      float el = (vUv.y - 0.5) * 3.1415926;
      vec3 d = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
      vec3 c = textureCubeUV(uEnv, d, 0.0).rgb;
      bool bad = (c.r != c.r) || (c.g != c.g) || (c.b != c.b) ||
                 abs(c.r) > 1e4 || abs(c.g) > 1e4 || abs(c.b) > 1e4;
      if (bad) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; }
      gl_FragColor = vec4(clamp(c * 3.0, 0.0, 1.0), 1.0);
    }`;

  /* ---------- 直出调试 ---------- */
  const COPY_FRAG = COMMON + `
    uniform sampler2D uSrc;
    void main(){
      vec3 c = texture2D(uSrc, vUv).rgb;
      gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(0.4545)), 1.0);
    }`;

  /* ---------- 合成 + FXAA + ACES ---------- */
  const COMP_FRAG = COMMON + `
    uniform sampler2D uSrc, uBloomTex, uGodTex;
    uniform float uExposure, uBloomA, uGodrayA, uVignette, uGrain, uChroma, uSaturation, uContrast;
    uniform vec3 uGrade;
    uniform float uDamage, uRain, uSnow, uTime, uUnderwater, uFxaa, uSunI, uNoAces;

    vec3 aces(vec3 x){
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){
      return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0001)), vec3(0.41666)) - 0.055,
                 step(vec3(0.0031308), c));
    }
    vec3 toLinear(vec3 c){
      return mix(c / 12.92, pow((max(c, vec3(0.0)) + 0.055) / 1.055, vec3(2.4)),
                 step(vec3(0.04045), c));
    }
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

    vec3 fxaa(vec2 uv){
      vec3 rgbM = texture2D(uSrc, uv).rgb;
      vec3 rgbNW = texture2D(uSrc, uv + vec2(-uTexel.x, -uTexel.y)).rgb;
      vec3 rgbNE = texture2D(uSrc, uv + vec2(uTexel.x, -uTexel.y)).rgb;
      vec3 rgbSW = texture2D(uSrc, uv + vec2(-uTexel.x, uTexel.y)).rgb;
      vec3 rgbSE = texture2D(uSrc, uv + vec2(uTexel.x, uTexel.y)).rgb;
      float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(rgbM);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin < 0.055 * lMax + 0.02) return rgbM;
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
      float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uTexel;
      vec3 rgbA = 0.5 * (texture2D(uSrc, uv + dir * (1.0/3.0 - 0.5)).rgb +
                         texture2D(uSrc, uv + dir * (2.0/3.0 - 0.5)).rgb);
      vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(uSrc, uv + dir * -0.5).rgb +
                                       texture2D(uSrc, uv + dir * 0.5).rgb);
      float lB = luma(rgbB);
      return (lB < lMin || lB > lMax) ? rgbA : rgbB;
    }

    void main(){
      vec2 uv = vUv;
      vec3 src = uFxaa > 0.5 ? fxaa(uv) : texture2D(uSrc, uv).rgb;

      vec2 d = uv - 0.5;
      float ca = uChroma * dot(d, d) * 3.0;
      vec3 col;
      col.r = src.r;
      col.g = src.g;
      col.b = src.b;
      // 轻微色差（只对高亮部分）
      if (ca > 0.0001){
        col.r = mix(src.r, texture2D(uSrc, uv - d * ca).r, 0.6);
        col.b = mix(src.b, texture2D(uSrc, uv + d * ca).b, 0.6);
      }

      // 中间目标是 sRGB 编码的，先解码回线性再叠加（否则会二次 gamma 冲白）
      col = toLinear(col);
      col += toLinear(texture2D(uBloomTex, uv).rgb) * uBloomA;
      col += toLinear(texture2D(uGodTex, uv).rgb) * uGodrayA * vec3(1.0, 0.93, 0.80);

      col *= uExposure;
      col = uNoAces > 0.5 ? clamp(col, 0.0, 1.0) : aces(col * 1.05);

      col *= uGrade;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      col = mix(col, col * vec3(0.95, 0.99, 1.06), (1.0 - l) * 0.12);
      col = mix(col, col * vec3(1.05, 1.0, 0.95), l * 0.12);

      col = mix(col, col * vec3(0.70, 0.92, 1.06), uUnderwater * 0.65);

      float v = 1.0 - uVignette * pow(clamp(length(d) * 1.34, 0.0, 1.4), 2.2);
      col *= clamp(v, 0.0, 1.0);

      col = mix(col, vec3(0.72, 0.05, 0.05), uDamage * 0.5 * (0.6 + 0.4 * sin(uTime * 22.0)));
      col *= 1.0 - uRain * 0.05;
      col += uSnow * 0.012;

      float g = h21(uv * vec2(1793.0, 1013.0) + fract(uTime * 1.7) * 97.3) - 0.5;
      col += g * uGrain;

      col = toSRGB(clamp(col, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`;

  function mkMat(frag) {
    return new THREE.ShaderMaterial({
      uniforms: U, vertexShader: VERT, fragmentShader: frag,
      depthTest: false, depthWrite: false,
    });
  }

  let passFog, passAO, passBright, passDown, passUp, passGod, passComposite, passCopy, passEnvView;

  function fsQuadMesh() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    const m = new THREE.Mesh(g, passFog);
    m.frustumCulled = false;
    return m;
  }

  function mkRT(w, h, depth) {
    w = max(1, w | 0); h = max(1, h | 0);
    const rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.HalfFloatType,
      depthBuffer: !!depth, stencilBuffer: false, generateMipmaps: false,
    });
    rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    if (depth) {
      const dt = new THREE.DepthTexture(w, h);
      dt.type = THREE.UnsignedIntType;
      dt.format = THREE.DepthFormat;
      dt.minFilter = THREE.NearestFilter;
      dt.magFilter = THREE.NearestFilter;
      rt.depthTexture = dt;
    }
    return rt;
  }

  function init(renderer, width, height, qualityLevel) {
    quality = qualityLevel;
    pr = CFG.lite ? 0.35 : (qualityLevel === 0 ? 0.62 : (qualityLevel === 2 ? 1.0 : 0.85));
    passFog = mkMat(FOG_FRAG);
    passAO = mkMat(AO_FRAG);
    passBright = mkMat(BRIGHT_FRAG);
    passDown = mkMat(DOWN_FRAG);
    passUp = mkMat(UP_FRAG);
    passGod = mkMat(GOD_FRAG);
    passComposite = mkMat(COMP_FRAG);
    passCopy = mkMat(COPY_FRAG);
    passCopyHDR = mkMat(COPY_HDR_FRAG);
    quadScene = new THREE.Scene();
    quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad = fsQuadMesh();
    quadScene.add(quad);
    resize(renderer, width, height);
  }

  function resize(renderer, width, height) {
    const w = max(2, floor(width * pr)), h = max(2, floor(height * pr));
    if (w === W && h === H && sceneRT) return;
    W = w; H = h;
    U.uTexel.value.set(1 / W, 1 / H);
    if (sceneRT) {
      sceneRT.dispose(); skyRT.dispose(); pingA.dispose(); pingB.dispose(); godRT.dispose();
      if (accA) { accA.dispose(); accB.dispose(); }
      for (const b of bloomRT) b.dispose();
    }
    sceneRT = mkRT(W, H, true);
    skyRT = mkRT(max(2, W >> 1), max(2, H >> 1), false);
    pingA = mkRT(W, H, false);
    pingB = mkRT(W, H, false);
    godRT = mkRT(max(2, W >> 2), max(2, H >> 2), false);
    bloomRT = [];
    for (let i = 0; i < 5; i++) bloomRT.push(mkRT(max(2, W >> (i + 1)), max(2, H >> (i + 1)), false));
    accA = mkRT(max(2, W >> 1), max(2, H >> 1), false);
    accB = mkRT(max(2, W >> 1), max(2, H >> 1), false);
  }

  function blit(renderer, mat, target, srcTex) {
    if (srcTex) mat.uniforms.uSrc.value = srcTex;
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.clear(true, false, false);
    renderer.render(quadScene, quadCam);
  }

  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m1 = new THREE.Matrix4();

  /** o: {sunDir, sunColor, sunIntensity, fogColor, fogDensity, time, rain, snow, underwater, damage, exposure, renderSky(rt,target)} */
  function render(renderer, scene, camera, o) {
    // 太阳屏幕坐标
    _v1.copy(o.sunDir).multiplyScalar(3000).add(camera.position);
    _v2.copy(_v1).project(camera);
    U.uSunScreen.value.set(_v2.x * .5 + .5, _v2.y * .5 + .5);
    const sunVisible = _v2.z < 1.0;
    const sunAmt = clamp01(o.sunIntensity * 0.6) * (sunVisible ? 1 : 0);

    // 1) 主场景
    if (CFG.dbg === 21 || CFG.dbg === 22) {
      if (!window.__ovr) {
        window.__ovr = CFG.dbg === 21
          ? new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
          : new THREE.MeshStandardMaterial({ color: 0x999999, roughness: .9, metalness: 0, side: THREE.DoubleSide });
      }
      scene.overrideMaterial = window.__ovr;
    } else scene.overrideMaterial = null;
    if (CFG.envint !== null && CFG.envint !== window.__envInt) {
      window.__envInt = CFG.envint;
      scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.envMapIntensity !== undefined) { m.envMapIntensity = CFG.envint; m.needsUpdate = true; } }); } });
      Post.U.uAmbBoost.value = CFG.envint;
    }
    if (CFG.envbg && !window.__envBg) { window.__envBg = true; scene.background = scene.environment; }
    if (CFG.noenv !== window.__envOff) {
      window.__envOff = CFG.noenv;
      if (CFG.noenv) { window.__envKeep = scene.environment; scene.environment = null; }
      else if (window.__envKeep) { scene.environment = window.__envKeep; window.__envKeep = null; }
      scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
    }
    if (CFG.noShadow !== window.__shOff) {
      window.__shOff = CFG.noShadow;
      renderer.shadowMap.enabled = !CFG.noShadow;
      scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
    }
    if (CFG.dbg === 22 || CFG.dbg === 24) {
      if (!window.__ptOff) { window.__ptOff = true; scene.traverse(o => { if (o.isPointLight) o.visible = false; }); }
    }
    if (CFG.dbg === 24) {
      if (!window.__ovr) window.__ovr = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: .9, metalness: 0, side: THREE.DoubleSide });
      scene.overrideMaterial = window.__ovr;
    }
    if (CFG.nopost || CFG.dbg === 1 || CFG.dbg === 21 || CFG.dbg === 22 || CFG.dbg === 24) {
      renderer.setRenderTarget(null);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
      return;
    }
    renderer.setRenderTarget(sceneRT);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    window.__sceneTris = renderer.info.render.triangles;
    if (CFG.dbg === 2) {           // 直出 HDR 目标
      renderer.setRenderTarget(null);
      quad.material = passCopy; quad.material.uniforms.uSrc.value = sceneRT.texture;
      renderer.clear(true, false, false);
      renderer.render(quadScene, quadCam);
      return;
    }

    // 2) 纯天空（供雾采样）
    if (o.renderSky) o.renderSky(renderer, camera, skyRT);
    if (CFG.skyonly) { blit(renderer, passCopy, null, skyRT.texture); return; }
    if (CFG.envview) {
      if (!passEnvView) passEnvView = mkMat(ENVVIEW_FRAG);
      passEnvView.uniforms.uEnv.value = scene.environment;
      blit(renderer, passEnvView, null);
      return;
    }

    // 统一 uniforms
    U.uColor.value = sceneRT.texture;
    U.uSky.value = skyRT.texture;
    U.uDepth.value = sceneRT.depthTexture;
    U.uNear.value = camera.near; U.uFar.value = camera.far;
    _m1.copy(camera.projectionMatrixInverse).multiply(camera.matrixWorldInverse);
    U.uInvViewProj.value.copy(_m1);
    // 地平线在屏幕上的行（相机俯仰决定），雾统一按那一行的天空取色
    _v1.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _v2.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const tanH = Math.tan(camera.fov * Math.PI / 360);
    const nyH = -_v1.y / max(1e-4, _v2.y * tanH);
    U.uHorizonY.value = max(0.015, min(0.985, 0.5 + 0.5 * nyH));
    if (CFG.nogod) U.uGodrayA.value = 0;
    if (CFG.nobloom2) U.uBloomA.value = 0;
    U.uCamPos.value.copy(camera.position);
    U.uFogColor.value.copy(o.fogColor);
    U.uFogDensity.value = o.fogDensity;
    U.uSunDir.value.copy(o.sunDir);
    U.uSunColor.value.copy(o.sunColor);
    U.uSunI.value = sunAmt;
    U.uTime.value = o.time;
    U.uRain.value = o.rain || 0;
    U.uSnow.value = o.snow || 0;
    U.uUnderwater.value = o.underwater ? 1 : 0;
    U.uDamage.value = o.damage || 0;
    U.uExposure.value = o.exposure !== undefined ? o.exposure : 1.0;

    // 3) 距离雾由 three 的 scene.fog 处理，这里只做一次拷贝
    blit(renderer, passCopyHDR, pingA, sceneRT.texture);
    // 4) AO
    U.uColor.value = pingA.texture;
    if (CFG.noao) blit(renderer, passCopyHDR, pingB, pingA.texture);
    else blit(renderer, passAO, pingB);
    if (CFG.stage === 1) { blit(renderer, passCopy, null, pingA.texture); return; }
    if (CFG.stage === 2) { blit(renderer, passCopy, null, pingB.texture); return; }
    if (CFG.stage === 3) { blit(renderer, passCopy, null, accSrc.texture); return; }
    if (CFG.stage === 4) { blit(renderer, passCopyHDR, null, sceneRT.texture); return; }

    // 5) Bloom
    U.uSrc.value = pingB.texture;
    U.uThreshold.value = 0.80 + (1 - clamp01(o.sunIntensity)) * 0.25;
    blit(renderer, passBright, bloomRT[0]);
    for (let i = 1; i < bloomRT.length; i++) {
      U.uSrc.value = bloomRT[i - 1].texture;
      U.uDir.value.set(1, 0);
      blit(renderer, passDown, bloomRT[i]);
      U.uSrc.value = bloomRT[i].texture;
      U.uDir.value.set(0, 1);
      blit(renderer, passDown, bloomRT[i]);
    }
    // 升采样：两级缓冲 ping-pong，避免读写同一张贴图形成反馈回路
    let accSrc = accA, accDst = accB;
    blit(renderer, passCopyHDR, accSrc, bloomRT[bloomRT.length - 1].texture);
    for (let i = bloomRT.length - 1; i >= 0; i--) {
      U.uSrc.value = bloomRT[i].texture;
      U.uAdd.value = accSrc.texture;
      U.uRadius.value = 1.0;
      blit(renderer, passUp, accDst);
      const t = accSrc; accSrc = accDst; accDst = t;
    }

    // 6) 体积光（用较粗的一层，效果更柔和）
    U.uSrc.value = bloomRT[1].texture;
    blit(renderer, passGod, godRT);

    // 7) 合成 → 屏幕
    U.uSrc.value = pingB.texture;
    U.uBloomTex.value = accSrc.texture;
    U.uGodTex.value = godRT.texture;
    renderer.setRenderTarget(null);
    quad.material = passComposite;
    renderer.clear(true, false, false);
    renderer.render(quadScene, quadCam);
  }

  return {
    init, resize, render, U,
    targets: () => ({ sceneRT, pingB, bloomRT, skyRT }),
    size: () => [W, H],
    setQuality: q => { quality = q; },
  };
})();
