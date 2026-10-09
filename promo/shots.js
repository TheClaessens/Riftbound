// =====================================================================================
//  Shot list. Each shot stages a real game situation (setup), drives the player per
//  frame (step), and can bend time (speed) or treat the plate (dim / filter / zoomPost).
//  Times are global seconds; cuts sit on a 120 BPM grid (0.5 s per beat).
// =====================================================================================

// Screen-space offset → world XZ (sx = right, sy = up on screen, in world units).
function scr(P, sx, sy) {
  const f = P.engine.forward, r = P.engine.right;
  return { x: r.x * sx + f.x * sy, z: r.z * sx + f.z * sy };
}
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

const GREENSKINS = ['husk', 'husk', 'husk', 'imp', 'imp'];
const WARBAND = ['ashHusk', 'ashHusk', 'cinderling', 'cinderling', 'pyreBomber'];
const WYRMKIN = ['shardling', 'shardling', 'wraith'];

// Class cut: close-up, dash through a pack while the starter fires.
function classShot(t0, { classId, act, skills, enemies, dashAt = 0.1, dir = [1, 0.3], seed }) {
  return {
    id: `class-${classId}`, t0,
    setup(P) {
      P.stage({ classId, act, actTime: 40, zoom: 1.5, skills, seed });
      P.spawn(enemies, 34, 5, 11);
      P.moveScreen(dir[0], dir[1]);
      P.warm(0.9);
    },
    step(P, t) {
      P.aim();
      P.moveScreen(dir[0], dir[1]);
      if (Math.abs(t - dashAt) < 0.5 / 60) P.dash();
    },
  };
}

// Boss cut: the boss is mid-attack when the shot opens.
function bossShot(t0, { id, act, classId, skills, attack, at, cam, warm = 1.0, seed, enemies, crowd = 26, zoom = 0.92 }) {
  return {
    id: `boss-${id}`, t0,
    setup(P) {
      P.stage({ classId, act, actTime: 100, zoom, skills, seed });
      const o = scr(P, at[0], at[1]);
      const b = P.boss(id, o.x, o.z);
      b.cycleT = 99;
      if (enemies) P.spawn(enemies, crowd, 6, 13);
      const c = scr(P, cam[0], cam[1]);
      P.camOffset.set(c.x, 0, c.z);
      P.warm(0.35);
      b._pick = () => attack;
      b._attack(P.game);
      b.cycleT = 99;
      P.warm(warm);
    },
    step(P) { P.aim(P.game.boss); P.moveScreen(-0.4, -0.2); },
    texts: 'light',
  };
}

