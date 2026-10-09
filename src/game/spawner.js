import * as THREE from 'three';
import { createEnemy } from './enemies.js';
import { ACTS, ACT_LENGTH, enemyHpMult, enemyDmgMult, spawnRate } from './acts.js';
import { randRange, GEO, glowMaterial } from '../core/utils.js';

const BEARER_MAT = glowMaterial(0xffc340, 3.5);

// =====================================================================================
//  Spawner: act-aware horde spawning (DESIGN §3 and §9), the per-act beats
//  (Elite Surge, Swarm, Boss) and boss bookkeeping. Events are subscribed ONCE in the
//  constructor, since the Spawner lives for the whole session.
// =====================================================================================

const ENEMY_CAP = 320;
const SURGE_AT = 90;          // Elite Surge
const SURGE_COUNT = 3;
const SWARM_AT = 135;         // Swarm ring
const SWARM_COUNT = 24;
const SWARM_RADIUS = 22;
const ELITE_AFTER = 45;       // elites roll only after this many seconds of an act
const ELITE_CHANCE = 0.01;      // per spawn, after ELITE_AFTER
const WARDS = ['fire', 'frost', 'storm', 'arcane'];

// Beat schedule for the HUD act timeline (seconds into the act; the boss arrives at ACT_LENGTH).
export const BEATS = [
  { id: 'surge', at: SURGE_AT, name: 'Elite Surge' },
  { id: 'swarm', at: SWARM_AT, name: 'Swarm' },
];

function freshBeats() {
  return { surge: false, swarm: false, boss: false };
}

// Weighted pick from a roster, only entries unlocked at time t (and not `exclude`).
function pickFromRoster(roster, t, exclude = null) {
  let total = 0;
  for (const r of roster) if (r.from <= t && r.type !== exclude) total += r.w;
  if (total <= 0) return null;
  let x = Math.random() * total;
  let last = null;
  for (const r of roster) {
    if (r.from > t || r.type === exclude) continue;
    last = r.type;
    x -= r.w;
    if (x < 0) return r.type;
  }
  return last;
}

export class Spawner {
  constructor(game) {
    this.game = game;
    this.budget = 0;
    this.beats = freshBeats();

  }

  reset() {
    this.budget = 0;
    this.beats = freshBeats();
  }

  // Called by game on each act start after the first (act 0 is covered by reset()).
  onActStart(act) {
    this.reset();
  }

  update(dt) {
    const g = this.game;
    const act = g.act;
    const t = g.actTime;
    const def = ACTS[act];
    if (!def) return;

    this._updateBeats(act, t);

    // Boss encounters are isolated (design/RAID.md): no horde while one runs.
    if (g.encounter?.active || g.phase !== 'horde') { this.budget = 0; return; }
    this.budget += spawnRate(act, t) * dt;

    let live = g.liveEnemyCount();
    if (live >= ENEMY_CAP) {
      this.budget = Math.min(this.budget, 4);
      return;
    }

    // Spend the budget in clusters of 2-5 that share one spawn point.
    while (this.budget >= 2 && live < ENEMY_CAP) {
      const size = Math.min(Math.floor(this.budget), 2 + Math.floor(Math.random() * 4));
      this.budget -= size;
      // Rift Pull: while an obelisk is being channelled, packs converge on it (obelisks.js)
      const pull = g.obelisks?.pullCenter?.();
      const center = pull ? g.world.randomSpawnPoint(pull, 14, 20) : g.world.randomSpawnPoint(g.player.pos, 24, 32);
      for (let i = 0; i < size && live < ENEMY_CAP; i++) {
        const type = pickFromRoster(def.roster, t);
        if (!type) break;
        const p = new THREE.Vector3(center.x + randRange(-1.2, 1.2), 0, center.z + randRange(-1.2, 1.2));
        const elite = t > ELITE_AFTER && Math.random() < ELITE_CHANCE;
        g.addEnemy(createEnemy(g, type, p, this._opts(act, t, type, elite)));
        live++;
      }
    }
  }

