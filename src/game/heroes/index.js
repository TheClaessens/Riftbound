import * as THREE from 'three';
import { ELEMENT_COLOR } from '../../core/utils.js';
import { HERO_LAYER } from '../../core/engine.js';
import { CreatureRenderer } from '../creatures/renderer.js';
import { newHeroState } from './hero.js';
import { pyromancerHero } from './pyromancer.js';
import { arcanistHero } from './arcanist.js';
import { cryomancerHero } from './cryomancer.js';
import { stormcallerHero } from './stormcaller.js';

// =====================================================================================
//  Hero registry + HeroModel (the controller: design/research/09-hero-bible.md §4.1, §4.5–4.8, §5).
//  The player's body is a creature-rig instance on its own renderer (game.heroes: 2.0 px outline,
//  drawn after the ground ring). HeroModel owns every bit of animation state and writes the
//  channels in h.hero (see heroes/hero.js); each class's animate() stays stateless.
//
//    model.update(dt, { player, moving, dashing })   · model.cast(def, slot) · model.dashStart(kind)
//    model.hit() · model.perfect() · model.die() · model.victory() · model.channel(on)
//    model.muzzle(out) / model.hand(out) / model.emitter(name, out)    world points (visual only)
// =====================================================================================

export const HEROES = { pyromancer: pyromancerHero, arcanist: arcanistHero, cryomancer: cryomancerHero, stormcaller: stormcallerHero };
export const HERO_ELEMENT = { pyromancer: 'fire', arcanist: 'arcane', cryomancer: 'frost', stormcaller: 'storm' };
const ELEMENT_HI = { fire: 0xffd0a8, frost: 0xe2f8ff, storm: 0xfff7c8, arcane: 0xe6d2ff };

// Pose per skill (bible §4.7). Starter + LMB fusions = shot; everything else not listed = throw.
const POSE = {
  heavy: new Set(['meteor', 'blizzard', 'singularity', 'cataclysm', 'absoluteZero']),
  nova: new Set(['frostNova']),
};
const ACT_T = { throw: 0.4, heavy: 0.55, nova: 0.45, arrive: 0.32, death: 1.4, victory: 1.6 };
const DASH_EXIT = { flame: 0.14, frost: 0.15, storm: 0.10, blink: 0 };

const _c = new THREE.Color();
const wrap = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function heroRenderer(scene, camera) {
  return (scene.userData.heroRenderer ??= new CreatureRenderer(scene, camera, { outlinePx: 2.0, renderOrder: 21 }));
}

export class HeroModel {
  constructor(game, classId) {
    this.game = game;
    this.classId = classId;
    this.def = HEROES[classId] ?? HEROES.pyromancer;
    this.element = HERO_ELEMENT[classId] ?? 'fire';
    this.renderer = game.heroes ?? heroRenderer(game.scene, game.camera);
    this.pos = new THREE.Vector3();
    const h = this.h = this.renderer.add(this.def, { pos: this.pos, track: true, seed: 0.5, turnRate: 14 });
    h.color = [1, 1, 1];
    _c.set(ELEMENT_HI[this.element]);
    h.rim = [_c.r, _c.g, _c.b, 0.45];
    this.H = h.hero = newHeroState();
    this._act = { name: '', t: 0, dur: 1 };
    this._lastShot = -9;
    this._lastCast = -9;
    this._accentT = 0;
    this._accentEl = null;
    this._idleT = 0;
    this._nextFidget = 3 + Math.random() * 3;
    this._fidgetT = -1;
    this._prevSin = 0;
    this._channel = false;
    this._unhide = -1;
    this._pulse = 0;
    this.time = 0;
    this.root = new THREE.Group();          // non-rig attachments that follow the hero (ground ring + aim notch)
    // storm's element yellow reads as SAFE_GOLD on the floor: the Stormcaller's ground ring is electric white-blue
    this.ring = groundRing(this.element === 'storm' ? 0xcfe0ff : ELEMENT_COLOR[this.element]);
    this.notch = this.ring.userData.notch;
    this.root.add(this.ring);
    game.scene.add(this.root);
    // readability layer (engine HeroMaskPass): the ring and the rig also render on HERO_LAYER; the light
    // band of the covered-hero rim is the class element's pale highlight
    this.root.traverse((o) => o.layers.enable(HERO_LAYER));
    this.readRim = new THREE.Color(ELEMENT_HI[this.element]).multiplyScalar(1.15);
  }

