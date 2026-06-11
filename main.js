import * as THREE from "three";

// ---------------------------------------------------------------------------
// Config — swap MIX_FEED for Simon's own set once it's on Mixcloud.
// CUE_SHEET: optional precomputed energy timeline [{t: seconds, energy: 0..1}]
// exported from offline analysis of the mix file; drives crowd + sky breathing.
// ---------------------------------------------------------------------------
const MIX_FEED = "/trotika/trotika-deep-summer-mix-2013/";
const CUE_SHEET = null;

const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOTION = REDUCED_MOTION ? 0.15 : 1;

// ?quiet — straight into the scene, no gate, no audio (art direction / review)
// ?phase=0..1 — freeze the sun cycle for art direction (1 golden, 0.45 dusk, 0 blue hour)
const PARAMS = new URLSearchParams(location.search);
const QUIET = PARAMS.has("quiet");
const PHASE_LOCK = parseFloat(PARAMS.get("phase"));

// the sun's pendulum: golden hour -> dusk -> blue hour -> back. Never full day,
// never full night. Cosine gives the long dwell at both ends.
const CYCLE_MINUTES = 12;

// --- palette keyframes: the cycle moves through these (Pinto registers) ------
const KEYS = {
  golden: {
    horizon: "#cf5a35", mid: "#a04866", high: "#3a2a66", zenith: "#07060f",
    sun: "#ffb478", fog: "#3a2030", seaShallow: "#396b74", glitter: "#e08a4f",
  },
  dusk: {
    horizon: "#a83a30", mid: "#7e3257", high: "#2c2154", zenith: "#050410",
    sun: "#ff9c5e", fog: "#301a2b", seaShallow: "#2c5560", glitter: "#d4703f",
  },
  blue: {
    horizon: "#5c3a55", mid: "#312a5e", high: "#1b1f4a", zenith: "#04030c",
    sun: "#6e5a8a", fog: "#131022", seaShallow: "#1e3343", glitter: "#5a6f8a",
  },
};
for (const k of Object.values(KEYS))
  for (const key of Object.keys(k)) k[key] = new THREE.Color(k[key]);

// alt: 0 = blue hour, 0.45 = dusk, 1 = golden. Blends through dusk in between.
const _c = new THREE.Color();
const _warmNight = new THREE.Color("#e8924e");
function paletteAt(key, alt) {
  if (alt < 0.45) return _c.copy(KEYS.blue[key]).lerp(KEYS.dusk[key], alt / 0.45);
  return _c.copy(KEYS.dusk[key]).lerp(KEYS.golden[key], (alt - 0.45) / 0.55);
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
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uSunDir, uHorizon, uMid, uHigh, uZenith, uSun, uMoonDir, uMoonCol;
    uniform float uTime, uEnergy, uEmber, uMoonI;
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
    uEnergy: { value: 0.5 },
    uDay: { value: 1.0 },
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
    uniform float uTime, uEnergy, uDay;
    uniform vec3 uDeep, uShallow, uGlitter, uHaze;
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
const lampGlow = new THREE.PointLight("#ff8f45", 6, 40, 1.8);
lampGlow.position.set(0, 5.5, 14);
scene.add(lampGlow);
// second warm pool over the booth and dancers — the night answers the dark
const danceGlow = new THREE.PointLight("#ff9a50", 0, 30, 1.9);
danceGlow.position.set(-2, 4.2, 5);
scene.add(danceGlow);

// --- terrace ---------------------------------------------------------------
const terrace = new THREE.Group();
scene.add(terrace);

const deckMat = new THREE.MeshStandardMaterial({ color: "#160d1c", roughness: 0.9 });
const deck = new THREE.Mesh(new THREE.BoxGeometry(46, 1.2, 26), deckMat);
deck.position.set(0, -0.6, 14);
terrace.add(deck);

const wallMat = new THREE.MeshStandardMaterial({ color: "#1d1126", roughness: 0.85 });
const wall = new THREE.Mesh(new THREE.BoxGeometry(46, 1.1, 0.7), wallMat);
wall.position.set(0, 0.55, 1.6);
terrace.add(wall);

// tables: low cylinders with a candle glow
const tableMat = new THREE.MeshStandardMaterial({ color: "#120a18", roughness: 0.7 });
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
}

