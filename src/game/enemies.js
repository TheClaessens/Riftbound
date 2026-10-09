import * as THREE from 'three';
import { GEO, glowMaterial, ELEMENT_COLOR, distXZ, rotateXZ, randRange } from '../core/utils.js';
import { makeStatus, updateStatuses, statusTint, statusLook, damageEnemy, killEnemy } from './combat.js';
import { creatureFor } from './creatures/index.js';
import { BLEND_ADD } from './fx.js';

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
const CHARGE_STAGGER = 0.6;                                // min seconds between any two charge wind-ups
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
  // ---- Act I · The Thornwood · Greenskins ----
  husk:          { name: 'Goblin Grunt',  archetype: 'chaser',   faction: 'hollow',   act: 1,     hp: 18,  speed: 3.0, radius: 0.5,  damage: 6,  xp: 1, kbResist: 0,   deathColor: 0xa3bd3c },
  imp:           { name: 'Goblin Scamp',  archetype: 'swarmer',  faction: 'hollow',   act: 1,     hp: 12,  speed: 5.6, radius: 0.4,  damage: 6,  xp: 1, kbResist: 0,   deathColor: 0xb9cf52 },
  brute:         { name: 'Forest Troll',  archetype: 'tank',     faction: 'hollow',   act: 1,     hp: 90,  speed: 2.2, radius: 0.9,  damage: 18, xp: 4, kbResist: 0.7, deathColor: 0x7da83a },
  spitter:       { name: 'Goblin Shaman', archetype: 'ranged',   faction: 'hollow',   act: 1,     hp: 30,  speed: 2.6, radius: 0.55, damage: 10, xp: 2, kbResist: 0,   deathColor: 0xb8ff3c, shootCD: 2.6 },
  bloater:       { name: 'Broodmother',   archetype: 'splitter', faction: 'hollow',   act: 1,     hp: 45,  speed: 2.0, radius: 0.75, damage: 10, xp: 3, kbResist: 0,   deathColor: 0xb8ff3c },
  mite:          { name: 'Spiderling',    archetype: 'swarmer',  faction: 'hollow',   act: 'any', hp: 5,   speed: 6.2, radius: 0.3,  damage: 4,  xp: 0, kbResist: 0,   deathColor: 0x6a4a74 },

  // ---- Act II · The Sunscorch Barrens · Warband (resist Fire 50%) ----
  ashHusk:       { name: 'Orc Raider',    archetype: 'chaser',   faction: 'ashborn',  act: 2,     hp: 20,  speed: 3.2, radius: 0.5,  damage: 6,  xp: 1, kbResist: 0,   deathColor: 0x6b8c34, resist: FIRE_RESIST },
  cinderling:    { name: 'Warg',          archetype: 'swarmer',  faction: 'ashborn',  act: 2,     hp: 12,  speed: 6.0, radius: 0.4,  damage: 6,  xp: 1, kbResist: 0,   deathColor: 0x8a7a66, resist: FIRE_RESIST },
  obsidianBrute: { name: 'Ogre',          archetype: 'tank',     faction: 'ashborn',  act: 2,     hp: 110, speed: 2.2, radius: 0.95, damage: 20, xp: 5, kbResist: 0.7, deathColor: 0x7d8a98, resist: FIRE_RESIST },
  emberSpitter:  { name: 'Orc Spirit-Shaman', archetype: 'ranged',   faction: 'ashborn',  act: 2,     hp: 30,  speed: 2.6, radius: 0.55, damage: 10, xp: 2, kbResist: 0,   deathColor: 0x1fe0c2, resist: FIRE_RESIST, shootCD: 2.6 },
  magmaRam:      { name: 'War Boar',      archetype: 'charger',  faction: 'ashborn',  act: 2,     hp: 60,  speed: 2.8, radius: 0.7,  damage: 16, xp: 3, kbResist: 0.3, deathColor: 0x8a5a3a, resist: FIRE_RESIST },
  pyreBomber:    { name: 'Goblin Sapper', archetype: 'bomber',   faction: 'ashborn',  act: 2,     hp: 25,  speed: 4.0, radius: 0.55, damage: 14, xp: 2, kbResist: 0,   deathColor: 0xffb040, resist: FIRE_RESIST },

  // ---- Act III · The Stormwater Reach · Wyrmkin (elites carry a Prism Ward) ----
  shardling:     { name: 'Dragon Whelp',  archetype: 'swarmer',  faction: 'riftborn', act: 3,     hp: 12,  speed: 6.2, radius: 0.4,  damage: 6,  xp: 1, kbResist: 0,   deathColor: 0xc23a4a },
  colossus:      { name: 'Stone River Troll', archetype: 'tank',     faction: 'riftborn', act: 3,     hp: 140, speed: 2.0, radius: 1.1,  damage: 22, xp: 6, kbResist: 0.7, deathColor: 0x9aa2ae },
  voidSpitter:   { name: 'Naga Tidecaller', archetype: 'ranged',   faction: 'riftborn', act: 3,     hp: 32,  speed: 2.6, radius: 0.55, damage: 10, xp: 2, kbResist: 0,   deathColor: 0x3fae9a, shootCD: 2.6 },
  crystalRam:    { name: 'Crag Drake',    archetype: 'charger',  faction: 'riftborn', act: 3,     hp: 65,  speed: 3.0, radius: 0.7,  damage: 16, xp: 3, kbResist: 0.3, deathColor: 0xa83a3a },
  wraith:        { name: 'Storm Wyvern',  archetype: 'blinker',  faction: 'riftborn', act: 3,     hp: 28,  speed: 3.4, radius: 0.5,  damage: 10, xp: 2, kbResist: 0,   deathColor: 0xe08a3a },
  prismHexer:    { name: 'Kobold Prism-Shaman', archetype: 'support',  faction: 'riftborn', act: 3,     hp: 40,  speed: 2.4, radius: 0.55, damage: 6,  xp: 4, kbResist: 0,   deathColor: 0xe6f4ff },
};

