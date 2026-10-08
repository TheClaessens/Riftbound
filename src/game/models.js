import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, glowMaterial, ELEMENT_COLOR } from '../core/utils.js';

// =====================================================================================
//  Player class models. CONTRACT (player.js depends on it):
//    buildPlayerModel(classId) → { root: Group, body: Group, orb: Mesh, orbMat: Material, ring: Mesh, update(dt, ctx) }
//      root  : added to the scene by the player; positioned at player.pos every frame
//      body  : child of root; player rotates body.rotation.y (facing) and bobs body.position.y
//      orb   : staff orb mesh; player scales it on cast
//      orbMat: glowMaterial whose color the player sets to the last-cast element each frame
//      ring  : ground ring under the player (class element colour, additive)
//      update(dt, { moving, castPulse, dashing, time, player }) : class animation (cape, runes, spin, flicker, dash pose)
//  Body faces +Z; the staff sits on +X. Feet are at y = 0. Height is about 2.1 with hat or hood.
//  Inside body there is a `pose` group that carries the dash stretch and lean, so body.rotation stays the player's.
// =====================================================================================

const HALF_PI = Math.PI / 2;
const FLAME_BASE = new THREE.Color(0xff6a1f);

// Module-level shared geometry (one copy for every player model).
const G = {
  ring: new THREE.RingGeometry(0.6, 0.75, 32),
  // arcanist
  arcRobe: new THREE.CylinderGeometry(0.22, 0.55, 1.3, 12),
  hem: new THREE.TorusGeometry(0.55, 0.035, 6, 20),
  sash: new THREE.TorusGeometry(0.3, 0.04, 6, 16),
  hood: new THREE.ConeGeometry(0.26, 0.75, 12),
  staffPole: new THREE.CylinderGeometry(0.035, 0.045, 1.9, 6),
  crescent: new THREE.TorusGeometry(0.2, 0.03, 6, 20, Math.PI * 1.3),
  // pyromancer
  pyRobe: new THREE.CylinderGeometry(0.28, 0.62, 1.3, 10),
  pyHem: new THREE.TorusGeometry(0.63, 0.04, 6, 20),
  horn: new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI * 0.85),
  brazier: new THREE.CylinderGeometry(0.14, 0.09, 0.12, 8, 1, true),
  flame: new THREE.ConeGeometry(0.11, 0.32, 6),
  pyPole: new THREE.CylinderGeometry(0.035, 0.045, 1.75, 6),
  // cryomancer
  frostRobe: new THREE.CylinderGeometry(0.3, 0.62, 1.3, 10),
  frostSkirt: new THREE.CylinderGeometry(0.5, 0.7, 0.5, 10, 1, true),
  cape: new THREE.CylinderGeometry(0.3, 0.44, 0.8, 10, 1, true, HALF_PI, Math.PI),
  spike: new THREE.ConeGeometry(0.05, 1, 4),
  frPole: new THREE.CylinderGeometry(0.03, 0.04, 1.75, 6),
  // stormcaller
  coat: new THREE.CylinderGeometry(0.3, 0.6, 1.3, 12),
  coatHem: new THREE.TorusGeometry(0.61, 0.035, 6, 20),
  belt: new THREE.TorusGeometry(0.37, 0.035, 6, 16),
  brim: new THREE.CylinderGeometry(0.58, 0.58, 0.04, 20),
  hatCone: new THREE.ConeGeometry(0.24, 0.75, 12),
  hatBand: new THREE.TorusGeometry(0.235, 0.02, 6, 16),
  rod: new THREE.CylinderGeometry(0.03, 0.035, 1.85, 6),
  stormRing: new THREE.TorusGeometry(0.2, 0.018, 6, 24),
};

const BUILDERS = { arcanist: buildArcanist, pyromancer: buildPyromancer, cryomancer: buildCryomancer, stormcaller: buildStormcaller };
const RING_COLOR = { arcanist: ELEMENT_COLOR.arcane, pyromancer: ELEMENT_COLOR.fire, cryomancer: ELEMENT_COLOR.frost, stormcaller: ELEMENT_COLOR.storm };

