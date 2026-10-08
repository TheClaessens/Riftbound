// =====================================================================================
//  Playable classes. Each has a starter skill (locked to slot 0 / LMB), a dash variant,
//  a trait that rewards a playstyle, a stat tilt and an unlock condition (see meta.js).
// =====================================================================================

export const CLASSES = {
  arcanist: {
    id: 'arcanist', name: 'Arcanist', title: 'Weaver of the Rift', element: 'arcane', color: '#c08cff', hex: 0xb67cff,
    starter: 'arcaneBolt',
    dash: { name: 'Phase Step', kind: 'blink', cd: 2.4, dist: 5.5, dur: 0.06, charges: 1, desc: 'Blink forward. Arrival burst detonates statuses.' },
    trait: { id: 'resonance', name: 'Resonance', desc: '+2% damage and +1% cooldown reduction per Chain (max 25).' },
    playstyle: 'Weave elements. Keep the Chain alive.',
    tilt: 'Balanced',
    apply: () => {},
    unlock: null,
  },
  pyromancer: {
    id: 'pyromancer', name: 'Pyromancer', title: 'Kindler of Ruin', element: 'fire', color: '#ff7a33', hex: 0xff6a1f,
    starter: 'cinderBolt',
    dash: { name: 'Flame Dash', kind: 'flame', cd: 3.0, dist: 5, dur: 0.16, charges: 1, desc: 'Dash, leaving a trail of fire.' },
    trait: { id: 'wildfire', name: 'Wildfire', desc: 'Burning foes explode on death, spreading Burn.' },
    playstyle: 'Dive into the pack. Let it spread.',
    tilt: '+10% damage, −10 max HP',
    apply: (s) => { s.damage += 0.1; s.maxHp -= 10; },
    unlock: { id: 'killWarden', text: 'Defeat the Hollow Warden' },
  },
  cryomancer: {
    id: 'cryomancer', name: 'Cryomancer', title: 'Keeper of Stillness', element: 'frost', color: '#7fe0ff', hex: 0x66d9ff,
    starter: 'iceShard',
    dash: { name: 'Glacial Slide', kind: 'frost', cd: 2.8, dist: 5, dur: 0.2, charges: 1, desc: 'Slide, chilling everything you pass.' },
    trait: { id: 'permafrost', name: 'Permafrost', desc: 'Frozen foes take +35% damage. Freezing grants Frost Armor (max 3).' },
    playstyle: 'Control the field. Shatter what is still.',
    tilt: '+30 max HP, −5% move speed',
    apply: (s) => { s.maxHp += 30; s.moveSpeed *= 0.95; },
    unlock: { id: 'reactions4', text: 'Discover 4 reactions' },
  },
  stormcaller: {
    id: 'stormcaller', name: 'Stormcaller', title: 'Rider of the Tempest', element: 'storm', color: '#ffe45c', hex: 0xffe14a,
    starter: 'spark',
    dash: { name: 'Lightning Dash', kind: 'storm', cd: 1.8, dist: 6, dur: 0.12, charges: 2, desc: 'Two charges. Shocks foes you pass through.' },
    trait: { id: 'momentum', name: 'Momentum', desc: 'Moving builds Charge (+0.5% damage each, max 100). Standing still drains it.' },
    playstyle: 'Never stop moving.',
    tilt: '+10% move speed, −10 max HP',
    apply: (s) => { s.moveSpeed *= 1.1; s.maxHp -= 10; },
    unlock: { id: 'reachAct3', text: 'Reach the Shattered Crown (Act III)' },
  },
};

export const CLASS_ORDER = ['arcanist', 'pyromancer', 'cryomancer', 'stormcaller'];
export const STARTER_IDS = new Set(Object.values(CLASSES).map((c) => c.starter));
