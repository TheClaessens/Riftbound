import * as THREE from 'three';
import { stormBolt, groundOut, chestY, STORM } from '../elements/storm.js';

// =====================================================================================
//  STORM hero visuals (owned by the storm VFX implementer; design/VFX.md, bible 10 §4.5–4.6, bible 09 §5).
//  Lightning Dash (2 charges), Momentum, Stormcaller idle FX (tine arcs…), storm cast flashes.
//  Visual only: never deal damage or change gameplay state.
//
//  Lightning Dash: the leader bolt cracks from start to end as the dash begins (thick, 2 re-strikes),
//  the hero flashes a lemon rim, arcs jump to every foe it passes, and the path is left as a glowing
//  fulgurite line that chars dark (ground streaks, 0 decals) with bounce sparks at the end. A 2nd dash
//  within 0.5 s re-strikes between the two bolts' end points.
//  Momentum (player.charge 0..100): > 30 static ticks at the feet, > 60 arcs crawling up the rod,
//  100 a spark wake + a lemon ground ribbon; standing still the crackle bleeds off as falling sparks.
//  Idle: tine arcs between the rod tips every lerp(1.2, 0.15, meter) s (bible 09 §5).
// =====================================================================================

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3();
const _p = { x: 0, y: 0, z: 0 };
const _vel = { x: 0, y: 0, z: 0 };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function S(player) {
  return (player._stormFx ??= {
    tineT: 0.6, tickT: 0, staffT: 0, pinT: 0, bleedT: 0, wakeT: 0,
    wake: null, wakePt: { x: 0, y: 0.08, z: 0 },
    dash: null, lastEnd: new THREE.Vector3(), lastEndT: -9, rimT: 0, rim0: null, time: 0,
  });
}

// World points on the rod. Until the Stormcaller rig exposes tineL/tineR, derive them from the
// focus (rod head) and the facing.
function tines(player, L, R) {
  const m = player.model, em = m?.def?.emitters;
  if (em?.tineL && em?.tineR) { m.emitter('tineL', L); m.emitter('tineR', R); return; }
  focus(player, _m);
  const f = player.facing ?? { x: 0, z: 1 };
  const rx = f.z * 0.095, rz = -f.x * 0.095;
  L.set(_m.x + rx, _m.y, _m.z + rz);
  R.set(_m.x - rx, _m.y, _m.z - rz);
}
function focus(player, out) {
  try { player.muzzle(out); } catch { out.set(player.pos.x, 1.8, player.pos.z); }
  if (out.y < 0.5) out.y = 1.8;            // emitter fell back to the hero position
  return out;
}
function point(player, name, out, dy) {
  const m = player.model, em = m?.def?.emitters;
  if (em?.[name]) return m.emitter(name, out);
  return out.set(player.pos.x, dy, player.pos.z);
}

// ---------------------------------------------------------------- Lightning Dash
export function dashStart(game, player, from) {
  game.fx.burst(from, { color: player.cls.hex, count: 7, speed: 4, life: 0.3, size: 0.3, up: 0.8 });   // class start burst ×0.6
  if (!game.vfx) return;
  const st = S(player), d = player.dash;
  const dist = d?.def?.dist ?? 6;
  const dir = d?.dir ?? player.facing;
  _a.set(from.x, 0.9, from.z);
  _b.set(from.x + dir.x * dist, 0.9, from.z + dir.z * dist);
  // the leader: a thick forked bolt along the whole path, the hero rides it
  stormBolt(game, _a, _b, { width: 0.55, hdr: 2.0, life: 0.15, twigs: 2, twigLen: [0.5, 1.1], jag: 0.32 });
  groundOut(game, from, { sparks: 4, glints: 2, fleck: 0, dust: 1, star: false });
  // a 2nd charge within 0.5 s of the last dash end: re-strike connecting the two bolts' end points
  st.chain = st.time - st.lastEndT < 0.5;
  st.dash = { fx: from.x, fz: from.z, dx: dir.x, dz: dir.z };
  // lemon outline flash on the hero (rim channel; restored in idle)
  const h = player.model?.h;
  if (h?.rim) {
    if (!st.rim0) st.rim0 = h.rim.slice();
    h.rim = [1, 0.93, 0.45, 1];
    st.rimT = 0.16;
  }
}

