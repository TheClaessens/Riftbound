import * as THREE from 'three';
import { arcaneKit, convergePop, COL, starTrail, radialEmit, RING } from '../elements/arcane.js';

// =====================================================================================
//  ARCANE hero visuals (owned by the arcane VFX implementer; design/VFX.md, bible 10 §4.5–4.6, bible 09 §5).
//  Phase Step, Resonance (Chain halo), Perfect Dodge + Adrenaline, Arcanist idle FX, arcane cast flashes.
//  Visual only: never deal damage or change gameplay state.
// =====================================================================================
const _v = new THREE.Vector3();
const _pp = { x: 0, y: 0, z: 0 };
const _q = { x: 0, y: 0, z: 0 };

// ---------------------------------------------------------------- Phase Step (blink)
// instant blink 5.5 u; `from` = departure, player.pos = arrival; arrival burst r 2 × area.
// Depart: motes implode onto the origin, a glyph seal stays on the ground and unwrites (0.4 s).
// Path: a one-frame starlight strip, then 6 star points that twinkle out (a constellation).
// Arrive: converge-pop; a rune circle at exactly r flashes and unwrites (0.3 s); sparks; dust shock to r.
export function dashStart(game, player, from) {
  const vfx = game.vfx, K = arcaneKit(game);
  const to = player.pos;
  const R = 2 * player.stats.area;
  game.fx.burst(from, { color: player.cls.hex, count: 7, speed: 4, life: 0.35, size: 0.35, up: 0.8 });
  // depart
  _pp.x = from.x; _pp.y = 1.0; _pp.z = from.z;
  vfx.emit('arcaneConverge', _pp, { count: 12, radius: 1.2 });
  _pp.y = 0.5;
  vfx.emit('arcaneVoidPuff', _pp, { count: 2, scale: 0.8 });
  K.ring(RING.seal, from.x, from.z, 0.8, 0.55, { write: 0.06, back: 0.45, hdr: 1.6, spin: 1.8, alpha: 1,
    onTick: (r) => { if (r.t > 0.12) K.unwriteRing(r, 0.4); } });
  // path
  K.timed('line', from.x, 1.0, from.z, 0, 0.08, { bx: to.x, by: 1.0, bz: to.z, width: 0.13, color: COL.hi, hdr: 1.9, core: 1 });
  _pp.x = from.x; _pp.y = 1.0; _pp.z = from.z; _q.x = to.x; _q.y = 1.0; _q.z = to.z;
  starTrail(game, _pp, _q, 6, { scale: 2.4 });
  // arrive
  _pp.x = to.x; _pp.y = 1.0; _pp.z = to.z;
  convergePop(game, _pp, 1.4, { sparks: 0 });
  K.ring(RING.rune, to.x, to.z, R, 0.42, { write: 0.07, spin: 1.4, hdr: 1.9, back: 0.45, style: 1,
    onTick: (r) => { if (r.t > 0.11) K.unwriteRing(r, 0.3); } });
  _pp.y = 0.55;
  radialEmit(game, 'arcaneSpark', _pp, 10, 1.25);
  _pp.y = 0.25;
  vfx.emit('dustRing', _pp, { count: 10, scale: 0.55, speed: R / 2.1 });
}
export function dashTrail() {}
export function dashHit() {}

// ---------------------------------------------------------------- Perfect Dodge (mint #9dffb0)
// A camera-facing parry read: mint-white star flash at the chest, 12 radial speed rays, class-colour
// sparks and 3 mint afterimages along the dash path. Slow-mo / hit-stop are gameplay (player.js);
// the rig flashes its accent mint (heroes/index.js, H.perfect).
export function perfectDodge(game, player) {
  const K = arcaneKit(game), p = player.pos;
  K.timed('flare', p.x, 1.1, p.z, 1.4, 0.16, { color: COL.mint, hdr: 1.5, core: 0.6 });
  K.timed('rays', p.x, 1.0, p.z, 4.4, 0.24, { color: COL.mint, hdr: 1.5 });
  _pp.x = p.x; _pp.y = 1.0; _pp.z = p.z;
  game.fx.burst(_pp, { color: player.cls.hex, count: 6, speed: 6, life: 0.35, size: 0.3, up: 0.6 });
  game.vfx.emit('arcaneSparkMint', _pp, { count: 6 });
  const d = player.dash?.dir;
  if (d) {
    const A = [0.4, 0.25, 0.12];
    for (let i = 0; i < 3; i++) {
      const k = 0.75 * (i + 1);
      K.timed('ghost', p.x - d.x * k, 0.95, p.z - d.z * k, 0.85, 0.32, { color: COL.mint, alpha: A[i] });
    }
  }
}

// ---------------------------------------------------------------- every frame, any class
const ST = new WeakMap();
function state(player) {
  let s = ST.get(player);
  if (!s) {
    s = { adren: false, moteAcc: 0, halo: [], haloN: 0, haloA: 0, twAcc: 0, tomeT: 0.6, wandT: 0.3 };
    for (let i = 0; i < 6; i++) s.halo.push({ born: -1, seed: Math.random() * 40 });
    ST.set(player, s);
  }
  return s;
}