export function buildPlayerModel(classId) {
  const id = BUILDERS[classId] ? classId : 'arcanist';
  const root = new THREE.Group();
  const body = new THREE.Group();
  const pose = new THREE.Group();
  body.add(pose);

  const parts = BUILDERS[id](pose); // { orb, orbMat, update?(dt, ctx) }
  addOutlines(pose);
  const ring = groundRing(RING_COLOR[id]);
  root.add(body, ring);

  const st = { dash: 0, move: 0 };
  return {
    root, body, orb: parts.orb, orbMat: parts.orbMat, ring,
    update(dt, ctx = {}) {
      poseFx(st, pose, dt, ctx);
      parts.update?.(dt, ctx);
    },
  };
}

// ------------------------------------------------------------------ helpers
const std = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

// Adds a mesh to `parent`. opts: x/y/z, rx/ry/rz, s (uniform number or [sx, sy, sz]), shadow.
function add(parent, geo, material, opts = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
  m.rotation.set(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
  if (typeof opts.s === 'number') m.scale.setScalar(opts.s);
  else if (opts.s) m.scale.set(opts.s[0], opts.s[1], opts.s[2]);
  m.castShadow = !!opts.shadow;
  parent.add(m);
  return m;
}

function groundRing(color) {
  // Always drawn on top (no depth test) so the player stays findable inside dense combat.
  // Saturated normal-blended band over a dark outline ring: value contrast on green, orange and blue ground.
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
  mat.color.multiplyScalar(1.15);
  const ring = new THREE.Mesh(G.ring, mat);
  ring.rotation.x = -HALF_PI; ring.position.y = 0.04;
  ring.scale.setScalar(1.15);
  ring.renderOrder = 20;
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a0812, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false });
  const outline = new THREE.Mesh(groundRing._outlineGeo ??= new THREE.RingGeometry(0.55, 0.8, 32), outlineMat);
  outline.renderOrder = 19;
  outline.position.z = -0.005;
  ring.add(outline);
  // inner soft disc (contact shadow) for contrast against bright spell effects
  const discMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
  const disc = new THREE.Mesh(GEO.disc, discMat);
  disc.scale.setScalar(0.62 / 1.15); disc.position.z = -0.01;
  ring.add(disc);
  return ring;
}

// ------------------------------------------------------------------ outline
// Dark inverted hull matching the creature rig's outline (rig.js: 1.6 px, colour #15121a): a BackSide
// child per solid body mesh, pushed out along welded smooth normals by a constant view-space width.
// Only shadow-casting body parts get one (glow parts — eyes, orbs, runes, flames, crown — and the
// thin gold trims stay clean). Hull geometries are welded once per source geometry and shared.
const OUTLINE_PX = 1.6;
const outlineWidth = { value: 0.035 };
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x15121a, side: THREE.BackSide });
outlineMat.onBeforeCompile = (sh) => {
  sh.uniforms.uOutline = outlineWidth;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uOutline;')
    .replace('#include <project_vertex>', /* glsl */`vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
      mvPosition.xyz += normalize(normalMatrix * normal) * uOutline;
      gl_Position = projectionMatrix * mvPosition;`);
};
outlineMat.customProgramCacheKey = () => 'player-hull-v1';
const hullGeos = new WeakMap();

function hullGeometry(src) {
  let g = hullGeos.get(src);
  if (g) return g;
  g = new THREE.BufferGeometry();
  g.setAttribute('position', src.attributes.position);
  if (src.index) g.setIndex(src.index);
  g = mergeVertices(g, 1e-4); // weld seams so the pushed-out hull has no cracks
  g.computeVertexNormals();
  hullGeos.set(src, g);
  return g;
}

function updateOutlineWidth(renderer, scene, camera) {
  if (camera.isOrthographicCamera) outlineWidth.value = OUTLINE_PX * (camera.top - camera.bottom) / (camera.zoom * Math.max(1, innerHeight));
}

function addOutlines(root) {
  const solids = [];
  root.traverse((o) => { if (o.isMesh && o.castShadow) solids.push(o); });
  for (const m of solids) {
    const hull = new THREE.Mesh(hullGeometry(m.geometry), outlineMat);
    hull.onBeforeRender = updateOutlineWidth;
    m.add(hull);
  }
}

// Staff group on the right-hand side (+X) of the body.
function makeStaff(pose) {
  const g = new THREE.Group();
  g.position.set(0.45, 0, 0.1);
  pose.add(g);
  return g;
}

