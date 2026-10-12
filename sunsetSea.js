// sunset-sea, ported into Three.js materials.
// Sky + sea shading from keensense/sunset-sea 0.1.0 (https://github.com/keensense/sunset-sea),
// MIT License, Copyright (c) keensense. The GLSL below is the library's own, except that the
// sea hit point comes from the Three.js camera, the noise hash is replaced (blocky clouds),
// and the atmosphere can be read from a lookup texture (marked "Perpetual Sunset").

export const SUNSET_SEA_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform vec3  uSun;
uniform vec3  uSunTrans;
uniform vec3  uCloudSun;
uniform float uCamH;
uniform float uPix;
uniform float uWind;
uniform float uTurb;
uniform float uCloud;
uniform float uCoast;
uniform float uCoastAz;
uniform float uExposure;
uniform float uSunSize;
uniform float uGlitter;
uniform float uSeaY;
`;

export const SUNSET_SEA_GLSL = /* glsl */ `
const float PI   = 3.14159265;
const float R    = 6360e3;      // planet radius [m]
const float RT   = 6420e3;      // top of the atmosphere [m]
const float HR   = 8000.0;      // Rayleigh scale height [m]
const float HM   = 1200.0;      // Mie scale height [m]
const vec3  BR   = vec3(5.8e-6, 13.5e-6, 33.1e-6);   // Rayleigh scattering [1/m]
const float BM   = 21e-6;                            // Mie scattering [1/m]
const vec3  BO   = vec3(0.650e-6, 1.881e-6, 0.085e-6);  // ozone absorption [1/m] (the reason the high sky is blue)
const float ISUN = 22.0;

float ozone(float h) { return max(0.0, 1.0 - abs(h - 25000.0) / 15000.0); }

const int NV = 12;   // samples along the view ray
const int NL = 4;    // samples along the light ray

// ---------------------------------------------------------------- noise
// (Perpetual Sunset) the original hash fed large lattice coordinates into big multipliers,
// so float rounding differed between neighbouring cells and the clouds broke into blocks.
// wrap the lattice and use small multipliers so neighbours always agree
float hash(vec2 p) {
  p = mod(p, 289.0);
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s;
}

// ---------------------------------------------------------------- atmosphere
float raySphereFar(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  return d < 0.0 ? -1.0 : -b + sqrt(d);
}

vec3 atmos(vec3 rd) {
  vec3 ro = vec3(0.0, R + uCamH, 0.0);
  float L = raySphereFar(ro, rd, RT);
  float mu = dot(rd, uSun);
  float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  const float g = 0.76;
  float phM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu))
            / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  float bm = BM * uTurb;
  float odR = 0.0, odM = 0.0, odO = 0.0;
  vec3 sR = vec3(0.0), sM = vec3(0.0);
  for (int i = 0; i < NV; i++) {
    // samples are packed near the camera, where almost all the scattering happens
    float f0 = float(i) / float(NV), f1 = float(i + 1) / float(NV);
    float t0 = L * f0 * f0, t1 = L * f1 * f1;
    float ds = t1 - t0;
    vec3 p = ro + rd * (0.5 * (t0 + t1));
    float h = length(p) - R;
    float dR = exp(-h / HR) * ds;
    float dM = exp(-h / HM) * ds;
    odR += dR;
    odM += dM;
    odO += ozone(h) * ds;
    // is the sun's ray to this point blocked by the planet?
    float b = dot(p, uSun);
    float c = dot(p, p) - R * R;
    if (b < 0.0 && b * b - c > 0.0) continue;
    float Ls = raySphereFar(p, uSun, RT);
    float dl = Ls / float(NL);
    float lR = 0.0, lM = 0.0, lO = 0.0;
    for (int j = 0; j < NL; j++) {
      vec3 q = p + uSun * (dl * (float(j) + 0.5));
      float hq = length(q) - R;
      lR += exp(-hq / HR) * dl;
      lM += exp(-hq / HM) * dl;
      lO += ozone(hq) * dl;
    }
    vec3 att = exp(-(BR * (odR + lR) + bm * 1.1 * (odM + lM) + BO * (odO + lO)));
    sR += dR * att;
    sM += dM * att;
  }
  return ISUN * (sR * BR * phR + sM * bm * phM);
}

