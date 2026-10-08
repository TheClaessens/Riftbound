import * as THREE from 'three';
import { GEO, glowMaterial, ELEMENT_COLOR, distXZ, rotateXZ, randRange } from '../core/utils.js';
import { makeStatus, updateStatuses, statusTint, damageEnemy, killEnemy } from './combat.js';

// =====================================================================================
//  Enemies = archetype (behaviour + silhouette) x faction (palette, resist).
//  Spec: DESIGN.md §9. Contract: ARCHITECTURE.md "Enemy contract".
//
//  Mesh budget: every enemy has 2 base meshes (body + accent). Elites add a rim
//  (shared additive shell), warded enemies add a ward shell. So elite + warded = 4.
//  Body and accent materials are cloned per instance (flash / tint / glow).
//  Rim and ward materials are shared module-level materials (never disposed).
// =====================================================================================

const TAU = Math.PI * 2;
const SPAWN_TIME = 0.35;
const ELITE_SCALE = 1.35;

// Behaviour tuning (DESIGN §9)
const WINDUP = 0.4;                                        // ranged glow before a shot
const RANGED_FIRE_RANGE = 11;
const CHARGE_TRIGGER = 9;                                  // charger starts a charge inside this range
const CHARGE_WINDUP = 0.7;
const CHARGE_LEN = 10;
const CHARGE_SPEED = 18;
const CHARGE_RECOVER = 1.2;
const CHARGE_COOLDOWN = 3;
const FUSE_RANGE = 2.2;
const FUSE_TIME = 1.0;
const BOMB_RADIUS = 2.8;
const BLINK_CD = 4;
const BLINK_MIN = 5;
const BLINK_MAX = 14;
const BLINK_OFFSET = 2.5;
const BLINK_TELEGRAPH = 0.5;
const SUPPORT_CD = 6;
const SUPPORT_RADIUS = 7;
const BARRIER_FRAC = 0.3;
const VOID_SPREAD = [-0.25, 0, 0.25];

// ---------------------------------------------------------------- types

const FIRE_RESIST = { fire: 0.5 };

export const ENEMY_TYPES = {
  // ---- Act I · The Hollow ----
  husk:          { name: 'Husk',          archetype: 'chaser',   faction: 'hollow',   act: 1,     hp: 18,  speed: 3.0, radius: 0.5,  damage: 6,  xp: 1, kbResist: 0,   deathColor: 0x6b8c6a },
  imp:           { name: 'Imp',           archetype: 'swarmer',  faction: 'hollow',   act: 1,     hp: 12,  speed: 5.6, radius: 0.4,  damage: 6,  xp: 1, kbResist: 0,   deathColor: 0x8c9a6b },
  brute:         { name: 'Brute',         archetype: 'tank',     faction: 'hollow',   act: 1,     hp: 90,  speed: 2.2, radius: 0.9,  damage: 18, xp: 4, kbResist: 0.7, deathColor: 0x7a6a5c },
  spitter:       { name: 'Spitter',       archetype: 'ranged',   faction: 'hollow',   act: 1,     hp: 30,  speed: 2.6, radius: 0.55, damage: 10, xp: 2, kbResist: 0,   deathColor: 0x7fb08a, shootCD: 2.6 },
  bloater:       { name: 'Bloater',       archetype: 'splitter', faction: 'hollow',   act: 1,     hp: 45,  speed: 2.0, radius: 0.75, damage: 10, xp: 3, kbResist: 0,   deathColor: 0x8fbf6a },
  mite:          { name: 'Mite',          archetype: 'swarmer',  faction: 'hollow',   act: 'any', hp: 5,   speed: 6.2, radius: 0.3,  damage: 4,  xp: 0, kbResist: 0,   deathColor: 0x9ac27a },

  // ---- Act II · The Ashborn (resist Fire 50%) ----
  ashHusk:       { name: 'Ash Husk',      archetype: 'chaser',   faction: 'ashborn',  act: 2,     hp: 20,  speed: 3.2, radius: 0.5,  damage: 6,  xp: 1, kbResist: 0,   deathColor: 0x7a4a3a, resist: FIRE_RESIST },
  cinderling:    { name: 'Cinderling',    archetype: 'swarmer',  faction: 'ashborn',  act: 2,     hp: 12,  speed: 6.0, radius: 0.4,  damage: 6,  xp: 1, kbResist: 0,   deathColor: 0xff8a3a, resist: FIRE_RESIST },
  obsidianBrute: { name: 'Obsidian Brute',archetype: 'tank',     faction: 'ashborn',  act: 2,     hp: 110, speed: 2.2, radius: 0.95, damage: 20, xp: 5, kbResist: 0.7, deathColor: 0xc4502a, resist: FIRE_RESIST },
  emberSpitter:  { name: 'Ember Spitter', archetype: 'ranged',   faction: 'ashborn',  act: 2,     hp: 30,  speed: 2.6, radius: 0.55, damage: 10, xp: 2, kbResist: 0,   deathColor: 0xff9a3a, resist: FIRE_RESIST, shootCD: 2.6 },
  magmaRam:      { name: 'Magma Ram',     archetype: 'charger',  faction: 'ashborn',  act: 2,     hp: 60,  speed: 2.8, radius: 0.7,  damage: 16, xp: 3, kbResist: 0.3, deathColor: 0xff5a1a, resist: FIRE_RESIST },
  pyreBomber:    { name: 'Pyre Bomber',   archetype: 'bomber',   faction: 'ashborn',  act: 2,     hp: 25,  speed: 4.0, radius: 0.55, damage: 14, xp: 2, kbResist: 0,   deathColor: 0xffb040, resist: FIRE_RESIST },

  // ---- Act III · The Riftborn (elites carry a Prism Ward) ----
  shardling:     { name: 'Shardling',     archetype: 'swarmer',  faction: 'riftborn', act: 3,     hp: 12,  speed: 6.2, radius: 0.4,  damage: 6,  xp: 1, kbResist: 0,   deathColor: 0xd8c8ff },
  colossus:      { name: 'Colossus',      archetype: 'tank',     faction: 'riftborn', act: 3,     hp: 140, speed: 2.0, radius: 1.1,  damage: 22, xp: 6, kbResist: 0.7, deathColor: 0xb9a6ff },
  voidSpitter:   { name: 'Void Spitter',  archetype: 'ranged',   faction: 'riftborn', act: 3,     hp: 32,  speed: 2.6, radius: 0.55, damage: 10, xp: 2, kbResist: 0,   deathColor: 0x9a7cff, shootCD: 2.6 },
  crystalRam:    { name: 'Crystal Ram',   archetype: 'charger',  faction: 'riftborn', act: 3,     hp: 65,  speed: 3.0, radius: 0.7,  damage: 16, xp: 3, kbResist: 0.3, deathColor: 0xc8b4ff },
  wraith:        { name: 'Wraith',        archetype: 'blinker',  faction: 'riftborn', act: 3,     hp: 28,  speed: 3.4, radius: 0.5,  damage: 10, xp: 2, kbResist: 0,   deathColor: 0xb04aff },
  prismHexer:    { name: 'Prism Hexer',   archetype: 'support',  faction: 'riftborn', act: 3,     hp: 40,  speed: 2.4, radius: 0.55, damage: 6,  xp: 4, kbResist: 0,   deathColor: 0xe0d0ff },
};

