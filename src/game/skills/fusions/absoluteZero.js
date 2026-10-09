import * as THREE from 'three';
import { timed } from '../common.js';
import { aimPoint, after, pullToward, blast, freezeAll } from '../fusionCommon.js';
import { ice, frostCreep, frostMist, iceShatter, frostParticle } from '../../vfx/elements/frost.js';

// ABSOLUTE ZERO (Frost Nova + Singularity). Look: the air itself freezes. A howling snow funnel drags
// them in while rime creeps from the edge INWARD; the zone flash-freezes into glacier and throws up a
// forest of ice spikes; a violet shockwave sweeps out and shatters every spike (and the frozen foes).

const ICE_TELE = 0x9fe8ff;
const ARCANE = 0xc08cff;

const _v = new THREE.Vector3();

// ---------------------------------------------------------------- vortex (pull phase)

// The pull. Calls onDone(game) when the pull ends. Visual: funnel + inspiralling snow + inward creep.
class Vortex {
  constructor(game, c, R, o) {
    this.c = c.clone();
    this.R = R;
    this.dur = o.duration;
    this.speed = o.speed;
    this.onDone = o.onDone;
    this.t = 0;
    const vfx = game.vfx;
    const p = this.c;
    // a funnel of driven snow, wide at the ground (exact R), narrowing to ~0.22 R at 5 u
    this.funnel = vfx.shell('frostFunnel', p, { radius: R, height: -5, y: 5, life: this.dur + 0.3 });
    this.snow = vfx.emitter('frostInspiral', { pos: p, radius: R * 0.98, area: 'ring', rate: 80, y: [0.15, 1.4], life: this.dur });
    this.gust = vfx.emitter('frostSpindrift', { pos: p, radius: R * 0.95, area: 'ring', rate: 14, y: [0.1, 0.35], life: this.dur });
    this.creep = 0;
    this.decals = [];
  }

  update(dt, game) {
    this.t += dt;
    pullToward(game, this.c, this.R, this.speed * dt);
    // visual: frost creeps from the edge INWARD with the pull (three rings of rime)
    const rings = [[0, 0.8, 9, 0.32], [0.38, 0.5, 6, 0.3], [0.76, 0, 1, 0.42]];
    while (this.creep < rings.length && this.t >= rings[this.creep][0]) {
      const [, rk, n, sk] = rings[this.creep++];
      const a0 = Math.random() * 6.283;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.283;
        _v.set(this.c.x + Math.cos(a) * this.R * rk, 0, this.c.z + Math.sin(a) * this.R * rk);
        this.decals.push(frostCreep(game, _v, this.R * sk, 0.4, 3.2, { alpha: 0.3, fade: 0.8 }));
      }
    }
    if (this.t >= this.dur) {
      this.onDone(game);
      return false;
    }
    return true;
  }

  dispose() {
    this.snow.stop(); this.gust.stop();
    this.funnel.end(0.08);                    // the funnel snaps away on the freeze
    for (const d of this.decals) d.end(1.2 + Math.random() * 0.4);
  }
}

// Visual: the glacier spikes thrown up at the freeze (18-24, 1.4-2.4 u, radiating, tilted outward).
function glacierSpikes(game, c, R) {
  const sys = ice(game), out = [];
  const n = Math.round(18 + Math.min(6, R));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const rr = R * (0.22 + Math.random() * 0.68);
    const h = 1.4 + Math.random() * 1.0;
    const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
    out.push({ h: sys.sprout(x, z, { h, w: h * 0.2, tilt: 0.3 + Math.random() * 0.25, dir: { x: Math.cos(a), z: Math.sin(a) },
      delay: Math.random() * 0.05, grow: 0.1, life: 3, chips: 0, rime: 0.12, tint: [0.8, 0.9, 1] }), d: rr });
  }
  return out;
}

// Arcane pulse: shatters every frozen foe in range (Arcane on Frozen = SHATTER). Visual: a violet light
// band sweeps 0 -> R in 0.2 s over a rune flash; each ice spike cracks and shatters as it passes.
function arcanePulse(game, c, R, dmg, spikes) {
  const vfx = game.vfx;
  vfx.decal('rune', c, R, 0.5, { grow: 0.12, fade: 0.32, accent: ARCANE, hdr: 1.4 });
  const wave = vfx.shell('frostArcaneWave', c, { radius: 0.3, height: 0.6, life: 0.26 });
  timed(game, 0.2, (dt, t, k) => { wave.radius = Math.max(0.3, R * k); wave.touch(); });
  game.fx.flashDisc(c, { color: 0xe6d4ff, radius: R * 0.5, life: 0.08, hdr: 1.3 });
  if (spikes) {
    const sys = ice(game);
    for (const s of spikes) sys.breakIce(s.h, (s.d / R) * 0.2, { chips: 3, chipKind: 'frostChipV', violet: 1, star: true });
  }
  frostParticle(vfx, 'runeGlyph', c.x, 0.6, c.z, 0, 1.5, 0, 1.2);
  game.fx.light(c, ARCANE, 90, 0.35, 14);
  game.fx.shake(0.3);
  blast(game, c, R, dmg, 'arcane', 3);
}

// ---------------------------------------------------------------- ABSOLUTE ZERO

export const absoluteZero = {
  id: 'absoluteZero',
  name: 'Absolute Zero',
  icon: '✳',
  element: 'frost',
  maxRank: 3,
  range: 12,
  hint: 'Drag foes into a vortex, freeze them, then shatter the frozen with an arcane pulse.',
  desc: (rank) => [
    'At the cursor: a 1.2 s vortex drags foes in (r 6), then freezes them all. 0.3 s later an arcane pulse (40 dmg) Shatters every frozen foe.',
    '+30% damage.',
    'A second arcane pulse follows 0.5 s after the first.',
  ][rank - 1],
  cooldown: (rank) => [8, 7, 6][rank - 1],

  cast(game, ctx) {
    const r = ctx.rank;
    const area = game.player.stats.area;
    const mult = r >= 2 ? 1.3 : 1;
    const R = 6 * area;
    const c = aimPoint(ctx, 12);

    game.fx.telegraph(c, R, 1.2, { color: ICE_TELE, friendly: true });
    game.addActor(new Vortex(game, c, R, {
      duration: 1.2,
      speed: 7.5,
      onDone: (g) => {
        freezeAll(g, c, R);
        // the zone flash-freezes into glacier
        const glacier = frostCreep(g, c, R, 0.08, 1.3 + (r >= 3 ? 0.5 : 0) + 1.0, { alpha: 0.32, intensity: 1.6, fade: 0.8 });
        void glacier;
        const spikes = glacierSpikes(g, c, R);
        frostMist(g, c, R * 0.95, 10, { speed: 0.5, y: 0.25, r0: R * 0.6, scale: 1.2 });   // cold-air skirt at the rim (the frozen clump stays visible)
        iceShatter(g, c, R * 0.5, 10, { y: 0.6, starScale: 1.6 });
        g.fx.flashDisc(c, { color: 0xe8fbff, radius: R * 0.6, life: 0.08, hdr: 1.3 });
        g.fx.ring(c, { color: 0xbff4ff, radius: R, life: 0.15, width: 0.18, hdr: 1.3, occ: 0.5 });
        g.fx.light(c, ICE_TELE, 120, 0.45, 16);
        g.fx.shake(0.35);
        g.hitStop(0.05);
        after(g, 0.3, (gg) => arcanePulse(gg, c, R, 40 * mult, spikes));
        if (r >= 3) after(g, 0.8, (gg) => arcanePulse(gg, c, R, 40 * mult, null));
      },
    }));
  },
};
