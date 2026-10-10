// =====================================================================================
//  Riftbound staging layer shared by every cut (promo/promo.js, promo/store/store.js).
//  Boots the game without its main loop and returns the staging API `P` the shots use,
//  plus the tick function and a canvas replica of the game's DOM floating text.
//  The page must have loaded the promo Kit's shims.js first (fixed size, virtual clock, seeded RNG).
// =====================================================================================
import * as THREE from 'three';
import { Engine } from '../src/core/engine.js';
import { Input } from '../src/core/input.js';
import { Game } from '../src/game/game.js';
import { createEnemy } from '../src/game/enemies.js';
import { createBoss } from '../src/game/bosses.js';
import { SKILLS, FUSIONS } from '../src/game/skills/registry.js';
import { ACTS, enemyHpMult, enemyDmgMult } from '../src/game/acts.js';

const BIOME_OF_ACT = ['verge', 'cinder', 'crown'];

// fonts: the faces used for the floating-text replica ({ label, num } CSS font families)
export function createStage({ W, H, fonts = { label: 'Cinzel', num: 'Inter' } }) {
  // ------------------------------------------------------------------ game boot (no main loop)
  const engine = new Engine(document.getElementById('game'));
  const input = new Input(engine.canvas, engine.camera);
  const game = new Game(engine, input);
  window.__game = game;
  game.audio.muted = true;
  // Level-ups and relic chests would open modal cards; the shots build the loadout directly.
  game._openLevelUp = function () { this.pendingLevelUps = 0; };
  game._openChest = function () { this.pendingChests = 0; };

  // Camera: shots can offset the follow target and drive the zoom directly.
  const camOffset = new THREE.Vector3();
  const _ft = new THREE.Vector3();
  const baseFollow = engine.follow.bind(engine);
  engine.follow = (target, dt) => baseFollow(_ft.copy(target).add(camOffset), dt, 0);

  function tickGame(dt) {
    game.update(dt);
    input.endFrame();
    if (game.state === 'levelup' || game.state === 'relic') game.state = 'playing';
  }

  // ------------------------------------------------------------------ staging API for shots
  const _v = new THREE.Vector3();
  const P = {
    game, engine, THREE, SKILLS, FUSIONS, ACTS, W, H,
    camOffset,
    seed: (n) => window.__promo.seed(n),

    // Fresh god-mode run of `classId` in `act` with skills [[id, rank], ...]. Beats/boss timers off.
    stage({ classId = 'arcanist', act = 0, actTime = 60, zoom = 1, skills = [], passives = [], seed = 1 } = {}) {
      P.seed(seed);
      game.start({ classId });
      for (const e of game.enemies) e.dispose(game);
      game.enemies.length = 0;
      game.act = act; game.actTime = actTime; game.phase = 'horde'; game.state = 'playing';
      game.world.setBiome(BIOME_OF_ACT[act], true);
      game.world.reset?.();
      game.spawner.reset();
      Object.assign(game.spawner.beats, { surge: true, swarm: true, boss: true });
      game.spawner.update = () => {};             // shots place every enemy themselves
      game.fx.labelTimes?.clear?.();
      game.autoCast = true;
      const p = game.player;
      for (const [id, rank] of skills) {
        const def = SKILLS[id] ?? FUSIONS.find((f) => f.def.id === id)?.def;
        let s = p.getSkill(id) ?? p.learnSkill(def);
        while (s && s.rank < rank) { p.rankUpSkill(id); s = p.getSkill(id); }
      }
      for (const [id, rank] of passives) for (let i = 0; i < rank; i++) p.learnPassive(id);
      p.level = 18;                                 // reaction damage scales with level
      p.hp = p.stats.maxHp;
      // God mode, but Perfect Dodges still register (they need takeDamage during the dash window).
      const take = p.takeDamage.bind(p);
      p.takeDamage = (amount, source) => { if (p.dash.window > 0 && !p.dash.perfectUsed) take(amount, source); };
      p.botMove = { x: 0, z: 0 };
      camOffset.set(0, 0, 0);
      engine.zoom = engine.targetZoom = zoom; engine.camera.zoom = zoom; engine.camera.updateProjectionMatrix();
      engine.camTarget.copy(p.pos).add(camOffset);
      engine.trauma = 0;
      engine._flash.t = 0; engine._aber.t = 0;
      game.timeScale = 1; game._slowmo = 0; game._hitStop = 0;
      // The environment animates on performance.now() deltas; without this the first tick would
      // see the time since the previous shot and roll a different number of random particles.
      game.world._lastNow = performance.now();
      game.fx.labelTimes?.clear?.();
      return p;
    },

    // Spawn n enemies of `types` (picked at random) between radii r0..r1 around `c` (default: player).
    spawn(types, n, r0, r1, { c = game.player.pos, elite = false, hpMult = 1, arc = [0, Math.PI * 2] } = {}) {
      const act = game.act, t = game.actTime, def = ACTS[act];
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = arc[0] + Math.random() * (arc[1] - arc[0]);
        const r = r0 + Math.sqrt(Math.random()) * (r1 - r0);
        const pos = new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
        game.world.collide(pos, 0.5);
        const type = types[Math.floor(Math.random() * types.length)];
        const e = createEnemy(game, type, pos, {
          elite, hpMult: enemyHpMult(act, t) * hpMult, damageScale: enemyDmgMult(act, t), xpMult: def.xp, resist: def.resist, noSpawnAnim: true,
        });
        game.addEnemy(e); out.push(e);
      }
      return out;
    },

    boss(id, x, z, { hpMult = 1 } = {}) {
      const b = createBoss(game, id, new THREE.Vector3(game.player.pos.x + x, 0, game.player.pos.z + z), { hpMult, damageScale: 1, final: id === 'riftHeart' });
      game.addEnemy(b); game.boss = b;
      return b;
    },

    // Aim (and face) the nearest foe, or a fixed point.
    aim(target) {
      const p = game.player;
      const t = target ?? game.nearestEnemy(p.pos, 18);
      if (t) input.mouseGround.set(t.pos?.x ?? t.x, 0, t.pos?.z ?? t.z);
      else input.mouseGround.set(p.pos.x + p.facing.x * 4, 0, p.pos.z + p.facing.z * 4);
    },
    move(x, z) { const l = Math.hypot(x, z) || 1; game.player.botMove = x || z ? { x: x / l, z: z / l } : { x: 0, z: 0 }; },
    // Screen-relative move: sx right, sy up (camera basis).
    moveScreen(sx, sy) {
      const f = engine.forward, r = engine.right;
      P.move(r.x * sx + f.x * sy, r.z * sx + f.z * sy);
    },
    dash() { game.player.botDash = true; },

    // One simulation step on the virtual clock (for warm-ups and console probes).
    tick(dt) { window.__promo.advance(dt * 1000); tickGame(dt); },
    // Unrendered warm-up (enemies converge, projectiles fly) before a shot starts recording.
    warm(seconds, step = null) {
      const n = Math.round(seconds * 30);
      for (let i = 0; i < n; i++) { step?.(i / 30 - seconds); P.aim(); P.tick(1 / 30); }
      engine.camTarget.copy(game.player.pos).add(camOffset);
    },
    project(pos, out = { x: 0, y: 0 }) {
      _v.set(pos.x, pos.y ?? 0, pos.z).project(engine.camera);
      out.x = (_v.x * 0.5 + 0.5) * W; out.y = (-_v.y * 0.5 + 0.5) * H;
      return out;
    },
    shot: null,       // per-shot scratch state (set by the renderer)
    // Event listener that lives for the current shot only.
    on(name, fn) { P.shot.cleanup.push(game.events.on(name, fn)); },
  };
  window.P = P;

  // ------------------------------------------------------------------ overlay: the game's DOM floating text
  // fx.texts are DOM elements (invisible to a canvas capture); redraw them on the plate.
  const FT_SCALE = 1.55 * Math.min(W, H) / 1080;
  function drawFloatingTexts(g, { def }) {
    const mode = def.texts ?? 'all';
    if (mode === 'none') return;
    for (const tx of game.fx.texts) {
      const k = tx.t / tx.life;
      if (k >= 1) continue;
      const cls = tx.el.className;
      if (mode === 'light' && cls === 'ftext dmg') continue;   // keep crits + labels only
      const s = P.project({ x: tx.x, y: tx.y, z: tx.z });
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 0.5);
      const label = cls.includes('label'), big = cls.includes('big'), crit = cls.includes('crit');
      const size = (label ? (big ? 30 : 18) : crit ? 22 : 16) * FT_SCALE;
      g.save();
      g.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      g.translate(s.x, s.y); g.scale(pop, pop);
      g.font = label ? `800 ${size}px ${fonts.label}` : `800 ${size}px ${fonts.num}`;
      g.letterSpacing = label ? `${FT_SCALE}px` : '0px';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = (big || crit ? 5 : 4) * FT_SCALE; g.strokeStyle = '#120a1a';
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText(tx.el.textContent, 0, 2 * FT_SCALE);
      g.strokeText(tx.el.textContent, 0, 0);
      g.fillStyle = tx.el.style.color || '#fff';
      g.fillText(tx.el.textContent, 0, 0);
      g.restore();
    }
  }

  return { game, engine, input, P, tickGame, drawFloatingTexts };
}