// ---------------------------------------------------------------- shared assets

// Faction palettes: body is cloned per enemy, accent (glow) is cloned per enemy too
// (so it can brighten while winding up / fusing), but the templates stay untouched.
const FACTIONS = {
  hollow:   { body: { color: 0x6e7a66, roughness: 0.92, metalness: 0.04 }, accent: 0x5ce8ff, accentI: 2.6 },
  ashborn:  { body: { color: 0x1c1816, roughness: 0.96, metalness: 0.03 }, accent: 0xff7a2a, accentI: 2.9 },
  riftborn: { body: { color: 0x4a3580, roughness: 0.3, metalness: 0.45 }, accent: 0x9ff3ff, accentI: 2.2 },
};
const FAC_BODY = {};
const FAC_ACCENT = {};
for (const id of Object.keys(FACTIONS)) {
  FAC_BODY[id] = new THREE.MeshStandardMaterial(FACTIONS[id].body);
  FAC_ACCENT[id] = glowMaterial(FACTIONS[id].accent, FACTIONS[id].accentI);
}

const G = {
  blob: new THREE.SphereGeometry(1, 12, 9),
  wedge: new THREE.ConeGeometry(1, 1, 4),
  rim: new THREE.SphereGeometry(1, 12, 8),
};

// Shared elite rim (pulsed globally; every elite computes the same value per frame).
const RIM_MAT = glowMaterial(0xffc340, 1.0, { transparent: true, opacity: 0.35, depthWrite: false, additive: true, side: THREE.BackSide });

// Shared ward shells, one per element.
const WARD_MATS = {};
function wardMat(el) {
  if (!WARD_MATS[el]) {
    WARD_MATS[el] = glowMaterial(ELEMENT_COLOR[el] ?? 0xffffff, 1.0, { transparent: true, opacity: 0.32, depthWrite: false, additive: true });
  }
  return WARD_MATS[el];
}

// Bullets: hot magenta shell with a white core (both shared; never disposed).
const BULLET_CORE = glowMaterial(0xffffff, 3.0, { additive: true });
const _bulletMats = new Map();
function bulletMat(color) {
  let m = _bulletMats.get(color);
  if (!m) {
    m = glowMaterial(color, 2.5, { additive: true });
    _bulletMats.set(color, m);
  }
  return m;
}

// Reused scratch objects (no per-frame allocation in the hot path).
const _near = [];
const _sep = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _vel = new THREE.Vector3();

// ---------------------------------------------------------------- visual builders