// --- people: soft capsule patrons -----------------------------------------
const PALETTE = ["#2e1822", "#241526", "#39201d", "#2a1a30", "#1f1826", "#34202a"];
const people = [];
function person(x, z, { dancer = false, scale = 1 } = {}) {
  const g = new THREE.Group();
  const tone = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42 * scale, 1.15 * scale, 6, 14),
    new THREE.MeshStandardMaterial({ color: tone, roughness: 0.65 })
  );
  body.position.y = 1.05 * scale;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3 * scale, 14, 14),
    new THREE.MeshStandardMaterial({ color: "#160d14", roughness: 0.6 })
  );
  head.position.y = 2.1 * scale;
  g.add(body, head);
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  terrace.add(g);
  people.push({
    g, dancer,
    phase: Math.random() * Math.PI * 2,
    freq: 0.75 + Math.random() * 0.5, // nobody moves at the same tempo
    baseX: x,
  });
}
// seated-ish clusters near tables
for (const [x, z] of tableSpots) {
  person(x + 1.6, z + 0.4, { scale: 0.82 });
  if (Math.random() > 0.35) person(x - 1.5, z - 0.6, { scale: 0.82 });
}
// dancers near the booth
for (let i = 0; i < 6; i++) {
  person(-4 + i * 1.7 + Math.random(), 4.2 + Math.random() * 2.2, { dancer: true });
}

// --- walkers: waiters and passersby, never in a hurry -------------------------
const walkers = [];
function makeWalker({ tint, scale = 0.8, slim = false }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry((slim ? 0.34 : 0.42) * scale, 1.2 * scale, 6, 14),
    new THREE.MeshStandardMaterial({ color: tint, roughness: 0.65 })
  );
  body.position.y = 1.08 * scale;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.29 * scale, 14, 14),
    new THREE.MeshStandardMaterial({ color: "#3d2a30", roughness: 0.6 })
  );
  head.position.y = 2.12 * scale;
  g.add(body, head);
  terrace.add(g);
  return g;
}

// waiters: drift from their station to a table, dwell, drift back
for (const station of [new THREE.Vector3(9, 0, 24.5), new THREE.Vector3(-13, 0, 24.5)]) {
  walkers.push({
    kind: "waiter",
    g: makeWalker({ tint: "#42333b", scale: 0.82, slim: true }),
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
    g: makeWalker({ tint: PALETTE[i % PALETTE.length], scale: 0.8 + Math.random() * 0.1 }),
    state: "away", stateUntil: 6 + i * 22 + Math.random() * 18,
    from: new THREE.Vector3(), to: new THREE.Vector3(),
    t0: 0, dur: 1, speed: 0.85 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    pairOffset: null,
  };
  w.g.visible = false;
  walkers.push(w);
}

// the flaneur: the one you live vicariously through. Slowest walk on the
// terrace, a shade lighter than everyone, comes to the rail just to watch.
const flaneur = {
  kind: "flaneur",
  g: makeWalker({ tint: "#7d6a59", scale: 0.96, slim: true }),
  state: "away", stateUntil: 12,
  from: new THREE.Vector3(), to: new THREE.Vector3(),
  t0: 0, dur: 1, speed: 0.72,
  phase: Math.random() * Math.PI * 2,
  legs: [],
};
flaneur.g.visible = false;
walkers.push(flaneur);

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
  new THREE.MeshStandardMaterial({ color: "#100a16", roughness: 0.5, metalness: 0.2 })
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
  new THREE.CapsuleGeometry(0.45, 1.2, 6, 14),
  new THREE.MeshStandardMaterial({ color: "#120b1c", roughness: 0.6 })
);
djBody.position.y = 1.15;
const djHead = new THREE.Mesh(
  new THREE.SphereGeometry(0.32, 14, 14),
  new THREE.MeshStandardMaterial({ color: "#160d14", roughness: 0.6 })
);
djHead.position.y = 2.25;
dj.add(djBody, djHead);
dj.position.z = -1.2;
booth.add(dj);
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
    bulbs.push({ m: bulb, phase: i * 0.7 });
  }
}
stringLights(-20, 20, 3.2, 6.2, 1.1);
stringLights(-18, 18, 11, 6.6, 1.3);
stringLights(-16, 16, 19, 6.3, 1.0);

// poles
const poleMat = new THREE.MeshStandardMaterial({ color: "#100a16", roughness: 0.8 });
for (const [x, z] of [[-20, 3.2], [20, 3.2], [-18, 11], [18, 11], [-16, 19], [16, 19]]) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.6, 8), poleMat);
  pole.position.set(x, 3.0, z);
  terrace.add(pole);
}

