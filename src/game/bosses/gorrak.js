import * as THREE from 'three';
import { BossBase, SAFE_GOLD, blendAddMaterial } from './core.js';
import { gorrak as GORRAK_MODEL, GORRAK_PODS } from '../creatures/bosses/gorrak.js';
import { PARTICLES } from '../vfx/presets.js';
import { CLOUD_STYLE } from '../vfx/clouds.js';
import { distXZ, dirXZ, clamp } from '../../core/utils.js';

// =====================================================================================
//  Gorrak, the Troll King — Act I teaching boss (design/RAID_PASSES.md Pass 4, contract design/RAID.md).
//  P1 Club and Pods · Int 1 Timberfall · P2 Spore Rot · Int 2 King's Wrath · P3 Troll Rage.
//
//  This file is the REFERENCE for the other raid bosses. Conventions used here:
//   * every move = ONE rig action + ONE hostile shape (or a named cast); the pose's impact frame is time-warped
//     onto the telegraph's resolve (see GORRAK_ACT warp() in creatures/bosses/gorrak.js);
//   * every add / object / zone states its PURPOSE next to its code;
//   * bodies move through `lunge()` / `leapTo()` (scripted motion advanced in think()), never by timer polling;
//   * VFX are game.vfx (particles / decals) layered ON TOP of the hostile / safe zone decals, which stay the
//     readable truth (hostile red, gold safe) — the VFX only dress them.
// =====================================================================================

const CFG = {
  id: 'hollowWarden', name: 'Gorrak, the Troll King', model: GORRAK_MODEL,
  hp: 14500, radius: 1.8, speed: 2.4, stopGap: 1.4, resist: null, deathColor: 0x6a5aaa,
  look: { scale: 1.05, glow: [0.22, 0.4, 0.55] },
  cycle: [1.3, 1.1, 0.9], downed: [4, 5, 6], enrageAt: 75,
};

const POD_RIPEN = [7, 7, 6];     // s: pod → ripe (first use ×1.4 via lead())
const POD_HP = 90;               // × act HP scaling at spawn (≈ 2 hits from a mid-level build)
const CLOUD_R = 4;               // spore cloud radius (hostile)
const SAP_R = 2.4;               // sap pool radius (gold, safe)
const SPORE_MAX = 5;             // spore stacks (P2+)
const RALLY_RIM = [1.0, 0.5, 0.18, 1.0];   // orange rim while a Goblin Runner has rallied him
const RUNNER_RIM = [1.0, 0.55, 0.2, 1.7];

// ---------------------------------------------------------------- particle presets (VFX.md: prefix with the owner)
Object.assign(PARTICLES, {
  // billowing spore smoke on the cloud: painted lime puffs that rise and thin out
  gorrakSpore: { layer: 'paint', cell: 'puff', life: [1.6, 2.4], size: [1.5, 2.3], spin: [-0.25, 0.25], drag: 1, gravity: -0.25, speed: [0.1, 0.5], up: 0.5,
    color: 0x9cc83c, shade: 0x5a8226, alpha: [[0, 0], [0.25, 0.36], [0.75, 0.34], [1, 0]],
    fill: 0.65, ink: 0, erode: [[0, 0.5], [0.3, 0.1], [0.7, 0.15], [1, 0.9]] },
  // glowing spores drifting up out of clouds and bursting pods
  gorrakSporeMote: { layer: 'glow', cell: 'glint', life: [1.0, 1.6], size: [0.16, 0.28], spin: [-1.5, 1.5], speed: [0.2, 0.8], up: 1.4, gravity: -0.9, drag: 0.5,
    color: [[0, 0xeaff8a, 1.9], [1, 0xb8ff3c, 1.3]], fill: 0.3, ink: 0.5, sizeCurve: [[0, 0.4], [0.3, 1], [1, 0]] },
  // sap: warm gold glints rising out of the pool (the gold "safe" language)
  gorrakSap: { layer: 'glow', cell: 'glint', life: [0.8, 1.3], size: [0.2, 0.32], spin: [-1, 1], speed: [0.15, 0.5], up: 1.7, gravity: -1.2, drag: 0.8,
    color: [[0, 0xfff4c8, 1.9], [1, 0xffc860, 1.3]], fill: 0.3, ink: 0.5, sizeCurve: [[0, 0.5], [0.3, 1], [1, 0]] },
  // brown dust: slam rings, tree trails, landings
  gorrakDust: { layer: 'paint', cell: 'puff', count: 8, life: [0.8, 1.3], size: [1.0, 1.6], spin: [-1, 1], speed: [2.5, 5.5], up: 0.35, drag: 2.5, gravity: -0.3,
    color: [[0, 0xc2a678], [1, 0x9a8460]], shade: [[0, 0x7a6648], [1, 0x6a5a40]], alpha: [[0, 0.8], [1, 0]], fill: 0.85, ink: 0.4,
    sizeCurve: [[0, 0.7], [1, 1.5]], erode: [[0, 0], [0.5, 0.1], [1, 1]] },
  // torn leaves from the flung trees / the club
  gorrakLeaf: { layer: 'paint', cell: 'flake', count: 6, life: [0.7, 1.2], size: [0.2, 0.34], spin: [-6, 6], speed: [1.5, 4], up: 0.8, gravity: 5, drag: 1.5,
    color: [[0, 0x7cbf4a], [1, 0x4f8a34]], fill: 1, ink: 0.7, erode: [[0, 0], [0.7, 0], [1, 1]] },
  // stagger stars circling his head while Downed (steel-white = poise)
  gorrakStar: { layer: 'glow', cell: 'star', count: 1, life: [0.5, 0.65], size: [0.55, 0.75], spin: [-3, 3], speed: [0, 0],
    color: [[0, 0xffffff, 2.0], [1, 0xc8d8ee, 1.4]], fill: 0.3, ink: 0.7, sizeCurve: [[0, 0.5], [0.3, 1], [1, 0.2]] },
});