  // ---------------------------------------------------------------- events
  cast(def, slot) {
    const H = this.H, now = this.time;
    this._lastCast = now;
    this._pulse = 1;
    if (def.element && def.element !== this.element) { this._accentEl = def.element; this._accentT = 0.9; }
    if (!def.cast) return;
    if (slot === 0) {
      const dt = now - this._lastShot;
      H.shot = Math.min(1, dt / 0.28);
      H.shotN++;
      this._lastShot = now;
    } else if (POSE.heavy.has(def.id)) this._start('heavy');
    else if (POSE.nova.has(def.id)) this._start('nova');
    else this._start('throw');
  }
  dashStart(kind) {
    const p = this.game.player;
    this.H.dashN++;
    if (kind === 'blink') { this._start('arrive'); this.h.hidden = true; this._unhide = 0.06; return; }
    this._start('dash', (p?.dash.def.dur ?? 0.16) + (DASH_EXIT[kind] ?? 0.12));
  }
  hit() { this.h.flash(); }
  perfect() { this.H.perfect = 1; }
  die() { if (this._act.name !== 'death') this._start('death'); }
  victory() { if (this._act.name !== 'victory') this._start('victory'); }
  channel(on) { this._channel = on; }

  _start(name, dur = ACT_T[name]) {
    const a = this._act;
    if (a.name === 'death' && name !== 'death') return;
    a.name = name; a.t = 0; a.dur = dur;
  }

  // ---------------------------------------------------------------- world points (visual only)
  muzzle(out = new THREE.Vector3()) { const m = this.def.muzzle; return this.renderer.boneWorld(this.h, m.bone, m.at, out); }
  // the hand that fired the last starter shot (alternating classes), else the muzzle
  hand(out = new THREE.Vector3()) {
    const c = this.def.castHands;
    const which = typeof c === 'function' ? c(this.H.shotN) : c === 'alt' && (this.H.shotN & 1) === 0 ? 'hand' : 'muzzle';
    const m = which === 'hand' ? this.def.hand : which === 'muzzle' ? this.def.muzzle : (this.def.emitters[which] ?? this.def.muzzle);
    return this.renderer.boneWorld(this.h, m.bone, m.at, out);
  }
  emitter(name, out = new THREE.Vector3()) {
    const m = this.def.emitters[name];
    return m ? this.renderer.boneWorld(this.h, m.bone, m.at, out) : out.copy(this.pos);
  }

