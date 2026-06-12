import * as THREE from "three";

// ---------------------------------------------------------------------------
// Config — swap MIX_FEED for Simon's own set once it's on Mixcloud.
// CUE_SHEET: optional precomputed energy timeline [{t: seconds, energy: 0..1}]
// exported from offline analysis of the mix file; drives crowd + sky breathing.
// ---------------------------------------------------------------------------
const MIX_FEED = "/Yasu_Hiro/joe-claussell-1997-to-2010-works-mix-from-sakurada-tokyo-52/";
const CUE_SHEET = null;

const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOTION = REDUCED_MOTION ? 0.15 : 1;
const PORTRAIT = innerHeight > innerWidth;

// ?quiet — straight into the scene, no gate, no audio (art direction / review)
// ?phase=0..1 — freeze the sun cycle for art direction (1 golden, 0.45 dusk, 0 blue hour)
const PARAMS = new URLSearchParams(location.search);
const QUIET = PARAMS.has("quiet");
const PHASE_LOCK = parseFloat(PARAMS.get("phase"));

// the sun's pendulum: golden hour -> dusk -> blue hour -> back. Never full day,
// never full night. Cosine gives the long dwell at both ends.
const CYCLE_MINUTES = 20;
// the sun lingers as it nears the water: a periodic time warp that slows the
// horizon crossing (the moment everyone watches) and repays the time at the
// extremes, where the cosine already dwells
const SUNSET_DWELL = 0.12;
// staged arrival: every session opens on the true sunset — sun visible and
// warm above the water, salmon sky under smoky violet, already descending.
// (solves the warped phase numerically so entry still lands at alt 0.9)
const CYCLE_OFFSET = (() => {
  const target = Math.acos(2 * 0.9 - 1);
  let th = target;
  for (let i = 0; i < 12; i++) th = target - SUNSET_DWELL * Math.sin(2 * th);
  return (th / (2 * Math.PI)) * CYCLE_MINUTES * 60;
})();

// --- the twilight overture -------------------------------------------------------
// The opening note: a quiet Pinto twilight (references/pinto_twilight.png),
// held, then dissolved into the cycle. Purely additive — after HOLD + DRIFT
// the code path is identical to the untouched cycle. Tune by eye here.
const TWILIGHT = {
  // gradient stops, top of sky to sea line
  zenith: "#afc6d2",  // pale cool blue
  high: "#c5beb3",    // warm pale gray haze
  mid: "#c99b92",     // dusty rose into muted coral
  horizon: "#9c7b85", // smoky mauve
  ember: "#c98a6e",   // the warm swell above the sea line
  emberI: 0.35,       // ember intensity (day is ~1.0+)
  sunY: -0.045,       // ember source below the sea line: swell, no disc
  sea: "#33414b",     // deep slate base
  glitter: "#b59a93",
  fog: "#565360",
  key: "#c9a099",     // sun key during twilight: soft dusty rose
  ambient: "#aebfca", // hemisphere: pale blue-gray, cool and low contrast
  rim: "#c9a099",     // figure rim during twilight
  cool: "#5a6a78",    // figure shadow fill during twilight
  saturation: 1.0,    // global multiplier on all stops above
  HOLD: 0,            // seconds of pure twilight (0 = overture off)
  DRIFT: 0,           // seconds of dissolve into the existing cycle
};
const TWI = {};
{
  const hsl = { h: 0, s: 0, l: 0 };
  for (const k of ["zenith", "high", "mid", "horizon", "ember", "sea", "glitter", "fog", "key", "ambient", "rim", "cool"]) {
    const c = new THREE.Color(TWILIGHT[k]);
    c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s * TWILIGHT.saturation, hsl.l);
    TWI[k] = c;
  }
}

// --- palette keyframes: the cycle moves through these (Pinto registers) ------
const KEYS = {
  afternoon: { // late afternoon, 1.5h to sundown: pastel azure-gold (Pinto pano)
    horizon: "#e9a979", mid: "#d29b85", high: "#6a74ab", zenith: "#2a3155",
    sun: "#fff0cf", fog: "#5e4147", seaShallow: "#4a8a96", glitter: "#f5bc7e",
    seaHaze: "#e0935f",
  },
  preset: { // the high sun: a coral core hovering in a dusty violet field (Pinto)
    horizon: "#de8a5a", mid: "#c97b6e", high: "#595a93", zenith: "#1d2244",
    sun: "#ffdcae", fog: "#54363e", seaShallow: "#3d7e8c", glitter: "#f2a865",
    seaHaze: "#dd8455",
  },
  golden: {
    horizon: "#cf5a35", mid: "#a04866", high: "#3a2a66", zenith: "#07060f",
    sun: "#ffb478", fog: "#3a2030", seaShallow: "#396b74", glitter: "#e08a4f",
    seaHaze: "#d9764a",
  },
  dusk: {
    horizon: "#a83a30", mid: "#7e3257", high: "#2c2154", zenith: "#050410",
    sun: "#ff9c5e", fog: "#301a2b", seaShallow: "#2c5560", glitter: "#d4703f",
    seaHaze: "#b65a3c",
  },
  blue: { // night is a different quality of light, not its absence
    horizon: "#6b4258", mid: "#3a3068", high: "#232452", zenith: "#0d0b22",
    sun: "#6e5a8a", fog: "#1c1430", seaShallow: "#1e3343", glitter: "#5a6f8a",
    seaHaze: "#7a4a44",
  },
};
for (const k of Object.values(KEYS))
  for (const key of Object.keys(k)) k[key] = new THREE.Color(k[key]);

// alt: 0 = blue hour, 0.45 = dusk, 0.8 = golden, 1 = pre-sunset.
const _c = new THREE.Color();
const _warmNight = new THREE.Color("#e8924e");
const _emberRim = new THREE.Color("#e08a50");
const _moonCool = new THREE.Color("#4a4f7a");
const _hotOrange = new THREE.Color("#ff8e3f");
const _paleMauve = new THREE.Color("#b9b4cc");
const _plumEdge = new THREE.Color("#8578a4");
function paletteAt(key, alt) {
  if (alt < 0.45) return _c.copy(KEYS.blue[key]).lerp(KEYS.dusk[key], alt / 0.45);
  if (alt < 0.8) return _c.copy(KEYS.dusk[key]).lerp(KEYS.golden[key], (alt - 0.45) / 0.35);
  if (alt < 0.93) return _c.copy(KEYS.golden[key]).lerp(KEYS.preset[key], (alt - 0.8) / 0.13);
  return _c.copy(KEYS.preset[key]).lerp(KEYS.afternoon[key], (alt - 0.93) / 0.07);
}

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("scene"),
  antialias: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2("#3a2030", 0.006);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 5.2, 30);

// --- sky dome -------------------------------------------------------------
const SUN_DIR = new THREE.Vector3(-0.18, 0.085, -1).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uSunDir: { value: SUN_DIR },
    uHorizon: { value: KEYS.golden.horizon.clone() },
    uMid: { value: KEYS.golden.mid.clone() },
    uHigh: { value: KEYS.golden.high.clone() },
    uZenith: { value: KEYS.golden.zenith.clone() },
    uSun: { value: KEYS.golden.sun.clone() },
    uEnergy: { value: 0.5 },
    uEmber: { value: 1.0 },
    uMoonDir: { value: new THREE.Vector3(-0.08, 0.42, -1).normalize() },
    uMoonCol: { value: new THREE.Color("#d8dcec") },
    uMoonI: { value: 0 },
    uEmberLine: { value: new THREE.Color("#c96a3e") },
    uNightI: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uSunDir, uHorizon, uMid, uHigh, uZenith, uSun, uMoonDir, uMoonCol, uEmberLine;
    uniform float uTime, uEnergy, uEmber, uMoonI, uNightI;
    varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y, 0.0, 1.0);
      // gentle breathing of the gradient so the sunset feels alive but never advances
      float breathe = 0.03 * sin(uTime * 0.05) + 0.02 * uEnergy;
      vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.17 + breathe, h));
      col = mix(col, uHigh, smoothstep(0.11, 0.38, h));
      col = mix(col, uZenith, smoothstep(0.28, 0.8, h));
      // ember sun: diffuse luminous core, long velvety falloff — no hard disc
      float d = distance(normalize(vDir), uSunDir);
      float ember = exp(-d * 26.0) * 0.8 + exp(-d * 8.0) * 0.42 + exp(-d * 3.0) * 0.13;
      col += uSun * ember * uEmber;
      // the moon: small, pale, soft-edged — surfaces only once the sun is gone
      float md = distance(normalize(vDir), uMoonDir);
      col += uMoonCol * (smoothstep(0.030, 0.024, md) * 0.85 + exp(-md * 16.0) * 0.16) * uMoonI;
      // heavy atmospheric haze hugging the horizon
      vec3 haze = mix(uHorizon, uSun, 0.3);
      col = mix(col, haze, smoothstep(0.14, 0.0, h) * 0.45);
      // the ember line: a last sliver of residual warmth at the waterline, night only
      col += uEmberLine * exp(-h * 40.0) * uNightI * (0.4 + 0.08 * sin(uTime * 0.13));
      // faint long horizontal cloud bands, sunk deep
      float bands = sin(vDir.y * 60.0 + sin(vDir.x * 4.0) * 1.5) * 0.5 + 0.5;
      col += vec3(0.45, 0.18, 0.12) * bands * 0.03 * smoothstep(0.3, 0.05, h) * smoothstep(0.0, 0.04, h);
      // values sink at the lateral frame edges
      col *= 1.0 - 0.3 * smoothstep(0.3, 1.0, abs(normalize(vDir).x));
      // screen-space dither so the gradients stay band-free
      float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      col += (grain - 0.5) * (3.0 / 255.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 48, 32), skyMat));