  // The Rift Answer (obelisks.js): `n` foes in clusters of 3-4 on a ring rMin..rMax around `pos`. Returns how many spawned.
  spawnAround(pos, n, rMin = 11, rMax = 15) {
    const g = this.game, act = g.act, t = g.actTime, def = ACTS[act];
    if (!def) return 0;
    let live = g.liveEnemyCount(), made = 0;
    const base = Math.random() * Math.PI * 2, groups = Math.max(1, Math.ceil(n / 3.5));
    for (let k = 0; k < groups && made < n; k++) {
      const a = base + (k / groups) * Math.PI * 2 + randRange(-0.25, 0.25);
      const d = randRange(rMin, rMax);
      const c = g.world.randomSpawnPoint(new THREE.Vector3(pos.x + Math.cos(a) * d, 0, pos.z + Math.sin(a) * d), 0, 2);
      const size = Math.min(n - made, Math.ceil((n - made) / (groups - k)));
      for (let i = 0; i < size && live < ENEMY_CAP; i++) {
        const type = pickFromRoster(def.roster, t);
        if (!type) break;
        const p = new THREE.Vector3(c.x + randRange(-1.2, 1.2), 0, c.z + randRange(-1.2, 1.2));
        g.addEnemy(createEnemy(g, type, p, this._opts(act, t, type, false)));
        g.fx.burst(p, { color: 0xe0c4ff, count: 4, speed: 2.5, life: 0.5, size: 0.35, up: 1.5 });
        live++; made++;
      }
    }
    return made;
  }

  // Per-spawn options shared by horde, surge and swarm.
  _opts(act, t, typeId, elite) {
    const g = this.game;
    const def = ACTS[act];
    // Act III only (wardChance > 0): every elite, and 12% of non-swarmer spawns, get a Prism Ward.
    const warded = def.wardChance > 0 && (elite || (typeId !== def.swarmer && Math.random() < def.wardChance));
    return {
      elite,
      hpMult: enemyHpMult(act, t, g.tier),
      damageScale: enemyDmgMult(act, t, g.tier),
      xpMult: def.xp,
      resist: def.resist,
      ward: warded ? WARDS[Math.floor(Math.random() * WARDS.length)] : null,
    };
  }

  _updateBeats(act, t) {
    const b = this.beats;
    if (this.game.phase !== 'horde') return;   // a Hasted boss skips the remaining beats
    if (this.game.obelisks?.summoning) return; // ...including during Haste's 3 s warning
    if (!b.surge && t >= SURGE_AT) {
      b.surge = true;
      this._eliteSurge(act, t);
    }
    if (!b.swarm && t >= SWARM_AT) {
      b.swarm = true;
      this._swarm(act, t);
    }
    if (!b.boss && t >= ACT_LENGTH) {
      b.boss = true;
      this._spawnBoss(act);
    }
  }

  // Three elites from the non-swarmer roster, placed near the player. Each drops a Relic Chest.
  _eliteSurge(act, t) {
    const g = this.game;
    const def = ACTS[act];
    for (let i = 0; i < SURGE_COUNT; i++) {
      const type = pickFromRoster(def.roster, t, def.swarmer);
      if (!type) continue;
      const p = g.world.randomSpawnPoint(g.player.pos, 12, 16);
      const e = createEnemy(g, type, p, this._opts(act, t, type, true));
      // The first elite is the Relic Bearer (bigger, gold-lit); the others only drop XP.
      e.dropsChest = i === 0;
      if (i === 0) {
        e.visScale *= 1.2; e.radius *= 1.1; e.maxHp *= 1.5; e.hp = e.maxHp;
        const crown = new THREE.Mesh(GEO.octa, BEARER_MAT); // floating gold relic marker
        crown.scale.set(0.22, 0.34, 0.22); crown.position.y = e.topY * e.visScale + 0.7; e.mesh.add(crown);
      }
      g.addEnemy(e);
    }
    g.events.emit('announce', { kind: 'surge', text: 'ELITE SURGE', sub: 'Slay the Relic Bearer', color: '#ffc340' });
  }

  // A ring of swarmers around the player.
  _swarm(act, t) {
    const g = this.game;
    const def = ACTS[act];
    const c = g.player.pos;
    for (let i = 0; i < SWARM_COUNT; i++) {
      if (g.liveEnemyCount() >= ENEMY_CAP) break;
      const a = (Math.PI * 2 * i) / SWARM_COUNT;
      const p = new THREE.Vector3(c.x + Math.cos(a) * SWARM_RADIUS, 0, c.z + Math.sin(a) * SWARM_RADIUS);
      g.world.collide(p, 0.5);
      g.addEnemy(createEnemy(g, def.swarmer, p, this._opts(act, t, def.swarmer, false)));
    }
    g.events.emit('announce', { kind: 'swarm', text: 'SWARM', sub: 'They come from all sides', color: '#ff9d3d' });
  }

  // The 3:00 timer: hand over to the encounter director (encounter.js).
  _spawnBoss(act) {
    this.game.encounter.summon('timer');
  }
}
