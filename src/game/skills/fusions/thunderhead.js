import * as THREE from 'three';
import { GEO, ELEMENT_COLOR, randRange, damp, pick } from '../../../core/utils.js';
import { damageEnemy } from '../../combat.js';
import { stormBolt, groundOut, moveDecal, STORM as SC } from '../../vfx/elements/storm.js';

const STORM = ELEMENT_COLOR.storm;
const CLOUD_HEIGHT = 5;

// Look (bible 10 §4.3, "your own thunderstorm: a dark anvil trailing you, sleeting, dropping bolts"):
//  • a churning slate thunderhead (14 toon puffs, outlined like the creatures) over the zone;
//  • the zone EDGE is the rain curtain: a thin noise-scrolled sheet of falling streaks at exactly R,
//    with splash ripples where it meets the ground (the rain stops at R);
//  • slanted local rain + white sleet flecks (Blizzard parent) inside, splashes, a wet stain and a cool
//    cloud shadow under it (painted interiors, ≤ 0.25 α);
//  • every strike: the belly flashes from inside, a forked bolt drops from y 4.6 and grounds out.
// The cloud keeps its gameplay follow (damp 2.2); the rain slants with the cloud's motion.

// Scratch objects. Never stored; each use is immediate.
const _q = [];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

const cloudRadius = (game, rank) => 6 * game.player.stats.area * (rank >= 2 ? 1.2 : 1);

// Fallback look without the vfx toolkit (old meshes).
function layoutCloud(state, R) {
  state.R = R;
  if (!state.puffs) return;
  state.disc.scale.setScalar(R);
  state.ring.scale.setScalar(R);
  const n = state.puffs.length;
  for (let i = 0; i < n; i++) {
    const m = state.puffs[i];
    if (i === 0) {
      m.position.x = 0;
      m.position.z = 0;
    } else {
      const a = ((i - 1) / (n - 1)) * Math.PI * 2 + 0.5;
      m.position.x = Math.cos(a) * R * 0.38;
      m.position.z = Math.sin(a) * R * 0.38;
    }
    m.scale.setScalar(R * (0.28 + 0.04 * (i % 2)));
  }
}

function cloudStrike(game, state, cloud, e) {
  if (game.vfx && state.fx) {
    const c = state.fx.cloud;
    c.flash(1);
    // from the belly, above the foe's side of the cloud
    const k = 0.35;
    _a.set(cloud.x + (e.pos.x - cloud.x) * k + randRange(-0.4, 0.4), c.pos.y - 0.7, cloud.z + (e.pos.z - cloud.z) * k + randRange(-0.4, 0.4));
    _b.set(e.pos.x, 0.05, e.pos.z);
    stormBolt(game, _a, _b, { width: 0.42, hdr: 1.9, life: 0.15, twigs: 2, twigLen: [0.6, 1.4], segLen: 0.5 });
    groundOut(game, e.pos, { sparks: 6, glints: 3, fleck: 0.45, dust: 2 });
    game.fx.light(e.pos, SC.body, 18, 0.2);
  } else {
    _a.set(cloud.x, CLOUD_HEIGHT - 0.4, cloud.z);
    _b.set(e.pos.x, 0.9, e.pos.z);
    game.fx.lightning(_a, _b, { color: STORM, life: 0.2, strands: 2, jag: 0.35 });
  }
  damageEnemy(game, e, 30, { element: 'storm' });
}