function part(parent, geo, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

// Each builder: body (1 mesh) + accent (1 mesh). r = type radius (before elite scale).
const BUILD = {
  // Hunched blob with a glowing eye-slit.
  chaser(g, r, bm, am) {
    const body = part(g, G.blob, bm, 0, 1.1 * r, 0, r, 1.1 * r, 1.05 * r);
    body.rotation.x = 0.25;
    const accent = part(g, GEO.box, am, 0, 1.35 * r, 1.0 * r, 0.42 * r, 0.12 * r, 0.12 * r);
    return { body, accent, cy: 1.1 * r };
  },
  // Small upright spike with a glowing core.
  swarmer(g, r, bm, am) {
    const body = part(g, GEO.cone, bm, 0, 0.95 * r, 0, 0.8 * r, 1.9 * r, 0.8 * r);
    const accent = part(g, GEO.sphereLow, am, 0, 0.7 * r, 0.45 * r, 0.3 * r, 0.3 * r, 0.3 * r);
    return { body, accent, cy: 0.95 * r };
  },
  // Big block with a glowing slit across its front.
  tank(g, r, bm, am) {
    const body = part(g, GEO.box, bm, 0, 0.6 * r, 0, 1.4 * r, 1.2 * r, 1.3 * r);
    const accent = part(g, GEO.box, am, 0, 0.85 * r, 0.68 * r, 1.0 * r, 0.12 * r, 0.06 * r);
    return { body, accent, cy: 0.6 * r };
  },
  // Faceted icosahedron with a glowing mouth.
  ranged(g, r, bm, am) {
    const body = part(g, GEO.icosa, bm, 0, 1.0 * r, 0, 0.9 * r, 1.0 * r, 0.9 * r);
    const accent = part(g, GEO.sphereLow, am, 0, 0.95 * r, 0.8 * r, 0.3 * r, 0.3 * r, 0.3 * r);
    return { body, accent, cy: 1.0 * r };
  },
  // Bloated sphere with a glowing vent.
  splitter(g, r, bm, am) {
    const body = part(g, GEO.sphere, bm, 0, 1.1 * r, 0, 1.1 * r, 1.1 * r, 1.1 * r);
    const accent = part(g, GEO.sphereLow, am, 0, 1.88 * r, 0.78 * r, 0.28 * r, 0.28 * r, 0.28 * r);
    return { body, accent, cy: 1.1 * r };
  },
  // Horned wedge pointing forward, glowing horn tip.
  charger(g, r, bm, am) {
    const body = part(g, G.wedge, bm, 0, 0.85 * r, 0, 0.85 * r, 1.6 * r, 0.85 * r);
    body.rotation.x = Math.PI / 2; // cone tip -> +Z
    const accent = part(g, GEO.sphereLow, am, 0, 1.25 * r, 0.2 * r, 0.22 * r, 0.22 * r, 0.22 * r);
    return { body, accent, cy: 0.85 * r };
  },
  // Round body with a glowing fuse on top.
  bomber(g, r, bm, am) {
    const body = part(g, GEO.sphere, bm, 0, 1.0 * r, 0, r, r, r);
    const accent = part(g, GEO.sphereLow, am, 0, 2.05 * r, 0, 0.22 * r, 0.22 * r, 0.22 * r);
    return { body, accent, cy: r };
  },
  // Floating inverted cone (no legs) with a glowing core.
  blinker(g, r, bm, am) {
    const body = part(g, GEO.cone, bm, 0, 1.9 * r, 0, 0.8 * r, 1.7 * r, 0.8 * r);
    body.rotation.x = Math.PI; // tip points down
    bm.transparent = true;
    bm.opacity = 0.72;
    const accent = part(g, GEO.sphereLow, am, 0, 1.5 * r, 0, 0.28 * r, 0.28 * r, 0.28 * r);
    return { body, accent, cy: 1.6 * r };
  },
  // Tall thin pillar with a floating crystal above.
  support(g, r, bm, am) {
    const body = part(g, GEO.cylinder, bm, 0, 0.8 * r, 0, 0.5 * r, 1.6 * r, 0.5 * r);
    const accent = part(g, GEO.octa, am, 0, 2.1 * r, 0, 0.3 * r, 0.3 * r, 0.3 * r);
    return { body, accent, cy: 1.1 * r };
  },
};

// ---------------------------------------------------------------- createEnemy

// opts: { elite, hpMult, damageScale, xpMult, ward, resist, noSpawnAnim }
// Creates and returns the enemy. Does NOT add it to game.enemies; the caller does.
export function createEnemy(game, typeId, pos, opts = {}) {
  const def = ENEMY_TYPES[typeId];
  if (!def) throw new Error(`Unknown enemy type: ${typeId}`);

  const elite = !!opts.elite;
  const hpMult = opts.hpMult ?? 1;
  const damageScale = opts.damageScale ?? 1;
  const xpMult = opts.xpMult ?? 1;
  const spawnAnim = !opts.noSpawnAnim;

  let hp = def.hp * hpMult;
  let radius = def.radius;
  let xp = def.xp;
  let damage = def.damage * damageScale;
  if (elite) {
    hp *= 4;
    radius *= ELITE_SCALE;
    xp = Math.max(10, Math.round(xp * 6));
    damage *= 1.3;
  }
  xp *= xpMult;

  const resistSrc = opts.resist !== undefined ? opts.resist : def.resist;

  const enemy = {
    type: typeId,
    name: def.name,
    archetype: def.archetype,
    faction: def.faction,
    act: def.act,
    pos: new THREE.Vector3(pos.x, 0, pos.z),
    radius,
    baseRadius: def.radius,
    hp,
    maxHp: hp,
    xp,
    damage,
    speed: def.speed,
    status: makeStatus(),
    knock: new THREE.Vector3(),
    kbResist: def.kbResist ?? 0,
    dead: false,
    elite,
    boss: false,
    final: false,
    inert: false,
    resist: resistSrc ? { ...resistSrc } : null,
    ward: opts.ward ?? null,
    barrier: 0,
    hpMult,
    damageScale,
    xpMult,
    deathColor: def.deathColor,
    attackCd: 0,
    flashT: 0,
    yaw: 0,
    phase: Math.random() * TAU,
    visScale: elite ? ELITE_SCALE : 1,
    // spawn-in
    spawnT: spawnAnim ? SPAWN_TIME : 0,
    spawnDY: spawnAnim ? -0.8 : 0,
    spawnS: spawnAnim ? 0.3 : 1,
    // behaviour state
    ai: 'chase',
    aiT: 0,
    aiCd: 0,
    aiDir: new THREE.Vector3(),
    aiLeft: 0,
    aiHit: false,
    fireCd: 0,
    windupT: 0,
    fuseT: 0,
    blinkT: 0,
    _tele: null,
    _boomed: false,
    _shell: null,
    _shellEl: null,
    _glowK: 0,
    _disposed: false,
    // visuals
    mesh: null,
    body: null,
    accent: null,
    center: 0,
    accentY: 0,
    rim: null,
    bodyMat: null,
    accentMat: null,
    _accentBase: null,
    clonedMaterials: [],
    // methods
    update: null,
    flash: null,
    dispose: null,
    onDeath: null,
  };

  if (def.archetype === 'ranged') enemy.fireCd = randRange(0.3, def.shootCD ?? 2.6);
  if (def.archetype === 'charger') enemy.aiCd = randRange(0.3, 1.2);
  if (def.archetype === 'blinker') enemy.blinkT = randRange(1.5, 3.5);
  if (def.archetype === 'support') enemy.aiT = randRange(2, 6);

  // ---- mesh ----
  const bodyMat = FAC_BODY[def.faction].clone();
  const accentMat = FAC_ACCENT[def.faction].clone();
  enemy.bodyMat = bodyMat;
  enemy.accentMat = accentMat;
  enemy._accentBase = FAC_ACCENT[def.faction].color;
  enemy.clonedMaterials.push(bodyMat, accentMat);

  const g = new THREE.Group();
  g.rotation.order = 'YXZ'; // yaw applied last
  const parts = BUILD[def.archetype](g, def.radius, bodyMat, accentMat);
  enemy.body = parts.body;
  enemy.accent = parts.accent;
  enemy.center = parts.cy;
  enemy.accentY = parts.accent.position.y;
  enemy.mesh = g;
  g.position.set(enemy.pos.x, enemy.spawnDY, enemy.pos.z);
  g.scale.setScalar(enemy.visScale * enemy.spawnS);

  if (elite) {
    const rim = new THREE.Mesh(G.rim, RIM_MAT);
    rim.scale.setScalar(def.radius * 1.5);
    rim.position.y = enemy.center;
    g.add(rim);
    enemy.rim = rim;
  }
  game.scene.add(g);
  syncWard(enemy);

  if (spawnAnim) {
    game.fx.ring(enemy.pos, { color: 0x5a2aa0, radius: def.radius * 2.4, life: SPAWN_TIME, width: 0.2 });
    game.fx.burst(enemy.pos, { color: 0x3c1f70, count: 8, speed: 3, life: 0.4, size: 0.3, up: 1.2 });
  }

  // ---- methods ----
  enemy.update = (dt, game2) => updateEnemy(dt, game2, enemy);
  enemy.flash = () => { enemy.flashT = 0.08; };
  enemy.dispose = (game2) => disposeEnemy(game2, enemy);
  if (def.archetype === 'splitter') enemy.onDeath = (game2) => spawnMites(game2, enemy);
  if (def.archetype === 'bomber') enemy.onDeath = (game2) => bomberBoom(game2, enemy, false);

  return enemy;
}

// ---------------------------------------------------------------- lifecycle

function freeMaterials(e) {
  for (const m of e.clonedMaterials) m.dispose();
  e.clonedMaterials.length = 0;
}

// Killed (hp <= 0): squash via fx.corpse, then free clones. Otherwise (Rift Shift, world
// reset): remove and free immediately.
function disposeEnemy(game, e) {
  if (e._disposed) return;
  e._disposed = true;
  cancelTele(e);
  const m = e.mesh;
  if (!m) return;
  if (e.hp <= 0) {
    game.fx.corpse(m, 0.12, { onEnd: () => freeMaterials(e) });
  } else {
    game.scene.remove(m);
    freeMaterials(e);
  }
}

function cancelTele(e) {
  if (e._tele) {
    e._tele.cancel();
    e._tele = null;
  }
}

function spawnMites(game, e) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + randRange(-0.4, 0.4);
    const d = randRange(0.5, 1.0);
    const p = new THREE.Vector3(e.pos.x + Math.cos(a) * d, 0, e.pos.z + Math.sin(a) * d);
    const mite = createEnemy(game, 'mite', p, { hpMult: e.hpMult, damageScale: e.damageScale, noSpawnAnim: true });
    game.addEnemy(mite);
  }
}