export const SHOTS = [
  // ---------------------------------------------------------------- 0.0 cold open / logo
  {
    id: 'logo', t0: 0,
    setup(P) {
      P.stage({ classId: 'pyromancer', act: 0, actTime: 60, zoom: 1.25, seed: 11,
        skills: [['cinderBolt', 4], ['fireball', 4]] });
      P.spawn(GREENSKINS, 60, 8, 16);
      P.warm(1.2);
    },
    step(P, t) {
      P.aim();
      P.moveScreen(0.3, 0.2);
      const z = 1.25 - 0.3 * smooth(t / 1.5);
      P.engine.zoom = P.engine.targetZoom = z;
    },
    dim: (t) => 0.5 - 0.15 * smooth(t / 1.4),
    texts: 'none',
    filter: (t) => (t < 0.5 ? `blur(${(6 * (1 - t / 0.5)).toFixed(2)}px)` : null),
  },

  // ---------------------------------------------------------------- 1.5 horde
  {
    id: 'horde', t0: 1.5,
    setup(P) {
      P.stage({ classId: 'pyromancer', act: 0, actTime: 75, zoom: 0.78, seed: 21,
        skills: [['cinderBolt', 5], ['fireball', 5], ['meteor', 5]], passives: [['amplify', 3], ['might', 3]] });
      P.spawn(GREENSKINS, 220, 6, 20, { hpMult: 14 });
      P.spawn(['brute', 'bloater'], 6, 10, 16, { hpMult: 4 });
      P.warm(0.5, () => P.moveScreen(1, 0.25));
      P.shot.kills0 = P.game.stats.kills;
    },
    step(P, t) {
      P.aim();
      P.moveScreen(1, 0.25);
      // reinforcements keep pouring in from off-screen
      if (Math.round(t * 60) % 12 === 0) P.spawn(GREENSKINS, 16, 12, 18, { hpMult: 14 });
      P.engine.zoom = P.engine.targetZoom = 0.78 - 0.08 * smooth(t / 2);
    },
  },

  // ---------------------------------------------------------------- 3.5 four classes (one per beat)
  classShot(3.5, { classId: 'arcanist', act: 0, skills: [['arcaneBolt', 5], ['spiritOrbs', 5]], enemies: GREENSKINS, seed: 31 }),
  classShot(4.0, { classId: 'pyromancer', act: 1, skills: [['cinderBolt', 5], ['fireball', 5]], enemies: WARBAND, seed: 32, dir: [-1, 0.2] }),
  classShot(4.5, { classId: 'cryomancer', act: 2, skills: [['iceShard', 5], ['blizzard', 5], ['frostNova', 5]], enemies: WYRMKIN, seed: 33 }),
  classShot(5.0, { classId: 'stormcaller', act: 0, skills: [['spark', 5], ['chainLightning', 5]], enemies: GREENSKINS, seed: 34, dir: [-1, -0.3] }),

  // ---------------------------------------------------------------- 5.5 reactions
  {
    id: 'reactions', t0: 5.5,
    setup(P) {
      P.stage({ classId: 'arcanist', act: 0, actTime: 90, zoom: 1.12, seed: 41,
        skills: [['arcaneBolt', 5], ['fireball', 5], ['frostNova', 5], ['chainLightning', 5]], passives: [['catalyst', 3], ['haste', 3]] });
      P.spawn(GREENSKINS, 120, 3, 12, { hpMult: 3 });
      P.warm(1.0);
      P.shot.reacts = [];
      P.on('reaction', (e) => P.shot.reacts.push({ type: e.type, t: P.game.time }));
    },
    step(P) { P.aim(); P.moveScreen(0.2, -0.15); },
  },

  // ---------------------------------------------------------------- 7.5 perfect dodge
  {
    id: 'dodge', t0: 7.5,
    setup(P) {
      P.stage({ classId: 'pyromancer', act: 0, actTime: 170, zoom: 1.05, seed: 51,
        skills: [['cinderBolt', 5], ['fireball', 4]] });
      const o = scr(P, -1.5, 5.6);
      const b = P.boss('hollowWarden', o.x, o.z);
      b.cycleT = 99;
      P.spawn(GREENSKINS, 30, 7, 13);
      const c = scr(P, -0.6, 2.4);
      P.camOffset.set(c.x, 0, c.z);
      P.warm(0.6);
      P.shot.boss = b;
      P.shot.perfectT = null;
      P.shot.dashed = false;
      // The slam telegraph (1.0 s of game time) starts as the shot opens.
      b._pick = () => 'slam'; b._attack(P.game);
      P.shot.slamT = P.game.time;
      P.on('perfectDodge', () => {
        P.shot.perfectT ??= P.shot.t;
        P.engine._flash.amp = Math.min(P.engine._flash.amp, 0.22);   // keep the green pulse short
      });
    },
    step(P, t) {
      const b = P.shot.boss, g = P.game;
      P.shot.t = t;
      P.aim(b);
      b.cycleT = 99;
      const since = g.time - P.shot.slamT;
      if (since > 0.9 && since < 1.05) P.moveScreen(1, -0.35); else if (P.shot.perfectT !== null) P.moveScreen(0.4, 0.2); else P.move(0, 0);
      if (!P.shot.dashed && since >= 0.95) { P.shot.dashed = true; P.dash(); }
    },
    // editorial time ramp: full speed while the telegraph fills, slow-mo through the dodge
    speed: (t) => (t < 0.82 ? 1 : t < 0.97 ? 1 - 0.6 * smooth((t - 0.82) / 0.15) : t < 1.5 ? 0.4 : 0.4 + 0.6 * smooth((t - 1.5) / 0.3)),
    zoomPost: (t) => 1 + 0.07 * smooth((t - 0.1) / 0.9) - 0.07 * smooth((t - 1.05) / 0.5),
    // punch + flash on the frame the Perfect Dodge actually fires
    cuts: (shot) => (shot.perfectT != null ? [{ t: shot.perfectT, punch: 0.1, flash: 0.5 }] : []),
    texts: 'light',
  },

  // ---------------------------------------------------------------- 9.5 fusion
  {
    id: 'fusion', t0: 9.5,
    setup(P) {
      P.stage({ classId: 'pyromancer', act: 1, actTime: 80, zoom: 0.95, seed: 61,
        skills: [['cinderBolt', 3], ['meteor', 3]], passives: [['amplify', 2], ['might', 4]] });
      P.spawn(WARBAND, 170, 5, 18, { hpMult: 5 });
      P.spawn(['obsidianBrute', 'magmaRam'], 6, 9, 14, { hpMult: 3 });
      P.warm(0.6);
    },
    texts: 'light',
    step(P, t) {
      P.aim();
      P.moveScreen(-0.5, -0.4);
      if (Math.round(t * 60) % 12 === 0) P.spawn(WARBAND, 14, 10, 16, { hpMult: 5 });
      if (Math.abs(t - 0.45) < 0.5 / 60) {
        const g = P.game, recipe = P.FUSIONS.find((f) => f.def.id === 'starfall');
        const slowmo = g.slowmo; g.slowmo = () => {};
        g.player.fuse(recipe);
        g.slowmo = slowmo;
        const s = g.player.getSkill('starfall');
        while (s.rank < 3) g.player.rankUpSkill('starfall');
        g.fx.ring(g.player.pos, { color: 0xffc340, radius: 6, life: 0.5, width: 0.12 });
        g.fx.flashDisc(g.player.pos, { color: 0xffc340, radius: 2.2, life: 0.3, hdr: 2 });
        g.engine.pulse('perfect');
      }
    },
  },

  // ---------------------------------------------------------------- 11.5 three acts, three bosses
  bossShot(11.5, { id: 'hollowWarden', act: 0, classId: 'arcanist', skills: [['arcaneBolt', 5], ['fireball', 4]], attack: 'slam', at: [-0.5, 5.5], cam: [0, 2.6], warm: 0.55, seed: 71, enemies: GREENSKINS }),
  bossShot(12.0, { id: 'vashkar', act: 1, classId: 'stormcaller', skills: [['spark', 5], ['chainLightning', 4]], attack: 'charge', at: [3.5, 6.5], cam: [1.6, 3.0], warm: 0.55, seed: 72, enemies: WARBAND, crowd: 8, zoom: 1.05 }),
  bossShot(12.5, { id: 'riftHeart', act: 2, classId: 'stormcaller', skills: [['spark', 5], ['chainLightning', 5]], attack: 'beams', at: [0, 7], cam: [0, 3.4], warm: 1.25, seed: 73, enemies: WYRMKIN }),

  // ---------------------------------------------------------------- 13.0 end card
  {
    id: 'end', t0: 13.0,
    setup(P) {
      P.stage({ classId: 'arcanist', act: 2, actTime: 100, zoom: 0.85, seed: 81,
        skills: [['arcaneBolt', 5], ['chainLightning', 5], ['fireball', 5]] });
      const o = scr(P, 0, 6.5);
      const b = P.boss('riftHeart', o.x, o.z);
      P.spawn(WYRMKIN, 50, 6, 15);
      const c = scr(P, 0, 3);
      P.camOffset.set(c.x, 0, c.z);
      P.warm(0.4);
      b._pick = () => 'volley'; b._attack(P.game); b.cycleT = 99;
      P.warm(0.6);
    },
    step(P, t) {
      P.aim(P.game.boss);
      P.moveScreen(0.3, 0);
      P.engine.zoom = P.engine.targetZoom = 0.85 + 0.12 * smooth(t / 2);
    },
    speed: () => 0.6,
    dim: (t) => 0.18 + 0.22 * smooth(t / 0.4),
    texts: 'none',
    filter: (t) => `blur(${(3 * smooth(t / 0.5)).toFixed(2)}px) saturate(1.15)`,
  },
];