// ---------------------------------------------------------------- toolkit look
const LONG = 1e6;
function buildFx(game, state, R) {
  const vfx = game.vfx, p = state.pos;
  const fx = state.fx ?? (state.fx = {});
  if (!fx.cloud || !vfx.clouds.clouds.includes(fx.cloud)) {
    fx.cloud = vfx.cloud({ x: p.x, z: p.z }, { radius: R * 0.5, height: CLOUD_HEIGHT + 0.9, style: 'stormHead', puffs: 14, life: LONG });
  }
  if (!fx.curtain?.alive) fx.curtain = vfx.shell('stormRainCurtain', p, { radius: R, height: CLOUD_HEIGHT - 0.2, life: LONG, follow: true });
  if (!fx.wet?.alive) fx.wet = vfx.decal('wet', p, R * 0.98, LONG, { grow: 1.2, alpha: 0.2, color: 0x1b2a3a, hdr: 0.5 });
  if (!fx.shade?.alive) fx.shade = vfx.decal('shadow', p, R * 1.05, LONG, { grow: 0.8, alpha: 0.2, color: 0x2e3648 });
  if (!fx.rain || !vfx.emitters.includes(fx.rain)) {
    fx.rainVel = fx.rainVel ?? { x: 0.6, y: -11, z: 0.3 };
    fx.rain = vfx.emitter('stormRain', { pos: p, follow: true, radius: R * 0.97, rate: 22 * R, y: [4.6, 5.3], vel: fx.rainVel, land: true });
    fx.sleetVel = fx.sleetVel ?? { x: 0.8, y: -8, z: 0.4 };
    fx.sleet = vfx.emitter('stormSleet', { pos: p, follow: true, radius: R * 0.9, rate: 4 * R, y: [3.6, 4.2], vel: fx.sleetVel, land: true });
    fx.splash = vfx.emitter('stormSplash', { pos: p, follow: true, radius: R * 0.92, rate: 3.5 * R, y: [0.04, 0.04] });
    fx.edge = vfx.emitter('stormSplash', { pos: p, follow: true, radius: R, area: 'ring', rate: 4.5 * R, y: [0.04, 0.04] });
  }
  fx.R = R;
}

function sizeFx(game, state, R) {
  const fx = state.fx;
  if (!fx || fx.R === R) return;
  // the curtain moves out with the radius (rank 2 / area); decals are re-laid at the new size
  fx.curtain.end(0.2); fx.curtain = null;
  fx.wet.end(0.4); fx.wet = null;
  fx.shade.end(0.4); fx.shade = null;
  fx.cloud.end(); fx.cloud = null;
  for (const k of ['rain', 'sleet', 'splash', 'edge']) fx[k].stop();
  fx.rain = null;
  buildFx(game, state, R);
}

function endFx(state) {
  const fx = state.fx;
  if (!fx) return;
  fx.curtain?.end(0.4); fx.wet?.end(0.8); fx.shade?.end(0.5); fx.cloud?.end();
  for (const k of ['rain', 'sleet', 'splash', 'edge']) fx[k]?.stop();
  state.fx = null;
}