export function dashTrail(game, player, dir) {
  const vfx = game.vfx;
  if (!vfx) return;
  // spark wake kicked back off the heels + a crackle on the body
  _p.x = player.pos.x; _p.y = 0.25; _p.z = player.pos.z;
  _vel.x = -dir.x * 4; _vel.y = 1.5; _vel.z = -dir.z * 4;
  vfx.emit('stormSpark', _p, { count: 2, vel: _vel, speed: 0.4 });
  _p.y = 0.7 + Math.random() * 0.8;
  vfx.emit('stormArc', _p, { scale: 1.2 });
}

export function dashHit(game, player, enemy) {
  if (!game.vfx) { return; }
  _a.set(player.pos.x, 1.0, player.pos.z);
  _b.set(enemy.pos.x, chestY(enemy), enemy.pos.z);
  stormBolt(game, _a, _b, { width: 0.24, life: 0.12, ground: true, twigs: 0, restrike: false });
  groundOut(game, enemy.pos, { sparks: 3, glints: 2, fleck: 0, dust: 0, scale: 0.7 });
}

function dashEnd(game, player, st) {
  const vfx = game.vfx, D = st.dash;
  st.dash = null;
  const ex = player.pos.x, ez = player.pos.z;
  // fulgurite: a jagged glassy line fused into the ground along the path, glowing lemon -> char
  const len = Math.hypot(ex - D.fx, ez - D.fz);
  const n = Math.max(2, Math.round(len / 0.55));
  const ux = len > 0.01 ? (ex - D.fx) / len : D.dx, uz = len > 0.01 ? (ez - D.fz) / len : D.dz;
  let off = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    off = off * 0.4 + (Math.random() * 2 - 1) * 0.09;
    _p.x = D.fx + (ex - D.fx) * t - uz * off; _p.y = 0.05; _p.z = D.fz + (ez - D.fz) * t + ux * off;
    const sw = (Math.random() * 2 - 1) * 0.35;           // each fused segment kinks a little
    _vel.x = (ux * Math.cos(sw) - uz * Math.sin(sw)) * 0.22; _vel.y = 0; _vel.z = (uz * Math.cos(sw) + ux * Math.sin(sw)) * 0.22;
    vfx.emit('stormFulgurite', _p, { count: 1, vel: _vel, speed: 0 });
  }
  _p.x = ex; _p.z = ez;
  groundOut(game, _p, { sparks: 6, glints: 3, fleck: 0.35, dust: 1 });
  if (st.chain) {
    _a.set(st.lastEnd.x, 0.9, st.lastEnd.z);
    _b.set(ex, 0.9, ez);
    if (_a.distanceToSquared(_b) > 0.25) stormBolt(game, _a, _b, { width: 0.42, hdr: 2.0, life: 0.15, twigs: 1, jag: 0.3 });
  }
  st.lastEnd.set(ex, 0, ez);
  st.lastEndT = st.time;
}