// Bomber explosion. hurtPlayer = true on fuse end (2x damage to the player); false when
// killed early (detonates instantly, hurts enemies only). Guarded against double explosions.
function bomberBoom(game, e, hurtPlayer) {
  if (e._boomed) return;
  e._boomed = true;
  cancelTele(e);
  const c = e.pos.clone();
  if (hurtPlayer && distXZ(game.player.pos, c) <= BOMB_RADIUS) {
    game.player.takeDamage(e.damage * 2, e);
  }
  const dmg = 60 + 20 * game.act;
  const hits = game.queryEnemies(c, BOMB_RADIUS, []).slice();
  for (const o of hits) {
    if (o === e || o.inert || o.dead) continue;
    damageEnemy(game, o, dmg, { element: 'physical', raw: true, noCrit: true });
  }
  game.fx.flashDisc(c, { color: 0xff7a2a, radius: BOMB_RADIUS, life: 0.3, hdr: 2 });
  game.fx.ring(c, { color: 0xff5a2a, radius: BOMB_RADIUS, life: 0.3, width: 0.25 });
  game.fx.burst(c, { color: 0xff6a1f, count: 24, speed: 8, life: 0.5, size: 0.4, up: 1.5, gravity: 4 });
  game.fx.light(c, 0xff6a1f, 40, 0.3);
  game.fx.shake(0.25);
}

