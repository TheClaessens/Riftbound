import * as THREE from 'three';

// =====================================================================================
//  Composite recipes: anticipation -> impact -> dissipation, built only from the primitives.
//  Zones return { update(dt) -> bool, end(), ... } and are ticked by vfx.zone(); impacts are
//  fire-and-forget. Counts are per instance (see design/research/08-spell-vfx-tech.md §4).
// =====================================================================================

const WIND = { x: 0.9, z: -0.45 };               // default: mostly screen-right (engine.right = (1,0,-1)/sqrt2) so the slant reads

// ---------------------------------------------------------------- BLIZZARD
// cloud lid + cold shadow + snow veil + slanted wind-driven streaks + tumbling flakes + ground
// gusts + low fog + creeping frost + ice spikes that sprout and shatter at the end.
function blizzard(vfx, pos, o) {
  const R = o.radius ?? 3.5;
  let L = o.life ?? 4;
  const wl = Math.hypot((o.wind ?? WIND).x, (o.wind ?? WIND).z) || 1;
  const wx = (o.wind ?? WIND).x / wl * 3.4, wz = (o.wind ?? WIND).z / wl * 3.4;
  const p = { x: pos.x, y: 0, z: pos.z };
  const parts = {
    frost: vfx.decal('frost', p, R * 1.08, L + 0.8, { grow: 0.6, fade: 0.7 }),
    shade: vfx.decal('shadow', p, R * 1.25, L + 0.4, { grow: 0.4, fade: 0.5, alpha: 0.26 }),
    // the cloud sits upwind (where the streaks start: 4 m up at 7.5 m/s fall = 0.5 s of drift)
    cloud: vfx.cloud({ x: p.x - wx * 0.5, z: p.z - wz * 0.5 }, { radius: R * 0.7, height: 4.2, style: 'snow', life: L + 0.35 }),
    veil: vfx.shell('snowVeil', p, { radius: R * 0.98, height: 1.4, life: L }),
    streaks: vfx.emitter('snowStreak', { pos: p, radius: R * 0.95, rate: 26 * R, y: [3.4, 4.0], vel: { x: wx, y: -7.5, z: wz }, land: true, life: L }),
    flakes: vfx.emitter('snowflake', { pos: p, radius: R * 0.9, rate: 5 * R, y: [2.0, 3.6], vel: { x: wx * 0.6, y: -2.6, z: wz * 0.6 }, land: true, life: L }),
    drift: vfx.emitter('snowDrift', { pos: p, radius: R * 0.85, rate: 3 * R, y: [0, 0], vel: { x: wx * 1.5, y: 0, z: wz * 1.5 }, life: L }),
    fog: vfx.emitter('coldFog', { pos: p, radius: R * 0.7, rate: 1.2 * R, y: [0.4, 0.7], vel: { x: wx * 0.3, y: 0, z: wz * 0.3 }, life: Math.max(0.5, L - 1.2) }),
  };
  vfx.emit('frostGlint', { x: p.x, y: 0.6, z: p.z }, { count: 8 });
  const spikes = [];
  const nSpikes = Math.round(4 + R);
  for (let i = 0; i < nSpikes; i++) spikes.push(0.2 + (i / nSpikes) * 0.7);
  let t = 0, ended = false;
  return {
    pos: p, parts,
    update(dt) {
      t += dt;
      while (spikes.length && t >= spikes[0]) {
        spikes.shift();
        const a = Math.random() * 6.283, r = R * (0.3 + Math.random() * 0.55);
        vfx.sprout('iceSpike', { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r }, { life: Math.max(0.3, L - t), scale: 0.8 + Math.random() * 0.5 });
      }
      return t < L + 0.8;
    },
    end() {
      if (ended) return; ended = true;
      L = Math.min(L, t);
      for (const k of ['streaks', 'flakes', 'drift', 'fog']) parts[k].stop();
      parts.veil.end(); parts.cloud.end(); parts.frost.end(0.6); parts.shade.end(0.4);
      spikes.length = 0;
    },
  };
}