// billowing 3D spore cloud (vfx.cloud) above the red zone: lit lime on top, mossy shade underneath
CLOUD_STYLE.gorrakSpore = { lit: 0xbfdc66, shadow: 0x587a2a, puffs: 8 };

// ---------------------------------------------------------------- shared prop geometry (built once, lumpy = organic)
let PROPS = null;
function props() {
  if (PROPS) return PROPS;
  const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
  const lump = (g, amt) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + (hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) - 0.5) * 2 * amt;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const trunk = new THREE.CylinderGeometry(0.34, 0.6, 6, 7).rotateX(Math.PI / 2);   // +Z = leafy end
  PROPS = {
    sac: lump(new THREE.IcosahedronGeometry(1, 1), 0.14),
    bud: lump(new THREE.IcosahedronGeometry(1, 0), 0.2),
    mound: lump(new THREE.IcosahedronGeometry(1, 1), 0.1),
    spike: new THREE.ConeGeometry(0.12, 0.7, 5),
    trunk,
    root: lump(new THREE.IcosahedronGeometry(1, 1), 0.18),
    leaf: lump(new THREE.IcosahedronGeometry(1, 1), 0.16),
    rootSpike: new THREE.ConeGeometry(0.16, 1.1, 5).rotateX(-Math.PI / 2),         // points +Z, rotated per root
  };
  return PROPS;
}

const _p = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);

// Where does a ray (from, unit dir) leave the arena circle?
function rayToWall(from, dir, c, R) {
  const fx = from.x - c.x, fz = from.z - c.z;
  const b = fx * dir.x + fz * dir.z, cc = fx * fx + fz * fz - R * R;
  return Math.max(4, -b + Math.sqrt(Math.max(0, b * b - cc)));
}

export class Gorrak extends BossBase {
  constructor(game, pos, opts) {
    super(game, CFG, pos, opts);
    this.spores = 0;              // P2+: Spore stacks on the player
    this.sporeT = 0;
    this.rootT = 0;               // root effect timer
    this.rootCd = 0;              // after a root: immune for a few seconds (no root-lock inside a cloud)
    this.playerDebuff = null;     // HUD may read { id, stacks, max }
    this._rallyT = 0;             // Goblin Runner rally: +10% damage while > 0
    this._hornClock = 0; this._hornNext = 1.58;
    this._mv = null;              // scripted body motion (lunge | leap)
    this._dizzy = null;
    this._dizzyPos = new THREE.Vector3();
    this.poise.max = 110;         // a bit longer than the default 100 (reaction fatigue in core does the rest)
    this.trees = [];              // tree prop pool (Timberfall)
    // track the rig's bone matrices: pods / hands / head are read back through boneWorld()
    this.rig.bones = new Float32Array(GORRAK_MODEL.boneCount * 16);
    this.rig.matrix = new THREE.Matrix4();
    this.rig.podGrow = [1, 1, 1, 1, 1, 1];
    const M = (c, o = {}) => this.own_mat(new THREE.MeshLambertMaterial({ color: c, ...o }));
    this.M = {
      bark: M(0x5b3a22), earth: M(0x4a3424), moss: M(0x86b33c), mound: M(0x4d5a22), leaf: M(0x4f8a34), leafLt: M(0x7cbf4a),
      podFly: M(0xa4d03a, { emissive: 0x3a5a08 }),
      sap: M(0xd8a030, { emissive: 0x7a4a08 }),
    };
    this.moves = {
      slam: () => this.mSlam(),
      backhand: () => this.mBackhand(),
      combo: () => this.mCombo(),
      pods: () => this.mPods(),
      horn: () => this.mHorn(),
    };
  }

  rotation(phase) {
    // the horn comes early in every loop so each phase gets its Break Check (fights are ~15-25 s per phase)
    if (phase === 1) return ['slam', 'backhand', 'horn', 'pods', 'slam', 'backhand'];
    if (phase === 2) return ['pods', 'combo', 'horn', 'pods', 'backhand', 'combo', 'slam'];   // pods ~every 14 s
    return ['combo', 'horn', 'pods', 'slam', 'backhand', 'combo'];
  }

  // Keep the field legible: one set of pods at a time; the horn never while Runners are still running.
  ready(name) {
    if (name === 'pods') return this.livePods() === 0 && this.liveZones('spores') < 2;
    if (name === 'horn') return ![...this.adds].some((e) => !e.dead);
    return true;
  }

  livePods() { let n = 0; for (const o of this.objects) if (o.tag === 'pod' && !o.dead) n++; return n; }
  liveZones(tag) { let n = 0; for (const a of this.actors) if (a.tag === tag && !a._cleared) n++; return n; }

  // Teaching rule (RAID.md): the first use of a mechanic is shown x1.4 longer. Unlike lead(), the move only counts as
  // learned when it RESOLVES, so a Downed that cancels the very first slam teaches it again next time.
  teach(id, base) { return this.seen.has(id) ? base : base * 1.4; }
  learn(id) { this.seen.add(id); }

  // ================================================================ body motion
  // Close the distance before a blow so the club visibly reaches the shape: slide to `reach` u from `target`
  // (at most 7 u) over `dur`. Returns the destination, so telegraphs anchored on the boss use it.
  lunge(target, reach, dur) {
    const from = this.pos.clone();
    const d = distXZ(from, target);
    const to = from.clone();
    if (d > reach) {
      const step = Math.min(7, d - reach);
      to.addScaledVector(dirXZ(from, target, new THREE.Vector3()), step);
      this._mv = { kind: 'lunge', from, to, t: 0, dur: Math.max(0.2, dur) };
    }
    return to;
  }