// ---------------------------------------------------------------- idle (every frame for a Stormcaller)
export function idle(game, player, dt) {
  const vfx = game.vfx;
  if (!vfx) return;
  const st = S(player);
  st.time += dt;
  // dash bookkeeping (end detection) + rim restore
  if (st.dash && !(player.dash?.t > 0)) dashEnd(game, player, st);
  if (st.rimT > 0) {
    st.rimT -= dt;
    if (st.rimT <= 0 && st.rim0 && player.model?.h) player.model.h.rim = st.rim0.slice();
  }
  const charge = player.charge ?? 0;
  const meter = clamp01(charge / 100);
  const moving = player.vel ? player.vel.x * player.vel.x + player.vel.z * player.vel.z > 0.5 : true;

  // tine arc: rod tips crackle, faster with Momentum (bible 09 §5)
  st.tineT -= dt;
  if (st.tineT <= 0) {
    st.tineT = (1.2 + (0.15 - 1.2) * meter) * (0.7 + Math.random() * 0.6);
    tines(player, _a, _b);
    stormBolt(game, _a, _b, { width: 0.1, hdr: 1.9, life: 0.07, twigs: 0, restrike: false, segLen: 0.05, jag: 0.06, after: 0.02 });
    if (meter > 0.5) vfx.emit('stormStar', Math.random() < 0.5 ? _a : _b, { scale: 0.45 });
  }
  // > 30: static ticks at the feet (2 per s)
  if (charge > 30) {
    st.tickT -= dt;
    if (st.tickT <= 0) {
      st.tickT = 0.5 * (0.7 + Math.random() * 0.6);
      const a = Math.random() * 6.283, r = 0.25 + Math.random() * 0.3;
      _p.x = player.pos.x + Math.cos(a) * r; _p.y = 0.06; _p.z = player.pos.z + Math.sin(a) * r;
      vfx.emit('stormGroundArc', _p, { scale: 0.8 });
    }
  }
  // > 60: arcs crawl along the rod
  if (charge > 60) {
    st.staffT -= dt;
    if (st.staffT <= 0) {
      st.staffT = 0.22 * (0.6 + Math.random() * 0.8);
      focus(player, _m);
      const k = Math.random() * 0.7;
      _p.x = _m.x + (player.pos.x - _m.x) * 0.15 * k; _p.y = _m.y - k; _p.z = _m.z + (player.pos.z - _m.z) * 0.15 * k;
      vfx.emit('stormArc', _p, { scale: 0.7 });
    }
  }
  // >= 80: hat pin + tail tips spit 2 sparks every 0.4 s
  if (meter >= 0.8) {
    st.pinT -= dt;
    if (st.pinT <= 0) {
      st.pinT = 0.4;
      point(player, 'hatPin', _m, 1.95);
      vfx.emit('stormSpark', _m, { count: 2, speed: 0.4 });
      for (const t of ['tailL', 'tailR']) { point(player, t, _m, 0.3); vfx.emit('stormSpark', _m, { count: 1, speed: 0.35 }); }
    }
  }
  // 100: spark wake behind the feet + a lemon ground ribbon 1.5 u behind
  if (charge >= 99.5 && moving) {
    st.wakePt.x = player.pos.x; st.wakePt.z = player.pos.z;
    if (!st.wake) st.wake = vfx.trail(st.wakePt, { color: STORM.body, width: 0.14, hdr: 1.15, segLen: 0.1 });
    st.wakeT += dt * 20;
    while (st.wakeT >= 1) {
      st.wakeT -= 1;
      const v = player.vel;
      point(player, Math.random() < 0.5 ? 'footL' : 'footR', _m, 0.1);
      _p.x = _m.x; _p.y = Math.max(0.1, _m.y + 0.05); _p.z = _m.z;
      _vel.x = -(v?.x ?? 0) * 0.5; _vel.y = 1.6; _vel.z = -(v?.z ?? 0) * 0.5;
      vfx.emit('stormSpark', _p, { count: 1, vel: _vel, speed: 0.35 });
    }
  } else if (st.wake) { st.wake.stop(); st.wake = null; }
  // standing still: the stored crackle bleeds off (falling sparks that die)
  if (!moving && charge > 4) {
    st.bleedT -= dt * (2 + 6 * meter);
    if (st.bleedT <= 0) {
      st.bleedT = 1;
      _p.x = player.pos.x + (Math.random() - 0.5) * 0.5; _p.y = 0.8 + Math.random() * 0.9; _p.z = player.pos.z + (Math.random() - 0.5) * 0.5;
      _vel.x = 0; _vel.y = -1; _vel.z = 0;
      vfx.emit('stormSpark', _p, { count: 1, vel: _vel, speed: 0.15 });
    }
  }
}

// ---------------------------------------------------------------- cast flash (any storm skill, any class)
export function castFlash(game, player, def, slot, pt) {
  const vfx = game.vfx;
  if (!vfx || !pt) return;
  vfx.emit('stormFlash', pt, { scale: slot === 0 ? 0.45 : 0.7 });
  vfx.emit('stormSpark', pt, { count: slot === 0 ? 2 : 4, speed: 0.6 });
  const f = player.facing ?? { x: 0, z: 1 };
  if (slot === 0) {
    // a 1-frame, 2-segment snap from the rod to 0.6 u ahead (bible §4.1 Spark A)
    _b.set(pt.x + f.x * 0.7, pt.y - 0.15, pt.z + f.z * 0.7);
    stormBolt(game, pt, _b, { width: 0.18, hdr: 2, life: 0.05, twigs: 0, restrike: false, segLen: 0.3, jag: 0.1, after: 0.01 });
  } else {
    // actives: both tines discharge into the cast
    tines(player, _a, _b);
    stormBolt(game, _a, _b, { width: 0.14, life: 0.08, twigs: 0, restrike: false, segLen: 0.05, jag: 0.08 });
    vfx.emit('stormArc', pt, { count: 2, scale: 1.1 });
  }
}