// --- sea -------------------------------------------------------------------
const seaMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color("#0e2230") },
    uShallow: { value: KEYS.golden.seaShallow.clone() },
    uGlitter: { value: KEYS.golden.glitter.clone() },
    uHaze: { value: new THREE.Color("#d9764a") },
    uMoonGlade: { value: new THREE.Color("#aab4d8") },
    uEnergy: { value: 0.5 },
    uDay: { value: 1.0 },
    uNight: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vPos;
    void main() {
      vUv = uv;
      vec3 p = position;
      p.z += sin(p.x * 0.35 + uTime * 0.7) * 0.18 + sin(p.y * 0.5 + uTime * 0.45) * 0.14;
      vPos = p;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime, uEnergy, uDay, uNight;
    uniform vec3 uDeep, uShallow, uGlitter, uHaze, uMoonGlade;
    varying vec2 vUv;
    varying vec3 vPos;
    void main() {
      float toHorizon = smoothstep(0.0, 1.0, vUv.y);
      vec3 col = mix(uDeep, uShallow, toHorizon * 0.9);
      // glitter path under the sun (sun sits left of center: x ~ 0.42)
      float path = exp(-pow((vUv.x - 0.42) * (7.0 - toHorizon * 4.5), 2.0));
      float sparkle = sin(vPos.x * 8.0 + uTime * 2.2) * sin(vPos.y * 13.0 - uTime * 1.7);
      sparkle = smoothstep(0.55, 1.0, sparkle) * (0.6 + uEnergy * 0.8);
      col += uGlitter * path * (0.14 + sparkle * 0.55) * (0.25 + toHorizon * 0.85) * (0.12 + 0.88 * uDay);
      // moonglade: a narrow silver path beneath the moon, night only
      float mpath = exp(-pow((vUv.x - 0.46) * (9.0 - toHorizon * 5.0), 2.0));
      col += uMoonGlade * mpath * (0.10 + sparkle * 0.35) * (0.25 + toHorizon) * uNight;
      // sea dissolves into the horizon haze
      col = mix(col, uHaze, smoothstep(0.8, 1.0, vUv.y) * 0.4 * (0.3 + 0.7 * uDay));
      // dither against banding
      float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      col += (grain - 0.5) * (3.0 / 255.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 240, 96, 48), seaMat);
sea.rotation.x = -Math.PI / 2;
sea.position.set(0, -0.4, -140);
scene.add(sea);

// --- light -----------------------------------------------------------------
const hemi = new THREE.HemisphereLight("#c06a48", "#171028", 0.6);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight("#d65f33", 1.5);
sunLight.position.copy(SUN_DIR).multiplyScalar(100);
scene.add(sunLight);

// --- stars: surface only in the blue hour ------------------------------------
const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let i = 0; i < 240; i++) {
    const az = Math.random() * Math.PI * 2;
    const el = 0.12 + Math.random() * 1.1;
    pts.push(
      390 * Math.cos(el) * Math.sin(az),
      390 * Math.sin(el),
      390 * Math.cos(el) * Math.cos(az)
    );
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
}
const starMat = new THREE.PointsMaterial({
  color: "#c9cfff", size: 1.6, sizeAttenuation: false,
  transparent: true, opacity: 0, depthWrite: false,
});
scene.add(new THREE.Points(starGeo, starMat));
// the moon as a real source: faint cool top light, night only
const moonLight = new THREE.DirectionalLight("#a9b4d8", 0);
moonLight.position.set(-9, 47, -112);
scene.add(moonLight);
const lampGlow = new THREE.PointLight("#ff8f45", 6, 40, 1.8);
lampGlow.position.set(0, 5.5, 14);
scene.add(lampGlow);
// second warm pool over the booth and dancers — the night answers the dark
const danceGlow = new THREE.PointLight("#ff9a50", 0, 30, 1.9);
danceGlow.position.set(-2, 4.2, 5);
scene.add(danceGlow);

// --- silhouette treatment: darkness with color in it ---------------------------
// Müller rules: rim from the sky, cool bounce in the undersides, no clipped
// black anywhere. Silhouettes stay silhouettes — the dark just breathes.
const SIL = {
  rim: { value: new THREE.Color("#ff9a5e") },
  cool: { value: new THREE.Color("#241a3e") },
  lift: { value: new THREE.Color("#0d0712") },
  rimI: { value: 0.3 },
  hot: { value: new THREE.Color("#ff8e3f") },
  peak: { value: 0 },
  sunV: { value: new THREE.Vector3(0, 0.2, -1) },
  duskRim: { value: 0 },
  duskRimC: { value: new THREE.Color("#9a93b2") },
  canopy: { value: 0 },
  canopyC: { value: new THREE.Color("#6a5f8a") },
};
function silhouetteMat(hex, roughness, extra = {}, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness, ...extra });
  m.onBeforeCompile = (s) => {
    s.uniforms.uRimC = SIL.rim;
    s.uniforms.uCoolC = SIL.cool;
    s.uniforms.uLiftC = SIL.lift;
    s.uniforms.uRimI = SIL.rimI;
    s.uniforms.uHotC = SIL.hot;
    s.uniforms.uPeak = SIL.peak;
    s.uniforms.uSunV = SIL.sunV;
    s.uniforms.uDuskRim = SIL.duskRim;
    s.uniforms.uDuskRimC = SIL.duskRimC;
    s.uniforms.uCanopy = SIL.canopy;
    s.uniforms.uCanopyC = SIL.canopyC;
    s.vertexShader = s.vertexShader.replace(
      "#include <common>",
      "varying vec3 vSilWorld;\n#include <common>"
    ).replace(
      "#include <fog_vertex>",
      "#include <fog_vertex>\nvSilWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <common>",
      "uniform vec3 uRimC; uniform vec3 uCoolC; uniform vec3 uLiftC; uniform vec3 uHotC; uniform vec3 uSunV; uniform float uRimI; uniform float uPeak; uniform float uDuskRim; uniform vec3 uDuskRimC; uniform float uCanopy; uniform vec3 uCanopyC;\nvarying vec3 vSilWorld;\n#include <common>"
    ).replace(
      "#include <opaque_fragment>",
      /* glsl */ `
      // brightness lives camera-side; values sink toward the rail (z ~ 2)
      float depthFade = smoothstep(2.0, 15.0, vSilWorld.z);
      // a thin warm sliver along the upward curves — the separator at the rail
      float rimNdV = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 2.6);
      float topness = saturate(geometryNormal.y * 0.8 + 0.2);
      outgoingLight += uRimC * rimNdV * topness * uRimI${opts.floor || opts.flat ? " * 0.12" : ""};
      // peak-sun backlight: a hot contour carved on the sun-facing edge only
      float hotWrap = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 1.8)
                    * saturate(dot(geometryNormal, uSunV));
      outgoingLight += uHotC * hotWrap * 0.85 * uPeak${opts.floor || opts.flat ? " * 0.12" : ""};
      ${opts.floor || opts.flat ? "" : /* glsl */ `
      // dusk edge separation: a thin cool sliver on the silhouette boundary only —
      // outline, not light. Interiors stay exactly as dark as they are.
      float duskEdge = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 6.0);
      outgoingLight += uDuskRimC * duskEdge * uDuskRim;`}
      ${opts.canopy ? /* glsl */ `
      // deep night: a whisper of sky plum on the underside edges and folds —
      // describing the tensioned shape, never lighting it
      float underEdge = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 3.5)
                      * saturate(-geometryNormal.y);
      outgoingLight += uCanopyC * underEdge * uCanopy;` : ""}
      // directional shadow fill: camera-facing sides fall to cool plum, never amber
      float camFacing = saturate(dot(geometryNormal, geometryViewDir));
      outgoingLight += uCoolC * (camFacing * 0.07 * (1.0 + 0.85 * uPeak) + (0.5 - 0.5 * geometryNormal.y) * 0.03)
                     * (0.4 + 0.6 * depthFade);
      // lifted black point, easing darker toward the rail for the graphic read
      outgoingLight = max(outgoingLight, uLiftC * (0.45 + 0.55 * depthFade));
      ${opts.floor ? /* glsl */ `
      // break the floor plane: plank-width value steps plus fine grain
      float plank = fract(sin(floor(vSilWorld.x / 1.35) * 12.9898) * 43758.5453);
      float fgrain = fract(sin(dot(vSilWorld.xz * 7.0, vec2(12.9898, 78.233))) * 43758.5453);
      outgoingLight *= 0.94 + plank * 0.06 + (fgrain - 0.5) * 0.05;
      // the foreground falls into its own warm shadow; the eye goes to the sea
      outgoingLight *= mix(1.0, 0.55, smoothstep(8.0, 25.0, vSilWorld.z));` : ""}
      ${opts.grain ? /* glsl */ `
      // handmade: faint material grain, only legible up close
      float pg = fract(sin(dot(vSilWorld.xy * 42.0 + vSilWorld.z * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
      outgoingLight *= 0.985 + pg * 0.03;` : ""}
      #include <opaque_fragment>`
    );
  };
  return m;
}

// soft contact shadow: seats figures and legs into the deck
const contactTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grd.addColorStop(0, "rgba(8,4,12,0.55)");
  grd.addColorStop(1, "rgba(8,4,12,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
function contactShadow(parent, radius, opacity, x = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: contactTex, transparent: true, opacity, depthWrite: false,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.012, z);
  parent.add(m);
  return m;
}

// --- terrace ---------------------------------------------------------------
const terrace = new THREE.Group();
scene.add(terrace);

const deckMat = silhouetteMat("#261410", 0.9, {}, { floor: true });
const deck = new THREE.Mesh(new THREE.BoxGeometry(46, 1.2, 26), deckMat);
deck.position.set(0, -0.6, 14);
terrace.add(deck);

const wallMat = silhouetteMat("#1d1126", 0.85);
const wall = new THREE.Mesh(new THREE.BoxGeometry(46, 1.1, 0.7), wallMat);
wall.position.set(0, 0.55, 1.6);
terrace.add(wall);

// tables: low cylinders with a candle glow
const tableMat = silhouetteMat("#2a1712", 0.7, {}, { flat: true });
const candleMat = new THREE.MeshBasicMaterial({ color: "#ff9d4f" });
const tableSpots = [
  [-14, 8], [-8, 12], [-15, 16], [8, 9], [14, 13], [9, 17], [-3, 18],
];
for (const [x, z] of tableSpots) {
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 20), tableMat);
  top.position.set(x, 1.05, z);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.05, 8), tableMat);
  stem.position.set(x, 0.5, z);
  const candle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), candleMat);
  candle.position.set(x, 1.22, z);
  terrace.add(top, stem, candle);
  contactShadow(terrace, 1.0, 0.4, x, z);
}

// two candles actually cast light — small warm pools, the eye's resting points
const practicals = [];
for (const [x, z] of [[-3, 18], [8, 9], [-14, 8], [14, 13]]) {
  const p = new THREE.PointLight("#ffac5e", 1.1, 7.5, 2);
  p.position.set(x, 1.55, z);
  terrace.add(p);
  practicals.push({ p, phase: x });
}

