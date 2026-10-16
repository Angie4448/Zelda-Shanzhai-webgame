/* =========================================================================
   45_water.js — 水体：Gerstner 波浪 / 菲涅尔天空反射 / 深度吸收 / 岸边泡沫
   ========================================================================= */

const Water = (() => {
  const U = {
    uTime: { value: 0 },
    uSky: { value: null },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSunI: { value: 1 },
    uCamPos: { value: new THREE.Vector3() },
    uRain: { value: 0 },
    uDeep: { value: new THREE.Color(0.008, 0.055, 0.115) },
    uShallow: { value: new THREE.Color(0.10, 0.52, 0.53) },
    uFoam: { value: 0 },
    uWaveScale: { value: 1.0 },
    uAmbient: { value: new THREE.Color(0.12, 0.20, 0.30) },
  };

  const VERT = /* glsl */`
    attribute float aDepth;
    varying float vDepth;
    varying vec3 vWP;
    varying vec3 vNrm;
    uniform float uTime, uWaveScale;
    uniform float uRain;
    uniform vec3 uCamPos;

    // 六道 Gerstner 波
    const int NW = 5;
    void gerstner(vec2 xz, float t, out vec3 disp, out vec3 nrm){
      const vec2 dirs[5] = vec2[5](
        vec2( 0.86,  0.51), vec2(-0.62,  0.78), vec2( 0.20, -0.98),
        vec2(-0.94, -0.34), vec2( 0.55,  0.84));
      const float amp[5]  = float[5](0.62, 0.34, 0.19, 0.11, 0.06);
      const float len[5]  = float[5](38.0, 21.0, 12.5, 7.4, 4.1);
      const float spd[5]  = float[5](0.72, 0.92, 1.24, 1.66, 2.30);
      const float stp[5]  = float[5](0.72, 0.62, 0.52, 0.44, 0.38);
      disp = vec3(0.0);
      vec3 tang = vec3(1.0, 0.0, 0.0);
      vec3 bin  = vec3(0.0, 0.0, 1.0);
      for (int i = 0; i < NW; i++){
        float k = 6.2831853 / len[i];
        vec2 d = normalize(dirs[i]);
        float f = k * dot(d, xz) - spd[i] * sqrt(9.81 * k) * t;
        float a = amp[i] * uWaveScale;
        float s = sin(f), c = cos(f);
        disp.y += a * s;
        disp.x += a * stp[i] * d.x * c;
        disp.z += a * stp[i] * d.y * c;
        float wa = k * a;
        tang += vec3(-d.x * d.x * stp[i] * wa * s, d.x * wa * c, -d.x * d.y * stp[i] * wa * s);
        bin  += vec3(-d.x * d.y * stp[i] * wa * s, d.y * wa * c, -d.y * d.y * stp[i] * wa * s);
      }
      nrm = normalize(cross(bin, tang));
    }

    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float dist = length(wp.xz - uCamPos.xz);
      // 远处降低波幅防止欠采样
      float fade = 1.0 - smoothstep(120.0, 420.0, dist);
      float amp = mix(0.15, 1.0, fade);
      vec3 disp, nrm;
      gerstner(wp.xz, uTime, disp, nrm);
      disp.xz *= amp; disp.y *= amp;

      // 雨滴涟漪
      if (uRain > 0.01){
        float r1 = sin(wp.x * 2.7 + uTime * 7.0) * sin(wp.z * 3.1 - uTime * 6.1);
        float r2 = sin(wp.x * 5.3 - uTime * 9.4) * sin(wp.z * 4.7 + uTime * 8.2);
        disp.y += (r1 * 0.5 + r2 * 0.35) * uRain * 0.045;
      }

      vec3 p = wp.xyz + disp;
      vWP = p;
      vNrm = nrm;
      vDepth = aDepth;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }
  `;

  const FRAG = /* glsl */`
    precision highp float;
    varying float vDepth;
    varying vec3 vWP;
    varying vec3 vNrm;
    uniform samplerCube uSky;
    uniform vec3 uSunDir, uCamPos, uSunColor;
    uniform vec3 uDeep, uShallow, uAmbient;
    uniform float uTime, uSunI, uRain, uFoam;

    float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float vn(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y);
    }
    float fb(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=0.5;} return s; }

    void main(){
      if (vDepth < 0.06) discard;

      vec3 V = normalize(uCamPos - vWP);
      float dist = length(uCamPos - vWP);

      // 细节法线：两套滚动噪声
      vec2 w1 = vWP.xz * 0.22 + vec2(uTime * 0.045, uTime * 0.021);
      vec2 w2 = vWP.xz * 0.63 - vec2(uTime * 0.062, uTime * 0.031);
      float e = 0.35;
      vec2 g1 = vec2(fb(w1 + vec2(e,0.0)) - fb(w1 - vec2(e,0.0)),
                     fb(w1 + vec2(0.0,e)) - fb(w1 - vec2(0.0,e))) / (2.0*e);
      vec2 g2 = vec2(fb(w2 + vec2(e,0.0)) - fb(w2 - vec2(e,0.0)),
                     fb(w2 + vec2(0.0,e)) - fb(w2 - vec2(0.0,e))) / (2.0*e);
      float detFade = 1.0 - smoothstep(40.0, 220.0, dist);
      vec3 N = normalize(vNrm + vec3(-(g1.x * 0.10 + g2.x * 0.05), 0.0, -(g1.y * 0.10 + g2.y * 0.05)) * detFade);

      // 菲涅尔
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      float F0 = 0.02;
      float fres = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
      fres = mix(fres, 0.06, smoothstep(120.0, 600.0, dist));

      // 天空反射
      vec3 R = reflect(-V, N);
      R.y = abs(R.y) * 0.85 + 0.02;
      vec3 sky = textureCube(uSky, R).rgb;
      // 反射也带一点底面深度色（浅水更透）
      vec3 refl = mix(sky, uShallow * 1.4, 0.06);

      // 水体颜色：深度吸收（Beer-Lambert）
      float d = clamp(vDepth, 0.0, 60.0);
      vec3 absorb = exp(-vec3(0.55, 0.19, 0.11) * d * 0.28);
      vec3 body = mix(uShallow * 1.15, uDeep * 4.0, 1.0 - absorb.g);
      body *= mix(vec3(1.0), absorb, 0.35);
      // 浅水透出底部颜色
      float shallowness = 1.0 - smoothstep(0.0, 5.0, vDepth);
      body = mix(body, uShallow * 1.35 * (0.7 + 0.5 * fb(vWP.xz * 0.5)), shallowness * 0.55);
      // 次表面散射：波峰透光
      float crest = clamp((N.y - 0.86) * 6.0, 0.0, 1.0);
      body += uSunColor * crest * 0.05 * max(0.0, uSunDir.y);

      // 环境光
      body += uAmbient * 0.35;

      vec3 col = mix(body, refl, clamp(fres * 1.15, 0.0, 0.96));

      // 太阳镜面（GGX）+ 闪光
      vec3 H = normalize(uSunDir + V);
      float a = 0.055;
      float a2 = a * a;
      float ndh = max(dot(N, H), 0.0);
      float ndl = max(dot(N, uSunDir), 0.0);
      float denom = ndh * ndh * (a2 - 1.0) + 1.0;
      float Dg = a2 / (3.14159265 * denom * denom);
      float spec = Dg * ndl * uSunI * 1.35;
      // 波峰上的碎光
      float sparkle = smoothstep(0.72, 0.98, fb(vWP.xz * 1.7 + uTime * 0.12)) * ndl;
      col += uSunColor * (spec + sparkle * 0.55 * uSunI) * (1.0 - fres * 0.4);

      // 岸边泡沫
      float foamN = fb(vWP.xz * 0.9 + vec2(uTime * 0.10, uTime * -0.07)) * 0.6 +
                    fb(vWP.xz * 2.3 - vec2(uTime * 0.16, 0.0)) * 0.4;
      float shore = 1.0 - smoothstep(0.0, 1.6, vDepth);
      float foam = clamp(shore * (0.55 + foamN * 0.8), 0.0, 1.0);
      // 波峰白沫
      float whitecap = smoothstep(0.98, 1.35, (N.y * -1.0 + 1.0) * 7.0) * 0.0;
      foam = clamp(foam + whitecap + uFoam * 0.15, 0.0, 1.0);
      col = mix(col, vec3(0.94, 0.97, 0.99) * (0.55 + uSunI * 0.6), foam * 0.88);

      // 雨天水面压暗
      col *= mix(1.0, 0.72, uRain);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  let mat = null;

  function init() {
    mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.FrontSide,
      transparent: false,
      depthWrite: true,
    });
    return mat;
  }

  function update(dt, camPos) {
    if (!mat) return;
    U.uTime.value += dt;
    U.uSky.value = Env.skyCube();
    U.uSunDir.value.copy(Env.E.sunDir);
    U.uSunColor.value.copy(Env.E.sunColor).multiplyScalar(1.0);
    U.uSunI.value = clamp01(Env.E.sunIntensity * 0.55);
    U.uRain.value = Env.E.rain;
    U.uFoam.value = Env.E.rain;
    if (camPos) U.uCamPos.value.copy(camPos);
    const amb = Env.E.skyLight;
    U.uAmbient.value.setRGB(amb.r, amb.g, amb.b);
    // 晨昏水色偏移
    const dusk = Env.E.duskF;
    U.uShallow.value.setRGB(lerp(0.10, 0.30, dusk * .6), lerp(0.52, 0.26, dusk * .6), lerp(0.53, 0.30, dusk * .6));
  }

  return { init, update, material: () => mat, U };
})();
