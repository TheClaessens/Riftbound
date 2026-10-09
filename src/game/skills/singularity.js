import * as THREE from 'three';
import { damageArea } from './common.js';
import { arcaneKit, RING, COL, matterTint, radialEmit } from '../vfx/elements/arcane.js';

// SINGULARITY (arcane, active). A dark-violet vortex at the cursor: pulls non-boss foes toward
// its centre, ticks arcane damage, then collapses for burst damage.
//
// Look (bible 10 §4.2, "a tear in the world's fabric"): a rune circle inscribes itself clockwise
// with its outer line exactly at the pull radius; a fainter inner glyph ring marks the collapse
// radius (3·area). A painted void spiral turns on the ground; above it an event horizon with a
// thin Einstein ring sits inside a tilted accretion disc. Pebbles and torn grass clods lift from
// the ground and spiral up into the core, starlight streaks spiral in. In the last 0.5 s the inner
// ring brightens and spins up (it tells where the burst lands), everything snaps into the core,
// and on the damage frame it pops: star flare, glyphs flung out to the collapse radius, a void
// wave expanding to exactly 3·area, light + shake. The outer circle then unwrites clockwise.
const CD = [9, 8.5, 8, 7.5, 6];
const RANGE = 14;           // cast clamp
const TICK = 0.25;

const _buf = [];            // reused query buffer (queryEnemies clears it)
const _pp = { x: 0, y: 0, z: 0 };
const CORE_Y = 1.25;
const MATTER = 10;

export const singularity = {
  id: 'singularity',
  name: 'Singularity',
  icon: '◎',
  element: 'arcane',
  kind: 'active',
  maxRank: 5,
  range: RANGE,
  hint: 'Pulls the horde together — perfect setup for AoE reactions.',
  desc: (rank) => [
    'Open a vortex at the cursor that pulls foes to its centre (4 arcane damage every 0.25s), then collapses for 30 damage.',
    '+20% radius.',
    'Vortex lasts 3.5s.',
    'Collapse deals double damage (60).',
    'Cooldown drops to 6s.',
  ][rank - 1],
  cooldown: (rank) => CD[rank - 1],

  // ctx: { rank, origin, dir, target, player }
  cast(game, ctx) {
    const target = clampTarget(ctx.origin, ctx.target, RANGE);
    game.addActor(new Vortex(game, target, ctx.rank));
  },
};

class Vortex {
  constructor(game, pos, rank) {
    const area = game.player.stats.area;
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.radius = 5 * area * (rank >= 2 ? 1.2 : 1);
    this.life = rank >= 3 ? 3.5 : 2.5;
    this.collapseDmg = rank >= 4 ? 60 : 30;
    this.collapseR = 3 * area;
    this.t = 0;
    this.tickAcc = 0;
    this.sparkAcc = 0;

    // ---- visuals (arcane kit records; no meshes of our own)
    const K = this.K = arcaneKit(game);
    const x = this.pos.x, z = this.pos.z, R = this.radius;
    this.rank = rank;
    this.outer = K.ring(RING.rune, x, z, R, Infinity, { write: 0.35, spin: 0.3, back: 0.5, hdr: 1.45 });
    this.inner = K.ring(RING.rune, x, z, this.collapseR, Infinity, { write: 0.35, spin: -0.5, back: 0.35, hdr: 1.5,
      alpha: 0.3, style: rank >= 4 ? 2 : 1 });
    this.swirl = K.ring(RING.swirl, x, z, R * 0.97, Infinity, { spin: -1.2, back: 0.36, hdr: 1.2, fadeIn: 0.35, quad: R });
    this.disc = K.ring(RING.accretion, x, z, 1.6, Infinity, { air: true, y: CORE_Y, tilt: 0.26, spin: -4, hdr: 1.6, fadeIn: 0.3, quad: 1.6 });
    this.tint = matterTint(game);
    this.matter = [];
    for (let i = 0; i < MATTER; i++) this.matter.push(this._newMatter(-i * 0.16));
    _pp.x = x; _pp.y = 0.4; _pp.z = z;
    game.vfx.emit('arcaneVoidPuff', _pp, { count: 3, scale: 1.2 });
  }

  _newMatter(t0, m = {}) {
    const R = this.radius;
    const kind = Math.random() < 0.45 ? 1 : 0;
    m.kind = kind; m.t = t0; m.L = 1.3 + Math.random() * 0.7;
    m.r0 = R * (0.25 + 0.7 * Math.sqrt(Math.random())); m.a = Math.random() * 6.283;
    m.s = kind ? 0.11 + Math.random() * 0.06 : 0.09 + Math.random() * 0.1;
    m.rx = Math.random() * 6; m.ry = Math.random() * 6; m.w = (Math.random() - 0.5) * 8;
    m.col = kind ? this.tint[2] : this.tint[0];
    m.kicked = false;
    return m;
  }

  update(dt, game) {
    this.t += dt;

    // Pull non-boss, non-inert foes toward the centre: slow at the centre, up to 7 u/s at the rim.
    const cx = this.pos.x;
    const cz = this.pos.z;
    for (const e of game.queryEnemies(this.pos, this.radius, _buf)) {
      if (e.dead || e.inert || e.boss) continue;
      const dx = cx - e.pos.x;
      const dz = cz - e.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1e-4) continue;
      const f = Math.min(1, d / this.radius);
      const speed = 7 * (0.25 + 0.75 * f);
      const step = Math.min(d, speed * dt);
      e.pos.x += (dx / d) * step;
      e.pos.z += (dz / d) * step;
    }

    // Arcane damage every 0.25 s.
    this.tickAcc += dt;
    if (this.tickAcc >= TICK) {
      this.tickAcc -= TICK;
      damageArea(game, this.pos, this.radius, 4, { element: 'arcane' });
    }