// night glow: soft warm bloom sprites over every practical flame ---------------
const glowTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grd.addColorStop(0, "rgba(255, 176, 102, 0.85)");
  grd.addColorStop(0.4, "rgba(255, 150, 80, 0.25)");
  grd.addColorStop(1, "rgba(255, 140, 70, 0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const glows = [];
function nightGlow(x, y, z, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  s.position.set(x, y, z);
  s.scale.setScalar(size);
  terrace.add(s);
  glows.push({ s, phase: x + z });
}
for (const [x, z] of tableSpots) nightGlow(x, 1.3, z, 1.7);
nightGlow(0, 5.5, 14, 3.4);
nightGlow(-2, 4.2, 5, 2.9);

// --- the peg: one canonical handmade figure ------------------------------------
// Johnny Kelly rules: capsule peg, head ~0.85 the body width, squat, no neck,
// no limbs, no face. Matte like turned wood. All variation lives in the
// config: lean, accent, accessory, scale — tune the CAST array below.
const PEG = {
  tones: ["#33211f", "#2c1a22", "#3a241c", "#2e1d29", "#2b1a1e", "#36221f"],
  head: "#241317",
  accents: {
    terracotta: "#b35c3a", teal: "#5f8378", ochre: "#c2913f",
    rose: "#b97f86", putty: "#a89a88",
  },
};
function pegMat(hex) {
  return silhouetteMat(hex, 0.96, {}, { grain: true });
}
function buildPeg({
  scale = 0.82, tone, slim = false, lean = 0,
  accent = null, accessory = null, nose = false,
} = {}) {
  const s = scale;
  const g = new THREE.Group();
  const bodyR = (slim ? 0.4 : 0.45) * s;
  const headR = bodyR * 0.85; // head ~0.85 the body width
  const bodyTone = tone ?? PEG.tones[Math.floor(Math.random() * PEG.tones.length)];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, 0.55 * s, 6, 14), pegMat(bodyTone));
  body.position.y = 0.275 * s + bodyR;
  g.add(body);
  const headY = 0.55 * s + 2 * bodyR + headR * 0.62; // overlapped: no neck
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(headR, 14, 14),
    pegMat(accent?.zone === "head" ? accent.color : PEG.head)
  );
  head.position.y = headY;
  g.add(head);
  if (accent?.zone === "band") {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(bodyR + 0.012, bodyR + 0.012, 0.2 * s, 14),
      pegMat(accent.color)
    );
    band.position.y = 0.62 * s;
    g.add(band);
  }
  if (nose) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 8, 8), head.material);
    n.position.set(0, headY, headR * 0.95);
    g.add(n);
  }
  if (accessory) {
    const aMat = pegMat(bodyTone);
    const top = headY + headR;
    if (accessory === "hatFlat") {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.5 * s, 0.035, 16), aMat);
      brim.position.y = top - headR * 0.3;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.24 * s, 0.16 * s, 12), aMat);
      crown.position.y = top - headR * 0.3 + 0.09 * s;
      g.add(brim, crown);
    } else if (accessory === "hatFloppy") {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 0.2 * s, 14), aMat);
      hat.position.y = top - headR * 0.22;
      g.add(hat);
    } else if (accessory === "glass") {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03 * s, 0.14 * s, 6), aMat);
      stem.position.set(bodyR + 0.13 * s, 0.86 * s, 0);
      const cup = new THREE.Mesh(new THREE.ConeGeometry(0.085 * s, 0.12 * s, 10), aMat);
      cup.rotation.x = Math.PI;
      cup.position.set(bodyR + 0.13 * s, 0.99 * s, 0);
      g.add(stem, cup);
      g.userData.drink = [stem, cup];
    } else if (accessory === "cup") {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.065 * s, 0.06 * s, 0.22 * s, 10), aMat);
      cup.position.set(bodyR + 0.12 * s, 0.92 * s, 0);
      g.add(cup);
      g.userData.drink = [cup];
    } else if (accessory === "bag") {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 10, 8), aMat);
      bag.scale.set(1, 0.72, 0.55);
      bag.position.set(-(bodyR + 0.06 * s), 0.5 * s, 0);
      g.add(bag);
    } else if (accessory === "book") {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.025, 0.24 * s), aMat);
      book.position.set(bodyR + 0.12 * s, 1.0 * s, 0.04);
      book.rotation.z = 0.3;
      g.add(book);
    }
  }
  g.rotation.z = lean;
  contactShadow(g, 0.55 * s, 0.5);
  return g;
}

// --- the cast: hand-placed, never a grid ----------------------------------------
// One tight knot of four (dancing), a pair at the rail, uneven tables, two
// solitaries, one child. ~1 in 8 carries a single chalky accent; over half
// carry nothing. Exactly one figure (the reader) faces away from the sun.
const A = PEG.accents;
const CAST = [
  // the knot
  { x: -2.6, z: 4.4, dancer: true, scale: 0.82, lean: 0.03 },
  { x: -1.3, z: 5.3, dancer: true, scale: 0.86, lean: -0.025, accent: { zone: "head", color: A.terracotta } },
  { x: 0.3, z: 4.2, dancer: true, scale: 0.78, lean: 0.045 },
  { x: 1.5, z: 5.0, dancer: true, scale: 0.82, lean: -0.04, accessory: "cup" },
  // the pair at the rail, tilted toward each other, deep in it
  { x: -10.2, z: 3.1, scale: 0.86, lean: 0.045, yRot: Math.PI - 0.35, accessory: "glass", converse: 0 },
  { x: -11.4, z: 3.2, scale: 0.82, lean: -0.05, yRot: Math.PI + 0.4, converse: 2.2 },
  // solitary under a floppy hat, right rail, space around them
  { x: 18.6, z: 3.1, scale: 0.82, lean: 0.02, accessory: "hatFloppy" },
  // tables, unevenly held
  { x: -12.4, z: 8.4, scale: 0.82, lean: 0.03, accessory: "hatFlat" },
  { x: -6.4, z: 12.4, scale: 0.86, lean: -0.02, converse: 1.3 },
  { x: -9.3, z: 11.6, scale: 0.82, lean: 0.035, accent: { zone: "band", color: A.teal }, converse: 3.5 },
  // the reader: the only one turned away from the sunset
  { x: -13.4, z: 16.6, scale: 0.78, lean: 0.025, nose: true, accessory: "book", yRot: 0.15 },
  { x: 9.6, z: 9.4, scale: 0.86, lean: -0.03 },
  { x: 7.0, z: 10.6, scale: 0.78, lean: 0.04 },
  // solitary near the camera, bag slung, alone on purpose
  { x: -1.8, z: 18.4, scale: 0.82, lean: -0.045, nose: true, accessory: "bag" },
];
const people = [];
const lifters = []; // figures who occasionally raise their drink to the light
for (const c of CAST) {
  const g = buildPeg(c);
  g.position.set(c.x, 0, c.z);
  g.rotation.y = c.yRot ?? Math.PI + (Math.random() - 0.5) * 0.6; // most face the sun
  terrace.add(g);
  people.push({
    g, dancer: !!c.dancer, lean: c.lean ?? 0, converse: c.converse,
    phase: Math.random() * Math.PI * 2,
    freq: 0.75 + Math.random() * 0.5, // nobody moves at the same tempo
    baseX: c.x,
  });
  if ((c.accessory === "glass" || c.accessory === "cup") && g.userData.drink) {
    lifters.push({
      meshes: g.userData.drink.map((m) => ({ m, by: m.position.y })),
      state: 0, t0: 0, next: 30 + Math.random() * 80,
    });
  }
}

// --- walkers: waiters and passersby, never in a hurry -------------------------
const walkers = [];
function makeWalker({ tint, scale = 0.8, slim = false, accessory = null }) {
  const g = buildPeg({ scale, tone: tint, slim, accessory });
  terrace.add(g);
  return g;
}

// waiters: drift from their station to a table, dwell, drift back
for (const station of [new THREE.Vector3(9, 0, 24.5), new THREE.Vector3(-13, 0, 24.5)]) {
  walkers.push({
    kind: "waiter",
    g: makeWalker({ tint: "#3f2c27", scale: 0.82, slim: true }),
    state: "post", stateUntil: 8 + Math.random() * 20,
    from: station.clone(), to: station.clone(), home: station,
    t0: 0, dur: 1, speed: 1.0 + Math.random() * 0.15,
    phase: Math.random() * Math.PI * 2,
  });
  walkers[walkers.length - 1].g.position.copy(station);
}

// passersby: stroll the promenade behind the tables, sometimes in pairs
const PROMENADE_Z = 23.5;
for (let i = 0; i < 3; i++) {
  const w = {
    kind: "stroller",
    g: makeWalker({ tint: PEG.tones[i % PEG.tones.length], scale: 0.8 + Math.random() * 0.1 }),
    state: "away", stateUntil: 6 + i * 22 + Math.random() * 18,
    from: new THREE.Vector3(), to: new THREE.Vector3(),
    t0: 0, dur: 1, speed: 0.85 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    pairOffset: null,
  };
  w.g.visible = false;
  walkers.push(w);
}

// the flaneurs: the ones you live vicariously through. Slowest walks on the
// terrace, a shade lighter than everyone, they come to the rail just to watch.
// Staggered so the rail occasionally gets quiet company.
const FLANEURS = [
  { tint: "#7d6a59", scale: 0.96, speed: 0.72, first: 12, accessory: "hatFlat" },
  { tint: "#6c6072", scale: 0.92, speed: 0.66, first: 75 },
  { tint: "#84705f", scale: 0.99, speed: 0.78, first: 150 },
];
for (const f of FLANEURS) {
  const w = {
    kind: "flaneur",
    g: makeWalker({ tint: f.tint, scale: f.scale, slim: true, accessory: f.accessory }),
    state: "away", stateUntil: f.first + Math.random() * 15,
    from: new THREE.Vector3(), to: new THREE.Vector3(),
    t0: 0, dur: 1, speed: f.speed,
    phase: Math.random() * Math.PI * 2,
    legs: [],
  };
  w.g.visible = false;
  walkers.push(w);
}

// the guest seat: its occupant eventually wanders out; a stranger drifts in.
// The scene never resolves — the chair is never empty for long.
const GUEST_SEAT = new THREE.Vector3(6.6, 0, 9.0);
function spawnGuestPeg() {
  return makeWalker({
    scale: [0.78, 0.82, 0.86][Math.floor(Math.random() * 3)],
    slim: Math.random() < 0.4,
    accessory: [null, null, null, "cup", "glass", "hatFloppy"][Math.floor(Math.random() * 6)],
  });
}
const guest = {
  kind: "guest",
  g: spawnGuestPeg(),
  state: "seated", stateUntil: 160 + Math.random() * 200,
  from: new THREE.Vector3(), to: new THREE.Vector3(),
  t0: 0, dur: 1, speed: 0.8,
  phase: Math.random() * Math.PI * 2,
  legs: [],
};
guest.g.position.copy(GUEST_SEAT);
guest.g.rotation.y = Math.PI + 0.2;
walkers.push(guest);

