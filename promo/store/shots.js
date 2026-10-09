// =====================================================================================
//  Store preview cut (CrazyGames): 18 s, silent, real-speed gameplay (no time ramps, no
//  fast-forward), opening and closing on the static cover. Shots work at any aspect ratio:
//  P.zoomK (store.js) widens the camera for portrait and square frames.
// =====================================================================================

const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

// Screen-space offset → world XZ (sx = right, sy = up on screen, in world units).
function scr(P, sx, sy) {
  const f = P.engine.forward, r = P.engine.right;
  return { x: r.x * sx + f.x * sy, z: r.z * sx + f.z * sy };
}

const GREENSKINS = ['husk', 'husk', 'husk', 'imp', 'imp'];
const WARBAND = ['ashHusk', 'ashHusk', 'cinderling', 'cinderling', 'pyreBomber'];
const WYRMKIN = ['shardling', 'shardling', 'wraith'];

export const COVER_END = 1.2;      // the cover holds still for this long at the start
export const OUTRO_AT = 17.0;      // ...and returns here
export const DURATION = 18;

// Raid-fight driver: keep a fighting distance from the boss, step out of telegraphs, dash
// out of anything about to land. A simple version of the sim bot (src/dev/sim.js).
const DIRS = Array.from({ length: 12 }, (_, i) => [Math.cos(i / 12 * Math.PI * 2), Math.sin(i / 12 * Math.PI * 2)]);
function raidBot(P, { range = 7, orbit = 1 } = {}) {
  const g = P.game, p = g.player, b = g.boss;
  if (!p || !b || b.dead) { P.aim(); P.move(0, 0); return; }
  P.aim(b);
  const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
  const here = b.danger?.(p.pos, 1.2) ?? 0;
  let best = null, bestScore = Infinity;
  const probe = { x: 0, y: 0, z: 0 };
  for (const [x, z] of DIRS) {
    probe.x = p.pos.x + x * 2.2; probe.z = p.pos.z + z * 2.2;
    const away = Math.hypot(probe.x - b.pos.x, probe.z - b.pos.z);
    // tangential preference circles the boss; distance term holds the fighting range
    const tang = (x * -dz + z * dx) / d * orbit;
    const score = (b.danger?.(probe, 1.2) ?? 0) * 10 + Math.abs(away - range) * 0.6 - tang * 0.5;
    if (score < bestScore) { bestScore = score; best = [x, z]; }
  }
  P.move(best[0], best[1]);
  if (here >= 2.2 && p.dash.charges > 0 && p.dash.t <= 0) P.dash();
}

function hordeShot(id, t0, { classId, act, skills, passives = [], enemies, n = 140, hpMult = 6, zoom = 0.85, dir = [1, 0.2], seed, refill = 14, warm = 0.8 }) {
  return {
    id, t0,
    setup(P) {
      P.stage({ classId, act, actTime: 35, zoom, skills, passives, seed });   // before the obelisks rise (0:50)
      P.spawn(enemies, n, 5, 19, { hpMult });
      P.warm(warm, () => P.moveScreen(dir[0], dir[1]));
    },
    step(P, t) {
      P.aim();
      P.moveScreen(dir[0], dir[1]);
      // reinforcements keep pouring in from off-screen
      if (Math.round(t * 60) % 15 === 0) P.spawn(enemies, refill, 13, 19, { hpMult });
    },
    texts: 'light',
  };
}

// Aim the camera between the hero and the boss (k = smoothing per frame), so narrow frames keep both.
function frameBoss(P, k) {
  const p = P.game.player, b = P.game.boss;
  if (!p || !b || b.dead) return;
  const tx = (b.pos.x - p.pos.x) * 0.45, tz = (b.pos.z - p.pos.z) * 0.45;
  P.camOffset.x += (tx - P.camOffset.x) * k;
  P.camOffset.z += (tz - P.camOffset.z) * k;
}

// A real v5 raid encounter, joined a few seconds into the fight.
function raidShot(id, t0, { classId, act, skills, passives = [], seed, warm = 4.5, range = 6, orbit = 1, adds = null, zoom = 1.2 }) {
  return {
    id, t0,
    setup(P) {
      P.stage({ classId, act, actTime: 170, zoom: 0.9, skills, passives, seed });
      if (adds) P.spawn(adds, 30, 6, 14);
      P.game.encounter.summon('dev');
      if (P.game.encounter.arena) P.game.encounter.arena.zoom = zoom * P.zoomK;
      // window.P_WARM = { vashkar: 3 } overrides the join time from the console while choosing a moment
      P.warm(window.P_WARM?.[id] ?? warm, () => raidBot(P, { range, orbit }));
      frameBoss(P, 1);
    },
    step(P) { raidBot(P, { range, orbit }); frameBoss(P, 0.06); },
    texts: 'light',
  };
}