// ---------------------------------------------------------------- METEOR (fall + impact)
let ROCK = null;
function rockAssets() {
  if (ROCK) return ROCK;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x4a3a32, emissive: 0xff5a1a, emissiveIntensity: 0.35, flatShading: true });
  const hull = new THREE.MeshBasicMaterial({ color: 0x1a0c06, side: THREE.BackSide });
  ROCK = { geo, mat, hull };
  return ROCK;
}

function meteor(vfx, target, o) {
  const fall = o.fallTime ?? 0.8, H = o.height ?? 22, R = o.radius ?? 3.2;
  const A = rockAssets();
  const group = new THREE.Group();
  const rock = new THREE.Mesh(A.geo, A.mat);
  const hull = new THREE.Mesh(A.geo, A.hull);
  hull.scale.setScalar(1.12);
  group.add(rock, hull);
  group.scale.setScalar(o.size ?? 0.7);
  vfx.scene.add(group);
  const rp = new THREE.Vector3(target.x - 4, H, target.z - 4);
  const trail = vfx.trail(rp, { color: 0xff7a2a, width: 1.5, hdr: 1.6, segLen: 0.6 });
  const fire = vfx.emitter('flameLick', { pos: rp, follow: true, area: 'point', rate: 55, y: [0, 0], scale: 1.6 });
  const smoke = vfx.emitter('smoke', { pos: rp, follow: true, area: 'point', rate: 16, y: [0, 0] });
  let t = 0, done = false;
  const finish = () => {
    if (done) return; done = true;
    vfx.scene.remove(group);
    trail.stop(); fire.stop(); smoke.stop();
  };
  return {
    update(dt) {
      t += dt;
      const k = Math.min(1, t / fall), a = 1 - k;
      rp.set(target.x - 4 * a, 0.6 + (H - 0.6) * a * a, target.z - 4 * a);
      group.position.copy(rp);
      rock.rotation.x += dt * 5; rock.rotation.y += dt * 3;
      hull.rotation.copy(rock.rotation);
      if (t >= fall) {
        finish();
        if (!o.noImpact) meteorImpact(vfx, target, { radius: R });
        return false;
      }
      return true;
    },
    end: finish,
  };
}

function meteorImpact(vfx, pos, o) {
  const R = o.radius ?? 3.2;
  const p = { x: pos.x, y: 0, z: pos.z };
  vfx.decal('crater', p, R * 0.75, o.life ?? 5, { extra: 0.8 });
  vfx.decal('scorch', p, R * 1.05, o.life ?? 5, { extra: 0.7 });
  vfx.shell('blastDome', p, { radius: R * 0.85, height: R * 0.6, life: 0.32 });
  vfx.emit('fireball', { x: p.x, y: 0.7, z: p.z }, { count: 6 });
  vfx.emit('ember', { x: p.x, y: 0.4, z: p.z }, { count: 26 });
  vfx.emit('smoke', { x: p.x, y: 0.6, z: p.z }, { count: 8, scale: 1.3 });
  vfx.emit('dustRing', { x: p.x, y: 0.25, z: p.z }, { count: 14 });
  vfx.debris('rock', p, 10);
  vfx.debris('ember', p, 8);
}

