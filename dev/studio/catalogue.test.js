// node --test dev/studio/   (the Studio's asset catalogue against the real sources)
import test from 'node:test';
import assert from 'node:assert/strict';
import catalogue from './catalogue.js';

const list = await catalogue();
const get = (id) => list.find((a) => a.id === id);
const anchors = (id) => get(id).anchors.map((a) => a.name);

test('creatures are grouped by the viewer set that exports them', () => {
  assert.deepEqual([get('goblinGrunt').group, get('ashHusk').group, get('wraith').group], ['greenskins', 'warband', 'wyrmkin']);
  assert.equal(get('goblinGrunt').name, 'Goblin Grunt');
  assert.equal(get('goblinGrunt').set, undefined);
});

test('a creature anchors on the generic poses plus the actions its animate reads', () => {
  assert.deepEqual(anchors('goblinShaman'), ['idle', 'walk', 'hit', 'die', 'cast']);
  assert.deepEqual(anchors('magmaRam'), ['idle', 'walk', 'hit', 'die', 'windup', 'charge', 'recover', 'attack']);   // via `act = s.action`
  assert.deepEqual(get('goblinShaman').anchors.find((a) => a.name === 'cast').range, [0, 1]);
});

test('bosses come from bossModels, with their ACT table as anchors', () => {
  assert.equal(get('gorrak').group, 'bossModels');
  assert.ok(['slam', 'backhand', 'summon', 'hornHold'].every((n) => anchors('gorrak').includes(n)));
  assert.equal(anchors('gorrak').filter((n) => n === 'die').length, 1);
});

test('heroes are keyed by export name and carry their own set path', () => {
  const h = get('pyromancerHero');
  assert.deepEqual([h.name, h.group, h.set], ['Pyromancer', 'heroes', '../heroes/pyromancer']);
  assert.ok(['run', 'shot', 'heavy', 'victory'].every((n) => anchors('pyromancerHero').includes(n)));
  assert.equal(list.filter((a) => a.group === 'heroes').length, 4);
});

test('ids are unique and REGISTER tables are skipped', () => {
  assert.equal(new Set(list.map((a) => a.id)).size, list.length);
  assert.ok(!get('REGISTER') && !get('BOSS_REGISTER'));
});