// The cover: Aurelith, the Prism Dragon, mid-fight; frozen (speed 0). Framing knobs in COVER
// (P.cover overrides them from the console while choosing a frame).
export const COVER = { seed: 7, warm: 4.0, zoom: 1.3, cam: [0, -1.3], camSquare: [-1.6, -1.3], camPortrait: [-2.8, -1.2], range: 6, classId: 'pyromancer' };
function coverShot(id, t0) {
  return {
    id, t0,
    setup(P) {
      const C = { ...COVER, ...P.cover };
      P.stage({ classId: C.classId, act: 2, actTime: 170, zoom: 0.9, seed: C.seed,
        skills: [['cinderBolt', 5], ['fireball', 5], ['meteor', 5]], passives: [['amplify', 3]] });
      P.game.encounter.summon('dev');
      if (P.game.encounter.arena) P.game.encounter.arena.zoom = C.zoom * P.zoomK;
      P.warm(C.warm, () => raidBot(P, { range: C.range }));
      const aspect = P.W / P.H;   // narrower frames slide toward the dragon (left of the hero)
      const cam = aspect < 0.8 ? C.camPortrait : aspect < 1.2 ? C.camSquare : C.cam;
      const c = scr(P, cam[0], cam[1]);
      P.camOffset.set(c.x, 0, c.z);
      P.engine.zoom = P.engine.targetZoom = C.zoom * P.zoomK;
      P.engine.camera.zoom = P.engine.zoom; P.engine.camera.updateProjectionMatrix();
      for (let i = 0; i < 90; i++) P.engine.follow(P.game.player.pos, 1 / 30);   // settle the camera on the new framing
    },
    speed: () => 0,
    texts: 'none',
    cover: true,
  };
}

export const SHOTS = [
  coverShot('cover', 0),

  // ---------------------------------------------------------------- the horde (Thornwood)
  hordeShot('horde', COVER_END, {
    classId: 'pyromancer', act: 0, seed: 21, zoom: 1.0, n: 170, hpMult: 12, refill: 16,
    skills: [['cinderBolt', 5], ['fireball', 5], ['meteor', 5]], passives: [['amplify', 3], ['might', 3]], enemies: GREENSKINS,
  }),

  // ---------------------------------------------------------------- elemental reactions
  hordeShot('reactions', 4.0, {
    classId: 'arcanist', act: 0, seed: 41, zoom: 1.2, n: 100, hpMult: 3, refill: 10, dir: [0.25, -0.2],
    skills: [['arcaneBolt', 5], ['fireball', 5], ['frostNova', 5], ['chainLightning', 5]], passives: [['catalyst', 3], ['haste', 3]], enemies: GREENSKINS,
  }),

  // ---------------------------------------------------------------- storm in the Barrens
  hordeShot('storm', 6.6, {
    classId: 'stormcaller', act: 1, seed: 34, zoom: 1.1, n: 130, hpMult: 6, dir: [-1, -0.25],
    skills: [['spark', 5], ['chainLightning', 5]], passives: [['amplify', 2]], enemies: WARBAND,
  }),

  // ---------------------------------------------------------------- three raid bosses
  raidShot('gorrak', 9.2, { classId: 'arcanist', act: 0, seed: 71, warm: 3.0,
    skills: [['arcaneBolt', 5], ['spiritOrbs', 5], ['fireball', 4]] }),
  raidShot('vashkar', 11.8, { classId: 'stormcaller', act: 1, seed: 72, warm: 7.0, orbit: -1,
    skills: [['spark', 5], ['chainLightning', 5]] }),
  raidShot('aurelith', 14.4, { classId: 'pyromancer', act: 2, seed: 73, warm: 6.0, range: 8,
    skills: [['cinderBolt', 5], ['fireball', 5], ['meteor', 4]] }),

  // ---------------------------------------------------------------- back to the cover (loops cleanly)
  coverShot('outro', OUTRO_AT),
];

export { smooth, scr };
