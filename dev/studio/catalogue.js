// =====================================================================================
//  Studio asset catalogue (dev only; the game never imports this). studio.json → assets.catalogue.
//  The Studio runs it in Node, where the game modules can't load (bare `three`), so it reads the
//  sources: every `defineCreature` def a creature set exports, plus the hero registry.
//  Entry: { id: export name (the viewer's ids=), name, group: set module, set?: hero set path, anchors }.
// =====================================================================================
import { readFileSync, readdirSync } from 'node:fs';

const SRC = new URL('../../src/game/', import.meta.url);
const read = (path) => readFileSync(new URL(path, SRC), 'utf8');
const label = (id) => id.replace(/Hero$/, '').replace(/^./, (c) => c.toUpperCase()).replace(/([a-z])([A-Z])/g, '$1 $2');
const PHASE = [0, 6.28], K = [0, 1];   // walk/run phase (one stride = 2π), action progress
const anchor = (name, range) => (range ? { name, range } : { name });

// Every def in creatures/ and creatures/bosses/: name → actions its animate reads (s.action === '…',
// or via an alias `a = s.action` / `act = s.action`), plus the keys of the file's ACT table (bosses).
function creatureDefs() {
  const defs = new Map();
  for (const file of [...ls('creatures/'), ...ls('creatures/bosses/')]) {
    const src = read(file);
    const act = [...src.matchAll(/_ACT = \{\n([\s\S]*?)\n\};/g)].flatMap(([, body]) => [...body.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
    const starts = [...src.matchAll(/export const (\w+) = defineCreature\(/g)];
    starts.forEach((m, i) => {
      const body = src.slice(m.index, starts[i + 1]?.index);
      const alias = body.match(/\b(\w+) = s\.action\b/)?.[1];
      const reads = new RegExp(`(?:\\.action${alias ? `|\\b${alias}` : ''}) === '(\\w+)'`, 'g');
      defs.set(m[1], [...new Set([...[...body.matchAll(reads)].map((a) => a[1]), ...act])]);
    });
  }
  return defs;
}
const ls = (dir) => readdirSync(new URL(dir, SRC)).filter((f) => f.endsWith('.js')).map((f) => dir + f);

const HERO_POSES = [['idle'], ['walk', PHASE], ['run', PHASE], ['strafe', PHASE], ['diag', PHASE], ['back', PHASE], ['hold'],
  ...['shot', 'throw', 'heavy', 'nova', 'channel', 'dash', 'arrive', 'death', 'victory', 'fidget'].map((n) => [n, K])];

export default function catalogue() {
  const defs = creatureDefs();
  const list = [];
  for (const file of ls('creatures/')) {
    const src = read(file);
    const exported = [...src.matchAll(/export const (\w+) =/g), ...[...src.matchAll(/export \{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((n) => [, n.trim()]))]
      .map((m) => m[1]).filter((id) => defs.has(id));
    for (const id of exported) {
      const generic = [anchor('idle'), anchor('walk', PHASE), anchor('hit'), anchor('die', K)];
      const actions = defs.get(id).filter((n) => !generic.some((g) => g.name === n)).map((n) => anchor(n, K));
      list.push({ id, name: label(id), group: file.slice('creatures/'.length, -3), anchors: [...generic, ...actions] });
    }
  }
  // heroes/index.js: `import { pyromancerHero } from './pyromancer.js'`, listed in HEROES.
  const index = read('heroes/index.js');
  const registry = index.match(/export const HEROES = \{([^}]*)\}/)[1];
  for (const [, id, module] of index.matchAll(/import \{ (\w+) \} from '\.\/(\w+)\.js'/g)) {
    if (!registry.includes(id)) continue;
    list.push({ id, name: label(id), group: 'heroes', set: `../heroes/${module}`, anchors: HERO_POSES.map(([n, r]) => anchor(n, r)) });
  }
  return list;
}