  // ---------------------------------------------------------------- per frame
  // ctx: { player, moving, dashing }
  update(dt, ctx) {
    const p = ctx.player, game = this.game, h = this.h, H = this.H, A = this._act;
    this.time += dt;
    const now = this.time;
    this.pos.copy(p.pos);
    this.root.position.copy(p.pos);
    // the renderer re-creates its meshes when it grows: keep them on the readability layer
    for (const b of this.renderer.batches.values()) { b.mesh?.layers.enable(HERO_LAYER); b.hull?.layers.enable(HERO_LAYER); }

    // ---- action clock
    if (A.name) {
      A.t += dt;
      const k = A.t / A.dur;
      if (k >= 1) {
        if (A.name === 'death') H.k = 1;
        else if (A.name === 'victory') { A.t = A.dur; H.k = 1; }   // class animate loops a calm variant at k = 1
        else { A.name = ''; H.k = 0; }
      } else H.k = k;
    }
    const dead = A.name === 'death';
    H.act = A.name || (this._channel ? 'channel' : '');
    if (H.act === 'channel') H.k = (now % 1);
    if (this._unhide >= 0) { this._unhide -= dt; if (this._unhide < 0) h.hidden = false; }

    // ---- stance + recoil (bible §4.6): hold → 1 in 0.06 s while the starter fires, → 0 in 0.3 s
    const starter = p.slots[0];
    const firing = starter && now - this._lastShot < (starter.def.cooldown(starter.rank) + 0.1);
    H.hold = firing ? Math.min(1, H.hold + dt / 0.06) : Math.max(0, H.hold - dt / 0.3);
    H.shot *= Math.exp(-dt / 0.07);

    // ---- facing + upper/lower split (bible §4.5)
    const aimYaw = Math.atan2(p.facing.x, p.facing.z);
    const spd = Math.hypot(p.vel.x, p.vel.z);
    const moving = spd > 1;
    const moveYaw = moving ? Math.atan2(p.vel.x, p.vel.z) : aimYaw;
    H.casting = H.hold > 0.05 || now - this._lastCast < 0.5 || H.act === 'heavy' || H.act === 'throw' || H.act === 'nova' || H.act === 'channel';
    if (!dead) {
      if (ctx.dashing && p.dash.dir) { h.yaw = Math.atan2(p.dash.dir.x, p.dash.dir.z); h.turnRate = 40; }
      else { h.yaw = H.casting || !moving ? aimYaw : moveYaw; h.turnRate = 14; }
    }
    const root = h._yaw;
    H.aimRel = wrap(aimYaw - root);
    const d = moving ? wrap(moveYaw - root) : 0;
    H.moveRel = d;
    if (!H.back && Math.abs(d) > 1.92) H.back = true;
    else if (H.back && Math.abs(d) < 1.57) H.back = false;
    const tgt = moving ? clamp(H.back ? wrap(d - Math.PI) : d, -0.7, 0.7) : 0;
    H.psi += (tgt - H.psi) * (1 - Math.exp(-10 * dt));
    H.mu = d - H.psi;
    H.moving = h.move;
    H.sp = Math.min(1, h.speed / 6.5);
    H.standing = 1 - h.move;

    // ---- footfall stomp (|sin φ| crosses 0.95)
    const sn = Math.abs(Math.sin(h.walk));
    if (sn >= 0.95 && this._prevSin < 0.95 && h.move > 0.5) H.stomp = 1;
    this._prevSin = sn;
    H.stomp = Math.max(0, H.stomp - dt / 0.06);

    // ---- idle fidget: after 3 s idle, every 7–10 s
    const idle = !moving && !H.casting && !A.name;
    this._idleT = idle ? this._idleT + dt : 0;
    if (this._fidgetT >= 0) {
      this._fidgetT += dt;
      H.fidget = Math.min(1, this._fidgetT / 1.2);
      if (this._fidgetT >= 1.2 || !idle) { this._fidgetT = -1; H.fidget = 0; this._nextFidget = this._idleT + 7 + Math.random() * 3; }
    } else if (idle && this._idleT > Math.max(3, this._nextFidget)) { this._fidgetT = 0; H.fidgetN++; }
    if (!idle && this._idleT === 0) this._nextFidget = 3;

    // ---- class meter (bible §5)
    H.armor = p.frostArmor ?? 0;
    switch (this.classId) {
      case 'stormcaller': H.meter = (p.charge ?? 0) / 100; break;
      case 'arcanist': H.meter = Math.min(1, (game.chain ?? 0) / 25); break;
      case 'cryomancer': H.meter = H.armor / 3; break;
      default: {
        let n = 0;
        for (const e of game.queryEnemies(p.pos, 6, (this._q ??= []))) if (!e.dead && !e.inert && e.status?.burn > 0) n++;
        H.meter += (Math.min(1, n / 5) - H.meter) * (1 - Math.exp(-4 * dt));
      }
    }
    H.perfect = Math.max(0, H.perfect - dt / 0.35);

    // ---- glow, accent (last-cast element / Perfect Dodge), i-frame tint pulse
    h.glow = dead ? Math.max(0, 0.45 * (1 - (H.k - 0.5) * 4)) : 0.45 + 0.9 * H.shot + 0.6 * this._pulse;
    this._pulse = Math.max(0, this._pulse - dt * 6);
    this._accentT = Math.max(0, this._accentT - dt);
    if (H.perfect > 0) { _c.set(0x9dffb0); h.accent = [_c.r, _c.g, _c.b, 0.6]; }
    else if (this._accentT > 0 && this._accentEl) {
      _c.set(ELEMENT_COLOR[this._accentEl]);
      h.accent = [_c.r, _c.g, _c.b, 0.7 * Math.min(1, this._accentT / 0.3)];
    } else h.accent = null;
    if (!dead && p.invuln > 0 && !ctx.dashing && p.dash.window <= 0 && Math.floor(p.invuln * 20) % 2 === 1) h.tint = ELEMENT_HI[this.element];
    else h.tint = dead && H.k > 0.75 ? 0xefe9ff : null;

    // ---- ground ring: aim notch + cast pulse; hidden once the hero is recalled
    this.notch.rotation.z = aimYaw;   // ring is rotated −90° about X: local z = world yaw
    this.ring.scale.setScalar(1.15 * (1 + 0.06 * this._pulse));
    this.ring.visible = !this.hideRing && !(dead && H.k > 0.8);
  }