// ---------------------------------------------------------------- sky
float ridgeHeight(float a, float seed, float size, float amp) {
  float env = smoothstep(size, 0.0, abs(a)) ;                 // a bump around the coast azimuth
  float n = fbm(vec2(a * 5.0 + seed, seed * 1.7));
  return env * (0.35 + 0.65 * n) * amp;
}

// (Perpetual Sunset) the atmosphere is smooth, so it is computed once per frame into a small
// lookup texture and sampled from there; clouds, the sun and the water stay per pixel
#ifdef SKY_LUT
uniform sampler2D uSkyLut;
vec3 skyBase(vec3 rd) {
  float az = atan(rd.x, -rd.z) / (2.0 * PI) + 0.5;
  float el = sqrt(clamp(rd.y, 0.0, 1.0));
  return texture2D(uSkyLut, vec2(az, el)).rgb;
}
#else
vec3 skyBase(vec3 rd) { return atmos(rd); }
#endif

vec3 skyColor(vec3 rd, bool withSun) {
  vec3 col = skyBase(rd);

  // the sun disc, dimmed by the air in front of it
  if (withSun) {
    float cs = dot(rd, uSun);
    if (cs > 0.9985) {
      float r = acos(clamp(cs, -1.0, 1.0)) / (0.00465 * uSunSize);
      float limb = 1.0 - 0.55 * (1.0 - sqrt(max(1.0 - r * r, 0.0)));
      float rad = 0.00465 * uSunSize;
      col += uSunTrans * limb * (ISUN / (PI * rad * rad)) * 0.0012 * smoothstep(1.0, 0.9, r);
    }
  }

  // one thin layer of cloud, lit from below by the low sun
  if (uCloud > 0.0 && rd.y > 0.004) {
    float Hc = 3500.0;
    float t = (Hc - uCamH) / rd.y;
    vec2 p = rd.xz * t + vec2(uTime * 6.0, uTime * 1.5);
    vec2 q = p * vec2(0.00020, 0.00046);
    float cov = mix(0.80, 0.38, uCloud);
    float d = fbm(q);
    float dens = smoothstep(cov, cov + 0.26, d);
    if (dens > 0.0) {
      vec2 toSun = normalize(uSun.xz + 1e-4) * vec2(0.00020, 0.00046) * 700.0;
      float d2 = smoothstep(cov, cov + 0.26, fbm(q + toSun));
      float lit = clamp(1.0 - 0.9 * max(d2 - dens * 0.5, 0.0), 0.15, 1.0);
      vec3 cloudCol = uCloudSun * (1.7 * lit) + col * 0.55;
      float fade = smoothstep(0.004, 0.10, rd.y);
      col = mix(col, cloudCol, dens * 0.88 * fade);
    }
  }

  // hazy headlands on the horizon
  if (uCoast > 0.5 && rd.y > -0.002) {
    float az = atan(rd.x, rd.z) - uCoastAz;
    az = mod(az + PI, 2.0 * PI) - PI;
    float far  = ridgeHeight(az, 3.1, 0.95, 0.050);
    float near = ridgeHeight(az, 8.7, 0.60, 0.028);
    float mFar  = 1.0 - smoothstep(far  - uPix * 1.5, far  + uPix * 1.5, rd.y);
    float mNear = 1.0 - smoothstep(near - uPix * 1.5, near + uPix * 1.5, rd.y);
    col = mix(col, mix(col * vec3(0.30, 0.27, 0.33), col, 0.62), mFar);   // far: mostly haze
    col = mix(col, mix(col * vec3(0.17, 0.15, 0.19), col, 0.34), mNear);  // near: darker
  }
  return col;
}

// ---------------------------------------------------------------- sea
// Travelling waves. Returns the slope (dh/dx, dh/dz) of the water surface.
// Waves shorter than a few pixels are faded out so the far sea stays calm instead of shimmering.
vec2 seaSlope(vec2 p, float t, float footprint) {
  vec2 slope = vec2(0.0);
  float steep = 0.006 + 0.0021 * uWind;
  for (int i = 0; i < 8; i++) {
    float a = float(i);
    float L = 46.0 * pow(0.66, a);                         // wavelengths 46 m ... 2.4 m
    float k = 2.0 * PI / L;
    float w = sqrt(9.81 * k);                              // deep-water dispersion
    float ang = (fract(sin(a * 12.9898) * 43758.5453) - 0.5) * 1.15;
    vec2 dir = vec2(sin(ang), cos(ang));                   // mostly towards the shore
    float s = steep * (0.35 + 0.65 * a / 7.0);             // short waves are steeper
    float fade = 1.0 - smoothstep(L * 0.10, L * 0.40, footprint);
    slope += dir * (s * cos(dot(dir, p) * k - w * t + a * 1.7) * fade);
  }
  return slope;
}