function walkerSetWalk(w, t, from, to) {
  w.from.copy(from);
  w.to.copy(to);
  w.t0 = t;
  w.dur = from.distanceTo(to) / w.speed;
  w.state = "walking";
  w.g.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
}

// --- DJ booth ---------------------------------------------------------------
const booth = new THREE.Group();
const desk = new THREE.Mesh(
  new THREE.BoxGeometry(4.6, 1.25, 1.4),
  silhouetteMat("#100a16", 0.5, { metalness: 0.2 })
);
desk.position.y = 0.9;
const deskGlow = new THREE.Mesh(
  new THREE.BoxGeometry(4.7, 0.08, 1.5),
  new THREE.MeshBasicMaterial({ color: "#b34a28" })
);
deskGlow.position.y = 1.56;
booth.add(desk, deskGlow);
const dj = new THREE.Group();
const djBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.46, 0.6, 6, 14),
  pegMat("#2c1a22")
);
djBody.position.y = 0.76;
const djHead = new THREE.Mesh(
  new THREE.SphereGeometry(0.39, 14, 14),
  pegMat(PEG.head)
);
djHead.position.y = 1.71;
dj.add(djBody, djHead);
dj.position.z = -1.2;
booth.add(dj);
contactShadow(booth, 2.4, 0.4);
booth.position.set(-1.5, 0, 2.8);
booth.rotation.y = Math.PI; // facing the crowd, back to the sun
terrace.add(booth);

// --- string lights ----------------------------------------------------------
const bulbs = [];
const bulbMat = new THREE.MeshBasicMaterial({ color: "#ff9d4f" });
function stringLights(x1, x2, z, y, sag, n = 14) {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), bulbMat.clone());
    bulb.position.set(
      x1 + (x2 - x1) * t,
      y - Math.sin(t * Math.PI) * sag,
      z
    );
    terrace.add(bulb);
    bulbs.push({ m: bulb, phase: i * 0.7, bx: bulb.position.x, by: bulb.position.y });
  }
}
stringLights(-20, 20, 3.2, 6.2, 1.1);
stringLights(-18, 18, 11, 6.6, 1.3);
stringLights(-16, 16, 19, 6.3, 1.0);

// poles
const poleMat = silhouetteMat("#100a16", 0.8);
for (const [x, z] of [[-20, 3.2], [20, 3.2], [-18, 11], [18, 11], [-16, 19], [16, 19]]) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.6, 8), poleMat);
  pole.position.set(x, 3.0, z);
  terrace.add(pole);
}

// --- palms (silhouettes at the edges) ----------------------------------------
const palms = [];
function palm(x, z, h = 9, lean = 0.12) {
  const g = new THREE.Group();
  const trunkMat = silhouetteMat("#0e0813", 0.9);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, h, 8), trunkMat);
  trunk.position.y = h / 2;
  trunk.rotation.z = lean;
  g.add(trunk);
  const frondMat = silhouetteMat("#110a18", 0.9, { side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4.2, 4), frondMat);
    frond.position.set(Math.sin(lean) * h, h - 0.2, 0);
    frond.rotation.z = Math.PI / 2.4 + (i / 7) * Math.PI * 0.9 - 0.6;
    frond.rotation.y = (i / 7) * Math.PI * 2;
    g.add(frond);
  }
  g.position.set(x, 0, z);
  terrace.add(g);
  palms.push({ g, phase: x * 0.7 });
}
palm(-24, 5, 10, 0.16);
palm(25, 11, 8.5, -0.1);

// olive trees: low gnarled trunks, soft round canopies
const oliveMat = silhouetteMat("#1c1426", 0.95);
function olive(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 2.4, 7), oliveMat);
  trunk.position.y = 1.2;
  trunk.rotation.z = 0.18;
  g.add(trunk);
  for (const [dx, dy, dz, r] of [[0, 3.1, 0, 1.5], [1.1, 2.6, 0.4, 1.0], [-0.9, 2.7, -0.3, 1.1]]) {
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), oliveMat);
    canopy.position.set(dx, dy, dz);
    canopy.scale.y = 0.75;
    g.add(canopy);
  }
  contactShadow(g, 1.1, 0.35);
  g.scale.setScalar(s);
  g.position.set(x, 0, z);
  terrace.add(g);
}
olive(21, 20, 1.1);
olive(-21.5, 14, 0.9);

// agaves in planters along the wall
function agave(x, z, s = 1) {
  const g = new THREE.Group();
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.5, 8), wallMat);
  planter.position.y = 0.25;
  g.add(planter);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 1.2, 4), oliveMat);
    const a = (i / 9) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.18, 0.85, Math.sin(a) * 0.18);
    leaf.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    g.add(leaf);
  }
  contactShadow(g, 0.62, 0.4);
  g.scale.setScalar(s);
  g.position.set(x, 0, z);
  terrace.add(g);
}
agave(-7.5, 2.6, 1.0);
agave(6, 2.6, 0.85);
agave(17.5, 2.8, 1.1);

// one umbrella pine on the far edge, holding the corner
{
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 7, 7), oliveMat);
  trunk.position.y = 3.5;
  trunk.rotation.z = -0.06;
  g.add(trunk);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 7), oliveMat);
  canopy.position.y = 7.6;
  canopy.scale.y = 0.42;
  g.add(canopy);
  contactShadow(g, 1.3, 0.3);
  g.position.set(-27, 0, 10);
  terrace.add(g);
}

// a leaning palm planted to dress the through-the-fronds shot
palm(16.5, 17, 7, -0.45);

// --- pergola: pale canvas over the western tables ------------------------------
const pergolaPanels = [];
{
  const postMat = silhouetteMat("#241726", 0.85);
  const canvasMat = silhouetteMat("#9a8a7c", 0.9, { side: THREE.DoubleSide }, { canopy: true });
  for (const x of [-19, -5]) {
    for (const z of [6, 18]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4.6, 8), postMat);
      post.position.set(x, 2.3, z);
      terrace.add(post);
    }
  }
  for (const z of [6, 18]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(15, 0.14, 0.14), postMat);
    beam.position.set(-12, 4.62, z);
    terrace.add(beam);
  }
  for (let i = 0; i < 3; i++) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 11.6, 8, 4), canvasMat);
    panel.rotation.x = -Math.PI / 2;
    panel.position.set(-17 + i * 5, 4.5, 12);
    const pos = panel.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const nx = pos.getX(v) / 2.1;
      pos.setZ(v, -(1 - nx * nx) * 0.4); // canvas sag between beams
    }
    pos.needsUpdate = true;
    panel.geometry.computeVertexNormals();
    terrace.add(panel);
    pergolaPanels.push({ panel, phase: i * 1.3 });
  }
}

// --- the cat (every Ibiza terrace has one) ------------------------------------
const cat = new THREE.Group();
const catMat = silhouetteMat("#0b0710", 0.9);
const catBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 4, 8), catMat);
catBody.rotation.x = 0.5;
catBody.position.y = 0.2;
cat.add(catBody);
const catHead = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), catMat);
catHead.position.set(0, 0.46, 0.08);
cat.add(catHead);
for (const sx of [-1, 1]) {
  const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 4), catMat);
  ear.position.set(sx * 0.06, 0.57, 0.08);
  cat.add(ear);
}
const catTail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.42, 5), catMat);
catTail.position.set(0.12, 0.16, -0.16);
catTail.rotation.z = -0.9;
cat.add(catTail);
// on the wall, facing the sea. Portrait frames see a narrower slice of the
// wall, so the cat keeps to the visible middle there — subtly, by the planter.
const CAT_HOME = PORTRAIT ? 2.2 : 11.5;
const CAT_RANGE = PORTRAIT ? [-4.5, 4.8] : [-19, 20];
cat.position.set(CAT_HOME, 1.1, 1.6);
terrace.add(cat);

// the cat lives on its own clock — nothing it does repeats on a loop
const catState = {
  mode: "sit", t0: 0, dur: 1, from: CAT_HOME, to: CAT_HOME, dir: 1,
  nextStretch: 45 + Math.random() * 90,
  nextMove: 200 + Math.random() * 280,
};

// --- shooting stars: blue hour only, rare ------------------------------------
const meteor = new THREE.Mesh(
  new THREE.BoxGeometry(3.2, 0.035, 0.035),
  new THREE.MeshBasicMaterial({ color: "#dfe4ff", transparent: true, opacity: 0 })
);
scene.add(meteor);
let meteorAt = 45 + Math.random() * 60;
let meteorT = -1;

// --- aircraft: distant coastal texture, never the subject ----------------------
const plane = new THREE.Group();
{
  const mat = new THREE.MeshBasicMaterial({ color: "#181222", fog: false });
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 3.2, 4, 8), mat);
  fuselage.rotation.z = Math.PI / 2;
  const wings = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 5.2), mat);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.95, 0.07), mat);
  tail.position.set(-1.65, 0.42, 0);
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 6, 6),
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, fog: false })
  );
  strobe.position.y = -0.3;
  plane.add(fuselage, wings, tail, strobe);
  plane.userData.strobe = strobe;
  plane.scale.setScalar(4);
  plane.visible = false;
  scene.add(plane);
}
let planeAt = 35, planeT = -1, planeDir = 1;
const PLANE_SECONDS = 55;

const heli = new THREE.Group();
{
  const mat = new THREE.MeshBasicMaterial({ color: "#161020", fog: false });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.4, 4, 8), mat);
  body.rotation.z = Math.PI / 2;
  const boom = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 0.15), mat);
  boom.position.x = -1.9;
  const rotor = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 1.9, 0.03, 16),
    new THREE.MeshBasicMaterial({ color: "#100a16", transparent: true, opacity: 0.35, fog: false })
  );
  rotor.position.y = 0.62;
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 6, 6),
    new THREE.MeshBasicMaterial({ color: "#ff4d3d", transparent: true, opacity: 0, fog: false })
  );
  beacon.position.y = -0.45;
  heli.add(body, boom, rotor, beacon);
  heli.userData.rotor = rotor;
  heli.userData.beacon = beacon;
  heli.scale.setScalar(1.8);
  heli.visible = false;
  scene.add(heli);
}
let heliAt = 95, heliT = -1, heliDir = 1;
const HELI_SECONDS = 24;

