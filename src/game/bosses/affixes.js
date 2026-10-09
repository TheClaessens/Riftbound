import * as THREE from 'three';

// =====================================================================================
//  Boss affixes ("Heat" from the Obelisk of Wrath). Generic: they work on every BossBase.
//  def: { id, name, icon (SVG sprite id, ui-icons), desc, init(boss), update(boss, dt) }
//  BossBase reads the multipliers it sets: _affixDmg, _affixGap, _affixPoise, _affixDownedCut;
//  'reverberating' is handled in BossBase._resolve.
// =====================================================================================

export const AFFIXES = {
  frenzied: {
    id: 'frenzied', name: 'Frenzied', icon: 'affixFrenzied',
    desc: 'Attacks come 20% faster.',
    init: (b) => { b._affixGap *= 0.8; },
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark', icon: 'affixBulwark',
    desc: 'Break Checks need 30% more Stagger; Downed lasts 1 s less.',
    init: (b) => { b._affixPoise *= 1.3; b._affixDownedCut += 1; b.poise.mult *= 1.3; },
  },
  reverberating: {
    id: 'reverberating', name: 'Reverberating', icon: 'affixReverb',
    desc: 'Every impact sends out a small shockwave. Dash through it.',
  },
  riftstorm: {
    id: 'riftstorm', name: 'Rift Storm', icon: 'affixStorm',
    desc: 'Rift lightning strikes near you every 6 s.',
    init: (b) => { b._stormT = 6; },
    update: (b, dt) => {
      b._stormT -= dt;
      if (b._stormT > 0) return;
      b._stormT = 6;
      const p = b.game.player.pos;
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 4;
        const at = new THREE.Vector3(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d);
        b.circle(at, 1.8, 1.1, { dmg: 0.6, how: 'rift storm', noEcho: true, onResolve: () => {
          b.game.fx.lightning({ x: at.x, y: 9, z: at.z }, at, { color: 0xc8b4ff });
        } });
      }
    },
  },
  vengeful: {
    id: 'vengeful', name: 'Vengeful', icon: 'affixVengeful',
    desc: '+12% damage. Each phase gate makes it 6% stronger.',
    init: (b) => { b._affixDmg *= 1.12; },
    update: (b) => { b._affixDmg = 1.12 * (1 + 0.06 * (b.phase - 1)); },
  },
};
export const AFFIX_IDS = Object.keys(AFFIXES);