// ---------------------------------------------------------------- shared assets

// Creatures are GPU-instanced rigs (src/game/creatures). Elites get a pulsing gold rim light,
// warded enemies a rim + translucent shell in the ward element's colour.
const ELITE_RIM = [1.0, 0.7, 0.16, 1.5];
const BARRIER_TINT = 0xc8a8ff;
const SWING_TIME = 0.5;            // melee attack animation length (strike lands ~35% in)
const CAST_RELEASE = 0.25;         // ranged "release" pose after a shot
const _wardRims = {};
function wardAccent(el) {
  const r = wardRim(el);
  return (r._acc ??= [r[0], r[1], r[2], 0.7]);
}
function wardRim(el) {
  if (!_wardRims[el]) {
    const c = new THREE.Color(ELEMENT_COLOR[el] ?? 0xffffff);
    _wardRims[el] = [c.r, c.g, c.b, 1.3];
  }
  return _wardRims[el];
}

// Shared ward shells, one per element.
const WARD_MATS = {};
function wardMat(el) {
  if (!WARD_MATS[el]) {
    // Fresnel-edge shell (blend-add): nearly clear in the middle so the creature stays readable,
    // a bright element-coloured rim at the silhouette.
    const c = new THREE.Color(ELEMENT_COLOR[el] ?? 0xffffff);
    WARD_MATS[el] = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: c } },
      vertexShader: /* glsl */`
        varying vec3 vN;
        void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying vec3 vN;
        void main() {
          float f = pow(1.0 - abs(vN.z), 2.5);
          gl_FragColor = vec4(uColor * (0.12 + 1.9 * f), 0.05 + 0.35 * f);
        }`,
      transparent: true, depthWrite: false, ...BLEND_ADD,
    });
  }
  return WARD_MATS[el];
}