// Dash stretch along the facing direction and a forward lean while dashing or moving.
// `pose` lives in body space, so the stretch and lean follow the facing.
function poseFx(st, pose, dt, ctx) {
  st.dash += ((ctx.dashing ? 1 : 0) - st.dash) * (1 - Math.exp(-14 * dt));
  st.move += ((ctx.moving ? 1 : 0) - st.move) * (1 - Math.exp(-8 * dt));
  const d = st.dash;
  pose.scale.set(1 - 0.05 * d, 1 - 0.05 * d, 1 + 0.25 * d);
  pose.rotation.x = 0.28 * d + 0.04 * st.move;
}

// ------------------------------------------------------------------ arcanist
// Violet bell robe, pointed hood with a dark face and cyan eyes, gold trim,
// a tall staff with a gold crescent cradling the orb, and three runes orbiting the waist.
function buildArcanist(pose) {
  const robe = std(0x3b2a6b, 0.8);
  const gold = std(0xc9a85a, 0.4, 0.6);
  const dark = std(0x1a1430, 0.9);
  const face = new THREE.MeshBasicMaterial({ color: 0x05040a });
  const eye = glowMaterial(0x9ff3ff, 4);

  add(pose, G.arcRobe, robe, { y: 0.65, shadow: true });
  add(pose, G.hem, gold, { y: 0.06, rx: HALF_PI });
  add(pose, G.sash, gold, { y: 1.0, rx: HALF_PI });
  add(pose, GEO.sphere, robe, { y: 1.2, s: [0.27, 0.26, 0.2], shadow: true });
  add(pose, G.hood, dark, { y: 1.72, rx: -0.12, shadow: true });
  add(pose, GEO.sphere, face, { y: 1.42, z: 0.22, s: [0.15, 0.17, 0.08] });
  add(pose, GEO.sphereLow, eye, { x: -0.065, y: 1.44, z: 0.27, s: 0.03 });
  add(pose, GEO.sphereLow, eye, { x: 0.065, y: 1.44, z: 0.27, s: 0.03 });

  const staff = makeStaff(pose);
  add(staff, G.staffPole, std(0x5a3a22, 0.9), { y: 0.925, shadow: true });
  add(staff, G.crescent, gold, { y: 2.0, rz: 0.85 * Math.PI }); // arc opens upward around the orb
  const orbMat = glowMaterial(ELEMENT_COLOR.arcane, 4);
  const orb = add(staff, GEO.sphere, orbMat, { y: 2.0, s: 0.12 });

  const runeMat = glowMaterial(ELEMENT_COLOR.arcane, 3);
  const runes = new THREE.Group();
  runes.position.y = 0.95;
  pose.add(runes);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    add(runes, GEO.octa, runeMat, { x: Math.sin(a) * 0.45, z: Math.cos(a) * 0.45, s: [0.05, 0.08, 0.05] });
  }

  let ang = 0;
  return {
    orb, orbMat,
    update(dt, ctx) {
      const t = ctx.time ?? 0;
      ang += dt * (1.2 + (ctx.castPulse ?? 0) * 4);
      runes.rotation.y = ang;
      for (let i = 0; i < 3; i++) runes.children[i].position.y = Math.sin(t * 3 + i * 2.1) * 0.05;
    },
  };
}

