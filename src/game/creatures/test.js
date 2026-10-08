import { defineCreature, TAU } from './rig.js';

// Pipeline smoke test creature (not used in game).
export const testBiped = defineCreature({
  id: 'testBiped',
  stride: 1.2,
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 0.6, 0] },
    { name: 'chest', parent: 'hips', pivot: [0, 0.75, 0] },
    { name: 'head', parent: 'chest', pivot: [0, 1.05, 0] },
    { name: 'armL', parent: 'chest', pivot: [0.28, 0.98, 0] },
    { name: 'armR', parent: 'chest', pivot: [-0.28, 0.98, 0] },
    { name: 'legL', parent: 'hips', pivot: [0.12, 0.6, 0] },
    { name: 'legR', parent: 'hips', pivot: [-0.12, 0.6, 0] },
  ],
  build(pb) {
    pb.box(0.42, 0.45, 0.3, { bone: 'chest', pos: [0, 0.85, 0], color: 0x6b4a2a, taper: [1.2, 1.1] });
    pb.blob(0.26, { bone: 'head', pos: [0, 1.25, 0.03], color: 0x7fb24a, detail: 1 });
    pb.sphere(0.04, { bone: 'head', pos: [0.09, 1.28, 0.24], color: 0xffd040, emis: 3 });
    pb.sphere(0.04, { bone: 'head', pos: [-0.09, 1.28, 0.24], color: 0xffd040, emis: 3 });
    pb.mirror((s, k) => {
      pb.cone(0.08, 0.35, { bone: 'head', pos: [0.3 * k, 1.3, 0], rot: [0, 0, -k * 1.2], color: 0x7fb24a });
      pb.box(0.12, 0.45, 0.12, { bone: 'arm' + s, pos: [0.32 * k, 0.78, 0], color: 0x7fb24a });
      pb.box(0.14, 0.6, 0.16, { bone: 'leg' + s, pos: [0.12 * k, 0.3, 0], color: 0x3a2a1a });
    });
    pb.box(0.06, 0.6, 0.06, { bone: 'armR', pos: [-0.32, 0.6, 0.25], rot: [1.2, 0, 0], color: 0x999999 });
  },
  animate(P, s, B) {
    const w = s.walk, m = s.move;
    P.rot(B.legL, Math.sin(w) * 0.6 * m).rot(B.legR, -Math.sin(w) * 0.6 * m);
    P.rot(B.armL, -Math.sin(w) * 0.5 * m).rot(B.armR, Math.sin(w) * 0.5 * m);
    P.move(B.hips, 0, Math.abs(Math.cos(w)) * 0.06 * m, 0);
    P.rot(B.chest, 0.05 + Math.sin(s.t * 2 + s.seed * TAU) * 0.03, Math.sin(w) * 0.12 * m, 0);
  },
});