  // Leap (intermissions): crouch → parabola → crash. The rig action 'leap' is normalised to `dur`.
  leapTo(dest, dur, { height = 5, onLand } = {}) {
    const from = this.pos.clone();
    this.yaw = Math.atan2(dest.x - from.x, dest.z - from.z);
    this._mv = { kind: 'leap', from, to: new THREE.Vector3(dest.x, 0, dest.z), t: 0, dur, h: height, lift: 0, onLand };
    this.play('leap', dur, dur * 0.9, null, 0.8);
    this.dustAt(from, 14, 1.2);
  }

  _motion(dt) {
    const m = this._mv;
    if (!m) return;
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    if (m.kind === 'lunge') {
      this.pos.lerpVectors(m.from, m.to, 1 - Math.pow(1 - k, 3));
    } else {
      const u = clamp((k - 0.22) / 0.68, 0, 1);
      this.pos.lerpVectors(m.from, m.to, 0.75 * u + 0.25 * u * u * (3 - 2 * u));
      m.lift = m.h * 4 * u * (1 - u);
    }
    if (k >= 1) { this._mv = null; m.onLand?.(); }
  }

  think(dt, mv) {
    if (this.rootT > 0) this.rootT -= dt;
    if (this.rootCd > 0) this.rootCd -= dt;
    if (this._rallyT > 0) this._rallyT -= dt;
    if (mv > 0) this._motion(dt);
    // Spore stacks wear off with their buff (cleansed by Sap Pools)
    if (this.spores > 0 && !this.game.player.buffs.has('spores')) { this.spores = 0; this.playerDebuff = null; }
  }

  dmg(mult = 1) { return super.dmg(mult) * (this._rallyT > 0 ? 1.1 : 1); }

  // ================================================================ small VFX helpers
  dustAt(p, n = 10, scale = 1) { this.game.vfx.emit('gorrakDust', { x: p.x, y: 0.4, z: p.z }, { count: n, scale }); }

