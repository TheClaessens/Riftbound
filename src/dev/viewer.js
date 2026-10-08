import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { CreatureRenderer } from '../game/creatures/renderer.js';
import { buildPlayerModel } from '../game/models.js';

// =====================================================================================
//  Creature viewer (dev only): /dev/creatures.html?set=greenskins&poses=idle,walk:0,walk:1.6,attack:0.5
//  Params:
//    set    : module in src/game/creatures/ (exports defineCreature defs)       default 'test'
//    ids    : comma list of export names (default: every def in the module)
//    poses  : comma list. idle | walk:<phase> | die:<0..1> | <action>:<k 0..1>  default idle,walk:0,walk:1.6
//    zoom   : camera zoom (1 = in-game default, 0.6..1.6 in game; use 2.5–4 for close-ups)   default 1
//    yaw    : extra creature yaw in radians (turntable)                               default 0
//    bg     : forest | barrens | river | #rrggbb                                      default forest
//    t      : animation time (s)                                                      default 0.7
//    glow   : 0..1 per-instance glow                                                  default 0
//    rim    : elite | none                                                            default none
//    ward   : fire | frost | storm | arcane (accent recolour)
//    layout : cols | rows (rows = poses side by side; default when > 3 poses)
//  window.view({ ...params }) re-renders without reloading.
// =====================================================================================

const BG = { forest: 0x5f8f3e, barrens: 0xc07a45, river: 0x6f9a4c };
const engine = new Engine(document.getElementById('game'));
const scene = engine.scene;
const creatures = new CreatureRenderer(scene, engine.camera);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x5f8f3e, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const ref = buildPlayerModel('arcanist');
scene.add(ref.root);
ref.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

const labels = document.getElementById('labels');
const info = document.getElementById('info');
let handles = [];

// Daylight preview lighting until the environment pass replaces engine defaults.
function daylight() {
  engine.setAtmosphere?.({ background: 0x9cc8e8, hemiSky: 0xcfe6ff, hemiGround: 0x5a6a3a, hemiIntensity: 1.6, moon: 0xfff1d6, moonIntensity: 2.6, grade: { tint: [1, 1, 1], saturation: 1.05, contrast: 1.0, vignette: 0.2 } }, 0);
}

function parsePoses(str) {
  return str.split(',').filter(Boolean).map((tok) => {
    const [name, v] = tok.split(':');
    const val = v === undefined ? undefined : parseFloat(v);
    if (name === 'idle') return { label: 'idle', move: 0, walk: 0, action: null, k: 0, dying: 0 };
    if (name === 'walk' || name === 'run') return { label: `${name} ${val ?? 0}`, move: 1, walk: val ?? 0, action: null, k: 0, dying: 0, speed: name === 'run' ? 8 : 3 };
    if (name === 'die') return { label: `die ${val ?? 0.5}`, move: 0, walk: 0, action: null, k: 0, dying: val ?? 0.5 };
    if (name === 'hit') return { label: 'hit', move: 0, walk: 0, action: null, k: 0, dying: 0, hit: 1 };
    return { label: `${name} ${val ?? 0.5}`, move: 0, walk: 0, action: name, k: val ?? 0.5, dying: 0 };
  });
}