// ---------------------------------------------------------------- steering helpers

// Fills _sep with the separation vector from up to 6 live, non-inert neighbours.
function separation(e, game) {
  _sep.set(0, 0, 0);
  const list = game.queryEnemies(e.pos, e.radius * 2, _near);
  let n = 0;
  for (let i = 0; i < list.length && n < 6; i++) {
    const o = list[i];
    if (o === e || o.dead || o.inert) continue;
    const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1e-4) {
      const inv = 1 / Math.sqrt(d2);
      _sep.x += dx * inv;
      _sep.z += dz * inv;
      n++;
    }
  }
  if (n > 0) _sep.multiplyScalar(0.15);
}

// Move along unit (dx, dz) (or hold, when both are 0) blended with separation.
// Sets e.yaw to the movement heading.
function moveXZ(e, game, dx, dz, speed, dt) {
  separation(e, game);
  const x = dx + _sep.x, z = dz + _sep.z;
  const l = Math.sqrt(x * x + z * z);
  if (l < 1e-5) return;
  const f = (dx === 0 && dz === 0 ? 0.5 : 1) * speed * dt / l;
  e.pos.x += x * f;
  e.pos.z += z * f;
  e.yaw = Math.atan2(x, z);
}

// Writes the unit XZ direction from the enemy to the player into out. Returns the distance.
function aimPlayer(e, game, out) {
  const p = game.player.pos;
  const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 1e-5) out.set(dx / d, 0, dz / d);
  else out.set(0, 0, 0);
  return d;
}

// ---------------------------------------------------------------- behaviours
// Each behaviour gets mv (status multiplier, 0 = frozen/stunned: no movement, no attacks).

function behaveChase(e, game, dt, mv) {
  aimPlayer(e, game, _to);
  if (mv > 0) moveXZ(e, game, _to.x, _to.z, e.speed * mv, dt);
}

function fireRanged(game, e) {
  aimPlayer(e, game, _to);
  if (e.type === 'voidSpitter') {
    for (const a of VOID_SPREAD) {
      rotateXZ(_to, a, _dir);
      game.addActor(new EnemyBullet(game, e.pos, _dir, e.damage));
    }
  } else if (e.type === 'emberSpitter') {
    game.addActor(new EnemyBullet(game, e.pos, _to, e.damage, { trail: 0xff7a2a }));
  } else {
    game.addActor(new EnemyBullet(game, e.pos, _to, e.damage));
  }
}