// --- birds: gulls in a loose flock, a pelican once in a while ------------------
function makeBird({ body = 0.16, wing = 1.0, beak = 0 }) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: "#16101e", fog: false });
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(body, body * 3, 4, 6), mat);
  b.rotation.z = Math.PI / 2;
  g.add(b);
  const wings = [];
  for (const s of [-1, 1]) {
    const holder = new THREE.Group();
    const w = new THREE.Mesh(new THREE.BoxGeometry(body * 2.4, 0.03, wing), mat);
    w.position.z = s * (wing / 2 + body * 0.5);
    holder.add(w);
    g.add(holder);
    wings.push({ h: holder, s });
  }
  if (beak) {
    const bk = new THREE.Mesh(new THREE.ConeGeometry(0.06, beak, 5), mat);
    bk.rotation.z = -Math.PI / 2;
    bk.position.set(body * 1.8 + beak / 2, -0.04, 0);
    g.add(bk);
  }
  g.visible = false;
  scene.add(g);
  return { g, wings };
}
const gulls = Array.from({ length: 4 }, (_, i) => ({
  ...makeBird({ body: 0.16, wing: 1.05 }),
  off: { x: i * 3.4 + (i % 2) * 1.6, y: (i % 3) * 1.5, z: (i % 2 ? 2.5 : -2) + i },
  phase: i * 1.7,
}));
let gullAt = 20, gullT = -1, gullDir = 1;
const GULL_SECONDS = 22;

const pelican = makeBird({ body: 0.34, wing: 1.7, beak: 0.85 });
let pelicanAt = 160, pelicanT = -1, pelicanDir = 1;
const PELICAN_SECONDS = 34;

// --- islands on the horizon: the Es Vedra silhouette and company ----------------
{
  const islandMat = new THREE.MeshBasicMaterial({ color: "#161028" });
  function island(x, z, w, h) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      islandMat
    );
    m.scale.set(w, h, w * 0.45);
    m.position.set(x, -0.45, z);
    scene.add(m);
  }
  island(-130, -235, 34, 9);  // the steep rock, near the sun's line
  island(-96, -238, 18, 3.5); // its low companion
  island(112, -240, 55, 4.5); // a long flat island to the east
}