  dispose() {
    this.renderer.remove(this.h);
    this.game.scene.remove(this.root);
  }
}

// Ground ring under the hero (always visible through grass), drawn BEFORE the hero (renderOrder 19/20 in
// the opaque list via custom blending), so the hero's boots stand on it. A crown-point notch shows the aim.
function groundRing(color) {
  const blend = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: false, depthWrite: false, depthTest: false };
  const mat = new THREE.MeshBasicMaterial({ color, opacity: 0.95, ...blend });
  mat.color.multiplyScalar(1.15);
  const ring = new THREE.Mesh(RING_GEO.ring, mat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  ring.scale.setScalar(1.15);
  ring.renderOrder = 20;
  // readability (playtest round 1 #3): a darker ink outline and a thin near-white inner line make the ring
  // crisp on every ground (orange on the dirt road, cyan on water). Opacity stays < 1: the engine's hero mask
  // tells ring (alpha ~0.9) from rig (alpha 1) by it.
  const outline = new THREE.Mesh(RING_GEO.outline, new THREE.MeshBasicMaterial({ color: 0x0a0812, opacity: 0.78, ...blend }));
  outline.renderOrder = 19; outline.position.z = -0.005;
  ring.add(outline);
  const hot = new THREE.Mesh(RING_GEO.hot, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.7), opacity: 0.95, ...blend }));
  hot.material.color.multiplyScalar(1.1);
  hot.renderOrder = 20; hot.position.z = 0.002;
  ring.add(hot);
  const disc = new THREE.Mesh(RING_GEO.disc, new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.25, ...blend }));
  disc.renderOrder = 19;
  disc.scale.setScalar(0.62 / 1.15); disc.position.z = -0.01;
  ring.add(disc);
  // aim notch: a small crown point just outside the ring, rotated to the aim yaw
  const notch = new THREE.Group();
  const tip = new THREE.Mesh(RING_GEO.notch, mat);
  tip.renderOrder = 20;
  const tipOut = new THREE.Mesh(RING_GEO.notchOutline, outline.material);
  tipOut.renderOrder = 19; tipOut.position.z = -0.004;
  notch.add(tipOut, tip);
  ring.add(notch);
  ring.userData.notch = notch;
  return ring;
}

const RING_GEO = (() => {
  // crown point pointing along local −Y of the rotated ring = world +Z at notch.rotation.z = 0 (yaw 0 faces +Z)
  const crown = (s, r0) => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.09 * s, r0); sh.lineTo(0.09 * s, r0); sh.lineTo(0.06 * s, r0 + 0.05 * s);
    sh.lineTo(0.03 * s, r0 + 0.03 * s); sh.lineTo(0, r0 + 0.14 * s); sh.lineTo(-0.03 * s, r0 + 0.03 * s); sh.lineTo(-0.06 * s, r0 + 0.05 * s);
    const g = new THREE.ShapeGeometry(sh);
    g.rotateZ(Math.PI); // points away from the centre toward −Y (world +Z)
    return g;
  };
  return {
    ring: new THREE.RingGeometry(0.6, 0.75, 32),
    outline: new THREE.RingGeometry(0.55, 0.8, 32),
    hot: new THREE.RingGeometry(0.6, 0.645, 48),
    disc: new THREE.CircleGeometry(1, 24),
    notch: crown(1, 0.78),
    notchOutline: crown(1.35, 0.74),
  };
})();