// Adrenaline mint motes (any class) + the Arcanist's Resonance halo (Chain).
export function anyClass(game, player, dt) {
  if (!game.vfx) return;
  const s = state(player);
  const on = player.hasBuff('adrenaline');
  const p = player.pos;
  if (on) {
    s.moteAcc += dt * 4;
    while (s.moteAcc >= 1) {
      s.moteAcc -= 1;
      const a = Math.random() * 6.283;
      _pp.x = p.x + Math.cos(a) * 0.38; _pp.y = 0.35 + Math.random() * 1.1; _pp.z = p.z + Math.sin(a) * 0.38;
      game.vfx.emit('arcaneMintMote', _pp, { count: 1 });
    }
  } else if (s.adren) {
    // the buff ended: a small fizz
    _pp.x = p.x; _pp.y = 1.0; _pp.z = p.z;
    game.vfx.emit('arcaneSparkMint', _pp, { count: 5, scale: 0.7, speed: 0.5 });
    game.vfx.emit('arcaneMintMote', _pp, { count: 4 });
  }
  s.adren = on;
  if (player.classId === 'arcanist') resonance(game, player, dt, s);
}

// Resonance: glyph halo at the waist. Chain >= 5: 1 glyph, >= 10: 3, 25: a full ring of 6 + starlight.
// It orbits outside the rig's 3 glyph-stars (r 0.52) and counter-rotates; on chainEnd the glyphs drop
// and unwrite (0.4 s).
const HALO_R = 0.88, HALO_Y = 0.92;
function resonance(game, player, dt, s) {
  const chain = game.chain ?? 0;
  const n = chain >= 25 ? 6 : chain >= 10 ? 3 : chain >= 5 ? 1 : 0;
  const K = arcaneKit(game), p = player.pos, t = K.t;
  const spin = -(1.1 + 0.5 * Math.min(1, chain / 25));
  s.haloA += spin * dt;
  if (n < s.haloN) {
    for (let i = 0; i < s.haloN; i++) {
      const a = s.haloA + (i / s.haloN) * 6.283;
      K.timed('drop', p.x + Math.cos(a) * HALO_R, HALO_Y, p.z + Math.sin(a) * HALO_R, 0.34, 0.4,
        { color: COL.body, hdr: 1.6, vy: 0.5, seed: s.halo[i].seed, bias: 0.4 });
      s.halo[i].born = -1;
    }
  }
  for (let i = 0; i < n; i++) if (s.halo[i].born < 0) s.halo[i].born = t;
  s.haloN = n;
  if (!n) return;
  for (let i = 0; i < n; i++) {
    const h = s.halo[i];
    const a = s.haloA + (i / n) * 6.283;
    const write = Math.min(1, (t - h.born) / 0.25);
    const bob = Math.sin(t * 2.2 + i * 1.7) * 0.05;
    K.glyph(p.x + Math.cos(a) * HALO_R, HALO_Y + bob, p.z + Math.sin(a) * HALO_R, 0.4 * (n === 6 ? 1.05 : 1),
      COL.body, n === 6 ? 1.9 : 1.6, 1, write, 0, t * 0.8 + i, h.seed, 0.4);
  }
  if (n === 6) {
    s.twAcc += dt * 3 * K.budget();
    while (s.twAcc >= 1) {
      s.twAcc -= 1;
      const a = Math.random() * 6.283;
      _pp.x = p.x + Math.cos(a) * HALO_R; _pp.y = HALO_Y + (Math.random() - 0.5) * 0.3; _pp.z = p.z + Math.sin(a) * HALO_R;
      game.vfx.emit('arcaneTwinkle', _pp, { count: 1, scale: 0.8 });
    }
  }
}

// ---------------------------------------------------------------- Arcanist idle (bible 09 §5)
// The rig already carries the halo, the tome sigil and the 3 glyph-stars; the world adds only two
// quiet things (<= 3/s, tied to the meter = Chain / 25): letters lifting off the floating tome as if
// it writes itself, and a starlight twinkle at the key-wand's star.
export function idle(game, player, dt) {
  if (!game.vfx || player.dead) return;
  const s = state(player);
  const meter = player.model?.H?.meter ?? Math.min(1, (game.chain ?? 0) / 25);
  s.tomeT -= dt * (1 + 2 * meter);
  s.wandT -= dt * (1 + meter);
  if (s.tomeT <= 0) {
    s.tomeT += 1.3 + Math.random() * 0.5;
    emitterAt(player, 'tome', 0.42, 1.2, 0.2);
    _v.y += 0.12;
    game.vfx.emit('arcaneTomeLetter', _v, { count: 1 });
  }
  if (s.wandT <= 0) {
    s.wandT += 0.9 + Math.random() * 0.5;
    emitterAt(player, 'wand', -0.3, 1.4, 0.1);
    game.vfx.emit('arcaneTwinkle', _v, { count: 1, scale: 0.75 });
  }
}

// world point of a rig emitter; if the rig lacks it (falls back to the feet), use a body offset
function emitterAt(player, name, ox, oy, oz) {
  const m = player.model;
  if (m?.emitter) m.emitter(name, _v); else _v.copy(player.pos);
  if (_v.y < 0.3) _v.set(player.pos.x + ox, oy, player.pos.z + oz);
  return _v;
}

// ---------------------------------------------------------------- cast flashes (any arcane skill)
// Starter: 6 motes converge on the wand star, then a 4-point star pops (0.5 u). Actives: bigger,
// with a rune seal flashing at the wand.
export function castFlash(game, player, def, slot, point) {
  if (!game.vfx) return;
  _pp.x = point.x; _pp.y = point.y; _pp.z = point.z;
  if (_pp.y < 0.3) { _pp.x = player.pos.x; _pp.y = 1.35; _pp.z = player.pos.z; }
  if (slot === 0) convergePop(game, _pp, 0.8, { sparks: 0 });
  else convergePop(game, _pp, 1.2, { glyph: true, sparks: 3 });
}