// --- the speedboat: a quick stitch across the bay -------------------------------
const speedboat = new THREE.Group();
{
  const mat = new THREE.MeshBasicMaterial({ color: "#140e1c", fog: false });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 0.7), mat);
  hull.position.y = 0.16;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 4), mat);
  bow.rotation.z = -Math.PI / 2;
  bow.position.set(1.7, 0.16, 0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), mat);
  cabin.position.set(-0.3, 0.45, 0);
  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 0.7),
    new THREE.MeshBasicMaterial({
      color: "#dfe6ea", transparent: true, opacity: 0.22, fog: false,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(-4.6, 0.02, 0);
  speedboat.add(hull, bow, cabin, wake);
  speedboat.visible = false;
  scene.add(speedboat);
}
let speedboatAt = 70, speedboatT = -1, speedboatDir = 1;
const SPEEDBOAT_SECONDS = 22;

// --- the boardwalk: the world passing in front of the cafe ----------------------
const boardwalk = new THREE.Mesh(
  new THREE.BoxGeometry(60, 0.25, 5.5),
  silhouetteMat("#1f1410", 0.9, {}, { floor: true })
);
boardwalk.position.set(0, -0.3, -4.5);
boardwalk.receiveShadow = true;
scene.add(boardwalk);
const beach = new THREE.Mesh(new THREE.PlaneGeometry(600, 13), silhouetteMat("#191009", 0.95));
beach.rotation.x = -Math.PI / 2;
beach.position.set(0, -0.42, -13.5);
scene.add(beach);

const bwWalkers = [];
for (let i = 0; i < 4; i++) {
  const g = buildPeg({ scale: 0.8 + (i % 3) * 0.04, slim: i % 2 === 0 });
  g.visible = false;
  terrace.add(g);
  bwWalkers.push({
    g, state: "away", until: 8 + i * 26 + Math.random() * 20,
    t0: 0, dur: 1, dir: 1, z: -4, k0: 0,
    speed: 0.7 + Math.random() * 0.35,
    phase: Math.random() * Math.PI * 2,
    persona: i === 0 ? "flaneur" : i === 3 ? "dancer" : "passer",
    pauseAt: 0, paused: false,
  });
}
const BW_Y = -0.175; // standing on the boardwalk

// --- the shore: waves crashing, ebbing, flowing ---------------------------------
const foamMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uFoam: { value: new THREE.Color("#e8e0d2") },
    uA: { value: 0.3 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime, uA;
    uniform vec3 uFoam;
    varying vec2 vUv;
    void main() {
      float tide = sin(uTime * 0.42) * 0.5 + 0.5; // the slow breath of the tide
      float edge = 0.30 + 0.28 * tide
                 + sin(vUv.x * 52.0 + uTime * 0.7) * 0.04
                 + sin(vUv.x * 13.0 - uTime * 0.3) * 0.06;
      float crest = smoothstep(edge + 0.02, edge - 0.03, vUv.y)
                  * smoothstep(edge - 0.30, edge - 0.10, vUv.y);
      float lace = fract(sin(dot(floor(vec2(vUv.x * 220.0, vUv.y * 60.0)), vec2(12.9898, 78.233))) * 43758.5453);
      gl_FragColor = vec4(uFoam, crest * uA * (0.55 + 0.45 * lace));
    }
  `,
});
const foam = new THREE.Mesh(new THREE.PlaneGeometry(600, 7), foamMat);
foam.rotation.x = -Math.PI / 2;
foam.position.set(0, -0.38, -11);
scene.add(foam);

// --- raking light: long soft shadows toward the camera ------------------------
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -34;
sunLight.shadow.camera.right = 34;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
sunLight.shadow.camera.near = 20;
sunLight.shadow.camera.far = 260;
sunLight.shadow.radius = 7;
sunLight.shadow.blurSamples = 16;
sunLight.shadow.bias = -0.0004;
sunLight.target.position.set(0, 0, 12);
scene.add(sunLight.target);
terrace.traverse((o) => {
  if (o.isMesh && o.material.isMeshStandardMaterial) o.castShadow = true;
});
deck.castShadow = false;
deck.receiveShadow = true;
wall.receiveShadow = true;
const _shadowDir = new THREE.Vector3();

// --- boats: sparse silhouettes adrift in the haze ----------------------------
const boats = [];
const hullMat = new THREE.MeshBasicMaterial({ color: "#0d0812" });
const sailMat = new THREE.MeshBasicMaterial({ color: "#120b18", side: THREE.DoubleSide });
const riggingLightMat = new THREE.MeshBasicMaterial({ color: "#ff9d4f" });
function boat(x, z, { sail = false, scale = 1 } = {}) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.18, 4.2, 6, 1), hullMat);
  hull.rotation.z = Math.PI / 2;
  hull.scale.y = 0.45;
  g.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5), hullMat);
  mast.position.y = 1.7;
  g.add(mast);
  if (sail) {
    const sailGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 3.3, 0), new THREE.Vector3(0, 0.45, 0), new THREE.Vector3(1.9, 0.45, 0),
    ]);
    sailGeo.setIndex([0, 1, 2]);
    sailGeo.computeVertexNormals();
    g.add(new THREE.Mesh(sailGeo, sailMat));
  }
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), riggingLightMat);
  lantern.position.y = sail ? 3.4 : 1.0;
  lantern.position.x = sail ? 0 : 1.6;
  g.add(lantern);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  scene.add(g);
  boats.push({ g, phase: Math.random() * Math.PI * 2, drift: (Math.random() - 0.5) * 0.0035 });
}
boat(-34, -68, { sail: true, scale: 1.15 });
boat(16, -78, { scale: 1.05 });
boat(44, -100, { sail: true, scale: 1.0 });
boat(-58, -110, { scale: 0.9 });

// --- mixcloud widget ---------------------------------------------------------
const dock = document.getElementById("player-dock");
const iframe = document.createElement("iframe");
iframe.allow = "autoplay; encrypted-media";
iframe.src =
  "https://player-widget.mixcloud.com/widget/iframe/?hide_cover=1&mini=1&light=0&feed=" +
  encodeURIComponent(MIX_FEED);
dock.appendChild(iframe);

let widget = null;
let widgetReady = false;
let energy = 0.5; // 0..1, drives crowd + sky + glitter
let position = 0;

function initWidget() {
  if (widget || !window.Mixcloud) return;
  widget = window.Mixcloud.PlayerWidget(iframe);
  widget.ready
    .then(async () => {
      widgetReady = true;
      const name = await widget.getCurrentKey?.().catch(() => null);
      setNowPlaying(name || MIX_FEED);
      widget.events.progress.on((pos) => { position = pos; });
      widget.events.play.on(() => setLive(true));
      widget.events.pause.on(() => setLive(false));
    })
    .catch(() => {});
}
// init as early as the widget script + iframe allow — not on full window load
iframe.addEventListener("load", initWidget);
document.addEventListener("DOMContentLoaded", initWidget);
window.addEventListener("load", initWidget);

// play, robustly: wait for readiness, then retry through transient errors.
// Never poke a half-initialized player — that is what threw playback errors.
async function playWhenReady() {
  for (let i = 0; i < 60 && !widgetReady; i++) await new Promise((r) => setTimeout(r, 250));
  if (!widget || !widgetReady) return;
  for (let i = 0; i < 4; i++) {
    try {
      await widget.play();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 700));
    }
  }
}

function setNowPlaying(key) {
  fetch("https://api.mixcloud.com" + (typeof key === "string" ? key : MIX_FEED))
    .then((r) => r.json())
    .then((c) => {
      document.getElementById("np-text").textContent =
        `${c.name} — ${c.user?.name ?? "resident DJ"}`;
      if (c.url) document.getElementById("now-playing").href = c.url;
    })
    .catch(() => {});
}
setNowPlaying(MIX_FEED);

function setLive(on) {
  document.querySelector(".now-playing .dot").style.animationPlayState = on ? "running" : "paused";
}

// energy: cue sheet if present, else a slow organic curve seeded by position
function currentEnergy(t) {
  if (CUE_SHEET) {
    let e = 0.5;
    for (const p of CUE_SHEET) { if (p.t <= position) e = p.energy; else break; }
    return e;
  }
  return 0.5 + 0.25 * Math.sin(t * 0.07 + position * 0.013) + 0.12 * Math.sin(t * 0.21);
}

// --- the veil ------------------------------------------------------------------
// The scene runs from frame one; the veil is a thin invitation over it.
// Click = sound + the veil lifts. Unanswered, it politely expires after 12s
// into the muted scene with a sound pill — and then any tap starts the set.
// Returning visitors never see the veil at all.
const gateEl = document.getElementById("gate");
const pillEl = document.getElementById("sound-pill");
const RETURNING = localStorage.getItem("ps_v") === "1";
let audioStarted = false;

function startAudio() {
  if (audioStarted) return;
  audioStarted = true;
  playWhenReady();
  gateEl?.classList.add("open");
  pillEl.hidden = true;
  localStorage.setItem("ps_v", "1");
}
function offerPill() {
  if (!audioStarted) pillEl.hidden = false;
}
function armTapAnywhere() {
  addEventListener("pointerdown", (e) => {
    if (audioStarted) return;
    if (e.target.closest("a, button, iframe, #player-dock")) return;
    startAudio();
  });
}

if (QUIET) {
  gateEl.remove();
  pillEl.remove();
} else if (RETURNING) {
  gateEl.remove();
  offerPill();
  armTapAnywhere();
  pillEl.addEventListener("click", startAudio);
} else {
  document.getElementById("enter").addEventListener("click", (e) => {
    e.stopPropagation();
    startAudio();
  });
  // a click that landed before this module loaded still counts
  if (window.__wantsAudio) startAudio();
  pillEl.addEventListener("click", startAudio);
  setTimeout(() => {
    if (!audioStarted) {
      gateEl.classList.add("open");
      offerPill();
      armTapAnywhere();
    }
  }, 12000);
}

// space bar = play/pause, anywhere on the page
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target.closest("button, a, input")) return;
  e.preventDefault();
  if (!audioStarted) startAudio();
  else Promise.resolve(widget?.togglePlay?.()).catch(() => {});
});

// subtle pointer parallax — lean, don't fly
const lean = { x: 0, y: 0 };
addEventListener("pointermove", (e) => {
  lean.x = (e.clientX / innerWidth - 0.5) * 2;
  lean.y = (e.clientY / innerHeight - 0.5) * 2;
});

// --- cinematography: a few composed shots, held long, cut clean ---------------
// ?shot=N locks a shot for art direction.
const SHOT_SECONDS = 38;
const SHOTS = [
  { // wide — the establishing view
    pos: new THREE.Vector3(0, 4.6, 27), look: new THREE.Vector3(-3, 3.0, -30),
    drift: 2.2, bob: 0.3 },
  { // low among the tables — silhouettes against the ember
    pos: new THREE.Vector3(-11, 2.1, 17), look: new THREE.Vector3(-17, 3.4, -40),
    drift: 0.9, bob: 0.15 },
  { // down the rail — profiles over the glitter path
    pos: new THREE.Vector3(17, 3.1, 5), look: new THREE.Vector3(-40, 2.2, -14),
    drift: 1.2, bob: 0.2 },
  { // among the tables — candles, dancers, the booth
    pos: new THREE.Vector3(7, 3.4, 22), look: new THREE.Vector3(-6, 2.2, -2),
    drift: 1.5, bob: 0.25 },
  { // the booth — DJ and dancers against the open sea
    pos: new THREE.Vector3(1.5, 3.3, 11.5), look: new THREE.Vector3(-3.5, 1.9, -28),
    drift: 0.7, bob: 0.12 },
  { // through the fronds — sun and boats framed by the leaning palm
    pos: new THREE.Vector3(13.5, 4.0, 20.5), look: new THREE.Vector3(2, 1.6, -40),
    drift: 0.4, bob: 0.08 },
  { // elevated wide — over the pergola canvas to the bay
    pos: new THREE.Vector3(7, 11.5, 39), look: new THREE.Vector3(-4, -0.5, -25),
    drift: 1.8, bob: 0.2 },
  { // inside the booth — over the DJ's shoulder, facing the room
    pos: new THREE.Vector3(-1.5, 3.1, 0.2), look: new THREE.Vector3(-1.5, 1.7, 16),
    drift: 0.25, bob: 0.05 },
];
const SHOT_LOCK = parseInt(PARAMS.get("shot"), 10);

console.log(
  "%c8:47 PM, forever.%c\nYou found the back door. The sun comes down to the water,\nrests a while in the blue hour, and climbs back — but it never sets.\nPull up a chair. — тяoтɪкᴀ",
  "font-size:14px;color:#ff8a5c", "color:#9a8fa8"
);

// --- loop ---------------------------------------------------------------------
const wind = { x: 0.6, target: 0.6, nextShift: 40 };

const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  energy += (currentEnergy(t) - energy) * 0.02;

  // --- the sun's pendulum: golden -> dusk -> blue hour -> back ---
  const alt = Number.isFinite(PHASE_LOCK)
    ? Math.min(1, Math.max(0, PHASE_LOCK))
    : (() => {
        const th = ((t + CYCLE_OFFSET) / (CYCLE_MINUTES * 60)) * Math.PI * 2;
        return 0.5 + 0.5 * Math.cos(th + SUNSET_DWELL * Math.sin(2 * th));
      })();
  SUN_DIR.set(
    -0.18,
    THREE.MathUtils.lerp(-0.075, 0.165, alt) + 0.15 * THREE.MathUtils.smoothstep(alt, 0.8, 1.0),
    -1
  ).normalize();
  skyMat.uniforms.uHorizon.value.copy(paletteAt("horizon", alt));
  skyMat.uniforms.uMid.value.copy(paletteAt("mid", alt));
  skyMat.uniforms.uHigh.value.copy(paletteAt("high", alt));
  skyMat.uniforms.uZenith.value.copy(paletteAt("zenith", alt));
  skyMat.uniforms.uSun.value.copy(paletteAt("sun", alt));
  // ember swells as the sun touches the water, fades in the blue hour
  skyMat.uniforms.uEmber.value =
    0.3 + 0.7 * alt + 0.35 * Math.exp(-Math.pow((alt - 0.45) / 0.18, 2));
  seaMat.uniforms.uShallow.value.copy(paletteAt("seaShallow", alt));
  seaMat.uniforms.uGlitter.value.copy(paletteAt("glitter", alt));
  seaMat.uniforms.uDay.value = THREE.MathUtils.smoothstep(alt, 0.3, 0.7);
  scene.fog.color.copy(paletteAt("fog", alt));
  // warm directional key from the sun — low and dead ahead, but the shadow
  // elevation is floored so the raking shadows stay long without running forever
  _shadowDir.copy(SUN_DIR);
  _shadowDir.y = Math.max(_shadowDir.y, 0.24);
  _shadowDir.normalize();
  sunLight.position.copy(sunLight.target.position).addScaledVector(_shadowDir, 130);
  sunLight.intensity = 0.3 + 1.9 * alt;
  sunLight.color.copy(paletteAt("sun", alt));
  // the café answers the dark: warm lighting breathes up as the sun sinks
  const night = THREE.MathUtils.smoothstep(1 - alt, 0.35, 0.92);
  // deepest night only — zero through golden hour and dusk, no boundary pop
  const deepNight = THREE.MathUtils.smoothstep(1 - alt, 0.75, 0.95);
  skyMat.uniforms.uNightI.value = deepNight;
  seaMat.uniforms.uNight.value = deepNight;
  seaMat.uniforms.uHaze.value.copy(paletteAt("seaHaze", alt));
  moonLight.intensity = 0.5 * deepNight;
  scene.fog.density = 0.006 + 0.0015 * deepNight;
  for (const gl of glows)
    gl.s.material.opacity = (0.2 + 0.04 * Math.sin(t * 1.9 + gl.phase)) * deepNight;
  // ambient is cool now — the warmth lives in the key, not the bath
  hemi.intensity = 0.2 + 0.24 * alt + 0.1 * night;
  hemi.color.copy(paletteAt("high", alt)).multiplyScalar(1.5).lerp(_warmNight, night * 0.35);
  starMat.opacity = Math.pow(1 - alt, 2.5) * 0.85;
  skyMat.uniforms.uMoonI.value = Math.pow(night, 2.2) * 0.9;

  skyMat.uniforms.uTime.value = t;
  skyMat.uniforms.uEnergy.value = energy;
  seaMat.uniforms.uTime.value = t;
  seaMat.uniforms.uEnergy.value = energy;

  // stop-motion cadence: figures are posed on threes, not eased
  const ts = Math.floor(t * 8) / 8;
  for (const p of people) {
    if (p.dancer) {
      // groove: two incommensurate sines, squash instead of jump, hips not heels
      const a = ts * (1.1 + energy * 0.9) * p.freq + p.phase;
      const groove = (Math.sin(a) + Math.sin(a * 1.618 + 1.3)) * 0.5;
      p.g.position.y = (groove + 1) * 0.04 * (0.4 + energy) * MOTION;
      p.g.scale.y = 1 - groove * 0.035 * MOTION;
      p.g.rotation.z = p.lean + Math.sin(a * 0.5) * 0.045 * MOTION;
      p.g.position.x = p.baseX + Math.sin(a * 0.25 + p.phase) * 0.12 * MOTION;
    } else {
      // standing: breath and slow weight shifts around the hand-placed lean
      let lean = p.lean;
      if (p.converse !== undefined) {
        // leaning in to listen, easing back to speak — on a long offset
        lean *= 1 + 0.5 * Math.max(0, Math.sin(t * 0.045 + p.converse)) * MOTION;
      }
      p.g.position.y = Math.sin(ts * 0.55 * p.freq + p.phase) * 0.012 * MOTION;
      p.g.rotation.z = lean + Math.sin(ts * 0.22 * p.freq + p.phase) * 0.02 * MOTION;
    }
  }

  // a glass rises into the rim light, holds, and settles back
  for (const L of lifters) {
    if (L.state === 0 && t > L.next) { L.state = 1; L.t0 = t; }
    if (L.state === 1) {
      const k = (t - L.t0) / 9;
      let lift;
      if (k < 0.33) lift = k / 0.33;
      else if (k < 0.55) lift = 1;
      else if (k < 1) lift = 1 - (k - 0.55) / 0.45;
      else { L.state = 0; L.next = t + 55 + Math.random() * 110; lift = 0; }
      const e = lift * lift * (3 - 2 * lift);
      for (const d of L.meshes) d.m.position.y = d.by + e * 0.15 * MOTION;
    }
  }
  // walkers: ease in and out of every journey, gait as a quiet two-beat
  for (const w of walkers) {
    if (w.state === "walking") {
      const p = Math.min(1, (t - w.t0) / w.dur);
      const eased = p * p * (3 - 2 * p);
      w.g.position.lerpVectors(w.from, w.to, eased);
      const stride = Math.min(1, Math.sin(p * Math.PI) * 3); // soft start and stop
      const a = ts * w.speed * 5.2 + w.phase;
      w.g.position.y += (1 - Math.cos(a * 2)) * 0.014 * stride * MOTION;
      w.g.rotation.z = Math.sin(a) * 0.035 * stride * MOTION;
      if (p >= 1) {
        if (w.legs && w.legs.length) {
          walkerSetWalk(w, t, w.g.position, w.legs.shift());
        } else if (w.kind === "stroller") {
          w.g.visible = false;
          w.state = "away";
          w.stateUntil = t + 18 + Math.random() * 45;
        } else if (w.kind === "flaneur") {
          if (w.g.position.z < 6) {
            w.state = "gaze"; // arrived at the rail: just watch
            w.stateUntil = t + 26 + Math.random() * 22;
            w.g.rotation.y = Math.PI;
          } else {
            w.g.visible = false;
            w.state = "away";
            w.stateUntil = t + 70 + Math.random() * 70;
          }
        } else if (w.kind === "guest") {
          if (w.g.position.z < 10) {
            w.state = "seated"; // took the chair
            w.stateUntil = t + 160 + Math.random() * 220;
            w.g.rotation.y = Math.PI + (Math.random() - 0.5) * 0.4;
          } else {
            terrace.remove(w.g); // gone; someone new will come
            w.g = spawnGuestPeg();
            w.g.visible = false;
            w.state = "away";
            w.stateUntil = t + 50 + Math.random() * 100;
          }
        } else {
          const atHome = w.to.distanceTo(w.home) < 0.5;
          w.state = atHome ? "post" : "dwell";
          w.stateUntil = t + (atHome ? 14 + Math.random() * 26 : 6 + Math.random() * 8);
        }
      }
    } else {
      // at rest: the same breath as everyone else
      w.g.position.y = Math.sin(ts * 0.55 + w.phase) * 0.012 * MOTION;
      w.g.rotation.z = Math.sin(ts * 0.22 + w.phase) * 0.02 * MOTION;
      w.g.rotation.x = w.state === "gaze" ? -0.035 : 0; // a slight lean back, taking it in
      if (t > w.stateUntil) {
        if (w.kind === "waiter") {
          if (w.state === "post") {
            const [tx, tz] = tableSpots[Math.floor(Math.random() * tableSpots.length)];
            walkerSetWalk(w, t, w.g.position, new THREE.Vector3(tx + 1.9, 0, tz + 0.6));
          } else {
            walkerSetWalk(w, t, w.g.position, w.home);
          }
        } else if (w.kind === "guest") {
          if (w.state === "seated") {
            w.legs = [new THREE.Vector3(24, 0, PROMENADE_Z)];
            walkerSetWalk(w, t, w.g.position, new THREE.Vector3(6.6, 0, PROMENADE_Z));
          } else {
            w.g.visible = true;
            w.legs = [GUEST_SEAT.clone()];
            walkerSetWalk(w, t, new THREE.Vector3(24, 0, PROMENADE_Z), new THREE.Vector3(6.6, 0, PROMENADE_Z));
          }
        } else if (w.kind === "flaneur") {
          if (w.state === "gaze") {
            // seen enough; drift back out the way he came
            const exitX = w.g.position.x > 0 ? 24 : -24;
            w.legs = [new THREE.Vector3(exitX, 0, PROMENADE_Z)];
            walkerSetWalk(w, t, w.g.position, new THREE.Vector3(w.g.position.x, 0, PROMENADE_Z));
          } else {
            // enter, stroll the promenade, come down to the rail near the cat
            const side = Math.random() < 0.5 ? 1 : -1;
            const railX = side * (10 + Math.random() * 4);
            w.g.visible = true;
            w.legs = [new THREE.Vector3(railX, 0, 3.4)];
            walkerSetWalk(
              w, t,
              new THREE.Vector3(24 * side, 0, PROMENADE_Z),
              new THREE.Vector3(railX, 0, PROMENADE_Z)
            );
          }
        } else {
          const dir = Math.random() < 0.5 ? 1 : -1;
          const z = PROMENADE_Z + (Math.random() - 0.5) * 1.6;
          w.g.visible = true;
          walkerSetWalk(
            w, t,
            new THREE.Vector3(-22 * dir, 0, z),
            new THREE.Vector3(22 * dir, 0, z)
          );
        }
      }
    }
  }

  // the DJ's moment: every few minutes, turn from the decks and watch the horizon
  const enjoy = THREE.MathUtils.smoothstep(Math.sin(t * 0.024 + 4.2), 0.82, 0.94);
  const da = ts * (1.3 + energy * 0.7);
  dj.position.y = (Math.sin(da) + Math.sin(da * 1.618)) * 0.02 * MOTION * (1 - enjoy);
  dj.rotation.x = Math.sin(da) * 0.035 * MOTION * (1 - enjoy) - enjoy * 0.12;
  dj.rotation.y = enjoy * Math.PI;

  // the cat: stillness, a slow tail sweep, and — on its own schedule — a
  // stretch, or a pad along the wall to a new spot
  catTail.rotation.z = -0.9 + Math.sin(ts * 0.4) * Math.max(0, Math.sin(ts * 0.07)) * 0.35 * MOTION;
  if (catState.mode === "sit") {
    if (t > catState.nextMove) {
      catState.mode = "turn";
      catState.t0 = t;
      catState.to = CAT_RANGE[0] + Math.random() * (CAT_RANGE[1] - CAT_RANGE[0]);
      catState.dir = Math.sign(catState.to - cat.position.x) || 1;
    } else if (t > catState.nextStretch) {
      catState.mode = "stretch";
      catState.t0 = t;
    }
  } else if (catState.mode === "stretch") {
    // a long unhurried arch, then back to stillness
    const k = Math.min(1, (t - catState.t0) / 4.5);
    const arch = Math.sin(k * Math.PI);
    catBody.scale.y = 1 + 0.24 * arch * MOTION;
    catHead.position.y = 0.46 - 0.06 * arch * MOTION;
    catTail.rotation.z = -0.9 + 0.5 * arch;
    if (k >= 1) {
      catState.mode = "sit";
      catState.nextStretch = t + 60 + Math.random() * 120;
    }
  } else if (catState.mode === "turn") {
    const k = Math.min(1, (t - catState.t0) / 1.5);
    cat.rotation.y = THREE.MathUtils.lerp(0, catState.dir * Math.PI / 2, k * k * (3 - 2 * k));
    if (k >= 1) {
      catState.mode = "walk";
      catState.t0 = t;
      catState.from = cat.position.x;
      catState.dur = Math.abs(catState.to - catState.from) / 0.45; // a cat is never late
    }
  } else if (catState.mode === "walk") {
    const k = Math.min(1, (t - catState.t0) / catState.dur);
    const e = k * k * (3 - 2 * k);
    cat.position.x = THREE.MathUtils.lerp(catState.from, catState.to, e);
    cat.position.y =
      1.1 + Math.abs(Math.sin(ts * 7)) * 0.022 * Math.min(1, Math.sin(k * Math.PI) * 4) * MOTION;
    if (k >= 1) {
      catState.mode = "turnBack";
      catState.t0 = t;
    }
  } else if (catState.mode === "turnBack") {
    const k = Math.min(1, (t - catState.t0) / 1.8);
    cat.rotation.y = THREE.MathUtils.lerp(catState.dir * Math.PI / 2, 0, k * k * (3 - 2 * k));
    if (k >= 1) {
      catState.mode = "sit";
      cat.position.y = 1.1;
      catState.nextMove = t + 240 + Math.random() * 320;
      catState.nextStretch = t + 40 + Math.random() * 80;
    }
  }

  // shooting star: only in the blue hour, brief and faint
  if (meteorT < 0 && t > meteorAt && alt < 0.3) meteorT = t;
  if (meteorT >= 0) {
    const k = (t - meteorT) / 1.4;
    if (k >= 1) {
      meteorT = -1;
      meteorAt = t + 50 + Math.random() * 70;
      meteor.material.opacity = 0;
    } else {
      meteor.position.set(-120 + k * 150, 150 - k * 55, -320);
      meteor.rotation.z = -0.35;
      meteor.material.opacity = Math.sin(k * Math.PI) * 0.7;
    }
  }

  // the airliner: high, slow, a long quiet diagonal
  if (planeT < 0 && t > planeAt) {
    planeT = t;
    planeDir = Math.random() < 0.5 ? 1 : -1;
    plane.rotation.y = planeDir > 0 ? 0 : Math.PI;
    plane.visible = true;
  }
  if (planeT >= 0) {
    const k = (t - planeT) / PLANE_SECONDS;
    if (k >= 1) {
      planeT = -1;
      planeAt = t + 140 + Math.random() * 130;
      plane.visible = false;
    } else {
      plane.position.set(planeDir * (k * 560 - 280), 33 + Math.sin(k * Math.PI) * 2, -195);
      plane.userData.strobe.material.opacity = Math.sin(t * 9) > 0.72 ? 0.9 : 0.08;
    }
  }

  // the helicopter: lower, quicker, hugging the coast
  if (heliT < 0 && t > heliAt) {
    heliT = t;
    heliDir = Math.random() < 0.5 ? 1 : -1;
    heli.rotation.y = heliDir > 0 ? 0 : Math.PI;
    heli.rotation.z = -0.06;
    heli.visible = true;
  }
  if (heliT >= 0) {
    const k = (t - heliT) / HELI_SECONDS;
    if (k >= 1) {
      heliT = -1;
      heliAt = t + 200 + Math.random() * 180;
      heli.visible = false;
    } else {
      heli.position.set(heliDir * (k * 440 - 220), 17 + Math.sin(t * 1.3) * 0.5, -115);
      heli.userData.rotor.rotation.y += 0.9;
      heli.userData.beacon.material.opacity = Math.sin(t * 6) > 0.4 ? 0.85 : 0.1;
    }
  }

  // gulls: flap-flap-glide, weaving as a loose flock
  if (gullT < 0 && t > gullAt) {
    gullT = t;
    gullDir = Math.random() < 0.5 ? 1 : -1;
    for (const b of gulls) {
      b.g.visible = true;
      b.g.rotation.y = gullDir > 0 ? 0 : Math.PI;
    }
  }
  if (gullT >= 0) {
    const k = (t - gullT) / GULL_SECONDS;
    if (k >= 1) {
      gullT = -1;
      gullAt = t + 80 + Math.random() * 80;
      for (const b of gulls) b.g.visible = false;
    } else {
      for (const b of gulls) {
        const burst = THREE.MathUtils.smoothstep(Math.sin(t * 0.55 + b.phase), -0.2, 0.35);
        const flap = Math.sin(t * 20 + b.phase) * (0.12 + 0.7 * burst);
        for (const w of b.wings) w.h.rotation.x = flap * w.s;
        b.g.position.set(
          gullDir * (k * 320 - 160 + b.off.x),
          11.5 + b.off.y + Math.sin(t * 0.9 + b.phase) * 0.8 - burst * 0.4,
          -72 + b.off.z
        );
      }
    }
  }

  // the pelican: rare, low over the water, mostly glide
  if (pelicanT < 0 && t > pelicanAt) {
    pelicanT = t;
    pelicanDir = Math.random() < 0.5 ? 1 : -1;
    pelican.g.visible = true;
    pelican.g.rotation.y = pelicanDir > 0 ? 0 : Math.PI;
  }
  if (pelicanT >= 0) {
    const k = (t - pelicanT) / PELICAN_SECONDS;
    if (k >= 1) {
      pelicanT = -1;
      pelicanAt = t + 280 + Math.random() * 220;
      pelican.g.visible = false;
    } else {
      const burst = THREE.MathUtils.smoothstep(Math.sin(t * 0.35), 0.1, 0.5);
      const flap = Math.sin(t * 7) * (0.06 + 0.5 * burst);
      for (const w of pelican.wings) w.h.rotation.x = flap * w.s;
      pelican.g.position.set(pelicanDir * (k * 300 - 150), 7.6 + Math.sin(t * 0.5) * 0.5, -64);
    }
  }

  // the speedboat: fast, glamorous, gone
  if (speedboatT < 0 && t > speedboatAt) {
    speedboatT = t;
    speedboatDir = Math.random() < 0.5 ? 1 : -1;
    speedboat.rotation.y = speedboatDir > 0 ? 0 : Math.PI;
    speedboat.visible = true;
  }
  if (speedboatT >= 0) {
    const k = (t - speedboatT) / SPEEDBOAT_SECONDS;
    if (k >= 1) {
      speedboatT = -1;
      speedboatAt = t + 210 + Math.random() * 160;
      speedboat.visible = false;
    } else {
      speedboat.position.set(speedboatDir * (k * 460 - 230), -0.42 + Math.sin(t * 2.6) * 0.05, -92);
      speedboat.rotation.z = Math.sin(t * 2.6) * 0.015;
    }
  }

  // the boardwalk: passersby, the occasional flaneur, the occasional dancer
  for (const w of bwWalkers) {
    if (w.state === "away") {
      if (t > w.until) {
        w.state = "cross";
        w.dir = Math.random() < 0.5 ? 1 : -1;
        w.t0 = t;
        w.z = -3.6 - Math.random() * 1.4;
        w.dur = 64 / w.speed;
        w.pauseAt = 0.35 + Math.random() * 0.3;
        w.paused = false;
        w.g.visible = true;
        w.g.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    } else if (w.state === "cross") {
      const k = Math.min(1, (t - w.t0) / w.dur);
      w.g.position.set(w.dir * (k * 64 - 32), BW_Y, w.z);
      const a = ts * w.speed * 5.2 + w.phase;
      w.g.position.y += (1 - Math.cos(a * 2)) * 0.014 * MOTION;
      w.g.rotation.z = Math.sin(a) * 0.035 * MOTION;
      if (!w.paused && w.persona !== "passer" && k > w.pauseAt) {
        w.state = "pause";
        w.paused = true;
        w.k0 = k;
        w.until = t + (w.persona === "flaneur" ? 14 + Math.random() * 14 : 7 + Math.random() * 5);
        w.g.rotation.y = Math.PI; // face the sea
        w.g.rotation.z = 0;
      }
      if (k >= 1) {
        w.state = "away";
        w.g.visible = false;
        w.until = t + 25 + Math.random() * 50;
      }
    } else {
      if (w.persona === "dancer") {
        const a = ts * 2.2 + w.phase;
        const groove = (Math.sin(a) + Math.sin(a * 1.618)) * 0.5;
        w.g.position.y = BW_Y + (groove + 1) * 0.035 * MOTION;
        w.g.rotation.z = Math.sin(a * 0.5) * 0.05 * MOTION;
      } else {
        w.g.position.y = BW_Y + Math.sin(ts * 0.55 + w.phase) * 0.012 * MOTION;
        w.g.rotation.x = -0.03;
      }
      if (t > w.until) {
        w.state = "cross";
        w.g.rotation.x = 0;
        w.g.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        w.t0 = t - w.k0 * w.dur; // resume the crossing where it left off
      }
    }
  }

  // the shore breathes
  foamMat.uniforms.uTime.value = t;
  foamMat.uniforms.uFoam.value.set("#e8e0d2").lerp(_moonCool, night * 0.55).multiplyScalar(0.75 + 0.25 * alt);

  for (const b of boats) {
    b.g.position.y = Math.sin(t * 0.5 + b.phase) * 0.09 * MOTION - 0.05;
    b.g.rotation.z = Math.sin(t * 0.4 + b.phase) * 0.03 * MOTION;
    b.g.position.x += b.drift * MOTION;
  }

  // the breeze: one wind for the whole terrace, wandering, sometimes near-still
  if (t > wind.nextShift) {
    wind.target = (0.2 + Math.random() * 1.0) * (Math.random() < 0.5 ? 1 : -1);
    wind.nextShift = t + 60 + Math.random() * 120;
  }
  wind.x += (wind.target - wind.x) * 0.0015; // the shift takes about a minute

  for (const b of bulbs) {
    const k = (0.75 + 0.25 * Math.sin(t * 2.4 + b.phase)) * (0.55 + 0.65 * night);
    b.m.material.color.setRGB(0.88 * k, 0.44 * k, 0.16 * k);
    b.m.position.x = b.bx + Math.sin(ts * 0.8 + b.phase) * 0.07 * wind.x * MOTION;
    b.m.position.y = b.by + Math.sin(ts * 1.1 + b.phase) * 0.02 * Math.abs(wind.x) * MOTION;
  }
  for (const p of palms)
    p.g.rotation.z = Math.sin(ts * 0.4 + p.phase) * 0.015 * wind.x * MOTION;
  for (const pp of pergolaPanels)
    pp.panel.rotation.z = Math.sin(ts * 0.6 + pp.phase) * 0.01 * wind.x * MOTION;
  candleMat.color.setRGB(1.0, 0.62, 0.31).multiplyScalar(0.72 + 0.45 * night);
  for (const pr of practicals)
    pr.p.intensity = (0.7 + 0.6 * night + 0.7 * deepNight) + Math.sin(t * 1.7 + pr.phase) * 0.1;
  // silhouette treatment follows the sky: rim from the sun, fill from the zenith.
  // At deepest night, the Muller duality: warm candle rim against cool moon fill.
  SIL.rim.value.copy(paletteAt("sun", alt)).multiplyScalar(0.5).lerp(_emberRim, 0.65 * deepNight);
  SIL.cool.value.copy(paletteAt("high", alt)).multiplyScalar(1.15).lerp(_moonCool, 0.6 * deepNight);
  SIL.lift.value.set("#0d0712").multiplyScalar(1 + 0.5 * deepNight);
  SIL.rimI.value = 0.16 + 0.26 * alt + 0.18 * deepNight;
  // peak-sun figure carve: hot sun-side rim + boosted cool fill, gated to the peak
  SIL.peak.value = THREE.MathUtils.smoothstep(alt, 0.82, 0.95);
  // dusk-only figure outline: cool mauve from the residual sky, capped low
  const duskW = THREE.MathUtils.smoothstep(alt, 0.25, 0.4) * (1 - THREE.MathUtils.smoothstep(alt, 0.55, 0.68));
  SIL.duskRim.value = 0.1 * duskW; // hard ceiling 0.15 — held under it
  SIL.duskRimC.value.copy(paletteAt("high", alt)).lerp(_paleMauve, 0.55);
  // canopy underside edge: deep-night only, capped 0.12 — held under it
  SIL.canopy.value = 0.08 * deepNight;
  SIL.canopyC.value.copy(paletteAt("high", alt)).lerp(_plumEdge, 0.4);
  SIL.hot.value.copy(paletteAt("sun", alt)).lerp(_hotOrange, 0.45);
  SIL.sunV.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
  lampGlow.intensity = 3.5 + night * 7 + Math.sin(t * 2.0) * 0.8 + energy * 2;
  danceGlow.intensity = night * (3.2 + energy * 1.8);

  // the twilight overture: hold the opening note, then dissolve into the day
  if (!Number.isFinite(PHASE_LOCK) && TWILIGHT.HOLD + TWILIGHT.DRIFT > 0) {
    const introW = 1 - THREE.MathUtils.smoothstep(t, TWILIGHT.HOLD, TWILIGHT.HOLD + TWILIGHT.DRIFT);
    if (introW > 0) {
      skyMat.uniforms.uZenith.value.lerp(TWI.zenith, introW);
      skyMat.uniforms.uHigh.value.lerp(TWI.high, introW);
      skyMat.uniforms.uMid.value.lerp(TWI.mid, introW);
      skyMat.uniforms.uHorizon.value.lerp(TWI.horizon, introW);
      skyMat.uniforms.uSun.value.lerp(TWI.ember, introW);
      skyMat.uniforms.uEmber.value = THREE.MathUtils.lerp(skyMat.uniforms.uEmber.value, TWILIGHT.emberI, introW);
      SUN_DIR.y = THREE.MathUtils.lerp(SUN_DIR.y, TWILIGHT.sunY, introW);
      SUN_DIR.normalize();
      seaMat.uniforms.uShallow.value.lerp(TWI.sea, introW);
      seaMat.uniforms.uGlitter.value.lerp(TWI.glitter, introW);
      seaMat.uniforms.uDay.value = THREE.MathUtils.lerp(seaMat.uniforms.uDay.value, 0.65, introW);
      scene.fog.color.lerp(TWI.fog, introW);
      sunLight.intensity = THREE.MathUtils.lerp(sunLight.intensity, 0.5, introW);
      sunLight.color.lerp(TWI.key, introW);
      hemi.intensity = THREE.MathUtils.lerp(hemi.intensity, 0.55, introW);
      hemi.color.lerp(TWI.ambient, introW);
      SIL.rim.value.lerp(TWI.rim, introW);
      SIL.rimI.value = THREE.MathUtils.lerp(SIL.rimI.value, 0.18, introW);
      SIL.cool.value.lerp(TWI.cool, introW);
      SIL.peak.value *= 1 - introW; // no hot peak carve against a quiet sky
    }
  }

  // cinematography: hold a composed shot with slow drift, cut to the next
  const shot = SHOTS[
    Number.isFinite(SHOT_LOCK)
      ? Math.abs(SHOT_LOCK) % SHOTS.length
      : Math.floor(t / SHOT_SECONDS) % SHOTS.length
  ];
  const st = t * 0.05;
  camera.position.set(
    shot.pos.x + Math.sin(st) * shot.drift * MOTION + lean.x * 1.1 * MOTION,
    shot.pos.y + Math.sin(st * 1.7) * shot.bob * MOTION - lean.y * 0.4 * MOTION,
    shot.pos.z
  );
  camera.lookAt(shot.look);

  renderer.render(scene, camera);
  if (!document.hidden) requestAnimationFrame(tick);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { clock.getDelta(); requestAnimationFrame(tick); }
});
tick();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
