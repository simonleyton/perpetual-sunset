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
const QUIET = new URLSearchParams(location.search).has("quiet");

// --- palette: Miami-sky golden hour, never resolving --------------------
const SKY = {
  horizon: new THREE.Color("#cf5a35"),
  mid: new THREE.Color("#a04866"),
  high: new THREE.Color("#3a2a66"),
  zenith: new THREE.Color("#07060f"),
  sun: new THREE.Color("#ffb478"),
};

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
    uHorizon: { value: SKY.horizon },
    uMid: { value: SKY.mid },
    uHigh: { value: SKY.high },
    uZenith: { value: SKY.zenith },
    uSun: { value: SKY.sun },
    uEnergy: { value: 0.5 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uSunDir, uHorizon, uMid, uHigh, uZenith, uSun;
    uniform float uTime, uEnergy;
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
      col += uSun * ember;
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
    uShallow: { value: new THREE.Color("#396b74") },
    uGlitter: { value: new THREE.Color("#e08a4f") },
    uHaze: { value: new THREE.Color("#d9764a") },
    uEnergy: { value: 0.5 },
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
    uniform float uTime, uEnergy;
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
      col += uGlitter * path * (0.14 + sparkle * 0.55) * (0.25 + toHorizon * 0.85);
      // sea dissolves into the horizon haze
      col = mix(col, uHaze, smoothstep(0.8, 1.0, vUv.y) * 0.4);
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
scene.add(new THREE.HemisphereLight("#c06a48", "#171028", 0.6));
const sunLight = new THREE.DirectionalLight("#d65f33", 1.5);
sunLight.position.copy(SUN_DIR).multiplyScalar(100);
scene.add(sunLight);
const lampGlow = new THREE.PointLight("#ff8f45", 6, 40, 1.8);
lampGlow.position.set(0, 5.5, 14);
scene.add(lampGlow);

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
  people.push({ g, dancer, phase: Math.random() * Math.PI * 2, baseY: 0 });
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

  skyMat.uniforms.uTime.value = t;
  skyMat.uniforms.uEnergy.value = energy;
  seaMat.uniforms.uTime.value = t;
  seaMat.uniforms.uEnergy.value = energy;

  for (const p of people) {
    const amp = (p.dancer ? 0.16 + energy * 0.22 : 0.035) * MOTION;
    const speed = p.dancer ? 2.1 + energy * 1.6 : 0.9;
    p.g.position.y = Math.abs(Math.sin(t * speed + p.phase)) * amp;
    if (p.dancer) p.g.rotation.y += Math.sin(t * 0.8 + p.phase) * 0.004;
  }
  dj.position.y = Math.abs(Math.sin(t * (2.0 + energy))) * 0.08;
  dj.rotation.x = Math.sin(t * (2.0 + energy)) * 0.05;

  for (const b of bulbs) {
    const k = 0.75 + 0.25 * Math.sin(t * 2.4 + b.phase);
    b.m.material.color.setRGB(0.88 * k, 0.44 * k, 0.16 * k);
  }
  lampGlow.intensity = 5 + Math.sin(t * 2.0) * 0.8 + energy * 2;

  // slow camera drift — a guest leaning back in their chair
  camera.position.x = Math.sin(t * 0.05) * 2.2 * MOTION + lean.x * 1.1 * MOTION;
  camera.position.y = 4.6 + Math.sin(t * 0.085) * 0.3 * MOTION - lean.y * 0.4 * MOTION;
  camera.position.z = 27;
  camera.lookAt(-3, 3.0, -30);

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
