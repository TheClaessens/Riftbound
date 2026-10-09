import { defineHero, pose, keys, twoKey, rest, idle, gait, aimTwist, cloth, hit, deathCommon, stomp, smooth } from './hero.js';

// Placeholder hero AND the reference for the layer pipeline every class follows (bible §4.1 order):
//   rest → idle → gait → aimTwist → cloth → stance/recoil → action keys → dash → hit → death/victory.
// One simple part per core bone, tinted per class. Viewer: /dev/creatures.html?set=../heroes/pyromancer

const BONES = [
  { name: 'root' },
  { name: 'hips', pivot: [0, 0.9, 0] },
  { name: 'spine', parent: 'hips', pivot: [0, 1.02, 0] },
  { name: 'chest', parent: 'spine', pivot: [0, 1.22, 0] },
  { name: 'head', parent: 'chest', pivot: [0, 1.55, 0.02] },
  { name: 'armL', parent: 'chest', pivot: [0.27, 1.44, 0] },
  { name: 'foreL', parent: 'armL', pivot: [0.31, 1.16, 0] },
  { name: 'handL', parent: 'foreL', pivot: [0.33, 0.9, 0.02] },
  { name: 'armR', parent: 'chest', pivot: [-0.27, 1.44, 0] },
  { name: 'foreR', parent: 'armR', pivot: [-0.31, 1.16, 0] },
  { name: 'handR', parent: 'foreR', pivot: [-0.33, 0.9, 0.02] },
  { name: 'focus', parent: 'handR', pivot: [-0.33, 0.9, 0.02] },
  { name: 'thighL', parent: 'hips', pivot: [0.12, 0.88, 0] },
  { name: 'shinL', parent: 'thighL', pivot: [0.12, 0.48, 0.01] },
  { name: 'footL', parent: 'shinL', pivot: [0.12, 0.1, 0] },
  { name: 'thighR', parent: 'hips', pivot: [-0.12, 0.88, 0] },
  { name: 'shinR', parent: 'thighR', pivot: [-0.12, 0.48, 0.01] },
  { name: 'footR', parent: 'shinR', pivot: [-0.12, 0.1, 0] },
  { name: 'cape', parent: 'chest', pivot: [0, 1.45, -0.16] },
];

// staff held vertical in the right hand: counter-rotate the arm chain
const STANCE = pose({ armR: [-1.0, 0, -0.15], foreR: [-0.3, 0, 0], focus: [-1.0, 0, 0], armL: [-1.2, 0, 0.25], foreL: [-0.2, 0, 0], chest: [0, 0.15, 0] });
const H_RAISE = pose({ armR: [-2.6, 0, -0.15], foreR: [-0.3, 0, 0], focus: [2.9, 0, 0], armL: [-2.2, 0, 0.4], spine: [-0.2, 0, 0], 'hips.m': [0, 0.04, 0] });
const H_SLAM = pose({ armR: [-0.7, 0, -0.1], foreR: [-0.5, 0, 0], focus: [0.0, 0, 0], spine: [0.35, 0, 0], 'hips.m': [0, -0.1, 0], thighL: [0, 0, 0.25], thighR: [0, 0, -0.25], shinL: [0.5, 0, 0], shinR: [0.5, 0, 0] });
const T_WIND = pose({ chest: [0, -0.5, 0], armR: [0.4, 0, -0.6], foreR: [-1.2, 0, 0] });
const T_REL = pose({ chest: [0, 0.45, 0], armR: [-1.6, 0, -0.1], foreR: [-0.05, 0, 0], focus: [-1.4, 0, 0], spine: [0.2, 0, 0], thighL: [-0.4, 0, 0], thighR: [0.3, 0, 0] });
const N_GATHER = pose({ 'hips.m': [0, -0.18, 0], spine: [0.5, 0, 0], armL: [-1.0, 0, -0.5], armR: [-1.0, 0, 0.5], foreL: [-1.4, 0, 0], foreR: [-1.4, 0, 0] });
const N_BURST = pose({ spine: [-0.25, 0, 0], head: [-0.3, 0, 0], armL: [-0.4, 0, 1.6], armR: [-0.4, 0, -1.6], 'hips.m': [0, 0.06, 0], cape: [-0.4, 0, 0] });
const DASH = pose({ spine: [0.6, 0, 0], head: [-0.45, 0, 0], armL: [0.9, 0, 0.4], armR: [0.6, 0, -0.3], thighL: [-0.9, 0, 0], shinL: [0.6, 0, 0], thighR: [0.8, 0, 0], shinR: [0.9, 0, 0], 'hips.m': [0, -0.08, 0], 'root.s': [0.95, 0.95, 1.2], cape: [1.0, 0, 0] });
const VICTORY = pose({ armR: [-3.0, 0, -0.1], foreR: [0, 0, 0], focus: [3.0, 0, 0], armL: [0, 0, 0.6] });
const DEATH = pose({ 'hips.m': [0, -0.45, 0], thighL: [-1.3, 0, 0], shinL: [2.0, 0, 0], thighR: [-0.4, 0, 0], shinR: [1.9, 0, 0], spine: [0.6, 0, 0], armR: [-0.6, 0, -0.1] });
const GAIT = { A: 0.7, K: 1.0, bob: 0.05, lean: 0.15, arm: 0.5, hy: 0.1, focusArm: 0.5 };