// ---------------------------------------------------------------- VORTEX (singularity)
function vortex(vfx, pos, o) {
  const R = o.radius ?? 5, L = o.life ?? 2.5;
  const p = { x: pos.x, y: 0, z: pos.z };
  const parts = {
    rune: vfx.decal('rune', p, R, L + 0.3, { grow: 0.35, fade: 0.3 }),
    funnel: vfx.shell('vortexFunnel', p, { radius: R * 0.42, height: 3.0, life: L }),
    motes: vfx.emitter('arcaneMote', { pos: p, radius: R, area: 'ring', rate: 30, y: [0.2, 1.6], life: L }),
    junk: vfx.emitter('vortexDebris', { pos: p, radius: R, area: 'ring', rate: 12, y: [0.1, 0.6], life: L }),
    glyphs: vfx.emitter('runeGlyph', { pos: p, radius: R * 0.8, area: 'ring', rate: 2.5, y: [0.3, 0.3], life: L }),
  };
  let t = 0, ended = false;
  const h = {
    pos: p, parts,
    update(dt) { t += dt; if (t >= L && !ended) h.collapse(); return t < L + 0.5; },
    collapse() {
      if (ended) return; ended = true;
      for (const k of ['motes', 'junk', 'glyphs']) parts[k].stop();
      parts.funnel.end(0.15); parts.rune.end(0.3);
      vfx.shell('arcaneDome', p, { radius: R * 0.6, height: R * 0.45, life: 0.3 });
      vfx.emit('runeGlyph', { x: p.x, y: 0.6, z: p.z }, { count: 8, speed: 4 });
      vfx.debris('crystal', p, 8);
    },
    end() { h.collapse(); },
  };
  return h;
}

// ---------------------------------------------------------------- THUNDERSTORM
function storm(vfx, pos, o) {
  const R = o.radius ?? 4, L = o.life ?? 5;
  const p = { x: pos.x, y: 0, z: pos.z };
  const parts = {
    cloud: vfx.cloud(p, { radius: R * 0.85, height: 5.2, style: 'storm', life: L, back: R * 0.6 }),
    shade: vfx.decal('shadow', p, R * 1.3, L, { alpha: 0.34 }),
    wet: vfx.decal('wet', p, R * 0.9, L + 1, { grow: 1.2 }),
    rain: vfx.emitter('rain', { pos: p, radius: R, rate: 30 * R, y: [4.6, 5.0], vel: { x: 0.6, y: -11, z: 0.3 }, land: true, life: L }),
  };
  let t = 0, flick = 0;
  const h = {
    pos: p, parts,
    update(dt) {
      t += dt; flick -= dt;
      if (flick <= 0) { flick = 0.25 + Math.random() * 0.5; parts.cloud.flash(0.25 + Math.random() * 0.2); }
      return t < L;
    },
    // a bolt from the cloud to `target` ({x,z}); returns nothing (damage is the skill's job)
    strike(target) {
      const c = parts.cloud.pos;
      skyStrike(vfx, target, { from: { x: c.x + (Math.random() - 0.5) * R * 0.6, y: c.y - 0.4, z: c.z + (Math.random() - 0.5) * R * 0.6 } });
      parts.cloud.flash(1);
    },
    end() { parts.rain.stop(); parts.cloud.end(); parts.shade.end(0.4); parts.wet.end(0.8); t = Math.max(t, L - 0.4); },
  };
  return h;
}

// Lightning strike: forked bolt + scorch + spark star + sparks + clods. opts.from overrides the sky point.
function skyStrike(vfx, target, o = {}) {
  const from = o.from ?? { x: target.x + 1.5, y: 12, z: target.z + 1.5 };
  vfx.bolt(from, { x: target.x, y: 0.5, z: target.z }, { color: o.color ?? 0xffe14a, branches: o.branches ?? 2 });
  vfx.decal('scorch', target, o.radius ?? 0.9, 2.2, { extra: 3, alpha: 0.55, grow: 0.05, fade: 1 });
  vfx.emit('sparkStar', { x: target.x, y: 0.7, z: target.z });
  vfx.emit('spark', { x: target.x, y: 0.4, z: target.z }, { count: 8 });
  vfx.debris('dirt', target, 3);
}

// Frozen enemy breaks: ice shards + chips + glint.
function shatter(vfx, pos, o = {}) {
  const s = o.scale ?? 1;
  vfx.debris('ice', pos, 8, { scale: s });
  vfx.emit('iceChip', { x: pos.x, y: 0.8 * s, z: pos.z }, { count: 10 });
  vfx.emit('frostGlint', { x: pos.x, y: 0.9 * s, z: pos.z }, { count: 3 });
}

export const RECIPES = { blizzard, meteor, meteorImpact, vortex, storm, skyStrike, shatter };