vec3 seaColor(vec3 rd, float t, vec2 p) {
  float footprint = t * uPix / max(-rd.y, 0.004);

  vec2 sl = seaSlope(p, uTime, footprint);
  vec3 n = normalize(vec3(-sl.x, 1.0, -sl.y));
  vec3 v = -rd;
  vec3 refl = reflect(rd, n);
  refl.y = max(refl.y, 0.002);                    // a reflection never points into the water
  vec3 sky = skyColor(normalize(refl), false);

  float cosT = max(dot(n, v), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);   // Fresnel (Schlick), water n = 1.33

  // light that enters the water and comes back: dark, a little teal, and only as bright as the sky
  float amb = 0.10 + 0.90 * smoothstep(-0.08, 0.30, uSun.y);
  vec3 body = vec3(0.010, 0.040, 0.050) * amb + uSunTrans * (0.012 * max(uSun.y, 0.0));

  // sun glitter from the Cox-Munk distribution of wave slopes (the bright path under the sun)
  vec3 h = normalize(uSun + v);
  float nh = max(h.y, 1e-3);
  float s2 = 0.003 + 0.00512 * uWind;
  float t2 = (1.0 - nh * nh) / (nh * nh);
  float D = exp(-t2 / s2) / (PI * s2 * nh * nh * nh * nh);
  float vh = max(dot(v, h), 1e-3);
  float nv = max(v.y, 0.03), nl = max(uSun.y, 0.03);
  float G = min(1.0, min(2.0 * nh * nv / vh, 2.0 * nh * nl / vh));
  float Fh = 0.02 + 0.98 * pow(1.0 - vh, 5.0);
  // a shimmer on top, fading out with distance so it never aliases
  float sh = vnoise(vec2(p.x * 0.9, p.y * 0.30) + vec2(uTime * 0.20, uTime * 0.55));
  sh *= vnoise(vec2(p.x * 2.4, p.y * 0.80) - vec2(uTime * 0.35, uTime * 0.90));
  float shimmer = mix(1.0, 0.25 + 3.2 * sh * 1.6, 1.0 - smoothstep(0.4, 3.0, footprint));
  vec3 glitter = uSunTrans * ISUN * Fh * D * G / (4.0 * nv) * shimmer * 0.045 * uGlitter;

  return sky * F + body * (1.0 - F) + glitter;
}


vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 finish(vec3 col) {
  col = pow(aces(col * uExposure), vec3(1.0 / 2.2));
  return col + (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
}
`;

const BR = [5.8e-6, 13.5e-6, 33.1e-6];
const BM = 21e-6;
const BO = [0.650e-6, 1.881e-6, 0.085e-6];
const R_EARTH = 6360e3;
const R_TOP = 6420e3;

export function sunTransmittance(height, elevationRad, turbidity) {
  const ox = 0, oy = R_EARTH + height;
  const dx = Math.cos(elevationRad), dy = Math.sin(elevationRad);
  const b = ox * dx + oy * dy;
  const c = ox * ox + oy * oy - R_EARTH * R_EARTH;
  if (b < 0 && b * b - c > 0) return [0, 0, 0];
  const cTop = ox * ox + oy * oy - R_TOP * R_TOP;
  const L = -b + Math.sqrt(b * b - cTop);
  const N = 48, ds = L / N;
  let odR = 0, odM = 0, odO = 0;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * ds;
    const px = ox + dx * t, py = oy + dy * t;
    const h = Math.sqrt(px * px + py * py) - R_EARTH;
    odR += Math.exp(-h / 8000) * ds;
    odM += Math.exp(-h / 1200) * ds;
    odO += Math.max(0, 1 - Math.abs(h - 25000) / 15000) * ds;
  }
  return BR.map((br, i) => Math.exp(-(br * odR + BM * turbidity * 1.1 * odM + BO[i] * odO)));
}