async function view(params = {}) {
  const q = Object.fromEntries(new URLSearchParams(location.search));
  const P = { set: 'test', poses: 'idle,walk:0,walk:1.6', zoom: '1', yaw: '0', bg: 'forest', t: '0.7', glow: '0', rim: 'none', ...q, ...params };
  const mod = await import(`../game/creatures/${P.set}.js?v=${Date.now()}`);
  const defs = Object.entries(mod).filter(([, d]) => d && d.boneCount && d.spec)
    .filter(([k]) => !P.ids || P.ids.split(',').includes(k));
  const poses = parsePoses(P.poses);

  creatures.clear();
  for (const b of creatures.batches.values()) b.mesh.count = 0;
  creatures.batches.clear();
  handles = [];
  labels.innerHTML = '';
  ground.material.color.setHex(BG[P.bg] ?? parseInt(String(P.bg).replace('#', ''), 16));
  daylight();

  // layout: 'cols' = creature columns along screen-right, pose rows along screen-up;
  //         'rows' = one creature per row, poses side by side (default when > 3 poses)
  const right = engine.right.clone(), up = engine.forward.clone();
  const layout = P.layout ?? (poses.length > 3 ? 'rows' : 'cols');
  const widthOf = (def) => Math.max(1.2, def.geometry.boundingSphere.radius * 2 * 0.9);
  const heightOf = (def) => Math.max(2.2, def.geometry.boundingBox.max.y * 1.1);
  const t = parseFloat(P.t);
  const yaw = parseFloat(P.yaw);
  const cells = []; // { def, name, pose, x, y, first }
  let total = 0;
  if (layout === 'rows') {
    let y = 0;
    for (const [name, def] of defs) {
      const w = widthOf(def) + 0.4;
      poses.forEach((ps, j) => cells.push({ def, name, ps, x: (j - (poses.length - 1) / 2) * w, y, first: j === 0 }));
      total = Math.max(total, w * poses.length);
      y -= heightOf(def);
    }
    for (const c of cells) c.y -= (cells.length ? cells[cells.length - 1].y : 0) / 2;
  } else {
    let x = 0;
    const rowH = Math.max(...defs.map(([, d]) => heightOf(d)));
    for (const [name, def] of defs) {
      const w = widthOf(def);
      poses.forEach((ps, r) => cells.push({ def, name, ps, x: x + w / 2, y: (r - (poses.length - 1) / 2) * rowH, first: r === 0 }));
      x += w + 0.6;
    }
    total = x;
    for (const c of cells) c.x -= total / 2;
  }
  for (const c of cells) {
    const ps = c.ps;
    const pos = right.clone().multiplyScalar(c.x).addScaledVector(up, c.y);
    const h = creatures.add(c.def, { pos, yaw, seed: 0.37 });
    h._yaw = yaw;
    h.walk = ps.walk; h.move = ps.move; h.speed = ps.speed ?? 0; h.action = ps.action; h.k = ps.k; h.hit = ps.hit ?? 0;
    h.glow = parseFloat(P.glow);
    if (P.rim === 'elite') { h.rim = [1.0, 0.7, 0.16, 1.5]; h.elite = true; }
    if (P.ward) h.accent = { fire: [1, 0.42, 0.12, 0.7], frost: [0.4, 0.85, 1, 0.7], storm: [1, 0.88, 0.29, 0.7], arcane: [0.71, 0.49, 1, 0.7] }[P.ward] ?? null;
    h.color = [1, 1, 1];
    if (ps.dying) { h.dying = ps.dying * 0.55; h._fall = 0.6; }
    handles.push({ h, label: c.first ? c.name : '', pose: ps.label });
  }
  // reference mage, left of the lineup
  ref.root.position.copy(right.clone().multiplyScalar(-total / 2 - 1.2));
  ref.body.rotation.y = yaw;

  // snap camera
  engine.targetZoom = engine.zoom = parseFloat(P.zoom);
  engine.camera.zoom = engine.zoom;
  engine.camera.updateProjectionMatrix();
  for (let i = 0; i < 30; i++) engine.follow(new THREE.Vector3(0, 0, 0), 1);
  creatures.update(0, t);
  ref.update(0.016, { time: t, moving: false });
  engine.update(0.016, null);
  engine.render();

  // labels
  const v = new THREE.Vector3();
  for (const { h, label, pose } of handles) {
    v.set(h.pos.x, -0.15, h.pos.z).project(engine.camera);
    const d = document.createElement('div');
    d.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    d.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight + 6}px`;
    d.textContent = label ? `${label} · ${pose}` : pose;
    labels.appendChild(d);
  }
  info.textContent = `set=${P.set} · ${defs.length} creatures · zoom ${P.zoom} · bg ${P.bg} · ${defs.map(([n, d]) => `${n}:${d.geometry.attributes.position.count / 3}tri`).join(' ')}`;
  return info.textContent;
}

window.view = view;
window.engine = engine;
view().then(() => view()).catch((e) => { info.textContent = 'ERROR: ' + e.message; console.error(e); });
