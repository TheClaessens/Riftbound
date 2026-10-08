import * as THREE from 'three';
import { createEnemy } from './enemies.js';
import { createBoss } from './bosses.js';
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
const BUSY_BOSS_MULT = 0.35;  // horde spawn rate while a boss lives
const WARDS = ['fire', 'frost', 'storm', 'arcane'];
const BOSS_SUB = {
  hollowWarden: 'The old king of the Thornwood wakes.',
  vashkar: 'The Warchief answers the war horns. Fire will not hurt him much.',
  riftHeart: 'Its scales drink the elements. Strike with what it is not wearing.',
};

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

    game.events.on('enemyKilled', (e) => this._onEnemyKilled(e?.enemy));
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

    const bossAlive = !!g.boss && !g.boss.dead;
    this.budget += spawnRate(act, t) * dt * (bossAlive ? BUSY_BOSS_MULT : 1);

    let live = g.liveEnemyCount();
    if (live >= ENEMY_CAP) {
      this.budget = Math.min(this.budget, 4);
      return;
    }

    // Spend the budget in clusters of 2-5 that share one spawn point.
    while (this.budget >= 2 && live < ENEMY_CAP) {
      const size = Math.min(Math.floor(this.budget), 2 + Math.floor(Math.random() * 4));
      this.budget -= size;
      const center = g.world.randomSpawnPoint(g.player.pos, 24, 32);
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
    g.events.emit('announce', { text: 'ELITE SURGE', sub: 'Slay the Relic Bearer', color: '#ffc340' });
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
    g.events.emit('announce', { text: 'SWARM', sub: 'They come from all sides', color: '#ff9d3d' });
  }

  _spawnBoss(act) {
    const g = this.game;
    const def = ACTS[act];
    const final = act === ACTS.length - 1;
    const pos = g.world.randomSpawnPoint(g.player.pos, 14, 18);
    const boss = createBoss(g, def.boss, pos, {
      hpMult: 1 + 0.3 * g.tier,
      damageScale: def.dmg * (1 + 0.12 * g.tier),
      final,
    });
    g.addEnemy(boss);
    g.boss = boss;
    g.events.emit('bossSpawned', { enemy: boss, final });
    g.events.emit('announce', {
      text: def.bossName.toUpperCase(),
      sub: final ? 'Shatter the Heart to seal the Rift' : BOSS_SUB[def.boss],
      color: final ? '#ff4d5e' : def.color,
    });
  }

  _onEnemyKilled(enemy) {
    if (!enemy || !enemy.boss) return;
    const g = this.game;
    g.boss = null;
    g.events.emit('bossKilled', { enemy, final: !!enemy.final });
    // The final boss ends the run; the game shows victory instead.
    if (!enemy.final) g.events.emit('announce', { text: `${enemy.name.toUpperCase()} FALLS`, color: '#ffc340' });
  }
}