export const thunderhead = {
  id: 'thunderhead',
  name: 'Thunderhead',
  icon: '☁',
  element: 'storm',
  maxRank: 3,
  range: 3,
  hint: 'A storm cloud follows you, chilling foes beneath it and calling strikes onto the chilled.',
  desc: (rank) => [
    'A storm cloud drifts after you. Every 0.4 s it chills all foes beneath (4 frost). Every 0.9 s it strikes a random foe for 30 storm.',
    '+20% radius.',
    'Strikes every 0.6 s.',
  ][rank - 1],
  cooldown: () => 0,

  init(game, state, rank) {
    state.pos = new THREE.Vector3(game.player.pos.x, 0, game.player.pos.z);
    state.t = 0;
    state.tickT = 0;
    state.strikeT = 0;
    state.flickT = 0.3;
    state.prevX = state.pos.x; state.prevZ = state.pos.z;
    if (game.vfx) { buildFx(game, state, cloudRadius(game, rank)); state.R = cloudRadius(game, rank); return; }

    state.group = new THREE.Group();
    const puffMat = new THREE.MeshBasicMaterial({ color: 0x3d4b63, transparent: true, opacity: 0.6, depthWrite: false });
    const discMat = new THREE.MeshBasicMaterial({ color: 0x4a6ad0, transparent: true, opacity: 0.12, depthWrite: false });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5f86e0, transparent: true, opacity: 0.6, depthWrite: false });
    state.mats = [puffMat, discMat, ringMat];
    state.puffs = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(GEO.sphere, puffMat);
      state.puffs.push(m);
      state.group.add(m);
    }
    state.disc = new THREE.Mesh(GEO.disc, discMat);
    state.disc.rotation.x = -Math.PI / 2;
    state.disc.position.y = 0.05;
    state.ring = new THREE.Mesh(GEO.ring, ringMat);
    state.ring.rotation.x = -Math.PI / 2;
    state.ring.position.y = 0.06;
    state.group.add(state.disc, state.ring);
    game.scene.add(state.group);
    layoutCloud(state, cloudRadius(game, rank));
    state.group.position.copy(state.pos);
  },

  update(game, dt, state, rank) {
    const p = game.player.pos;
    const R = cloudRadius(game, rank);

    // Lagging follow.
    state.pos.x = damp(state.pos.x, p.x, 2.2, dt);
    state.pos.z = damp(state.pos.z, p.z, 2.2, dt);
    state.t += dt;

    if (game.vfx) {
      buildFx(game, state, state.fx?.R ?? R);   // recovers parts evicted from a full pool / cleared
      if (R !== state.fx.R) sizeFx(game, state, R);
      state.R = R;
      const fx = state.fx;
      // cloud + decals ride the follow; the cloud churns slowly
      fx.cloud.pos.x = state.pos.x; fx.cloud.pos.z = state.pos.z;
      fx.cloud.pos.y = CLOUD_HEIGHT + 0.9 + Math.sin(state.t * 0.9) * 0.12;
      moveDecal(fx.wet, state.pos.x, state.pos.z);
      moveDecal(fx.shade, state.pos.x, state.pos.z);
      // rain slants with the cloud's motion (it trails the drifting anvil)
      const vx = dt > 0 ? (state.pos.x - state.prevX) / dt : 0, vz = dt > 0 ? (state.pos.z - state.prevZ) / dt : 0;
      fx.rainVel.x = 0.6 + vx * 0.55; fx.rainVel.z = 0.3 + vz * 0.55;
      fx.sleetVel.x = 0.8 + vx * 0.6; fx.sleetVel.z = 0.4 + vz * 0.6;
      // internal flicker (heat lightning inside the anvil)
      state.flickT -= dt;
      if (state.flickT <= 0) { state.flickT = 0.3 + Math.random() * 0.6; fx.cloud.flash(0.2 + Math.random() * 0.2); }
    } else {
      state.group.position.set(state.pos.x, 0, state.pos.z);
      if (R !== state.R) layoutCloud(state, R);
      for (let i = 0; i < state.puffs.length; i++) {
        state.puffs[i].position.y = CLOUD_HEIGHT + Math.sin(state.t * 1.2 + i * 1.9) * 0.35;
      }
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        const rr = R * Math.sqrt(Math.random());
        _a.set(state.pos.x + Math.cos(a) * rr, CLOUD_HEIGHT - 0.5, state.pos.z + Math.sin(a) * rr);
        _b.set(randRange(-0.2, 0.2), -1.6, randRange(-0.2, 0.2));
        game.fx.spark(_a, _b, { color: 0xe6f4ff, size: 0.14, life: 2.6, drag: 0.6, hdr: 1.6 });
      }
    }
    state.prevX = state.pos.x; state.prevZ = state.pos.z;

    // Frost pulse on everything under the cloud.
    state.tickT += dt;
    if (state.tickT >= 0.4) {
      state.tickT -= 0.4;
      for (const e of game.queryEnemies(state.pos, R, _q).slice()) {
        if (e.dead || e.inert) continue;
        damageEnemy(game, e, 4, { element: 'frost' });
      }
    }

    // Sky strike on a random foe under the cloud.
    state.strikeT += dt;
    const every = rank >= 3 ? 0.6 : 0.9;
    if (state.strikeT >= every) {
      state.strikeT -= every;
      const pool = [];
      for (const e of game.queryEnemies(state.pos, R, _q)) {
        if (!e.dead && !e.inert) pool.push(e);
      }
      if (pool.length) cloudStrike(game, state, state.pos, pick(pool));
    }
  },

  onRankUp(game, state, rank) {
    if (game.vfx) return;              // the toolkit look re-sizes itself in update()
    layoutCloud(state, cloudRadius(game, rank));
  },

  dispose(game, state) {
    endFx(state);
    if (state.group) game.scene.remove(state.group);
    for (const m of state.mats ?? []) m.dispose();
    state.group = null;
    state.mats = null;
    state.puffs = null;
  },
};