// --- palms (silhouettes at the edges) ----------------------------------------
function palm(x, z, h = 9, lean = 0.12) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#0e0813", roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, h, 8), trunkMat);
  trunk.position.y = h / 2;
  trunk.rotation.z = lean;
  g.add(trunk);
  const frondMat = new THREE.MeshStandardMaterial({ color: "#110a18", roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4.2, 4), frondMat);
    frond.position.set(Math.sin(lean) * h, h - 0.2, 0);
    frond.rotation.z = Math.PI / 2.4 + (i / 7) * Math.PI * 0.9 - 0.6;
    frond.rotation.y = (i / 7) * Math.PI * 2;
    g.add(frond);
  }
  g.position.set(x, 0, z);
  terrace.add(g);
}
palm(-24, 5, 10, 0.16);
palm(25, 11, 8.5, -0.1);

// olive trees: low gnarled trunks, soft round canopies
const oliveMat = new THREE.MeshStandardMaterial({ color: "#1c1426", roughness: 0.95 });
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
  g.position.set(-27, 0, 10);
  terrace.add(g);
}

// --- the cat (every Ibiza terrace has one) ------------------------------------
const cat = new THREE.Group();
const catMat = new THREE.MeshStandardMaterial({ color: "#0b0710", roughness: 0.9 });
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
cat.position.set(11.5, 1.1, 1.6); // on the wall, facing the sea
terrace.add(cat);

// --- shooting stars: blue hour only, rare ------------------------------------
const meteor = new THREE.Mesh(
  new THREE.BoxGeometry(3.2, 0.035, 0.035),
  new THREE.MeshBasicMaterial({ color: "#dfe4ff", transparent: true, opacity: 0 })
);
scene.add(meteor);
let meteorAt = 45 + Math.random() * 60;
let meteorT = -1;

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
let energy = 0.5; // 0..1, drives crowd + sky + glitter
let position = 0;

window.addEventListener("load", () => {
  if (!window.Mixcloud) return;
  widget = window.Mixcloud.PlayerWidget(iframe);
  widget.ready.then(async () => {
    const name = await widget.getCurrentKey?.().catch(() => null);
    setNowPlaying(name || MIX_FEED);
    widget.events.progress.on((pos) => { position = pos; });
    widget.events.play.on(() => setLive(true));
    widget.events.pause.on(() => setLive(false));
  });
});

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

// --- gate / enter ------------------------------------------------------------
if (QUIET) {
  document.getElementById("gate").remove();
} else {
  document.getElementById("enter").addEventListener("click", () => {
    document.getElementById("gate").classList.add("open");
    widget?.play?.();
  });
}

// space bar = play/pause, anywhere on the page
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target.closest("button, a, input")) return;
  e.preventDefault();
  widget?.togglePlay?.();
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
];
const SHOT_LOCK = parseInt(PARAMS.get("shot"), 10);

console.log(
  "%c8:47 PM, forever.%c\nYou found the back door. The sun comes down to the water,\nrests a while in the blue hour, and climbs back — but it never sets.\nPull up a chair. — тяoтɪкᴀ",
  "font-size:14px;color:#ff8a5c", "color:#9a8fa8"
);

// --- perpetual clock: seconds tick, the minute never arrives ------------------
const clockEl = document.getElementById("clock");
setInterval(() => {
  const s = new Date().getSeconds();
  clockEl.innerHTML = `8:47:${String(s).padStart(2, "0")} <span>PM</span>`;
}, 1000);