  // Club crash on the ground at `at` (slam, wave start, leap landing): dust ring, debris, crater, shake.
  groundHit(at, r, { crater = true, shake = 0.5 } = {}) {
    const g = this.game, v = g.vfx;
    g.fx.ring(at, { color: 0xc2a678, radius: r, from: 0.6, life: 0.55, width: 0.28, blend: 'normal', hdr: 1.1 });
    // dust and debris thrown off the circle's edge (the danger boundary), clear of the hero-yield fade at the centre
    const a0 = Math.random() * 6.283, n = Math.round(8 + r * 1.5);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 6.283, s = Math.sin(a), c = Math.cos(a);
      v.emit('gorrakDust', { x: at.x + s * r * 0.8, y: 0.3, z: at.z + c * r * 0.8 }, { count: 3, scale: 1.3, dir: { x: s, y: 0.25, z: c }, cone: 0.6 });
      if (i % 2 === 0) v.debris(i % 4 ? 'dirt' : 'rock', { x: at.x + s * r * 0.5, y: 0.3, z: at.z + c * r * 0.5 }, 2, { scale: 1.3, dir: { x: s, y: 0.9, z: c }, cone: 0.4 });
    }
    if (crater) v.decal('crater', at, r * 0.45, 7, { fade: 2 });
    g.fx.shake(shake, 'threat');
  }

  // ================================================================ moves
  // CLUB SLAM — circle r5 on the player. PURPOSE: teaches "leave the circle"; the club sticks (Exposed).
  mSlam() { return this.slam(this.teach('slam', 0.9)); }

  slam(lead) {
    const g = this.game;
    const at = g.player.pos.clone();
    this.face(at);
    this.lunge(at, 4.4, lead * 0.6);
    this.play('slam', lead + 0.4, lead, null, 0.55);
    g.events.emit('bossTell', { enemy: this, kind: 'slam', lead });
    this.circle(at, 5, lead, { dmg: 1.6, how: 'club slam', onResolve: () => {
      this.learn('slam');
      this.groundHit(at, 5, { shake: 0.55 });
      g.vfx.emit('gorrakLeaf', { x: at.x, y: 1, z: at.z }, { count: 5, scale: 1 });
      this.expose(1.2);         // the club sticks in the ground: a small damage window
    } });
    return lead + 1.4;
  }

  // BACKHAND — cone 120° r9 (P3: 180°) toward the player. PURPOSE: teaches the safe side of a cone (behind / outside r9).
  mBackhand() { return this.backhand(this.teach('backhand', 1.1), 'backhand'); }

  // lungeDist: how far he closes in before the swing. The combo's follow-up only steps (playtest v5: a 6 u
  // lunge + 0.6 s lead left ~3 u to clear after a human reaction time: undodgeable without a dash).
  backhand(lead, id, lungeDist = 6) {
    const g = this.game;
    const p = g.player.pos;
    const apex = this.lunge(p, lungeDist, lead * 0.6);             // the cone's apex is where he will stand
    const dir = dirXZ(apex, p, new THREE.Vector3());
    const angle = this.phase === 3 ? Math.PI : (120 * Math.PI) / 180;
    this.yaw = Math.atan2(dir.x, dir.z);
    this.play('backhand', lead + 0.35, lead, null, 1.0);
    g.events.emit('bossTell', { enemy: this, kind: 'backhand', lead });
    this.cone(apex, dir, angle, 9, lead, { dmg: 1.3, how: 'backhand', onResolve: () => {
      this.learn(id);
      g.fx.shake(0.4, 'threat');
      // dust and leaves kicked up along the sweep's outer arc
      const a0 = Math.atan2(dir.x, dir.z);
      for (let i = -2; i <= 2; i++) {
        const a = a0 + (i / 2) * (angle / 2) * 0.9;
        const q = { x: apex.x + Math.sin(a) * 7, y: 0.5, z: apex.z + Math.cos(a) * 7 };
        g.vfx.emit('gorrakDust', q, { count: 4, scale: 1.1, dir: { x: Math.sin(a), y: 0.1, z: Math.cos(a) }, cone: 0.5 });
      }
      g.vfx.emit('gorrakLeaf', { x: apex.x + dir.x * 4, y: 1.5, z: apex.z + dir.z * 4 }, { count: 6, scale: 1 });
    } });
    return lead + 0.6;
  }

  // COMBO (P2+) — slam on you, then the cone 0.6 s later toward where you went. PURPOSE: pressure after the teaching phase.
  mCombo() {
    const lead = this.teach('slam', 0.9);
    const busy = this.slam(lead);
    this.after(lead, () => {
      if (this.downed) return;
      this.backhand(this.teach('combo', 0.85), 'combo', 2);
    });
    return busy + 0.7;
  }

  // SPORE PODS — he flings pods off his back to ring positions. PURPOSE: kill-timer objects that zone the arena and
  // teach the gold "go here" zone: killed early → Sap Pool, left to ripen → spore cloud.
  mPods() {
    const n = this.phase === 1 ? 3 : 2 + (Math.random() < 0.5 ? 1 : 0);
    this.face(this.game.player.pos);
    this.play('volley', 0.95, 0.66, null, 1.15);
    this.game.events.emit('bossTell', { enemy: this, kind: 'pods', lead: 0.9 });
    const dests = this.podSpots(n);
    const slots = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    dests.forEach((d, i) => this.after(0.64 + i * 0.06, () => this.lobPod(slots[i], d, 0.9)));
    return 1.7;
  }

  // n ring positions (r 0.5–0.72 of the arena), spread apart and not on top of the player
  podSpots(n) {
    const pp = this.game.player.pos, out = [];
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 8; tries++) {
        const p = this.arenaPoint(base + (i * Math.PI * 2) / n + (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.22);
        if (distXZ(p, pp) > 4 && out.every((q) => distXZ(p, q) > 6)) { out.push(p); break; }
        if (tries === 7) out.push(p);
      }
    }
    return out;
  }

  // A pod leaves his back along a lob and lands at `to` (a shadow marks the landing); the pod object spawns on landing.
  lobPod(slot, to, flight) {
    const g = this.game, S = props();
    const start = g.creatures.boneWorld(this.rig, `pod${slot}`, GORRAK_PODS[slot].cap, new THREE.Vector3());
    this.rig.podGrow[slot] = 0;                       // gone from his back, regrows over ~5 s
    const mesh = new THREE.Mesh(S.sac, this.M.podFly);
    mesh.scale.set(0.5, 0.65, 0.5);
    g.scene.add(mesh);
    const sh = g.vfx.decal('shadow', to, 1.5, flight + 0.15, { grow: flight * 0.8, fade: 0.15, alpha: 0.45 });
    const from = start.clone();
    const self = this;
    const act = {
      hostile: false, t: 0, tag: 'podShot',
      update(dt) {
        this.t += dt;
        const k = Math.min(1, this.t / flight);
        mesh.position.set(from.x + (to.x - from.x) * k, from.y * (1 - k) + 0.7 * k + 4.2 * 4 * k * (1 - k), from.z + (to.z - from.z) * k);
        mesh.rotation.x += dt * 5; mesh.rotation.z += dt * 3;
        if (k >= 1) {
          g.vfx.debris('dirt', { x: to.x, y: 0.3, z: to.z }, 8, { scale: 1.1 });
          g.vfx.emit('gorrakDust', { x: to.x, y: 0.3, z: to.z }, { count: 8, scale: 0.8 });
          g.fx.shake(0.15, 'threat');
          self.spawnPod(to);
          return false;
        }
        return true;
      },
      dispose() { g.scene.remove(mesh); sh.end(0.1); },
    };
    this.own(act);
  }

  // The pod: a swelling fungal sac on a root mound. A gold-white ring on the ground fills as it ripens.
  // PURPOSE (see mPods): kill-timer object. Ripe → spore cloud; killed first → Sap Pool.
  spawnPod(pos) {
    const g = this.game, S = props(), M = this.M;
    const ripen = this.lead('pod', POD_RIPEN[this.phase - 1]);
    const sacMat = new THREE.MeshLambertMaterial({ color: 0x86b02e, emissive: 0x2a3a08 });
    const grp = new THREE.Group();
    const mound = new THREE.Mesh(S.mound, M.mound); mound.scale.set(1.2, 0.4, 1.2); mound.position.y = 0.08;
    const sac = new THREE.Mesh(S.sac, sacMat); sac.position.y = 1.05;
    grp.add(mound, sac);
    for (let i = 0; i < 5; i++) {      // satellite buds
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const b = new THREE.Mesh(S.bud, M.moss); b.scale.setScalar(0.26 + (i % 2) * 0.08); b.position.set(Math.cos(a) * 0.9, 0.26, Math.sin(a) * 0.9);
      grp.add(b);
    }
    for (let i = 0; i < 4; i++) {      // bark roots clawing outward
      const a = (i / 4) * Math.PI * 2 + 1.0;
      const sp = new THREE.Mesh(S.spike, M.bark); sp.position.set(Math.cos(a) * 0.82, 0.4, Math.sin(a) * 0.82); sp.scale.setScalar(1.35);
      sp.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      grp.add(sp);
    }
    const mkRing = (opacity) => { const m = this.own_mat(blendRing(opacity)); const r = new THREE.Mesh(this.ringGeo, m); r.rotation.x = -Math.PI / 2; r.position.y = 0.08; r.renderOrder = 2; grp.add(r); return { r, m }; };
    const target = mkRing(0.4), fill = mkRing(0.95);
    target.r.scale.setScalar(1.75);
    let t = 0, pulse = 0;
    const phase = this.phase;
    const hp = POD_HP * (g.actDef?.hp ?? 1);
    const pod = this.spawnObject({
      pos, radius: 0.85, hp, mesh: grp, name: 'Spore Pod', tag: 'pod', keepOnClear: phase >= 2,
      onHit: () => { pulse = 1; },
      update: (dt) => {
        t += dt * (pod.rush ? 6 : 1);          // pod.rush: King's Wrath ripens every live pod at once
        pulse = Math.max(0, pulse - dt * 6);
        const k = Math.min(1, t / ripen);
        const sw = 0.85 + 0.5 * k * k + 0.12 * pulse;
        const shake = k > 0.7 ? Math.sin(t * 50) * 0.03 * (k - 0.7) / 0.3 : 0;
        sac.scale.set(sw + shake, sw * 1.32, sw - shake);
        sacMat.color.setRGB(0.52 + 0.4 * k, 0.69 + 0.2 * k, 0.18 + 0.3 * k);
        sacMat.emissive.setRGB(0.16 + 0.45 * k + 0.3 * pulse, 0.23 + 0.4 * k + 0.3 * pulse, 0.03 + 0.15 * k);
        fill.r.scale.setScalar(0.35 + 1.4 * k);
        fill.m.opacity = 0.55 + 0.4 * (k > 0.8 ? 0.5 + 0.5 * Math.sin(t * 16) : 1);
        if (k >= 1 && !pod.dead) { pod.ripe = true; pod.dead = true; pod.onDeath(g); }
      },
      onDeath: () => {
        if (pod.ripe) this.sporeCloud(pod.pos); else this.sapPool(pod.pos);
      },
    });
    const d0 = pod.dispose;
    pod.dispose = (game) => { sacMat.dispose(); target.m.dispose(); fill.m.dispose(); d0.call(pod, game); };   // per-pod materials
    g.vfx.emit('gorrakSporeMote', { x: pos.x, y: 0.5, z: pos.z }, { count: 5, scale: 0.8 });
    return pod;
  }

  // SPORE CLOUD — hostile zone r4, 8 s (the pod ripened). P1: light tick damage. P2+: Spore stacks (below).
  // VFX: lime smoke ring at the true radius + glowing spores, on top of the red zone decal.
  sporeCloud(pos) {
    const g = this.game, v = g.vfx;
    v.emit('gorrakSporeMote', { x: pos.x, y: 0.6, z: pos.z }, { count: 22, scale: 1.1 });
    v.emit('gorrakSpore', { x: pos.x, y: 0.7, z: pos.z }, { count: 10, scale: 1.2, speed: 4 });
    v.debris('dirt', { x: pos.x, y: 0.4, z: pos.z }, 8, { scale: 1.0, color: 0x7aa22a });
    g.fx.shake(0.25, 'threat');
    const z = this.zone(pos, 'hostile', { radius: CLOUD_R, life: 8, tag: 'spores', onInside: (dt) => {
      this.sporeT += dt;
      if (this.sporeT < 1) return;
      this.sporeT = 0;
      if (this.phase < 2) this.hitPlayer(0.25, 'spore cloud'); else this.addSpore();
    } });
    z.tag = 'spores';
    const fx = [
      v.emitter('gorrakSpore', { pos, rate: 8, radius: CLOUD_R * 0.9, area: 'ring', y: [0.3, 1.2], life: 8, scale: 1 }),
      v.emitter('gorrakSpore', { pos, rate: 6, radius: CLOUD_R * 0.6, area: 'disc', y: [0.3, 1.5], life: 8, scale: 1.1 }),
      v.emitter('gorrakSporeMote', { pos, rate: 12, radius: CLOUD_R * 0.85, area: 'disc', y: [0.2, 1.6], life: 8, scale: 1 }),
    ];
    const stain = v.decal('wet', pos, CLOUD_R * 0.95, 8, { color: 0x3a5a14, alpha: 0.5, accent: 0xb8ff3c, hdr: 0.8, fade: 0.6 });
    const cloud = v.cloud({ x: pos.x, z: pos.z }, { radius: CLOUD_R * 0.8, height: 1.7, style: 'gorrakSpore', life: 8, back: 0.8 });
    patchDispose(z, [...fx, { stop: () => stain.end(0.4) }, { stop: () => cloud.end() }]);
  }

  // SAP POOL — gold safe zone r2.4, 10 s (a pod killed before it ripened). +25% move speed; cleanses Spore stacks.
  // PURPOSE: the first "go here" shape the player meets.
  sapPool(pos) {
    const g = this.game, v = g.vfx;
    v.emit('gorrakSap', { x: pos.x, y: 0.5, z: pos.z }, { count: 14, scale: 1.2 });
    v.debris('dirt', { x: pos.x, y: 0.4, z: pos.z }, 6, { scale: 0.9, color: 0xe0b040 });
    const z = this.zone(pos, 'safe', { radius: SAP_R, life: 10, tag: 'sap', onInside: () => {
      const p = g.player;
      if (this.spores > 0) { this.spores = 0; this.playerDebuff = null; p.buffs.delete('spores'); p.recalcStats(); g.fx.text(p.pos, 'CLEANSED', '#ffe9a8'); }
      const b = p.buffs.get('sap');
      if (!b || b.t < 0.2) p.addBuff('sap', 0.45, { name: 'Sap', icon: 'sap', color: '#ffe9a8', apply: (s) => { s.moveSpeed *= 1.25; } });
    } });
    z.tag = 'sap';
    const fx = [v.emitter('gorrakSap', { pos, rate: 9, radius: SAP_R * 0.8, area: 'disc', y: [0.1, 0.5], life: 10, scale: 1 })];
    const puddle = v.decal('wet', pos, SAP_R * 0.95, 10, { color: 0x9a6a1c, alpha: 0.5, accent: 0xffe9a8, hdr: 1.0, fade: 0.8 });
    // the puddle itself: a low amber dome (physical sap, not just a flat disc) with slowly rising bubbles from the emitter
    const dome = new THREE.Mesh(props().mound, this.M.sap); dome.scale.set(SAP_R * 0.88, 0.2, SAP_R * 0.88); dome.position.set(pos.x, 0.05, pos.z);
    g.scene.add(dome);
    patchDispose(z, [...fx, { stop: () => puddle.end(0.4) }, { stop: () => g.scene.remove(dome) }]);
  }

  // Spore stacks (P2+): +8% damage taken and -5% speed per stack, max 5; 5 stacks root for 1 s (then 3 s immune).
  addSpore() {
    const g = this.game, p = g.player;
    this.spores = Math.min(SPORE_MAX, this.spores + 1);
    const n = this.spores;
    this.playerDebuff = { id: 'spores', stacks: n, max: SPORE_MAX };
    p.addBuff('spores', 14, { name: `Spores ×${n}`, icon: 'spores', color: '#b8ff3c', apply: (s) => { s.dmgTaken *= 1 + 0.08 * n; s.moveSpeed *= 1 - 0.05 * n; } });
    g.vfx.emit('gorrakSporeMote', { x: p.pos.x, y: 1.0, z: p.pos.z }, { count: 5, scale: 0.8 });
    if (n >= SPORE_MAX && this.rootCd <= 0) {
      this.rootT = 1; this.rootCd = 4;
      p.addBuff('rooted', 1, { name: 'Rooted', icon: 'spores', color: '#b8ff3c', apply: (s) => { s.moveSpeed *= 0.05; } });
      g.fx.text(p.pos, 'ROOTED', '#b8ff3c');
    }
  }

  // WAR HORN — Break Check (5 s, threshold 60 / 70). PURPOSE: the poise lesson. Success: HORN BROKEN → Downed.
  // Fail: four Goblin Runners race to him (below).
  mHorn() {
    const g = this.game;
    this._hornClock = 0; this._hornNext = 1.58;
    g.events.emit('bossTell', { enemy: this, kind: 'horn', lead: 1 });
    return this.breakCheck({
      name: 'War Horn', dur: 5, threshold: this.phase === 1 ? 60 : 70, action: 'hornHold',
      onSuccess: () => {
        g.fx.text({ x: this.pos.x, y: 3.4, z: this.pos.z }, 'HORN BROKEN', '#e8eef8', true);
        g.vfx.debris('rock', this.hornPos(_p), 8, { scale: 0.9, color: 0xeadcb4 });
      },
      onFail: () => {
        this.play('roar', 0.9, 0.5);
        this.runners(4);
      },
    });
  }

  hornPos(out) { return this.game.creatures.boneWorld(this.rig, 'hornHand', [2.35, 0.85, 0.35], out); }

  // The blast: a bone-white ring from the horn's bell + a few lime spores. Visual only (no damage).
  hornPulse() {
    const g = this.game;
    g.fx.ring(this.pos, { color: 0xeadcb4, radius: 6.5, from: 1.4, life: 0.8, width: 0.07, hdr: 1.3, occ: 0.2 });
    g.vfx.emit('gorrakSporeMote', this.hornPos(_p), { count: 4, scale: 0.9 });
    g.fx.shake(0.12, 'threat');
  }

  // GOBLIN RUNNERS — race adds, spawned only when the War Horn is NOT broken. PURPOSE: punish a failed check: each one
  // that reaches him heals 3% and enrages him (+10% damage, 8 s). Kill them (1 reaction each) before they arrive.
  // They sprint along a drawn path (orange dashed lane) from the wall; an orange rim marks them.
  runners(n) {
    const g = this.game;
    const base = Math.random() * Math.PI * 2;
    g.fx.text({ x: this.pos.x, y: 3.6, z: this.pos.z }, 'RUNNERS!', '#ffb060', true);
    for (let i = 0; i < n; i++) {
      const p = this.arenaPoint(base + (i * Math.PI * 2) / n, 0.96);
      const dir = dirXZ(p, this.pos, new THREE.Vector3());
      const len = distXZ(p, this.pos);
      g.fx.lineTelegraph(p, dir, len, 0.8, 0.9, { friendly: true, color: 0xff9a3c, onDone: () => {} });
      this.after(0.9, () => {
        g.vfx.emit('gorrakDust', { x: p.x, y: 0.3, z: p.z }, { count: 8, scale: 0.9 });
        const e = this.spawnAdd('husk', p, { hpMult: 0.6, speedMult: 1.7, goal: this.pos, goalR: this.radius + 0.8, onGoal: (game, e2) => {
          e2.dead = true;
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.03);
          this._rallyT = 8;
          game.fx.text({ x: this.pos.x, y: 3.2, z: this.pos.z }, '+3%', '#ffb060', true);
          game.vfx.emit('gorrakSporeMote', { x: this.pos.x, y: 1.5, z: this.pos.z }, { count: 8, scale: 1 });
        } });
        e.isRunner = true;
        e.dustT = 0;
      });
    }
    // dress the runners every frame (rim + dust) until none is left; the actor ends itself
    let idle = 0, age = 0;
    this.own({ hostile: false, update: (dt) => {
      age += dt;
      let any = false;
      for (const e of this.adds) {
        if (!e.isRunner) continue;
        if (e.dead) continue;
        any = true;
        if (e.rig) e.rig.rim = RUNNER_RIM;
        e.dustT -= dt;
        if (e.dustT <= 0) { e.dustT = 0.09; g.vfx.emit('gorrakDust', { x: e.pos.x, y: 0.25, z: e.pos.z }, { count: 1, scale: 0.55, speed: 0.4 }); }
      }
      idle = any ? 0 : idle + dt;
      return age < 1.5 || idle < 0.5;
    }, dispose() {} });
  }

  // ================================================================ intermissions
  intermission(idx) { return idx === 1 ? this.timberfall() : this.kingsWrath(); }

  // INTERMISSION 1 "Timberfall" — he leaps to the far wall and hurls six uprooted trees at you in a fan of lines, one every
  // 0.9 s, aimed alternately a little to either side of you (the next line is shown 1 s before it lands), then leaps back
  // onto your head (circle r6: dash it). PURPOSE: arena-scale reading of lines before the later bosses ask for it.
  timberfall() {
    const g = this.game, c = this.arena.center;
    g.events.emit('bossTell', { enemy: this, kind: 'timberfall', lead: 1.4 });
    const pp = g.player.pos;
    let ax = c.x - pp.x, az = c.z - pp.z;
    if (Math.hypot(ax, az) < 3) { ax = this.pos.x - c.x; az = this.pos.z - c.z; }
    const wall = this.arenaPoint(Math.atan2(ax, az), 0.84);
    this.leapTo(wall, 0.8, { height: 5.5, onLand: () => { this.groundHit(wall, 5, { shake: 0.6 }); this.face(g.player.pos); } });
    for (let i = 0; i < 6; i++) this.after(1.3 + i * 0.9, () => this.hurlTree(i));
    this.after(6.0, () => {
      const lead = this.lead('kingLeap', 1.0);
      const at = g.player.pos.clone();
      this.leapTo(at, lead, { height: 6.5, onLand: () => this.groundHit(at, 6, { shake: 0.8 }) });
      this.circle(at, 6, lead, { dmg: 1.2, how: 'king leap' });
    });
    return 7.6;
  }

  // One tree: a line telegraph (w3, wall to wall) + the hurl body action + a tree prop that flies along it.
  hurlTree(i) {
    const g = this.game, c = this.arena.center, R = this.arena.r;
    const p = g.player.pos;
    this.face(p);
    const d0 = dirXZ(this.pos, p, new THREE.Vector3());
    const aim = p.clone().addScaledVector(new THREE.Vector3(d0.z, 0, -d0.x), (i % 2 ? 1 : -1) * 1.2);   // alternate flanks
    const dir = dirXZ(this.pos, aim, new THREE.Vector3());
    const from = this.pos.clone().addScaledVector(dir, 1.6);
    const len = rayToWall(from, dir, c, R * 0.98);
    const lead = this.lead('timber', 1.0);
    this.play('hurl', 0.9, 0.56, null, 0.8);
    this.line(from, dir, len, 3, lead, { dmg: 0.5, how: 'timber' });
    this.flyTree(from, dir, len, lead, clamp((p.x - from.x) * dir.x + (p.z - from.z) * dir.z, 5, len));
  }

  treeMesh() {
    let t = this.trees.find((m) => !m.userData.busy);
    if (t) return t;
    const S = props(), M = this.M;
    t = new THREE.Group();
    t.add(new THREE.Mesh(S.trunk, M.bark));
    const root = new THREE.Mesh(S.root, M.earth); root.scale.set(1.05, 0.95, 0.85); root.position.z = -3.0; t.add(root);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sp = new THREE.Mesh(S.rootSpike, M.bark);
      sp.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, -3.3);
      sp.lookAt(Math.cos(a) * 3, Math.sin(a) * 3, -9);
      t.add(sp);
    }
    for (const [x, y, z, s, m] of [[0, 0, 3.0, 1.3, M.leaf], [0.5, 0.45, 2.3, 0.85, M.leafLt], [-0.5, -0.4, 2.0, 0.8, M.leaf]]) {
      const lf = new THREE.Mesh(S.leaf, m); lf.position.set(x, y, z); lf.scale.setScalar(s); t.add(lf);
    }
    t.visible = false;
    this.game.scene.add(t);
    this.trees.push(t);
    return t;
  }

  // The prop: stooped-over uprooting (0–0.16 s), held aloft in the left hand, released at 0.56 s, then it skims the ground
  // along the line fast enough to cross the player's spot as the line resolves.
  flyTree(from, dir, len, lead, aimD) {
    const g = this.game;
    const mesh = this.treeMesh();
    mesh.userData.busy = true;
    mesh.visible = false;
    const REL = 0.56;
    const speed = aimD / Math.max(0.3, lead - REL);
    const hand = new THREE.Vector3(), axis = new THREE.Vector3(), roll = new THREE.Quaternion();
    let t = 0, s = 0, rollA = 0, y0 = 4, state = 0, dustT = 0;
    const self = this;
    const act = {
      hostile: false,
      update(dt) {
        t += dt;
        if (state === 0) {
          if (t >= 0.16 && !mesh.visible) {                 // the tree comes up out of the ground
            mesh.visible = true;
            g.vfx.debris('dirt', self.hornPos(_p), 8, { scale: 1.1 });
            g.vfx.emit('gorrakDust', { x: self.pos.x + dir.x * 1.5, y: 0.3, z: self.pos.z + dir.z * 1.5 }, { count: 8, scale: 1 });
          }
          g.creatures.boneWorld(self.rig, 'hornHand', [1.85, 1.3, 0.15], hand);
          axis.set(dir.x * 0.4, 1, dir.z * 0.4).normalize();
          mesh.position.copy(hand).addScaledVector(axis, 2.4);
          mesh.quaternion.setFromUnitVectors(_z, axis);
          y0 = hand.y;
          if (t >= REL) { state = 1; s = 1.6; }
        } else {
          s += speed * dt;
          const sink = Math.min(1, s / 5);
          const y = y0 * (1 - sink) + 1.15 * sink;
          mesh.position.set(from.x + dir.x * s, y, from.z + dir.z * s);
          axis.set(dir.x, -0.18 * (1 - sink), dir.z).normalize();
          rollA += dt * 7;
          mesh.quaternion.setFromUnitVectors(_z, axis).multiply(roll.setFromAxisAngle(_z, rollA));
          dustT -= dt;
          if (dustT <= 0) {
            dustT = 0.035;
            g.vfx.emit('gorrakDust', { x: mesh.position.x, y: 0.3, z: mesh.position.z }, { count: 1, scale: 0.9, speed: 0.5 });
            if (Math.random() < 0.4) g.vfx.emit('gorrakLeaf', { x: mesh.position.x, y: 1.4, z: mesh.position.z }, { count: 1, scale: 1 });
          }
          if (s >= len - 1) {
            g.vfx.debris('rock', { x: mesh.position.x, y: 0.5, z: mesh.position.z }, 6, { scale: 1.2 });
            g.vfx.emit('gorrakDust', { x: mesh.position.x, y: 0.5, z: mesh.position.z }, { count: 8, scale: 1.2 });
            return false;
          }
        }
        return true;
      },
      dispose() { mesh.visible = false; mesh.userData.busy = false; },
    };
    this.own(act);
  }

  // INTERMISSION 2 "King's Wrath" — he roars (every live pod ripens at once; more are flung first so at least two ripen)
  // and stamps three ring waves 3.2 s apart (dash through; ≥ the slowest dash recharge, 3.0 s). PURPOSE: ring-wave reading + spore clouds
  // dropped into the lanes, the signature of the last phase.
  kingsWrath() {
    const g = this.game;
    g.events.emit('bossTell', { enemy: this, kind: 'wrath', lead: 1.2 });
    this.face(g.player.pos);
    this.play('roar', 1.3, 0.7, null, 1.2);
    g.fx.shake(0.4, 'threat');
    const have = this.livePods();
    if (have < 2) {
      const spots = this.podSpots(2 - have + 1);
      spots.forEach((d, i) => this.after(0.55 + i * 0.1, () => this.lobPod(i * 2, d, 0.8)));
    }
    this.after(1.6, () => {
      for (const o of this.objects) if (o.tag === 'pod' && !o.dead) o.rush = true;
      g.fx.text({ x: this.pos.x, y: 3.6, z: this.pos.z }, 'THE PODS RIPEN', '#d8ff7a', true);
    });
    for (let i = 0; i < 3; i++) {
      const t0 = 1.0 + i * 3.2;
      this.after(t0, () => this.play('slam', 1.3, 0.9, null, 0.6));
      this.after(t0 + 0.9, () => {
        const at = this.pos.clone();
        this.groundHit(at, 4, { shake: 0.6 });
        g.events.emit('bossImpact', { enemy: this, pos: at, heavy: true });
        this.ringWave(at, { speed: 8, width: 0.9, maxR: this.arena.r + 2, dmg: 0.6, how: 'kings wrath' });
      });
    }
    return 9.0;
  }

  // ================================================================ hooks
  onDowned() {
    const g = this.game, v = g.vfx;
    this._mv = null;
    this.rig.lift = 0;
    g.fx.ring(this.pos, { color: 0xe8eef8, radius: 5, from: 1.2, life: 0.6, width: 0.1, hdr: 1.4 });
    this.dustAt(this.pos, 14, 1.3);
    // steel-white stars orbit the bowed head while he is down
    this._dizzy = true; this._starA = 0;
  }

  onRecovered() { this._stopDizzy(); }

  _stopDizzy() { this._dizzy = null; }

  onClearField() { this._mv = null; if (this.rig) this.rig.lift = 0; }

  // Cosmetic per-frame work: flung pods regrow, leap lift, rally rim, stars follow the head, horn blasts.
  visuals(dt) {
    const r = this.rig;
    if (!r) return;
    const pg = r.podGrow;
    for (let i = 0; i < 6; i++) if (pg[i] < 1) pg[i] = Math.min(1, pg[i] + dt / 5.5);
    r.lift = this._mv?.kind === 'leap' ? this._mv.lift : 0;
    if (this._rallyT > 0) r.rim = RALLY_RIM; else if (r.rim === RALLY_RIM) r.rim = null;   // orange rim: a Runner rallied him
    if (this._dizzy) {   // stars circle the bowed head (the poise colour): two glints per frame on a ring around it
      this.game.creatures.boneWorld(r, 'head', [0, 4.45, 1.0], this._dizzyPos);
      this._starA += dt * 4.5;
      for (let i = 0; i < 2; i++) { const a = this._starA + i * Math.PI; this.game.vfx.emit('gorrakStar', { x: this._dizzyPos.x + Math.cos(a) * 1.5, y: this._dizzyPos.y + 0.6, z: this._dizzyPos.z + Math.sin(a) * 1.5 }, { count: 1 }); }
    }
    const c = this.cast;
    if (c?.check && c.name === 'War Horn' && !this.downed) {
      // blasts land on the hornHold breath cycle: first at 1.58 s, then every 1.15 s
      this._hornClock += dt;
      if (this._hornClock >= this._hornNext) { this._hornNext += 1.15; this.hornPulse(); }
    }
  }

  onDispose(game) {
    if (game.player?.buffs.delete('spores')) game.player.recalcStats();
    this._stopDizzy();
    for (const t of this.trees) game.scene.remove(t);
    this.trees.length = 0;
  }
}

// Spore-lime ground ring for the pod timer (additive, no depth test: decal layer). Not gold: gold means
// "go here", and a pod is something to shoot (playtest round 2).
const POD_RING = 0xb8ff3c;
function blendRing(opacity) {
  return blendAddMaterial(POD_RING, { hdr: 1.5, occ: 0.4, opacity, side: THREE.DoubleSide, depthTest: false });
}

// Zones have no dispose hook: wrap it so their VFX emitters / decals stop with them.
function patchDispose(z, parts) {
  const d0 = z.dispose.bind(z);
  z.dispose = (g) => { for (const p of parts) (p.stop ?? p.end)?.call(p); d0(g); };
}