// Bullets (daylight read): dark inverted-hull outline + OPAQUE saturated body with a white-hot core + ground
// shadow dot. All shared; never disposed. Additive magenta washed out to pastel pink on sunlit ground.
// The body is a fresnel-style shader (white-hot in the middle, saturated rim) because a separate core
// sphere would be hidden inside the opaque body.
const BULLET_OUTLINE = new THREE.MeshBasicMaterial({ color: 0x16000c, side: THREE.BackSide });
const BULLET_SHADOW = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
const BULLET_CORE = new THREE.Color(0xffffff).multiplyScalar(2.2);   // HDR white: the only part that blooms hard
const _bulletMats = new Map();
function bulletMat(color) {
  let m = _bulletMats.get(color);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(0.9) }, uCore: { value: BULLET_CORE } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform vec3 uCore; varying vec3 vN; varying vec3 vV;
        void main() { float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0); gl_FragColor = vec4(mix(uColor, uCore, smoothstep(0.86, 0.97, f)), 1.0); }`,
    });
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
    _disposed: false,
    swingT: 0,         // melee swing animation timer
    castT: 0,          // support / ranged release animation timer
    // visuals
    mesh: null,        // Group for attachments (ward shell, relic marker); the body is a rig instance
    rig: null,         // CreatureRenderer handle
    center: 0,
    topY: 0,
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

  // ---- visuals: rig instance + an attachment group ----
  const cdef = creatureFor(typeId);
  const toPlayer = game.player ? Math.atan2(game.player.pos.x - pos.x, game.player.pos.z - pos.z) : Math.random() * TAU;
  enemy.yaw = toPlayer;
  enemy.rig = game.creatures.add(cdef, { pos: enemy.pos, yaw: toPlayer, scale: enemy.visScale * enemy.spawnS });
  if (elite) { enemy.rig.rim = ELITE_RIM; enemy.rig.elite = true; }
  const box = cdef.geometry.boundingBox;
  enemy.topY = box.max.y;
  enemy.center = box.max.y * 0.5;
  const g = new THREE.Group();
  g.position.copy(enemy.pos);
  game.scene.add(g);
  enemy.mesh = g;
  syncWard(enemy);

  if (spawnAnim) {
    game.fx.ring(enemy.pos, { color: 0x2e2216, radius: def.radius * 2.4, life: SPAWN_TIME, width: 0.28, hdr: 1, occ: 0.8, blend: 'normal' });
    game.fx.burst(enemy.pos, { color: 0x5a4630, count: 10, speed: 3, life: 0.45, size: 0.4, up: 1.2, gravity: 6, occ: 0.85, blend: 'normal' });
  }

  // ---- methods ----
  enemy.update = (dt, game2) => updateEnemy(dt, game2, enemy);
  enemy.flash = () => { enemy.flashT = 0.08; enemy.rig.flash(); };
  enemy.dispose = (game2) => disposeEnemy(game2, enemy);
  if (def.archetype === 'splitter') enemy.onDeath = (game2) => spawnMites(game2, enemy);
  if (def.archetype === 'bomber') enemy.onDeath = (game2) => bomberBoom(game2, enemy, false);

  return enemy;
}

// ---------------------------------------------------------------- lifecycle

// Killed (hp <= 0): the rig plays its death topple. Otherwise (Rift Shift, world reset):
// removed immediately.
function disposeEnemy(game, e) {
  if (e._disposed) return;
  e._disposed = true;
  cancelTele(e);
  if (e.rig) {
    e.rig.frozen = false;
    game.creatures.remove(e.rig, { corpse: e.hp <= 0 });
  }
  if (e.mesh) game.scene.remove(e.mesh);
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
    game.player.takeDamage(e.damage * 2, e, 'explosion');
  }
  const dmg = 60 + 20 * game.act;
  const hits = game.queryEnemies(c, BOMB_RADIUS, []).slice();
  for (const o of hits) {
    if (o === e || o.inert || o.dead) continue;
    damageEnemy(game, o, dmg, { element: 'physical', raw: true, noCrit: true });
  }
  game.fx.flashDisc(c, { color: 0xff5a1f, radius: BOMB_RADIUS, life: 0.3, hdr: 1.3, occ: 0.4 });
  game.fx.ring(c, { color: 0xff2a3d, radius: BOMB_RADIUS, life: 0.3, width: 0.25, hdr: 1.5, occ: 0.6 });
  game.fx.burst(c, { color: 0xff6a1f, count: 24, speed: 8, life: 0.5, size: 0.4, up: 1.5, gravity: 4, occ: 0.45, backing: 0.5, backingColor: 0x2a0f08 });
  game.fx.light(c, 0xff6a1f, 40, 0.3);
  game.fx.shake(0.25, 'threat');
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
// Boss adds may carry a goal (design/RAID.md "race adds"): e.goal (Vector3) replaces the player as the
// chase target, and e.onGoal(game, e) fires once within e.goalR (default 1.6) of it.
function aimPlayer(e, game, out) {
  const p = e.goal ?? game.player.pos;
  const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 1e-5) out.set(dx / d, 0, dz / d);
  else out.set(0, 0, 0);
  return d;
}

// ---------------------------------------------------------------- behaviours
// Each behaviour gets mv (status multiplier, 0 = frozen/stunned: no movement, no attacks).

function behaveChase(e, game, dt, mv) {
  const d = aimPlayer(e, game, _to);
  if (mv > 0) moveXZ(e, game, _to.x, _to.z, e.speed * mv, dt);
  if (e.goal && e.onGoal && d < (e.goalR ?? 1.6)) { const f = e.onGoal; e.onGoal = null; f(game, e); }
}

// World-space muzzle (creature spec.muzzle = [x, y, z] in model space; default chest height).
const _muzzle = new THREE.Vector3();
function muzzleOf(e) {
  const m = e.rig?.def.spec.muzzle;
  if (!m) return _muzzle.set(e.pos.x, 0.8, e.pos.z);
  const s = e.visScale, c = Math.cos(e.yaw), sn = Math.sin(e.yaw);
  return _muzzle.set(e.pos.x + (m[0] * c + m[2] * sn) * s, Math.min(3.2, Math.max(0.5, m[1] * s)), e.pos.z + (-m[0] * sn + m[2] * c) * s);
}

function fireRanged(game, e) {
  e.castT = CAST_RELEASE;
  aimPlayer(e, game, _to);
  const mz = muzzleOf(e);
  const y = mz.y;
  if (e.type === 'voidSpitter') {
    for (const a of VOID_SPREAD) {
      rotateXZ(_to, a, _dir);
      game.addActor(new EnemyBullet(game, mz, _dir, e.damage, { y, owner: e.name }));
    }
  } else if (e.type === 'emberSpitter') {
    game.addActor(new EnemyBullet(game, mz, _to, e.damage, { trail: 0x1fe0c2, y, owner: e.name }));
  } else {
    game.addActor(new EnemyBullet(game, mz, _to, e.damage, { y, owner: e.name }));
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
    const wait = (game._nextChargeT ?? 0) - game.time;   // a stale value from an earlier run is > CHARGE_STAGGER away
    if (e.aiCd <= 0 && d <= CHARGE_TRIGGER && !(wait > 0 && wait <= CHARGE_STAGGER)) {
      // stop and telegraph a line toward the player's current position. Charges across all
      // chargers start CHARGE_STAGGER apart: packs of War Boars used to land 2-3 charges at once.
      game._nextChargeT = game.time + CHARGE_STAGGER;
      e.ai = 'windup';
      e.aiT = CHARGE_WINDUP;
      e.aiDir.copy(_to);
      e.yaw = Math.atan2(_to.x, _to.z);
      cancelTele(e);
      e._tele = game.fx.lineTelegraph(e.pos, e.aiDir, CHARGE_LEN, 1.4, CHARGE_WINDUP);
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
        game.player.takeDamage(e.damage * 1.5, e, 'charge');
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
    e._tele = game.fx.telegraph(e.pos, BOMB_RADIUS, FUSE_TIME);   // hostile: unified red
    return;
  }
  moveXZ(e, game, _to.x, _to.z, e.speed * mv, dt);
}

function blinkTo(game, e, t) {
  if (e.dead) return;
  game.fx.burst(e.pos, { color: 0xb04aff, count: 14, speed: 5, life: 0.4, size: 0.4, occ: 0.5, backing: 0.45, backingColor: 0x1a0830 });
  e.pos.x = t.x;
  e.pos.z = t.z;
  game.world.collide(e.pos, e.radius);
  game.fx.burst(e.pos, { color: 0xb04aff, count: 14, speed: 5, life: 0.4, size: 0.4, occ: 0.5, backing: 0.45, backingColor: 0x1a0830 });
  game.fx.ring(e.pos, { color: 0xb04aff, radius: 1.2, life: 0.25, width: 0.2, hdr: 1.6, occ: 0.6 });
  e.castT = 0.35;
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
      keepColor: true,   // arrival marker stays purple (keeps the hostile dark outline)
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
  e.castT = 0.6;
  const list = game.queryEnemies(e.pos, SUPPORT_RADIUS, _near).slice();
  for (const o of list) {
    // never bosses: 30% of a boss bar, refreshed every cast, made Aurelith unkillable while
    // Prism-Shamans lived (playtest round 1, issue #1)
    if (o === e || o.dead || o.inert || o.boss) continue;
    o.barrier = Math.max(o.barrier || 0, BARRIER_FRAC * o.maxHp);
  }
  game.fx.ring(e.pos, { color: 0xa880ff, radius: SUPPORT_RADIUS, life: 0.45, width: 0.12, hdr: 1.5, occ: 0.55 });
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
      e.swingT = SWING_TIME;
      e.yaw = Math.atan2(dx, dz);
    }
  }

  updateVisuals(game, e, dt);
}

// Ward shell: rotating translucent icosahedron in the ward element's colour (+ matching rim light).
function syncWard(e) {
  if (e.ward) {
    if (!e._shell) {
      const shell = new THREE.Mesh(GEO.sphere, wardMat(e.ward));
      shell.scale.setScalar(Math.max(e.baseRadius * 1.6, e.topY * 0.62));
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

// Drives the rig: placement, action + progress for the creature's animate(), glow, tint, rim.
// Actions: 'attack' (melee swing), 'cast' (ranged windup 0..0.7, release 0.7..1; support pulse),
// 'fuse', 'windup' / 'charge' / 'recover' (chargers), 'blink' / 'arrive' (blinkers).
function updateVisuals(game, e, dt) {
  const t = game.time;
  const h = e.rig;
  if (e.flashT > 0) e.flashT -= dt;
  if (e.swingT > 0) e.swingT -= dt;
  if (e.castT > 0) e.castT -= dt;

  let action = null, k = 0, glow = 0;
  if (e.swingT > 0) { action = 'attack'; k = 1 - e.swingT / SWING_TIME; }
  switch (e.archetype) {
    case 'ranged':
      if (e.windupT > 0) { action = 'cast'; k = 0.7 * (1 - e.windupT / WINDUP); glow = k / 0.7; }
      else if (e.castT > 0) { action = 'cast'; k = 1 - 0.3 * (e.castT / CAST_RELEASE); glow = e.castT / CAST_RELEASE; }
      break;
    case 'bomber':
      if (e.fuseT > 0) {
        const f = 1 - e.fuseT / FUSE_TIME;
        action = 'fuse'; k = f;
        glow = 0.5 + 0.5 * Math.sin(t * (10 + 25 * f));
      }
      break;
    case 'charger':
      if (e.ai === 'windup') { action = 'windup'; k = 1 - e.aiT / CHARGE_WINDUP; glow = 0.5 + 0.5 * Math.sin(t * 18); }
      else if (e.ai === 'charge') { action = 'charge'; k = 1 - e.aiLeft / CHARGE_LEN; glow = 1; }
      else if (e.ai === 'recover') { action = 'recover'; k = 1 - e.aiT / CHARGE_RECOVER; }
      break;
    case 'blinker':
      if (e._tele) { action = 'blink'; e.blinkWind = Math.max(0, (e.blinkWind ?? BLINK_TELEGRAPH) - dt); k = 1 - e.blinkWind / BLINK_TELEGRAPH; glow = 0.5 + 0.5 * Math.sin(t * 22); }
      else { e.blinkWind = BLINK_TELEGRAPH; if (e.castT > 0) { action = 'arrive'; k = 1 - e.castT / 0.35; } }
      break;
    case 'support':
      glow = 0.2 + 0.15 * Math.sin(t * 3 + e.phase);
      if (e.castT > 0) { action = 'cast'; k = 1 - e.castT / 0.6; glow = 1; }
      break;
  }

  h.yaw = e.yaw;
  h.scale = e.visScale * e.spawnS;
  h.lift = e.spawnDY;
  h.action = action;
  h.k = k;
  h.glow = glow;
  h.frozen = e.status.frozen > 0;
  h.stat = statusLook(e, h.stat ?? [0, 0, 0], game.player?.stats.freezeAt);
  const tint = statusTint(e);
  h.tint = tint !== null ? tint : e.barrier > 0 ? BARRIER_TINT : null;
  if (e.elite) {
    const pulse = 1.2 + 0.5 * Math.sin(t * 5);
    ELITE_RIM[3] = pulse; // shared array: every elite pulses in sync
  }
  h.accent = e.ward ? wardAccent(e.ward) : null;
  if (e.ward && !e.elite) h.rim = wardRim(e.ward);
  else if (!e.ward && !e.elite && h.rim) h.rim = null;

  e.mesh.position.set(e.pos.x, e.pos.y + e.spawnDY, e.pos.z);
  syncWard(e);
  if (e._shell) {
    e._shell.rotation.y += dt * 1.2;
    e._shell.rotation.x += dt * 0.7;
    e._shell.scale.setScalar(Math.max(e.baseRadius * 1.6, e.topY * 0.62) * e.visScale * e.spawnS);
    e._shell.position.y = e.center * e.visScale;
  }
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
    this.pos = new THREE.Vector3(pos.x, opts.y ?? 0.8, pos.z);
    const dl = Math.hypot(dir.x, dir.z) || 1;
    this.dir = new THREE.Vector3(dir.x / dl, 0, dir.z / dl);
    this.damage = damage;
    this.speed = opts.speed ?? 11;
    this.radius = opts.radius ?? 0.35;
    this.life = opts.life ?? 3;
    this.age = 0;
    this.onHit = opts.onHit ?? null;
    this.name = opts.owner ?? 'Enemy projectile';   // the shooter, for the death recap

    const color = opts.color ?? 0xff2a6d;
    this.trailColor = opts.trail ?? color;
    const size = opts.size ?? 0.28;

    this.mesh = new THREE.Group();
    // dark inverted-hull shell (visual radius ~ hit radius), opaque saturated body, small white-hot core
    const shell = new THREE.Mesh(GEO.sphere, BULLET_OUTLINE);
    shell.scale.setScalar(size * 1.38);
    const outer = new THREE.Mesh(GEO.sphere, bulletMat(color));
    outer.scale.setScalar(size);
    // ground shadow dot at the true XZ the bullet hits (bullets fly above the ground)
    const shadow = new THREE.Mesh(GEO.disc, BULLET_SHADOW);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05 - this.pos.y;
    shadow.scale.setScalar(size * 1.1);
    this.mesh.add(shell, outer, shadow);
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
      game.fx.spark(this.pos, _vel, { color: this.trailColor, size: 0.2, life: 0.4, hdr: 1.4, occ: 0.5 });
    }

    const p = game.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const hr = this.radius + game.player.radius;
    if (dx * dx + dz * dz < hr * hr) {
      game.player.takeDamage(this.damage, this, 'projectile');
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