export function mannequin(id, c) {
  return defineHero({
    id,
    bones: BONES,
    stride: 1.85,
    gait: GAIT,
    muzzle: { bone: 'focus', at: [-0.33, 1.95, 0.02] },
    hand: { bone: 'handL', at: [0.33, 0.82, 0.06] },
    build(pb) {
      const ROBE = c.robe, DARK = c.dark, SKIN = 0xe0b48c, GLOW = c.glow;
      pb.mirror((s, k) => {
        pb.box(0.16, 0.42, 0.16, { bone: 'thigh' + s, pos: [0.12 * k, 0.68, 0], color: DARK });
        pb.box(0.14, 0.38, 0.14, { bone: 'shin' + s, pos: [0.12 * k, 0.29, 0.01], color: DARK });
        pb.box(0.16, 0.1, 0.26, { bone: 'foot' + s, pos: [0.12 * k, 0.05, 0.05], color: 0x3a2618 });
        pb.box(0.13, 0.3, 0.13, { bone: 'arm' + s, pos: [0.29 * k, 1.3, 0], color: ROBE });
        pb.box(0.12, 0.27, 0.12, { bone: 'fore' + s, pos: [0.32 * k, 1.03, 0.01], color: ROBE });
        pb.sphere(0.07, { bone: 'hand' + s, pos: [0.33 * k, 0.85, 0.02], color: SKIN });
      });
      pb.box(0.44, 0.3, 0.3, { bone: 'hips', pos: [0, 0.9, 0], color: ROBE });
      pb.box(0.4, 0.25, 0.26, { bone: 'spine', pos: [0, 1.12, 0], color: ROBE });
      pb.box(0.5, 0.3, 0.3, { bone: 'chest', pos: [0, 1.38, 0], color: ROBE });
      pb.box(0.42, 0.8, 0.05, { bone: 'cape', pos: [0, 1.05, -0.2], color: DARK });
      pb.sphere(0.17, { bone: 'head', pos: [0, 1.68, 0.02], color: SKIN });
      pb.mirror((s, k) => pb.sphere(0.03, { bone: 'head', pos: [0.06 * k, 1.7, 0.17], color: 0xffffff, emis: -2 }));
      pb.cone(0.22, 0.4, { bone: 'head', pos: [0, 1.95, 0], color: DARK });
      pb.cyl(0.03, 0.035, 1.6, { bone: 'focus', pos: [-0.33, 1.05, 0.02], color: 0x6b4426 });
      pb.sphere(0.1, { bone: 'focus', pos: [-0.33, 1.95, 0.02], color: GLOW, emis: 2.5 });
    },
    animate(L, s, B, H) {
      const lower = H.standing;                       // full-body keys only when standing
      rest(L, B);
      // staff upright at rest: forearm forward, focus counter-rotated
      L.add(B.foreR, -0.8, 0, 0); L.add(B.focus, 0.98, 0, 0);
      idle(L, s, B, H, { a: 0.02, f: 1.8, cloth: [B.cape] });
      gait(L, s, B, H, GAIT, 'L');
      aimTwist(L, s, B, H);
      cloth(L, s, B, B.cape, H);
      // starter stance + recoil
      keys(L, B, STANCE, H.hold);
      L.add(B.armR, -0.2 * H.shot, 0, 0); L.add(B.foreR, 0.3 * H.shot, 0, 0);
      // actions
      if (H.act === 'heavy') { const [a, b] = twoKey(H.k, 0.18, 0.36, 0.6); keys(L, B, H_RAISE, a, lower); keys(L, B, H_SLAM, b, lower); }
      else if (H.act === 'throw') { const [a, b] = twoKey(H.k, 0.2, 0.35, 0.5); keys(L, B, T_WIND, a, lower); keys(L, B, T_REL, b, lower); }
      else if (H.act === 'nova') { const [a, b] = twoKey(H.k, 0.25, 0.4, 0.6); keys(L, B, N_GATHER, a, lower); keys(L, B, N_BURST, b, lower); }
      else if (H.act === 'dash') keys(L, B, DASH, smooth(H.k / 0.1) * (1 - smooth((H.k - 0.6) / 0.4)));
      else if (H.act === 'arrive') { const w = 1 - smooth(H.k); L.mv(B.hips, 0, -0.16 * w, 0); L.add(B.thighL, -0.5 * w, 0, 0); L.add(B.thighR, -0.5 * w, 0, 0); L.add(B.shinL, w, 0, 0); L.add(B.shinR, w, 0, 0); }
      else if (H.act === 'victory') keys(L, B, VICTORY, smooth(H.k / 0.3));
      stomp(L, B, H);
      hit(L, s, B, [B.cape]);
      if (H.act === 'death') { keys(L, B, DEATH, smooth((H.k - 0.15) / 0.35)); deathCommon(L, B, H.k); }
    },
  });
}