function behaveRanged(e, game, dt, mv) {
  const d = aimPlayer(e, game, _to);
  if (mv <= 0) {
    e.windupT = 0; // frozen / stunned: the windup is cancelled
    return;
  }
  // keep 8-10 units from the player
  if (d < 8) moveXZ(e, game, -_to.x, -_to.z, e.speed * mv, dt);
  else if (d > 10) moveXZ(e, game, _to.x, _to.z, e.speed * mv, dt);
  else moveXZ(e, game, 0, 0, e.speed * mv, dt);
  e.yaw = Math.atan2(_to.x, _to.z); // always face the player

  if (e.windupT > 0) {
    e.windupT -= dt;
    if (e.windupT <= 0) {
      e.windupT = 0;
      fireRanged(game, e);
    }
  } else {
    e.fireCd -= dt;
    if (e.fireCd <= 0 && d <= RANGED_FIRE_RANGE) {
      e.windupT = WINDUP;
      e.fireCd = ENEMY_TYPES[e.type].shootCD ?? 2.6;
    }
  }
}

function behaveCharger(e, game, dt, mv) {
  if (e.ai === 'chase') {
    const d = aimPlayer(e, game, _to);
    if (mv <= 0) return;
    e.aiCd -= dt;
    if (e.aiCd <= 0 && d <= CHARGE_TRIGGER) {
      // stop and telegraph a line toward the player's current position
      e.ai = 'windup';
      e.aiT = CHARGE_WINDUP;
      e.aiDir.copy(_to);
      e.yaw = Math.atan2(_to.x, _to.z);
      cancelTele(e);
      e._tele = game.fx.lineTelegraph(e.pos, e.aiDir, CHARGE_LEN, 1.4, CHARGE_WINDUP, { color: 0xff3344 });
      return;
    }
    moveXZ(e, game, _to.x, _to.z, e.speed * mv, dt);
    return;
  }

  if (e.ai === 'windup') {
    if (mv <= 0) {
      cancelTele(e);
      e.ai = 'chase';
      e.aiCd = 0.6;
      return;
    }
    e.aiT -= dt;
    if (e.aiT <= 0) {
      e._tele = null;
      e.ai = 'charge';
      e.aiLeft = CHARGE_LEN;
      e.aiHit = false;
    }
    return;
  }

  if (e.ai === 'charge') {
    if (mv <= 0) return; // frozen mid-charge: pause
    const step = Math.min(e.aiLeft, CHARGE_SPEED * dt * mv);
    e.pos.x += e.aiDir.x * step;
    e.pos.z += e.aiDir.z * step;
    e.aiLeft -= step;
    if (!e.aiHit) {
      const p = game.player.pos;
      const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
      const rr = e.radius + game.player.radius + 0.15;
      if (dx * dx + dz * dz < rr * rr) {
        game.player.takeDamage(e.damage * 1.5, e);
        e.aiHit = true; // contact damage once per charge
      }
    }
    if (e.aiLeft <= 1e-4) {
      e.ai = 'recover';
      e.aiT = CHARGE_RECOVER;
    }
    return;
  }

  // recover: slow, then back to chasing
  if (mv > 0) {
    e.aiT -= dt;
    aimPlayer(e, game, _to);
    moveXZ(e, game, _to.x, _to.z, e.speed * 0.25 * mv, dt);
    if (e.aiT <= 0) {
      e.ai = 'chase';
      e.aiCd = CHARGE_COOLDOWN;
    }
  }
}

function behaveBomber(e, game, dt, mv) {
  if (e.fuseT > 0) {
    if (mv <= 0) {
      e.fuseT = 0; // frozen: fuse cancelled
      cancelTele(e);
      return;
    }
    e.fuseT -= dt;
    if (e.fuseT <= 0) {
      e.fuseT = 0;
      bomberBoom(game, e, true);
      e.hp = 0; // squash on the way out
      killEnemy(game, e);
    }
    return;
  }
  if (mv <= 0) return;
  const d = aimPlayer(e, game, _to);
  if (d <= FUSE_RANGE) {
    e.fuseT = FUSE_TIME;
    cancelTele(e);
    e._tele = game.fx.telegraph(e.pos, BOMB_RADIUS, FUSE_TIME, { color: 0xff5a2a });
    return;
  }
  moveXZ(e, game, _to.x, _to.z, e.speed * mv, dt);
}

function blinkTo(game, e, t) {
  if (e.dead) return;
  game.fx.burst(e.pos, { color: 0xb04aff, count: 14, speed: 5, life: 0.4, size: 0.4 });
  e.pos.x = t.x;
  e.pos.z = t.z;
  game.world.collide(e.pos, e.radius);
  game.fx.burst(e.pos, { color: 0xb04aff, count: 14, speed: 5, life: 0.4, size: 0.4 });
  game.fx.ring(e.pos, { color: 0xb04aff, radius: 1.2, life: 0.25, width: 0.2 });
}