// ------------------------------------------------------------------ pyromancer
// Crimson robe with a black chest plate and hem, a horned cowl with ember eyes,
// iron pauldrons, and a staff with an iron brazier cage around the orb and a flickering flame.
function buildPyromancer(pose) {
  const robe = std(0x6b1e14, 0.8);
  const black = std(0x1a0a08, 0.9);
  const iron = std(0x3a3430, 0.5, 0.7);
  const ironOpen = new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide });
  const bone = std(0xcdbfa6, 0.6);
  const ember = glowMaterial(0xffb060, 4);

  add(pose, G.pyRobe, robe, { y: 0.65, shadow: true });
  add(pose, G.pyHem, black, { y: 0.06, rx: HALF_PI });
  add(pose, GEO.sphere, black, { y: 1.2, s: [0.3, 0.27, 0.24], shadow: true });
  add(pose, GEO.sphere, iron, { x: -0.33, y: 1.3, s: [0.17, 0.13, 0.17], shadow: true });
  add(pose, GEO.sphere, iron, { x: 0.33, y: 1.3, s: [0.17, 0.13, 0.17], shadow: true });
  add(pose, GEO.sphere, black, { y: 1.5, s: [0.25, 0.27, 0.25], shadow: true }); // cowl
  add(pose, G.horn, bone, { x: 0.16, y: 1.66, rz: -HALF_PI, shadow: true });
  add(pose, G.horn, bone, { x: -0.16, y: 1.66, rz: 0.65 * Math.PI, shadow: true });
  add(pose, GEO.sphereLow, ember, { x: -0.09, y: 1.52, z: 0.2, s: 0.03 });
  add(pose, GEO.sphereLow, ember, { x: 0.09, y: 1.52, z: 0.2, s: 0.03 });

  const staff = makeStaff(pose);
  add(staff, G.pyPole, std(0x4a3020, 0.9), { y: 0.875, shadow: true });
  add(staff, G.brazier, ironOpen, { y: 1.8, shadow: true });
  const flameMat = glowMaterial(0xff6a1f, 2.5, { transparent: true, opacity: 0.7, depthWrite: false, additive: true });
  const flame = add(staff, G.flame, flameMat, { y: 1.9 });
  const orbMat = glowMaterial(ELEMENT_COLOR.fire, 4);
  const orb = add(staff, GEO.sphere, orbMat, { y: 2.0, s: 0.12 });
  const cage = add(staff, GEO.icosa, new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.5, metalness: 0.7, wireframe: true }), { y: 2.0, s: 0.2 });

  return {
    orb, orbMat,
    update(dt, ctx) {
      const t = ctx.time ?? 0;
      const boost = ctx.castPulse ?? 0;
      cage.rotation.y = t * 0.7;
      // Ember flicker: scale and intensity jitter.
      const f = 0.5 + 0.3 * Math.sin(t * 17) + 0.3 * Math.sin(t * 29 + 1.3) + Math.random() * 0.2 + boost * 0.5;
      flame.scale.set(0.9 + 0.2 * f, 0.7 + 0.45 * f, 0.9 + 0.2 * f);
      flameMat.color.copy(FLAME_BASE).multiplyScalar(1.5 + 1.5 * f);
    },
  };
}

// ------------------------------------------------------------------ cryomancer
// White layered robe with an ice-blue flared skirt, a short frosty cape, a tall jagged ice crown
// of glowing cones, and a crystal staff whose octahedron shards orbit the orb.
function buildCryomancer(pose) {
  const white = std(0xcfe2ee, 0.6);
  const iceBlue = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.5, side: THREE.DoubleSide });
  const hood = std(0x2a4258, 0.9);
  const capeMat = new THREE.MeshStandardMaterial({ color: 0xe6f4ff, roughness: 0.6, side: THREE.DoubleSide });
  const eye = glowMaterial(0x9ff3ff, 4);
  const crown = glowMaterial(0xa8f0ff, 2.2);
  const crystal = new THREE.MeshStandardMaterial({ color: 0xbfeaff, roughness: 0.15, metalness: 0.1, emissive: 0x2a7fa0, emissiveIntensity: 0.6 });

  add(pose, G.frostRobe, white, { y: 0.65, shadow: true });
  add(pose, G.frostSkirt, iceBlue, { y: 0.25, shadow: true });

  // frosty cape hanging from the shoulders, hinged at the top so it can flutter
  const capeHinge = new THREE.Group();
  capeHinge.position.set(0, 1.6, 0);
  pose.add(capeHinge);
  add(capeHinge, G.cape, capeMat, { y: -0.4, shadow: true });

  add(pose, GEO.sphere, hood, { y: 1.5, s: 0.22, shadow: true });
  add(pose, GEO.sphereLow, eye, { x: -0.07, y: 1.52, z: 0.2, s: 0.03 });
  add(pose, GEO.sphereLow, eye, { x: 0.07, y: 1.52, z: 0.2, s: 0.03 });

  // jagged ice crown: four tall thin cones, each tilted slightly outward
  const crownRoot = new THREE.Group();
  crownRoot.position.y = 1.62;
  pose.add(crownRoot);
  const spikes = [
    { a: 0, h: 0.5 }, { a: HALF_PI, h: 0.7 }, { a: Math.PI, h: 0.6 }, { a: -HALF_PI, h: 0.42 },
  ];
  for (const { a, h } of spikes) {
    add(crownRoot, G.spike, crown, {
      x: Math.sin(a) * 0.1, y: h / 2, z: Math.cos(a) * 0.1,
      rx: 0.15 * Math.cos(a), rz: -0.15 * Math.sin(a), s: [1, h, 1],
    });
  }

  const staff = makeStaff(pose);
  add(staff, G.frPole, std(0xbfe8ff, 0.3, 0.3), { y: 0.875, shadow: true });
  const orbMat = glowMaterial(ELEMENT_COLOR.frost, 4);
  const orb = add(staff, GEO.sphere, orbMat, { y: 2.0, s: 0.12 });

  // crystal shards around the orb (three ringed, one on top)
  const shardRoot = new THREE.Group();
  shardRoot.position.y = 2.0;
  staff.add(shardRoot);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    add(shardRoot, GEO.octa, crystal, {
      x: Math.sin(a) * 0.14, z: Math.cos(a) * 0.14,
      rx: 0.35 * Math.cos(a), rz: -0.35 * Math.sin(a), s: [0.05, 0.13, 0.05],
    });
  }
  add(shardRoot, GEO.octa, crystal, { y: 0.2, s: [0.04, 0.16, 0.04] });

  let spin = 0, capeRot = 0.12;
  return {
    orb, orbMat,
    update(dt, ctx) {
      const t = ctx.time ?? 0;
      spin += dt * (0.9 + (ctx.castPulse ?? 0) * 6);
      shardRoot.rotation.y = spin;
      const target = 0.12 + Math.sin(t * 2.6) * 0.05 + (ctx.moving ? 0.2 : 0);
      capeRot += (target - capeRot) * (1 - Math.exp(-8 * dt));
      capeHinge.rotation.x = capeRot;
    },
  };
}