    this._visuals(game, dt);

    if (this.t >= this.life) {
      this.collapse(game);
      return false;
    }
    return true;
  }

  _visuals(game, dt) {
    const K = this.K, t = this.t, L = this.life;
    const cx = this.pos.x, cz = this.pos.z, R = this.radius;
    const grow = Math.min(1, t / 0.35);
    const pre = Math.max(0, Math.min(1, (t - (L - 0.5)) / 0.38));     // collapse anticipation
    const snap = Math.max(0, Math.min(1, (t - (L - 0.12)) / 0.12));   // everything into the core
    // inner (collapse) ring: alpha 0.3 -> 1 and spin-up in the last 0.5 s
    const inn = this.inner;
    inn.alpha = 0.3 + 0.7 * pre;
    inn.spin = -0.5 - 4.5 * pre * pre;
    inn.hdr = 1.5 + 0.6 * pre;
    // accretion disc spins up and shrinks into the core on the snap
    const d = this.disc;
    d.spin = -4 - 6 * pre;
    d.quad = d.R = 1.6 * (0.35 + 0.65 * grow) * (1 - 0.85 * snap);
    // event horizon + Einstein ring
    const hs = (0.5 + 0.5 * grow) * (1 + 0.15 * pre - 0.35 * snap);
    K.horizon(cx, CORE_Y, cz, 1.27 * hs, 1 + pre, 1);
    // starlight streaks spiralling in (36/s), budgeted
    this.sparkAcc += dt * 36 * K.budget() * (1 - snap);
    while (this.sparkAcc >= 1) {
      this.sparkAcc -= 1;
      _pp.x = cx; _pp.y = 0.3 + Math.random() * 1.2; _pp.z = cz;
      game.vfx.emit('arcaneInspiral', _pp, { count: 1, radius: R });
    }
    // torn ground matter spiralling up and in
    const tier = K.tier();
    for (const m of this.matter) {
      m.t += dt;
      if (m.t < 0) continue;
      let k = m.t / m.L + snap;
      if (k >= 1) {
        if (t < L - 0.6 && tier < 2) this._newMatter(0, m);
        else m.t = -99;
        continue;
      }
      if (!m.kicked) {
        m.kicked = true;
        _pp.x = cx + Math.cos(m.a) * m.r0; _pp.y = 0; _pp.z = cz + Math.sin(m.a) * m.r0;
        if (tier === 0) game.vfx.debris('dirt', _pp, 1, { speed: 0.35 });
      }
      const e = k * k * (3 - 2 * k);
      const r = m.r0 * Math.pow(1 - k, 1.3);
      m.a += dt * (1.1 + 4 * k * k);
      m.rx += dt * m.w; m.ry += dt * m.w * 0.7;
      const lift = Math.min(1, m.t / 0.12);
      const sc = m.s * (0.6 + 0.4 * lift) * (1 - Math.max(0, (k - 0.72) / 0.28));
      K.matter(m.kind, cx + Math.cos(m.a) * r, 0.06 + (CORE_Y - 0.06) * e + 0.15 * Math.sin(k * Math.PI), cz + Math.sin(m.a) * r, sc, m.rx, m.ry, 0, m.col);
    }
  }

  collapse(game) {
    const p = this.pos;
    const r = this.collapseR;
    damageArea(game, p, r, this.collapseDmg, { element: 'arcane' });
    // ---- the pop (on the damage frame)
    const K = this.K, big = this.rank >= 4 ? 1.4 : 1;
    K.timed('flare', p.x, CORE_Y, p.z, 2.4 * big, 0.2, { color: COL.hi, hdr: 2.0, core: 1.2 });
    K.timed('rays', p.x, CORE_Y, p.z, 3.6 * big, 0.2, { color: COL.body, hdr: 1.8 });
    K.ring(RING.wave, p.x, p.z, r, 0.3, { hdr: 1.8, fadeOut: 0.12, quad: r + 0.3, onTick: (w) => { w.p1 = Math.min(1, w.t / 0.18); } });
    _pp.x = p.x; _pp.y = 0.7; _pp.z = p.z;
    radialEmit(game, 'arcaneGlyphFly', _pp, 12, r * 8.2, { scale: big });
    _pp.y = 0.8;
    radialEmit(game, 'arcaneSpark', _pp, 16, 1.6);
    game.vfx.emit('arcaneVoidPuff', _pp, { count: 4, scale: 1.4 });
    game.vfx.debris('arcaneShard', _pp, Math.round(8 * big));
    game.fx.light(p, 0xb67cff, 50, 0.3);
    game.fx.shake(0.15);
    // ---- residue: the outer circle unwrites clockwise, the swirl fades; the core is gone
    K.unwriteRing(this.outer, 0.45);
    this.inner.life = this.inner.t;
    this.disc.life = this.disc.t;
    this.swirl.fadeOut = 0.45; this.swirl.life = this.swirl.t + 0.45;
  }

  dispose() {
    // the kit records retire themselves (collapse sets their lives); guard an early removal
    // (Rift Shift / clear) so nothing lingers
    if (this.t < this.life) {
      for (const rec of [this.outer, this.inner, this.disc, this.swirl]) if (rec.alive) rec.life = Math.min(rec.life, rec.t + 0.2);
    }
  }
}

// Target point on the ground, clamped to `maxRange` from origin.
function clampTarget(origin, target, maxRange) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d <= maxRange || d < 1e-6) return new THREE.Vector3(target.x, 0, target.z);
  const s = maxRange / d;
  return new THREE.Vector3(origin.x + dx * s, 0, origin.z + dz * s);
}