function behaveBlinker(e, game, dt, mv) {
  if (mv <= 0) {
    cancelTele(e);
    return;
  }
  if (e._tele) return; // telegraph running: hold still
  const d = aimPlayer(e, game, _to);
  e.blinkT -= dt;
  if (e.blinkT <= 0 && d >= BLINK_MIN && d <= BLINK_MAX) {
    // blink target: BLINK_OFFSET from the player, on the wraith's side
    const p = game.player.pos;
    const target = new THREE.Vector3(p.x - _to.x * BLINK_OFFSET, 0, p.z - _to.z * BLINK_OFFSET);
    e._tele = game.fx.telegraph(target, 1, BLINK_TELEGRAPH, {
      color: 0xb04aff,
      onDone: () => {
        e._tele = null;
        blinkTo(game, e, target);
      },
    });
    e.blinkT = BLINK_CD * randRange(0.9, 1.1);
    return;
  }
  moveXZ(e, game, _to.x, _to.z, e.speed * mv, dt);
}

function castBarrier(game, e) {
  const list = game.queryEnemies(e.pos, SUPPORT_RADIUS, _near).slice();
  for (const o of list) {
    if (o === e || o.dead || o.inert) continue;
    o.barrier = Math.max(o.barrier || 0, BARRIER_FRAC * o.maxHp);
  }
  game.fx.ring(e.pos, { color: 0xc8a8ff, radius: SUPPORT_RADIUS, life: 0.45, width: 0.12 });
}

function behaveSupport(e, game, dt, mv) {
  if (mv <= 0) return;
  const d = aimPlayer(e, game, _to);
  if (d < 9) moveXZ(e, game, -_to.x, -_to.z, e.speed * mv, dt);
  else if (d > 12) moveXZ(e, game, _to.x, _to.z, e.speed * mv, dt);
  else moveXZ(e, game, 0, 0, e.speed * mv, dt);
  e.yaw = Math.atan2(_to.x, _to.z);

  e.aiT -= dt;
  if (e.aiT <= 0) {
    e.aiT = SUPPORT_CD;
    castBarrier(game, e);
  }
}

const BEHAVIOUR = {
  chaser: behaveChase,
  swarmer: behaveChase,
  tank: behaveChase,
  splitter: behaveChase,
  ranged: behaveRanged,
  charger: behaveCharger,
  bomber: behaveBomber,
  blinker: behaveBlinker,
  support: behaveSupport,
};

// Contact damage is skipped for bombers (they explode instead) and during a charge
// (the charge has its own single hit).
function canTouch(e) {
  if (e.archetype === 'bomber') return false;
  if (e.archetype === 'charger' && e.ai === 'charge') return false;
  return true;
}

// ---------------------------------------------------------------- update

// Called by game.js every frame for live enemies. Exported for compatibility.
export function updateEnemy(dt, game, e) {
  if (e.dead) return;

  const mv = updateStatuses(game, e, dt);
  if (e.dead) return; // burn can kill
  if (e.attackCd > 0) e.attackCd -= dt;

  // Spawn-in: rise from the ground and grow. No movement or attacks.
  if (e.spawnT > 0) {
    e.spawnT -= dt;
    if (e.spawnT > 0) {
      const k = 1 - e.spawnT / SPAWN_TIME;
      const ease = k * k * (3 - 2 * k);
      e.spawnDY = -0.8 * (1 - ease);
      e.spawnS = 0.3 + 0.7 * ease;
      updateVisuals(game, e, dt);
      return;
    }
    e.spawnT = 0;
    e.spawnDY = 0;
    e.spawnS = 1;
  }

  BEHAVIOUR[e.archetype](e, game, dt, mv);
  if (e.dead) return;

  // knockback and walls
  e.pos.addScaledVector(e.knock, dt);
  e.knock.multiplyScalar(Math.exp(-8 * dt));
  game.world.collide(e.pos, e.radius);
  e.pos.y = 0;

  // contact damage
  if (mv > 0 && e.attackCd <= 0 && canTouch(e)) {
    const p = game.player.pos;
    const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
    const rr = e.radius + game.player.radius + 0.15;
    if (dx * dx + dz * dz < rr * rr) {
      game.player.takeDamage(e.damage, e);
      e.attackCd = 0.8;
    }
  }

  updateVisuals(game, e, dt);
}

// Accent brightness: 0 = normal, 1 = bright (windups, fuses, telegraphs).
function setGlow(e, k) {
  if (Math.abs(k - e._glowK) < 0.02) return;
  e._glowK = k;
  e.accentMat.color.copy(e._accentBase).multiplyScalar(1 + 2.2 * k);
}

// Status tint / flash / barrier pulse on the body (priority: flash > status > barrier).
function applyTint(game, e) {
  const m = e.bodyMat;
  if (e.flashT > 0) {
    m.emissive.setHex(0xffffff);
    m.emissiveIntensity = (e.flashT / 0.08) * 0.8;
    return;
  }
  const tint = statusTint(e);
  if (tint !== null) {
    m.emissive.setHex(tint);
    m.emissiveIntensity = 0.45;
  } else if (e.barrier > 0) {
    m.emissive.setHex(0xc8a8ff);
    m.emissiveIntensity = 0.3 + 0.2 * Math.sin(game.time * 8 + e.phase);
  } else if (m.emissiveIntensity !== 0) {
    m.emissiveIntensity = 0;
  }
}