// ------------------------------------------------------------------ stormcaller
// Navy coat with gold trim, a wide-brimmed pointed hat tilted back (the brim is raised at the
// front so the yellow eyes stay visible), and a rod with two gold rings that spin around the orb.
function buildStormcaller(pose) {
  const navy = std(0x1c2a52, 0.8);
  const hatMat = std(0x0c1226, 0.9);
  const gold = std(0xe0b84a, 0.4, 0.6);
  const eye = glowMaterial(0xfff2a0, 4);

  add(pose, G.coat, navy, { y: 0.65, shadow: true });
  add(pose, G.coatHem, gold, { y: 0.04, rx: HALF_PI });
  add(pose, G.belt, gold, { y: 1.0, rx: HALF_PI });
  add(pose, GEO.box, gold, { y: 1.0, z: 0.37, s: [0.05, 0.8, 0.03] }); // front trim strip
  add(pose, GEO.sphere, hatMat, { y: 1.5, s: [0.2, 0.21, 0.22], shadow: true });
  add(pose, GEO.sphereLow, eye, { x: -0.065, y: 1.46, z: 0.23, s: 0.03 });
  add(pose, GEO.sphereLow, eye, { x: 0.065, y: 1.46, z: 0.23, s: 0.03 });

  const hat = new THREE.Group();
  hat.position.y = 1.72;
  hat.rotation.x = -0.3;
  pose.add(hat);
  add(hat, G.brim, hatMat, { shadow: true });
  add(hat, G.hatCone, hatMat, { y: 0.395, shadow: true });
  add(hat, G.hatBand, gold, { y: 0.05, rx: HALF_PI });

  const staff = makeStaff(pose);
  add(staff, G.rod, std(0x2a2c38, 0.5, 0.6), { y: 0.925, shadow: true });
  const orbMat = glowMaterial(ELEMENT_COLOR.storm, 4);
  const orb = add(staff, GEO.sphere, orbMat, { y: 2.0, s: 0.12 });

  // two gold rings around the orb: one vertical, one tilted, both spinning about Y
  const ringsRoot = new THREE.Group();
  ringsRoot.position.y = 2.0;
  staff.add(ringsRoot);
  const gA = new THREE.Group();
  ringsRoot.add(gA);
  add(gA, G.stormRing, gold, {});
  const gB = new THREE.Group();
  gB.rotation.x = 1.0;
  ringsRoot.add(gB);
  const gBSpin = new THREE.Group();
  gB.add(gBSpin);
  add(gBSpin, G.stormRing, gold, {});

  let aA = 0, aB = 0;
  return {
    orb, orbMat,
    update(dt, ctx) {
      const t = ctx.time ?? 0;
      const boost = (ctx.castPulse ?? 0) * 10;
      aA += dt * (1.6 + boost);
      aB += dt * (2.4 + boost);
      gA.rotation.y = aA;
      gBSpin.rotation.y = -aB;
      hat.rotation.z = Math.sin(t * 1.7) * 0.03;
    },
  };
}
