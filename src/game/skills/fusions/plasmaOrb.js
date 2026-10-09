import * as THREE from 'three';
import { damageEnemy } from '../../combat.js';
import { stormBolt, groundOut, groundArcs, Strand, chestY, STORM } from '../../vfx/elements/storm.js';

// Look (bible 10 §4.3, "a contained miniature sun"): an opaque toon fire core inside a crackling
// storm cage (two noise-shell domes = a sphere), three great-circle wires spinning on different axes,
// and four feeler tendrils that keep reaching out EXACTLY to the zap radius (4.5 × area) and fizzling:
// the tendril reach is the radius, no circle is drawn. A zap locks a full forked bolt onto the foe.
// Detonation (Overload language): fire billow + blast dome, ground arcs crawling out to exactly r,
// a scorch with lemon fulgurite cracks, a soot plume and a dust shock.

const _v = new THREE.Vector3();
const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = { x: 0, y: 0, z: 0 };
const WIRE_AXES = [[1, 0.3, 0], [0.2, 1, 0.5], [-0.4, 0.2, 1]];

export const plasmaOrb = {
  id: 'plasmaOrb',
  name: 'Plasma Orb',
  icon: '◍',
  element: 'storm',
  maxRank: 3,
  range: 14,
  hint: 'Slow orb zaps enemies and detonates, overloading all of them.',
  desc: (rank) => [
    'Send a pulsing orb that zaps up to 3 nearby enemies, then detonates.',
    'Zaps up to 5 enemies instead of 3.',
    'Larger detonation radius.',
  ][rank - 1],
  cooldown: (rank) => [2.6, 2.3, 2.0][rank - 1],

  cast(game, ctx) {
    const r = ctx.rank;
    const target = ctx.target.clone();
    target.y = 0.9;

    const orbActor = {
      pos: Object.assign(ctx.origin.clone(), { y: 0.9 }),
      target: target,
      travelled: 0,
      maxDist: 14,
      speed: 5,
      alive: true,
      lastZap: 0,
      age: 0,
      parts: null,

      init() {
        const vfx = game.vfx;
        const P = this.pos;
        this.parts = {
          coreT: vfx.shell('stormPlasmaCore', P, { radius: 0.3, height: 0.3, life: 30, follow: true }),
          coreB: vfx.shell('stormPlasmaCore', P, { radius: 0.3, height: -0.3, life: 30, follow: true }),
          cageT: vfx.shell('stormCage', P, { radius: 0.56, height: 0.56, life: 30, follow: true }),
          cageB: vfx.shell('stormCage', P, { radius: 0.56, height: -0.56, life: 30, follow: true }),
          wires: WIRE_AXES.map(() => new Strand(game, { width: 0.05, hdr: 1.7, color: STORM.body, alpha: 0.85 })),
          tendrils: [0, 1, 2, 3].map((i) => ({ st: new Strand(game, { width: 0.12, hdr: 1.5, color: STORM.body, alpha: 0.6 }), a: i * 1.57 + Math.random(), t: Math.random() * 0.2, dur: 0.2 })),
        };
        vfx.emit('stormFlash', P, { scale: 0.9 });
      },

      // visual only: per-frame body, wires, feelers
      _visual(g, dt) {
        const vfx = g.vfx, P = this.pos, parts = this.parts;
        this.age += dt;
        for (const k of ['coreT', 'coreB', 'cageT', 'cageB']) if (!parts[k].alive) {
          const core = k.startsWith('core'), rad = core ? 0.3 : 0.56;
          parts[k] = vfx.shell(core ? 'stormPlasmaCore' : 'stormCage', P, { radius: rad, height: k.endsWith('B') ? -rad : rad, life: 30, follow: true });
        }
        const pulse = 1 + Math.sin(g.time * 8) * 0.12;
        vfx.emit('stormPlasma', P, { scale: 0.42 * pulse });
        // three great-circle wires spinning on different axes
        for (let w = 0; w < 3; w++) {
          const ax = WIRE_AXES[w];
          _ax.set(ax[0], ax[1], ax[2]).normalize();
          _u.set(-_ax.y, _ax.x, 0.3).cross(_ax).normalize();
          _w.crossVectors(_ax, _u);
          _q.setFromAxisAngle(_ax, this.age * (3 + w * 1.7));
          _u.applyQuaternion(_q); _w.applyQuaternion(_q);
          const pts = parts.wires[w].begin(13);
          const R = 0.6 * pulse;
          for (let i = 0; i < 13; i++) {
            const th = (i / 12) * Math.PI * 2;
            const j = 1 + (Math.random() - 0.5) * 0.12;
            pts[i * 3] = P.x + (Math.cos(th) * _u.x + Math.sin(th) * _w.x) * R * j;
            pts[i * 3 + 1] = P.y + (Math.cos(th) * _u.y + Math.sin(th) * _w.y) * R * j;
            pts[i * 3 + 2] = P.z + (Math.cos(th) * _u.z + Math.sin(th) * _w.z) * R * j;
          }
        }
        // feeler tendrils: reach out to exactly the zap radius, fizzle, pick a new heading
        const reach = 4.5 * g.player.stats.area;
        for (const f of parts.tendrils) {
          f.t += dt;
          if (f.t >= f.dur) {
            f.t = 0; f.dur = 0.16 + Math.random() * 0.14; f.a += 1.2 + Math.random() * 2.5;
            _p.x = P.x + Math.cos(f.a) * reach; _p.y = 0.12; _p.z = P.z + Math.sin(f.a) * reach;
            vfx.emit('stormSpark', _p, { count: 1, speed: 0.4 });
          }
          const k = Math.min(1, f.t / (f.dur * 0.55));
          const L = reach * (1 - (1 - k) * (1 - k));
          _v.set(P.x + Math.cos(f.a) * L, 0.9 - 0.75 * k, P.z + Math.sin(f.a) * L);
          f.st.jagged(6, P, _v, 0.16 + 0.05 * L, 0.05);
          if (k >= 1) { _p.x = _v.x; _p.y = 0.12; _p.z = _v.z; vfx.emit('stormGroundArc', _p, { scale: 0.7 }); }
        }
        if (Math.random() < 0.4) vfx.emit('stormArc', P, { scale: 1.2 });
      },

      update(dt, g) {
        if (!this.alive) return false;

        // Move toward target
        const dir = new THREE.Vector3(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
        const dist = dir.length();
        if (dist > 1e-6) dir.multiplyScalar(1 / dist);
        const step = this.speed * dt;
        this.pos.addScaledVector(dir, step);
        this.travelled += step;

        this._visual(g, dt);

        // Zap nearby enemies every 0.25s
        this.lastZap += dt;
        if (this.lastZap >= 0.25) {
          this.lastZap = 0;
          const zapCount = r >= 2 ? 5 : 3;
          const targets = g.queryEnemies(this.pos, 4.5 * g.player.stats.area, []).slice(0, zapCount);
          for (const e of targets) {
            _v.set(e.pos.x, chestY(e), e.pos.z);
            stormBolt(g, this.pos, _v, { width: 0.3, hdr: 1.8, life: 0.15, ground: true, twigs: 1, jag: 0.4 });
            groundOut(g, e.pos, { sparks: 3, glints: 2, fleck: 0, dust: 0, scale: 0.8 });
            damageEnemy(g, e, 10, { element: 'storm' });
          }
        }

        // Finish when travelled far enough or reached target
        if (this.travelled >= this.maxDist || (new THREE.Vector3(this.target.x - this.pos.x, 0, this.target.z - this.pos.z).length() < 0.5)) {
          this.alive = false;
          this._detonate(g);
          return false;
        }
        return true;
      },

      _detonate(g) {
        const r2 = (r >= 3 ? 4.5 : 3.5) * g.player.stats.area;
        const vfx = g.vfx, P = this.pos;
        const c = { x: P.x, y: 0, z: P.z };
        // white-gold flash (≤ 0.6 r, 0.08 s) + the contained sun bursts as a toon fire billow
        g.fx.flashDisc(c, { color: 0xffd25a, radius: r2 * 0.5, life: 0.08, hdr: 1.3 });
        vfx.emit('stormFlash', { x: P.x, y: 1.0, z: P.z }, { scale: 1.8 });
        vfx.shell('blastDome', c, { radius: r2 * 0.6, height: r2 * 0.42, life: 0.3 });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * 6.283 + Math.random() * 0.5;
          _p.x = P.x + Math.cos(a) * r2 * 0.35; _p.y = 0.7; _p.z = P.z + Math.sin(a) * r2 * 0.35;
          vfx.emit('fireball', _p, { count: 1, scale: 0.6 + r2 * 0.08, vel: { x: Math.cos(a) * r2 * 1.2, y: 0.6, z: Math.sin(a) * r2 * 1.2 } });
        }
        // lightning crawling along the ground out to exactly the blast radius
        groundArcs(g, c, r2, 7, { width: 0.3, life: 0.22, stagger: 0.012 });
        vfx.decal('scorch', c, r2 * 0.9, 2.4, { grow: 0.08, fade: 1.0, alpha: 0.5, accent: STORM.body, hdr: 2.2, extra: 1.6 });
        _p.x = P.x; _p.y = 0.8; _p.z = P.z;
        vfx.emit('stormSoot', _p, { count: 7, scale: 1.1 });
        vfx.emit('stormSpark', _p, { count: 14, speed: 1.4 });
        vfx.debris('stormSparkChip', c, 8);
        vfx.debris('dirt', c, 6);
        g.fx.ring(c, { color: 0x8a7a62, radius: r2, life: 0.2, width: 0.25, blend: 'dark' });   // dust shock to r
        g.fx.light(P, 0xff8a2a, 60, 0.35);
        g.fx.shake(0.25);

        // Deal fire damage, which triggers overload on shocked enemies
        const enemies = g.queryEnemies(this.pos, r2, []).slice();
        for (const e of enemies) {
          damageEnemy(g, e, 40, { element: 'fire' });
        }
      },

      dispose(g) {
        const parts = this.parts;
        if (!parts) return;
        for (const k of ['coreT', 'coreB', 'cageT', 'cageB']) parts[k].end(0.06);
        for (const w of parts.wires) w.end();
        for (const f of parts.tendrils) f.st.end();
        this.parts = null;
      },
    };

    orbActor.init();
    game.addActor(orbActor);
  },
};