// Ward shell: rotating translucent icosahedron in the ward element's colour.
function syncWard(e) {
  if (e.ward) {
    if (!e._shell) {
      const shell = new THREE.Mesh(GEO.icosa, wardMat(e.ward));
      shell.scale.setScalar(e.baseRadius * 1.6);
      shell.position.y = e.center;
      e.mesh.add(shell);
      e._shell = shell;
      e._shellEl = e.ward;
    } else if (e._shellEl !== e.ward) {
      e._shell.material = wardMat(e.ward);
      e._shellEl = e.ward;
    }
  } else if (e._shell) {
    e.mesh.remove(e._shell);
    e._shell = null;
    e._shellEl = null;
  }
}

function updateVisuals(game, e, dt) {
  const t = game.time;
  if (e.flashT > 0) e.flashT -= dt;

  // placement: wraiths hover and bob; spawn-in offset applies to all
  let hover = 0;
  if (e.archetype === 'blinker') hover = 0.35 + 0.12 * Math.sin(t * 2.5 + e.phase);
  const g = e.mesh;
  g.position.set(e.pos.x, e.pos.y + hover + e.spawnDY, e.pos.z);
  g.rotation.y = e.yaw;
  g.scale.setScalar(e.visScale * e.spawnS);

  // accent glow by archetype state
  let k = 0;
  switch (e.archetype) {
    case 'ranged':
      if (e.windupT > 0) k = 1 - e.windupT / WINDUP;
      break;
    case 'bomber':
      if (e.fuseT > 0) k = 0.5 + 0.5 * Math.sin(t * (10 + 25 * (1 - e.fuseT / FUSE_TIME)));
      break;
    case 'charger':
      if (e.ai === 'windup') k = 0.5 + 0.5 * Math.sin(t * 18);
      else if (e.ai === 'charge') k = 1;
      break;
    case 'blinker':
      if (e._tele) k = 0.5 + 0.5 * Math.sin(t * 22);
      break;
    case 'support':
      k = 0.2 + 0.15 * Math.sin(t * 3 + e.phase);
      e.accent.position.y = e.accentY + 0.12 * Math.sin(t * 2.2 + e.phase);
      break;
  }
  setGlow(e, k);

  if (e.rim) RIM_MAT.opacity = 0.28 + 0.14 * Math.sin(t * 5);
  syncWard(e);
  if (e._shell) {
    e._shell.rotation.y += dt * 1.2;
    e._shell.rotation.x += dt * 0.7;
  }
  applyTint(game, e);
}

// ---------------------------------------------------------------- EnemyBullet

// Hostile projectile. Hot magenta shell with a white core (2 meshes).
// new EnemyBullet(game, pos, dir, damage, { speed=11, radius=0.35, life=3, color=0xff2a6d,
//                                           size=0.28, onHit(game, bullet), trail })
// trail: spark colour (defaults to color). onHit runs when the bullet hits the player.
// The caller adds it with game.addActor(bullet).
export class EnemyBullet {
  constructor(game, pos, dir, damage, opts = {}) {
    this.game = game;
    this.hostile = true;
    this.pos = new THREE.Vector3(pos.x, 0.8, pos.z);
    const dl = Math.hypot(dir.x, dir.z) || 1;
    this.dir = new THREE.Vector3(dir.x / dl, 0, dir.z / dl);
    this.damage = damage;
    this.speed = opts.speed ?? 11;
    this.radius = opts.radius ?? 0.35;
    this.life = opts.life ?? 3;
    this.age = 0;
    this.onHit = opts.onHit ?? null;

    const color = opts.color ?? 0xff2a6d;
    this.trailColor = opts.trail ?? color;
    const size = opts.size ?? 0.28;

    this.mesh = new THREE.Group();
    const outer = new THREE.Mesh(GEO.sphereLow, bulletMat(color));
    outer.scale.setScalar(size);
    const core = new THREE.Mesh(GEO.sphereLow, BULLET_CORE);
    core.scale.setScalar(size * 0.45);
    this.mesh.add(outer, core);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }

  update(dt, game) {
    this.age += dt;
    if (this.age >= this.life) return false;

    this.pos.x += this.dir.x * this.speed * dt;
    this.pos.z += this.dir.z * this.speed * dt;
    this.mesh.position.copy(this.pos);

    if (Math.random() < 0.6) {
      _vel.set(this.dir.x * this.speed * 0.5, 0, this.dir.z * this.speed * 0.5);
      game.fx.spark(this.pos, _vel, { color: this.trailColor, size: 0.2, life: 0.4 });
    }

    const p = game.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const hr = this.radius + game.player.radius;
    if (dx * dx + dz * dz < hr * hr) {
      game.player.takeDamage(this.damage, this);
      this.onHit?.(game, this);
      return false;
    }
    return true;
  }

  dispose(game) {
    // shared materials and geometry: only detach the mesh
    game.scene.remove(this.mesh);
  }
}