// --- loop ---------------------------------------------------------------------
const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  energy += (currentEnergy(t) - energy) * 0.02;

  // --- the sun's pendulum: golden -> dusk -> blue hour -> back ---
  const alt = Number.isFinite(PHASE_LOCK)
    ? Math.min(1, Math.max(0, PHASE_LOCK))
    : 0.5 + 0.5 * Math.cos((t / (CYCLE_MINUTES * 60)) * Math.PI * 2);
  SUN_DIR.set(-0.18, THREE.MathUtils.lerp(-0.075, 0.085, alt), -1).normalize();
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
  sunLight.position.copy(SUN_DIR).multiplyScalar(100);
  sunLight.intensity = 0.25 + 1.25 * alt;
  // the café answers the dark: warm lighting breathes up as the sun sinks
  const night = THREE.MathUtils.smoothstep(1 - alt, 0.35, 0.92);
  hemi.intensity = 0.28 + 0.32 * alt + 0.1 * night;
  hemi.color.set("#c06a48").lerp(_warmNight, night * 0.6);
  starMat.opacity = Math.pow(1 - alt, 2.5) * 0.85;
  skyMat.uniforms.uMoonI.value = Math.pow(night, 2.2) * 0.9;

  skyMat.uniforms.uTime.value = t;
  skyMat.uniforms.uEnergy.value = energy;
  seaMat.uniforms.uTime.value = t;
  seaMat.uniforms.uEnergy.value = energy;

  for (const p of people) {
    if (p.dancer) {
      // groove: two incommensurate sines, squash instead of jump, hips not heels
      const a = t * (1.1 + energy * 0.9) * p.freq + p.phase;
      const groove = (Math.sin(a) + Math.sin(a * 1.618 + 1.3)) * 0.5;
      p.g.position.y = (groove + 1) * 0.04 * (0.4 + energy) * MOTION;
      p.g.scale.y = 1 - groove * 0.035 * MOTION;
      p.g.rotation.z = Math.sin(a * 0.5) * 0.045 * MOTION;
      p.g.position.x = p.baseX + Math.sin(a * 0.25 + p.phase) * 0.12 * MOTION;
    } else {
      // standing: breath and slow weight shifts, nothing more
      p.g.position.y = Math.sin(t * 0.55 * p.freq + p.phase) * 0.012 * MOTION;
      p.g.rotation.z = Math.sin(t * 0.22 * p.freq + p.phase) * 0.02 * MOTION;
    }
  }
  // walkers: ease in and out of every journey, gait as a quiet two-beat
  for (const w of walkers) {
    if (w.state === "walking") {
      const p = Math.min(1, (t - w.t0) / w.dur);
      const eased = p * p * (3 - 2 * p);
      w.g.position.lerpVectors(w.from, w.to, eased);
      const stride = Math.min(1, Math.sin(p * Math.PI) * 3); // soft start and stop
      const a = t * w.speed * 5.2 + w.phase;
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
        } else {
          const atHome = w.to.distanceTo(w.home) < 0.5;
          w.state = atHome ? "post" : "dwell";
          w.stateUntil = t + (atHome ? 14 + Math.random() * 26 : 6 + Math.random() * 8);
        }
      }
    } else {
      // at rest: the same breath as everyone else
      w.g.position.y = Math.sin(t * 0.55 + w.phase) * 0.012 * MOTION;
      w.g.rotation.z = Math.sin(t * 0.22 + w.phase) * 0.02 * MOTION;
      w.g.rotation.x = w.state === "gaze" ? -0.035 : 0; // a slight lean back, taking it in
      if (t > w.stateUntil) {
        if (w.kind === "waiter") {
          if (w.state === "post") {
            const [tx, tz] = tableSpots[Math.floor(Math.random() * tableSpots.length)];
            walkerSetWalk(w, t, w.g.position, new THREE.Vector3(tx + 1.9, 0, tz + 0.6));
          } else {
            walkerSetWalk(w, t, w.g.position, w.home);
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
  const da = t * (1.3 + energy * 0.7);
  dj.position.y = (Math.sin(da) + Math.sin(da * 1.618)) * 0.02 * MOTION * (1 - enjoy);
  dj.rotation.x = Math.sin(da) * 0.035 * MOTION * (1 - enjoy) - enjoy * 0.12;
  dj.rotation.y = enjoy * Math.PI;

  // the cat: stillness, an occasional slow tail sweep
  catTail.rotation.z = -0.9 + Math.sin(t * 0.4) * Math.max(0, Math.sin(t * 0.07)) * 0.35 * MOTION;

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

  for (const b of boats) {
    b.g.position.y = Math.sin(t * 0.5 + b.phase) * 0.09 * MOTION - 0.05;
    b.g.rotation.z = Math.sin(t * 0.4 + b.phase) * 0.03 * MOTION;
    b.g.position.x += b.drift * MOTION;
  }

  for (const b of bulbs) {
    const k = (0.75 + 0.25 * Math.sin(t * 2.4 + b.phase)) * (0.55 + 0.65 * night);
    b.m.material.color.setRGB(0.88 * k, 0.44 * k, 0.16 * k);
  }
  candleMat.color.setRGB(1.0, 0.62, 0.31).multiplyScalar(0.72 + 0.45 * night);
  lampGlow.intensity = 3.5 + night * 7 + Math.sin(t * 2.0) * 0.8 + energy * 2;
  danceGlow.intensity = night * (5.5 + energy * 2.5);

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
