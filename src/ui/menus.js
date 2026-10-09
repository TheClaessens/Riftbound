// =====================================================================================
//  Out-of-run menus, Crownforge style (design/UI.md §8).
//    · Title / Sanctum: the reliquary of the shattered Riftcrown, laid over the live world.
//      Wordmark, 4 class medallions + one details panel, the Rift Tier gate with Begin Quest,
//      six attunement stones, shard counter, codex tome, settings (gear) and controls (?).
//    · End screens: Fallen / Victory with a shard count-up, an engraved ledger, reactions as
//      element-gem pairs, fusions and relics as icons, unlock callouts.
//  UI owns one Menus instance and delegates showTitle / hideTitle / showGameOver / showVictory
//  / hideEnd to it. All DOM is appended to root (#ui); root itself is never cleared.
// =====================================================================================
import { CLASSES, CLASS_ORDER } from '../game/classes.js';
import { ATTUNEMENTS, attuneCost, buyAttunement, isUnlocked, maxTierOf, saveMeta, MAX_TIER } from '../game/meta.js';
import { ACTS } from '../game/acts.js';
import { REACTIONS } from '../game/combat.js';
import { SKILLS, FUSIONS } from '../game/skills/registry.js';
import { RELICS, RELIC_IDS, RELIC_TAG_COLOR } from '../game/relics.js';
import { AFFIXES } from '../game/bosses/affixes.js';
import { icon, hasIcon, ICON } from './icons/index.js';

const GLYPH = { arcanist: '✦', pyromancer: '🜂', cryomancer: '❅', stormcaller: 'ϟ' };
const DASH_GLYPH = { blink: '✧', flame: '➶', frost: '❄', storm: 'ϟ' };
const TIER_STEP = { hp: 30, dmg: 12, shards: 25 };   // per Rift Tier, in percent (acts.js / meta.js)
const DASH_KEY = 'space';

const OB_ICON = { haste: 'obeliskHaste', echo: 'obeliskEcho', wrath: 'obeliskWrath' };
const OB_COLOR = { haste: '#bfefff', echo: '#b08cff', wrath: '#ff7a33' };

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function make(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}

function mmss(t) {
  const s = Math.max(0, Math.floor(Number(t) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const fmt = (n) => Number(n ?? 0).toLocaleString('en-US');

// "STEAM BURST" -> "Steam Burst"
const titleCase = (s) => String(s ?? '').toLowerCase().replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toUpperCase());

// Wrap signed numbers ("+10%", "−10") in highlight spans.
const hlNums = (s) => esc(s).replace(/([+−-]\d+%?)/g, '<b class="cf-hl">$1</b>');

function relicByName(name) {
  for (const def of Object.values(RELICS)) if (def.name === name) return def;
  return null;
}

function fusionByName(name) {
  return FUSIONS.find((f) => f.def?.name === name)?.def ?? null;
}

// ---------------------------------------------------------------- death recap (playtest round 1, #6)
// Input is stats.hurt (player.js hitSourceName / game.js _onPlayerHit):
//   by { [name]: { dmg, hits, hows } } · recent [{ name, how, dmg, t, hp }] · killer { name, how, dmg } | null
const HAZARDS = new Set(['Fissure Geyser', 'Lightning Strike']);
const CHARGERS = new Set(['War Boar', 'Crag Drake']);
const SHOOTERS = new Set(['Goblin Shaman', 'Orc Spirit-Shaman', 'Naga Tidecaller']);
const SWARMERS = new Set(['Goblin Scamp', 'Warg', 'Dragon Whelp', 'Spiderling']);
const TROLLS = new Set(['Forest Troll', 'Ogre', 'Stone River Troll']);
const FIRE_RESISTERS = new Set(['Orc Raider', 'Warg', 'Ogre', 'Orc Spirit-Shaman', 'War Boar', 'Goblin Sapper']);
const BOSS = Object.fromEntries(ACTS.map((a) => [a.boss, String(a.bossName).split(',')[0]]));   // hollowWarden -> Gorrak

// First match wins: specific tips (how / killer) first, situational ones next, a generic line last.
// ctx: { k: killer { name, how, dmg }, n: distinct sources, share: top source share 0..1,
//        el: class element, burst: hits within 1.5 s of the end }
const DEATH_TIPS = [
  { id: 'charge',   test: (c) => c.k.how === 'charge' && CHARGERS.has(c.k.name), text: 'Chargers mark their run with a red line. Dash across it, not along it.' },
  { id: 'bolt',     test: (c) => c.k.how === 'projectile' || SHOOTERS.has(c.k.name), text: 'Shaman bolts are slow. Strafe sideways instead of backing away.' },
  { id: 'sapper',   test: (c) => c.k.how === 'explosion' || c.k.name === 'Goblin Sapper', text: 'Sappers pop when their fuse ends. Kill them at range, or dash clear.' },
  { id: 'geyser',   test: (c) => c.k.name === 'Fissure Geyser', text: 'Red rings with glowing cracks erupt a second later. Step out.' },
  { id: 'storm',    test: (c) => c.k.name === 'Lightning Strike', text: 'A blue ring marks each lightning strike. It lands a second later, so keep moving.' },
  // Raid bosses (v5): per-move tips first, then one fallback per boss.
  { id: 'gorrak-slam',     test: (c) => c.k.name === BOSS.hollowWarden && c.k.how === 'club slam', text: 'Club slam drops a red circle on you. Step out before it fills.' },
  { id: 'gorrak-backhand', test: (c) => c.k.name === BOSS.hollowWarden && c.k.how === 'backhand', text: 'Backhand is a red cone in front of Gorrak, starting where he lands after his lunge. Step behind him, or out past its edge.' },
  { id: 'gorrak-wrath',    test: (c) => c.k.name === BOSS.hollowWarden && c.k.how === 'kings wrath', text: "King's Wrath shockwaves can't be outrun in the arena. Dash through each ring. They come about 3 seconds apart, so your dash is back for the next." },
  { id: 'gorrak-timber',   test: (c) => c.k.name === BOSS.hollowWarden && c.k.how === 'timber', text: 'Timber throws trees along red lanes. Watch the next lane shown ahead, and step aside.' },
  { id: 'gorrak-leap',     test: (c) => c.k.name === BOSS.hollowWarden && c.k.how === 'king leap', text: "Gorrak's king leap lands on your position. Leave the circle, or dash." },
  { id: 'gorrak-spores',   test: (c) => c.k.name === BOSS.hollowWarden && c.k.how === 'spore cloud', text: 'Green spore clouds drift from ripe pods. Shoot the pods before they ripen, and stand in the gold sap pools to cleanse spores.' },
  { id: 'gorrak',          test: (c) => c.k.name === BOSS.hollowWarden, text: "Gorrak's attacks show on the ground first. Read the red, then step out of it." },
  { id: 'vashkar-whirl',   test: (c) => c.k.name === BOSS.vashkar && c.k.how === 'axe whirl', text: 'Axe whirl draws a circle around Vashkar first. Get OUT of it.' },
  { id: 'vashkar-sweep',   test: (c) => c.k.name === BOSS.vashkar && c.k.how === 'axe sweep', text: 'Axe sweep follows with a ring around that circle. Step back IN, close to him.' },
  { id: 'vashkar-charge',  test: (c) => c.k.name === BOSS.vashkar && c.k.how === 'banner charge', text: 'Banner charge sends Vashkar along a red line. Step sideways, off the line.' },
  { id: 'vashkar-fire',    test: (c) => c.k.name === BOSS.vashkar && ['lava trail', 'lava', 'ground fire'].includes(c.k.how), text: "Vashkar leaves burning ground behind him. Don't stand in the flames." },
  { id: 'vashkar-banners', test: (c) => c.k.name === BOSS.vashkar && c.k.how === 'banner pulse', text: 'His war banners send out pulse shockwaves, and they shield him. Destroy the banners.' },
  { id: 'vashkar-marks',   test: (c) => c.k.name === BOSS.vashkar && c.k.how === 'cinder mark', text: 'Cinder marks drop where you walk, then explode in order. Keep moving, and never double back.' },
  { id: 'vashkar-meteor',  test: (c) => c.k.name === BOSS.vashkar && ['meteor', 'meteor lane'].includes(c.k.how), text: 'Meteors hit red circles and red lanes from the sky. Step out of them.' },
  { id: 'vashkar-cone',    test: (c) => c.k.name === BOSS.vashkar && c.k.how === 'molten overswing', text: 'Molten Overswing leaves a huge cone after its cast. Stagger Vashkar during the cast (reactions, freezes, stuns, perfect dodges), or get far away.' },
  { id: 'vashkar',         test: (c) => c.k.name === BOSS.vashkar, text: "Vashkar's attacks show on the ground first. Read the red, and move before it lands." },
  { id: 'aurelith-beam',   test: (c) => c.k.name === BOSS.riftHeart && c.k.how === 'prism beam', text: "Prism beams sweep across the arena. Hide in a pillar's gold shadow strip, or move ahead of the sweep." },
  { id: 'aurelith-nova',   test: (c) => c.k.name === BOSS.riftHeart && c.k.how === 'prism nova', text: "Stagger Aurelith during the Prism Nova cast, or hide in a pillar's gold shadow." },
  { id: 'aurelith-frost',  test: (c) => c.k.name === BOSS.riftHeart && ['frost ring', 'frost stomp'].includes(c.k.how), text: 'Frost rings spread out from Aurelith. Dash through them.' },
  { id: 'aurelith-flame',  test: (c) => c.k.name === BOSS.riftHeart && c.k.how === 'flame lane', text: 'Flame lanes burn along red lines. Step out of them.' },
  { id: 'aurelith-tempest', test: (c) => c.k.name === BOSS.riftHeart && c.k.how === 'tempest', text: 'Tempest lightning circles chase you, then lock in place. Keep moving, or stand in the gold lightning rod the storm wyvern leaves.' },
  { id: 'aurelith-shards', test: (c) => c.k.name === BOSS.riftHeart && ['prism shard', 'shard rain'].includes(c.k.how), text: 'Falling prism shards land in circles. Step out of them.' },
  { id: 'aurelith-quadrant', test: (c) => c.k.name === BOSS.riftHeart && c.k.how === 'prism quadrant', text: 'Three of the four quarters fire. Stand in the gold-striped one.' },
  { id: 'aurelith-crash',  test: (c) => c.k.name === BOSS.riftHeart && c.k.how === 'prism crash', text: 'Prism Crash sends out a ring. Dash through it.' },
  { id: 'aurelith',        test: (c) => c.k.name === BOSS.riftHeart, text: "Aurelith's ward colour shows her next attack. Reactions break the ward." },
  { id: 'wyvern',   test: (c) => c.k.name === 'Storm Wyvern', text: 'Storm Wyverns blink in beside you. Keep a dash ready, or kill them on arrival.' },
  { id: 'orcs',     test: (c) => c.el === 'fire' && FIRE_RESISTERS.has(c.k.name), text: 'Act II orcs resist Fire 50%. Lean on reactions.' },
  { id: 'swarm',    test: (c) => SWARMERS.has(c.k.name), text: 'Swarmers die in one hit and surround you. Clear them with area skills and keep to open ground.' },
  { id: 'troll',    test: (c) => TROLLS.has(c.k.name), text: 'Trolls hit hard but plod. Kite them, and never trade blows at point blank.' },
  { id: 'burst',    test: (c) => c.burst >= 3, text: 'Three hits in a blink. Dash on the first one, because the next two are already on their way.' },
  { id: 'crowd',    test: (c) => c.n >= 4 && c.share < 0.45, text: 'No single foe killed you, the crowd did. Thin it with area skills and fight with open ground behind you.' },
];
const DEATH_TIP_FALLBACK = 'Dashing recharges. Dying with a dash charge unspent is the usual story.';

// fight (stats.fight, game.js _fightRecap) is set when you fell inside a boss encounter: the breakdown then shows
// only that fight's damage ("This fight") and a "Your bets" block, instead of the run-wide list.
function deathRecap(hurt, { el = 'arcane', maxHp = 0, fight = null } = {}) {
  const useFight = !!fight && Object.values(fight.by ?? {}).some((v) => v?.dmg > 0);
  const by = useFight ? fight.by : (hurt?.by ?? {});
  const entries = Object.entries(by).filter(([, v]) => v && v.dmg > 0).sort((a, b) => b[1].dmg - a[1].dmg);
  const recentAll = Array.isArray(hurt?.recent) ? hurt.recent : [];
  if (!entries.length && !recentAll.length && !hurt?.killer) return null;
  const total = entries.reduce((n, [, v]) => n + v.dmg, 0) || 1;
  const topName = entries[0]?.[0] ?? recentAll[recentAll.length - 1]?.name ?? 'Unknown';

  // headline: the killing blow, else the biggest source
  const kill = hurt.killer ?? null;
  const topHow = Object.entries(entries[0]?.[1]?.hows ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const name = kill?.name ?? topName;
  const how = kill ? (kill.how ?? null) : topHow;
  const verb = !kill ? 'Worn down by' : (HAZARDS.has(name) ? 'Caught by' : 'Slain by');

  // top 3 sources, with the main "how" when one dominates
  const sources = entries.slice(0, 3).map(([n, v]) => {
    const hows = Object.entries(v.hows ?? {}).sort((a, b) => b[1] - a[1]);
    let dom = hows[0] && hows[0][1] / v.dmg >= 0.5 ? hows[0][0] : null;
    const isKiller = !!kill && kill.name === n;
    // the row names the move that did most of the damage; when the killing move was another one, say so
    // (round 3: a "prism beam 100%" row under a "Slain by ... prism crash" headline read as a contradiction)
    if (isKiller && kill.how && kill.how !== dom) dom = dom ? `${dom}, killed by ${kill.how}` : `killed by ${kill.how}`;
    return { name: n, dmg: v.dmg, hits: v.hits, share: v.dmg / total, how: dom, killer: isKiller };
  });

  // last moments: up to 5 hits within 8 s of the final one
  const endT = recentAll.length ? recentAll[recentAll.length - 1].t : 0;
  let recent = recentAll.filter((h) => endT - h.t <= 8).slice(-5);
  if (!recent.length) recent = recentAll.slice(-1);
  const hpMax = Math.max(maxHp || 0, ...recent.map((h) => h.hp + h.dmg), 1);
  const burst = recentAll.filter((h) => endT - h.t <= 1.5).length;

  const ctx = { k: { name, how, dmg: kill?.dmg ?? null }, n: entries.length, share: (entries[0]?.[1].dmg ?? 0) / total, el, burst };
  const tip = DEATH_TIPS.find((t) => { try { return t.test(ctx); } catch { return false; } })?.text ?? DEATH_TIP_FALLBACK;

  return { verb, name, how, dmg: kill?.dmg ?? null, sources, recent, hpMax, endT, tip, scope: useFight ? 'fight' : 'run', bets: useFight ? fight : null };
}

// "Your bets": what was riding on the boss fight you lost (obelisks armed, HP you entered with, shards forfeited)
function betsHTML(f) {
  const st = f.stakes ?? {};
  const chip = (type, label, sub) =>
    `<span class="mn-bet" style="--acc:${OB_COLOR[type]}">${icon(ICON.ui(OB_ICON[type]))}<span class="mn-bet-t"><b>${esc(label)}</b>${sub ? `<em>${esc(sub)}</em>` : ''}</span></span>`;
  const chips = [];
  if (st.haste) chips.push(chip('haste', 'Haste', `skipped ${mmss(st.haste.skipped)}`));
  if (st.echo) chips.push(chip('echo', 'Echo', 'boss twice, +10% damage taken'));
  if ((st.heat | 0) > 0) {
    const names = (st.affixes ?? []).map((id) => AFFIXES[id]?.name).filter(Boolean).join(', ');
    chips.push(chip('wrath', `Wrath ×${st.heat}`, names));
  }
  if (!chips.length) chips.push('<span class="mn-bet none">no obelisks armed</span>');
  const hp = Math.round((f.entryHp ?? 1) * 100);
  const lost = f.lost | 0;
  const boss = BOSS[f.bossId] ?? 'the boss';
  return `
      <div class="mn-bets" aria-label="Your bets">
        <h3 class="mn-bets-h">Your bets<span>${esc(boss)}</span></h3>
        <div class="mn-bets-row">${chips.join('')}</div>
        <span class="mn-bet-hp" title="Your health when ${esc(boss)} was summoned"><span>entered at</span><span class="mn-bet-bar"><i style="transform:scaleX(${(hp / 100).toFixed(3)})"></i></span><b class="num">${hp}%</b></span>
        ${lost > 0 ? `<span class="mn-bet-lost" title="Obelisk shards are paid only if you win the fight">${icon(ICON.ui('shard'), { fallback: '◆' })}<b class="num">${fmt(lost)}</b><span>shards lost</span></span>` : ''}
      </div>`;
}

const dmgN = (n) => fmt(Math.round(n));

// "Slain by War Boar · charge · 41"
function killerLineHTML(r) {
  return `<p class="mn-killer"><span class="mn-killer-v">${esc(r.verb)}</span><b class="mn-killer-n">${esc(r.name)}</b>${r.how ? `<span class="mn-killer-how">${esc(r.how)}</span>` : ''}${r.dmg != null ? `<span class="mn-killer-dmg num">${dmgN(r.dmg)}</span>` : ''}</p>`;
}

function deathRecapHTML(r) {
  const src = r.sources.map((s) => `
      <li class="mn-src${s.killer ? ' is-killer' : ''}" title="${esc(`${dmgN(s.dmg)} damage in ${s.hits} hit${s.hits === 1 ? '' : 's'}`)}">
        <span class="mn-src-name">${esc(s.name)}${s.how ? `<em>${esc(s.how)}</em>` : ''}</span>
        <span class="mn-src-bar"><i style="transform:scaleX(${Math.max(0.02, s.share).toFixed(3)})"></i></span>
        <span class="num mn-src-pct">${Math.round(s.share * 100)}%</span>
      </li>`).join('');
  const last = r.recent.length - 1;
  const chips = r.recent.map((h, i) => {
    const gap = r.endT - h.t;
    const when = i === last ? 'the end' : `−${gap.toFixed(1)}s`;
    return `
      <li class="mn-hit${i === last ? ' is-last' : ''}" title="${esc(`${h.name}${h.how ? ` · ${h.how}` : ''}: ${dmgN(h.dmg)} damage, ${dmgN(h.hp)} HP left`)}">
        <span class="mn-hit-top"><b class="num mn-hit-dmg">−${dmgN(h.dmg)}</b><span class="mn-hit-t">${when}</span></span>
        <span class="mn-hit-name">${esc(h.name)}</span>
        <span class="mn-hit-how">${esc(h.how ?? (HAZARDS.has(h.name) ? 'hazard' : 'contact'))}</span>
        <span class="mn-hit-hp"><i style="transform:scaleX(${Math.max(0, Math.min(1, h.hp / r.hpMax)).toFixed(3)})"></i></span>
        <span class="mn-hit-hpn num">${dmgN(h.hp)} hp</span>
      </li>`;
  }).join('');
  // "3 hits in 1.2 s": the tight cluster at the end (last 4 s), not the whole chip row
  const cluster = r.recent.filter((h) => r.endT - h.t <= 4);
  const n = cluster.length;
  const burst = n > 1 ? `${n} hits in ${(r.endT - cluster[0].t).toFixed(1)} s` : 'one hit';
  return `
    <section class="cf-frame mn-recap" aria-label="Why you fell">
      <div class="mn-recap-cols">
        <div class="mn-recap-col mn-recap-src">
          <h3 class="mn-recap-h">${r.scope === 'fight' ? 'This fight' : 'Damage taken'}${r.scope === 'fight' ? '<span class="mn-recap-sum">damage taken</span>' : ''}</h3>
          <ul class="mn-srcs">${src}</ul>
        </div>
        <div class="mn-recap-col mn-recap-last">
          <h3 class="mn-recap-h">The last moments<span class="mn-recap-sum">${esc(burst)}</span></h3>
          <ul class="mn-hits">${chips}</ul>
        </div>
      </div>
      ${r.bets ? betsHTML(r.bets) : ''}
      <p class="mn-tip">${icon(ICON.ui('help'), { fallback: '?' })}<span><b>Next time</b> ${esc(r.tip)}</span></p>
    </section>`;
}

// "+4% damage per rank" -> { sign, n, pct, what }
function parseAttune(def) {
  const m = /^([+−-])(\d+)(%?)\s+(.*?)\s+per rank$/.exec(def.desc ?? '');
  return m ? { sign: m[1], n: Number(m[2]), pct: m[3], what: m[4] } : null;
}
function attuneAmount(p, r) {
  if (!p) return '';
  const n = p.n * r;
  let what = p.what;
  if (n !== 1 && !p.pct) what = what.replace(/reroll$/, 'rerolls').replace(/banish$/, 'banishes');
  return `${p.sign}${n}${p.pct} ${what}`;
}

const ui = (name, fallback, cls = '') => icon(ICON.ui(name), { fallback, cls });

export class Menus {
  constructor(game, root) {
    this.game = game;
    this.root = root ?? document.body;
    this.selClass = 'pyromancer';
    this.selTier = 0;
    this.titleOpen = false;
    this.endOpen = false;
    this.endStats = null;
    this.refs = {};
    this.pop = null;
    this._justBought = null;
    this._raf = [];

    this.titleEl = make('div', 'mn-screen mn-title');
    this.endEl = make('div', 'mn-screen mn-end');
    this.titleEl.setAttribute('role', 'dialog');
    this.titleEl.setAttribute('aria-label', 'Riftbound: the Sanctum');
    this.endEl.setAttribute('role', 'dialog');
    this.root.append(this.titleEl, this.endEl);

    this._buildTitle();
    this.titleEl.addEventListener('click', (e) => this._onTitleClick(e));
    this.titleEl.addEventListener('change', (e) => this._onTitleChange(e));
    this.titleEl.addEventListener('pointerover', (e) => this._onAttHover(e));
    this.titleEl.addEventListener('focusin', (e) => this._onAttHover(e));
    this.refs.attunes.addEventListener('pointerleave', () => this._attInfo(null));
    this.refs.attunes.addEventListener('focusout', (e) => { if (!this.refs.attunes.contains(e.relatedTarget)) this._attInfo(null); });
    this.endEl.addEventListener('click', (e) => this._onEndClick(e));
    // One window listener; it only acts while the title or an end screen is open.
    window.addEventListener('keydown', (e) => this._onKey(e));
    window.addEventListener('pointerdown', (e) => {
      if (this.pop && !e.target?.closest?.('.mn-pop, [data-act="pop"]')) this._setPop(null);
    });

    // Gate the wordmark on the display faces (≤ 1.5 s) so it never flashes in a fallback font.
    const fonts = document.fonts?.load
      ? Promise.all([document.fonts.load('700 64px "Grenze Gotisch"'), document.fonts.load('700 26px "Grenze"')]).catch(() => {})
      : Promise.resolve();
    Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).then(() => this.titleEl.classList.add('mn-fonts'));
  }

  // ---------------------------------------------------------------- public API
  showTitle() {
    this.hideEnd();
    const meta = this.game.meta;
    const last = meta?.lastClass;
    this.selClass = this._unlocked(last) ? last : this._firstUnlocked();
    this.selTier = Math.max(0, Math.min(meta?.lastTier ?? 0, maxTierOf(meta)));
    this._setPop(null);
    this._renderTitle();
    this.titleEl.classList.add('mn-open');
    this.titleOpen = true;
    this.game.showcase?.(this.selClass);   // the selected hero stands in the world behind the menus
  }

  hideTitle() {
    this.titleOpen = false;
    this._setPop(null);
    this.titleEl.classList.remove('mn-open');
  }

  showGameOver(stats) { this._showEnd(stats, false); }

  showVictory(stats) { this._showEnd(stats, true); }

  hideEnd() {
    this.endOpen = false;
    this._stopCounts();
    this.endEl.classList.remove('mn-open');
  }

  // ---------------------------------------------------------------- title skeleton
  _buildTitle() {
    // "Aurelith, the Prism Dragon" -> "the Prism Dragon"
    const finalFoe = (ACTS[ACTS.length - 1]?.bossName ?? '').split(', ')[1] ?? 'the final boss';
    this.titleEl.innerHTML = `
      <div class="mn-shade" aria-hidden="true"></div>

      <header class="mn-brand">
        <h1 class="mn-mark"><span class="mn-mark-ink" aria-hidden="true">Riftbound</span><span class="mn-mark-face">Riftbound</span></h1>
        <div class="mn-mark-rule" aria-hidden="true"><i></i><span class="cf-prism"></span><i></i></div>
        <p class="mn-tagline">cross the rifts · weave the primes · slay ${esc(finalFoe.toLowerCase())}</p>
      </header>

      <section class="mn-col mn-who" aria-label="Choose your Riftbound">
        <div class="mn-sec-head">
          <span class="mn-sec-title">Choose your Riftbound</span>
          <span class="mn-sec-keys"><span class="cf-key">1</span>&ndash;<span class="cf-key">4</span></span>
        </div>
        <div class="mn-medals" data-ref="classes" role="radiogroup" aria-label="Class"></div>
        <article class="cf-frame crown mn-detail" data-ref="detail" aria-live="polite"></article>
      </section>

      <section class="mn-gate" aria-label="Begin">
        <div class="mn-tier" data-ref="tier" hidden></div>
        <button type="button" class="cf-btn primary mn-begin" data-act="begin" data-ref="begin">
          <span class="mn-begin-cls" data-ref="beginCls" aria-hidden="true"></span><span class="mn-begin-txt">Begin Quest</span><span class="cf-key">enter</span>
        </button>
      </section>

      <section class="cf-frame mn-col mn-sanctum" aria-label="The Sanctum">
        <div class="mn-sanc-head">
          <span class="mn-sanc-title">The Sanctum</span>
          <span class="cf-label">attunements · kept forever</span>
        </div>
        <div class="mn-attunes" data-ref="attunes"></div>
        <div class="mn-att-info" data-ref="attInfo"></div>
      </section>

      <nav class="mn-bar" aria-label="Sanctum tools">
        <div class="mn-shards" data-ref="shards" title="Rift Shards: earned every run, spent on attunements"></div>
        <button type="button" class="mn-tome" data-act="pop" data-id="tome" data-ref="tome" aria-haspopup="dialog" aria-expanded="false"></button>
        <button type="button" class="mn-tool" data-act="pop" data-id="settings" aria-haspopup="dialog" aria-expanded="false" title="Settings">${ui('gear', '✲')}</button>
        <button type="button" class="mn-tool" data-act="pop" data-id="help" aria-haspopup="dialog" aria-expanded="false" title="Controls">${ui('help', '?')}</button>

        <div class="cf-plate mn-pop mn-pop-tome" data-pop="tome" data-ref="tomePop" hidden></div>

        <div class="cf-plate mn-pop mn-pop-settings" data-pop="settings" hidden>
          <div class="mn-pop-title">Settings</div>
          <label class="mn-toggle">
            <input type="checkbox" data-ref="unlockAll"><i aria-hidden="true"></i>
            <span><b>Unlock all</b><small>Any class at any Rift Tier. Earned unlocks are kept.</small></span>
          </label>
          <label class="mn-toggle">
            <input type="checkbox" data-ref="auto"><i aria-hidden="true"></i>
            <span><b>Auto-cast</b><small>Skills fire at the nearest foe. Toggle in a run with <span class="cf-key">t</span></small></span>
          </label>
          <label class="mn-toggle">
            <input type="checkbox" data-ref="tutorial"><i aria-hidden="true"></i>
            <span><b>Rift Primer</b><small>Play the short guided start in your next run.</small></span>
          </label>
          <div class="mn-seg-row">
            <span><b>Screen shake</b><small>Your own spells always shake less.</small></span>
            <div class="mn-seg" role="radiogroup" aria-label="Screen shake" data-ref="shake">
              <label><input type="radio" name="mn-shake" value="1"><span>Full</span></label>
              <label><input type="radio" name="mn-shake" value="0.5"><span>Low</span></label>
              <label><input type="radio" name="mn-shake" value="0"><span>Off</span></label>
            </div>
          </div>
        </div>

        <div class="cf-plate mn-pop mn-pop-help" data-pop="help" hidden>
          <div class="mn-pop-title">Controls</div>
          <dl class="mn-keys">
            <dt><span class="cf-key">w</span><span class="cf-key">a</span><span class="cf-key">s</span><span class="cf-key">d</span></dt><dd>Move</dd>
            <dt>${ui('mouse-l', '◐', 'mn-mouse')}</dt><dd>Aim and cast your starter</dd>
            <dt>${ui('mouse-r', '◑', 'mn-mouse')}<span class="cf-key">q</span><span class="cf-key">e</span><span class="cf-key">r</span></dt><dd>Cast learned skills</dd>
            <dt><span class="cf-key">space</span></dt><dd>Dash through danger</dd>
            <dt><span class="cf-key">t</span></dt><dd>Toggle auto-cast</dd>
            <dt><span class="cf-key">esc</span></dt><dd>Pause, build and codex</dd>
          </dl>
          <p class="mn-pop-note">Strike one Prime onto another to cause a <b>reaction</b>. Chain reactions to grow your power.</p>
        </div>
      </nav>`;
    this.titleEl.querySelectorAll('[data-ref]').forEach((n) => { this.refs[n.dataset.ref] = n; });
  }

  _renderTitle() {
    this._renderShards();
    this._renderClasses();
    this._renderTier();
    this._renderAttunes();
    this._renderCodex();
    this._attInfo(null);
    if (this.refs.auto) this.refs.auto.checked = !!this.game.autoCast;
    if (this.refs.unlockAll) this.refs.unlockAll.checked = !!this.game.meta?.unlockAll;
    if (this.refs.tutorial) this.refs.tutorial.checked = !this.game.meta?.tutorialDone;
    const shake = String(this.game.meta?.shake ?? 1);
    this.refs.shake?.querySelectorAll('input').forEach((r) => { r.checked = r.value === shake; });
  }

  _renderShards(flash = false) {
    const n = this.game.meta?.shards ?? 0;
    this.refs.shards.innerHTML = `${ui('shard', '◆', 'mn-shard-ico')}<span class="mn-shards-n num">${esc(fmt(n))}</span><span class="mn-shards-lbl">rift<br>shards</span>`;
    if (flash) {
      this.refs.shards.classList.remove('is-spent');
      void this.refs.shards.offsetWidth;
      this.refs.shards.classList.add('is-spent');
    }
  }

  // ---- class medallions + details
  _renderClasses() {
    this.refs.classes.innerHTML = CLASS_ORDER.map((id, i) => this._medalHTML(CLASSES[id], i)).join('');
    this._renderDetail();
  }

  _medalHTML(c, i) {
    if (!c) return '';
    const unlocked = this._unlocked(c.id);
    const sel = c.id === this.selClass;
    const cls = ['mn-medal'];
    if (sel) cls.push('is-sel');
    if (!unlocked) cls.push('is-locked');
    return `
      <button type="button" class="${cls.join(' ')}" data-act="pick" data-id="${esc(c.id)}" data-el="${esc(c.element)}"
              role="radio" aria-checked="${sel}" ${unlocked ? '' : 'aria-disabled="true"'}
              title="${esc(unlocked ? `${c.name}, ${c.title}` : `Locked: ${c.unlock?.text ?? ''}`)}">
        <span class="cf-socket mn-medal-socket${sel ? ' lit' : ''}">${icon(ICON.cls(c.id), { el: c.element, fallback: GLYPH[c.id] ?? '✦' })}
          ${unlocked ? '' : `<span class="mn-medal-lock">${ui('lock', '✕')}</span>`}</span>
        <span class="cf-key mn-medal-key">${i + 1}</span>
        <span class="mn-medal-name">${esc(c.name)}</span>
        ${unlocked ? '' : `<span class="mn-medal-unlock">${esc(c.unlock?.text ?? 'Locked')}</span>`}
      </button>`;
  }

  _renderDetail() {
    const c = CLASSES[this.selClass];
    if (!c) { this.refs.detail.innerHTML = ''; return; }
    const sk = SKILLS[c.starter];
    const skDesc = typeof sk?.desc === 'function' ? sk.desc(1) : '';
    const row = (sock, label, keyHTML, name, desc) => `
      <div class="mn-row">
        ${sock}
        <div class="mn-row-txt">
          <div class="mn-row-head"><span class="mn-row-lbl">${label}</span>${keyHTML}<span class="mn-row-name">${esc(name)}</span></div>
          <div class="mn-row-desc">${esc(desc)}</div>
        </div>
      </div>`;
    this.refs.detail.dataset.el = c.element;
    this.refs.detail.style.setProperty('--sel', String(Math.max(0, CLASS_ORDER.indexOf(c.id))));
    this.refs.beginCls.innerHTML = icon(ICON.cls(c.id), { el: c.element, fallback: GLYPH[c.id] ?? '✦' });
    this.refs.begin.setAttribute('aria-label', `Begin Quest as ${c.name}`);
    this.refs.detail.innerHTML = `
      <div class="mn-detail-in">
        <header class="mn-detail-head">
          <span class="mn-detail-gem">${icon(ICON.el(c.element), { el: c.element, fallback: '◆' })}</span>
          <div>
            <h2 class="mn-detail-name">${esc(c.name)}</h2>
            <div class="mn-detail-title">${esc(c.title)}</div>
          </div>
        </header>
        <div class="cf-rule mn-detail-rule"><i></i></div>
        ${row(`<span class="cf-socket mn-row-sock" data-el="${esc(sk?.element ?? c.element)}">${icon(ICON.skill(c.starter), { el: sk?.element ?? c.element, fallback: sk?.icon ?? '✦' })}</span>`,
          'starter', `<span class="mn-row-key">${ui('mouse-l', 'lmb', 'mn-mouse')}</span>`, sk?.name ?? c.starter, skDesc)}
        ${row(`<span class="cf-socket mn-row-sock" data-el="${esc(c.element)}">${icon(ICON.dash(c.dash?.kind), { el: c.element, fallback: DASH_GLYPH[c.dash?.kind] ?? '➶' })}</span>`,
          'dash', `<span class="cf-key">${DASH_KEY}</span>`, c.dash?.name, c.dash?.desc)}
        ${row(`<span class="cf-socket round mn-row-sock" data-el="${esc(c.element)}">${icon(ICON.el(c.element), { el: c.element, fallback: '◆' })}</span>`,
          'trait', '', c.trait?.name, c.trait?.desc)}
        <footer class="mn-detail-foot">
          <span class="mn-play">${esc(c.playstyle)}</span>
          <span class="mn-tilt">${hlNums(c.tilt)}</span>
        </footer>
      </div>`;
  }

  // ---- rift tier gate
  _renderTier() {
    const box = this.refs.tier;
    const max = Math.min(MAX_TIER, maxTierOf(this.game.meta));
    if (max <= 0) {
      box.hidden = true;
      box.innerHTML = '';
      this.selTier = 0;
      this.titleEl.style.setProperty('--tier', '0');
      return;
    }
    box.hidden = false;
    this.selTier = Math.max(0, Math.min(this.selTier, max));
    this.titleEl.style.setProperty('--tier', String(this.selTier));
    const t = this.selTier;
    let gems = '';
    for (let i = 0; i <= MAX_TIER; i++) {
      const locked = i > max;
      const cls = ['mn-tgem'];
      if (i === t) cls.push('is-sel');
      if (i > 0 && i <= t) cls.push('is-lit');
      if (locked) cls.push('is-locked');
      const mods = `foes +${i * TIER_STEP.hp}% HP, +${i * TIER_STEP.dmg}% damage; +${i * TIER_STEP.shards}% shards`;
      const tip = locked ? `Rift Tier ${i}: win a run at Tier ${i - 1} to open it` : (i === 0 ? 'Rift Tier 0: the Rift as it is' : `Rift Tier ${i}: ${mods}`);
      gems += `<button type="button" class="${cls.join(' ')}" data-act="tier" data-id="${i}" role="radio" aria-checked="${i === t}"
        ${locked ? 'aria-disabled="true"' : ''} title="${esc(tip)}"><i></i><span class="num">${i}</span></button>`;
    }
    const line = t > 0
      ? `foes <b class="mn-up">+${t * TIER_STEP.hp}%</b> hp · <b class="mn-up">+${t * TIER_STEP.dmg}%</b> dmg · <b class="mn-gain">+${t * TIER_STEP.shards}%</b> shards`
      : `the rift as it is · no modifiers`;
    box.innerHTML = `
      <div class="mn-tier-head">${ui('tier', '▲', 'mn-tier-ico')}<span class="mn-tier-lbl">Rift Tier</span></div>
      <div class="mn-tgems" role="radiogroup" aria-label="Rift Tier">${gems}</div>
      <div class="mn-tier-line">${line}</div>`;
  }

  // ---- attunement stones
  _renderAttunes() {
    const meta = this.game.meta ?? {};
    const just = this._justBought;
    this._justBought = null;
    this.refs.attunes.innerHTML = Object.values(ATTUNEMENTS).map((def) => {
      const r = meta.attune?.[def.id] ?? 0;
      const maxed = r >= def.max;
      const cost = attuneCost(r + 1);
      const can = !maxed && (meta.shards ?? 0) >= cost;
      let pips = '';
      for (let i = 0; i < def.max; i++) pips += `<i class="${i < r ? 'on' : ''}${just === def.id && i === r - 1 ? ' new' : ''}"></i>`;
      const p = parseAttune(def);
      const short = p ? `${p.sign}${p.n}${p.pct} ${p.what}` : def.desc;
      const price = maxed
        ? '<span class="mn-att-max">mastered</span>'
        : `<span class="mn-att-cost${can ? '' : ' is-poor'}">${ui('shard', '◆', 'mn-cost-ico')}<span class="num">${cost}</span></span>`;
      const state = maxed ? ' is-max' : (can ? ' is-buy' : ' is-poor');
      return `
        <button type="button" class="mn-att${state}${r > 0 ? ' is-owned' : ''}${just === def.id ? ' is-just' : ''}" data-act="buy" data-id="${esc(def.id)}"
                ${can ? '' : 'aria-disabled="true"'} aria-label="${esc(`${def.name}, rank ${r} of ${def.max}. ${def.desc}.${maxed ? ' Mastered.' : ` Costs ${cost} Rift Shards.`}`)}">
          <span class="cf-socket round mn-att-sock">${icon(ICON.attune(def.id), { fallback: def.icon })}</span>
          <span class="mn-att-name">${esc(def.name)}</span>
          <span class="mn-att-desc">${esc(short)}</span>
          <span class="cf-pips mn-att-pips">${pips}</span>
          ${price}
        </button>`;
    }).join('');
  }

  _onAttHover(e) {
    const tile = e.target?.closest?.('.mn-att');
    if (tile && this.refs.attunes.contains(tile)) this._attInfo(tile.dataset.id);
  }

  _attInfo(id) {
    const box = this.refs.attInfo;
    if (!box) return;
    const def = ATTUNEMENTS[id];
    if (!def) {
      box.innerHTML = '<span class="mn-info-idle">Spend Rift Shards on permanent boons. Every run earns more.</span>';
      return;
    }
    const meta = this.game.meta ?? {};
    const r = meta.attune?.[id] ?? 0;
    const p = parseAttune(def);
    const maxed = r >= def.max;
    const cost = attuneCost(r + 1);
    const can = !maxed && (meta.shards ?? 0) >= cost;
    const now = r > 0 ? `now <b class="cf-hl">${esc(attuneAmount(p, r))}</b>` : `<span class="cf-dim">not attuned</span>`;
    const next = maxed
      ? '<span class="mn-att-max">mastered</span>'
      : `next <b class="cf-hl">${esc(attuneAmount(p, r + 1))}</b> for ${ui('shard', '◆', 'mn-cost-ico')}<b class="num${can ? '' : ' mn-poor'}">${cost}</b>${can ? '' : ` <span class="mn-poor">(need ${cost - (meta.shards ?? 0)} more)</span>`}`;
    box.innerHTML = `<b class="mn-info-name">${esc(def.name)}</b><span class="mn-info-rank num">${r}/${def.max}</span><span class="mn-info-sep"></span>${now}<span class="mn-info-sep"></span>${next}`;
  }

  // ---- codex tome
  _renderCodex() {
    const m = this.game.meta ?? {};
    const cod = m.codex ?? {};
    const st = m.stats ?? {};
    const nR = Object.keys(REACTIONS).length, nF = FUSIONS.length, nL = RELIC_IDS.length;
    const r = cod.reactions?.length ?? 0, f = cod.fusions?.length ?? 0, l = cod.relics?.length ?? 0;
    const bestAct = st.bestAct ? (ACTS[st.bestAct - 1]?.numeral ?? '—') : '—';
    this.refs.tome.title = 'Codex and record';
    this.refs.tome.innerHTML = `
      ${ui('tome', '▤', 'mn-tome-ico')}
      <span class="mn-tome-txt">
        <span class="mn-tome-top"><span class="mn-tome-lbl">codex</span><span class="num">${r + f + l}</span><span class="mn-tome-of num">/${nR + nF + nL}</span></span>
        <span class="mn-tome-sub"><span class="num">${fmt(st.runs ?? 0)}</span> runs · <span class="num">${fmt(st.wins ?? 0)}</span> wins · best act <span class="mn-num-r">${esc(bestAct)}</span></span>
      </span>`;
    const bar = (label, n, of, ico) => `
      <div class="mn-cx-row">${ico}<span class="mn-cx-lbl">${label}</span>
        <span class="mn-cx-track"><i style="transform:scaleX(${of ? n / of : 0})"></i></span>
        <span class="num mn-cx-n">${n}<small>/${of}</small></span></div>`;
    const rec = (label, v) => `<div class="mn-rec"><span>${label}</span><b class="num">${v}</b></div>`;
    this.refs.tomePop.innerHTML = `
      <div class="mn-pop-title">Codex</div>
      ${bar('Reactions', r, nR, icon(ICON.react('steam'), { fallback: '◇', cls: 'mn-cx-ico' }))}
      ${bar('Fusions', f, nF, icon(ICON.skill('plasmaOrb'), { el: 'storm', fallback: '✧', cls: 'mn-cx-ico' }))}
      ${bar('Relics', l, nL, icon(ICON.relic('alchemistsCoil'), { fallback: '⚗', cls: 'mn-cx-ico' }))}
      <div class="mn-pop-title mn-pop-title-2">Record</div>
      <div class="mn-recs">
        ${rec('Runs', fmt(st.runs ?? 0))}${rec('Wins', fmt(st.wins ?? 0))}
        ${rec('Best act', esc(bestAct))}${rec('Best chain', fmt(st.bestChain ?? 0))}
        ${rec('Bosses slain', fmt(st.bossKills ?? 0))}${rec('Foes slain', fmt(st.totalKills ?? 0))}
      </div>`;
  }

  // ---- popovers
  _setPop(id) {
    this.pop = id && this.pop !== id ? id : null;
    this.titleEl.querySelectorAll('.mn-pop').forEach((p) => { p.hidden = p.dataset.pop !== this.pop; });
    this.titleEl.querySelectorAll('[data-act="pop"]').forEach((b) => {
      const on = b.dataset.id === this.pop;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-expanded', String(on));
    });
  }

  // ---------------------------------------------------------------- title interaction
  _onTitleClick(e) {
    const btn = e.target?.closest?.('[data-act]');
    if (!btn || !this.titleEl.contains(btn) || btn.disabled) return;
    const id = btn.dataset.id;
    switch (btn.dataset.act) {
      case 'pick': this._pick(id); break;
      case 'tier': this._setTier(Number(id)); break;
      case 'buy': this._buy(id); break;
      case 'begin': this._begin(); break;
      case 'pop': this._setPop(id); break;
      default: break;
    }
  }

  _onTitleChange(e) {
    if (this.refs.unlockAll && e.target === this.refs.unlockAll) { this._setUnlockAll(!!e.target.checked); return; }
    const meta = this.game.meta;
    if (meta && e.target === this.refs.tutorial) {
      meta.tutorialDone = !e.target.checked;
      if (e.target.checked) meta.tips = [];   // replaying the primer brings the one-time tips back too
      saveMeta(meta);
      return;
    }
    if (meta && e.target.name === 'mn-shake') {
      meta.shake = Number(e.target.value);
      this.game.engine.shakeScale = meta.shake;
      saveMeta(meta);
      return;
    }
    if (!this.refs.auto || e.target !== this.refs.auto) return;
    const on = !!this.refs.auto.checked;
    this.game.autoCast = on;
    this.game.events?.emit('autoCastChanged', { on });
  }

  _setUnlockAll(on) {
    const meta = this.game.meta;
    if (!meta) return;
    meta.unlockAll = on;
    saveMeta(meta);
    if (!this._unlocked(this.selClass)) this.selClass = this._firstUnlocked();
    this._renderClasses();
    this._renderTier();
  }

  _pick(id) {
    if (!this._unlocked(id)) return;
    const changed = id !== this.selClass;
    this.selClass = id;
    this._renderClasses();
    this.game.showcase?.(id);
    if (changed) this.refs.detail.classList.remove('is-swap'), void this.refs.detail.offsetWidth, this.refs.detail.classList.add('is-swap');
    this.refs.classes.querySelector(`[data-id="${id}"]`)?.focus?.({ preventScroll: true, focusVisible: false });
  }

  _setTier(t) {
    const max = Math.min(MAX_TIER, maxTierOf(this.game.meta));
    if (!Number.isFinite(t) || t < 0 || t > max) return;
    this.selTier = t;
    this._renderTier();
    this.refs.tier.querySelector(`[data-id="${t}"]`)?.focus?.({ preventScroll: true });
  }

  _buy(id) {
    if (!this.game.meta || !buyAttunement(this.game.meta, id)) return;
    this._justBought = id;
    this._renderShards(true);
    this._renderAttunes();
    this.refs.attunes.querySelector(`[data-id="${id}"]`)?.focus?.({ preventScroll: true });
    this._attInfo(id);
  }

  _begin() {
    if (!this.titleOpen || !this._unlocked(this.selClass)) return;
    this.game.start({ classId: this.selClass, tier: this.selTier, player: true });
    this.hideTitle();
  }

  // ---------------------------------------------------------------- end screens
  _showEnd(stats, victory) {
    this.hideTitle();
    this.endStats = stats ?? {};
    this._renderEnd(this.endStats, victory);
    this.endEl.classList.add('mn-open');
    this.endOpen = true;
    this.endEl.querySelector('[data-act="again"]')?.focus?.({ preventScroll: true });
    this._startCounts();
  }

  _renderEnd(s, victory) {
    this.endEl.className = `mn-screen mn-end ${victory ? 'is-victory' : 'is-death'}`;
    this.endEl.setAttribute('aria-label', victory ? 'Victory' : 'Fallen');
    const meta = this.game.meta ?? {};
    const cls = CLASSES[s.classId];
    const actIdx = Math.max(0, Math.min(ACTS.length - 1, s.act ?? 0));
    const act = ACTS[actIdx];
    const tier = s.tier ?? 0;
    const shards = s.shardsEarned ?? 0;
    const total = s.totalShards ?? meta.shards ?? 0;
    const el = cls?.element ?? 'arcane';

    // "Aurelith, the Prism Dragon" -> "Aurelith"
    const finalBoss = (ACTS[ACTS.length - 1]?.bossName ?? 'The final boss').split(',')[0];
    const hero = victory ? `${finalBoss} is slain` : 'The Rift claims you';

    // unlock callouts
    const callouts = [];
    for (const id of s.unlocks ?? []) {
      const c = CLASSES[id];
      if (!c) continue;
      callouts.push(`
        <div class="cf-plate mn-callout" data-el="${esc(c.element)}">
          <span class="cf-socket lit mn-callout-sock">${icon(ICON.cls(c.id), { el: c.element, fallback: GLYPH[c.id] ?? '✦' })}</span>
          <span class="mn-callout-txt"><span class="mn-callout-k">new riftbound</span><span class="mn-callout-n">${esc(c.name)}</span><span class="mn-callout-s">${esc(c.title)}</span></span>
        </div>`);
    }
    if (s.tierUnlocked) {
      callouts.push(`
        <div class="cf-plate mn-callout mn-callout-tier">
          <span class="cf-socket lit mn-callout-sock" data-el="arcane">${ui('tier', '▲')}</span>
          <span class="mn-callout-txt"><span class="mn-callout-k">the rift deepens</span><span class="mn-callout-n">Rift Tier ${esc(s.tierUnlocked)}</span><span class="mn-callout-s">fiercer foes · <b class="mn-gain">+${s.tierUnlocked * TIER_STEP.shards}%</b> shards</span></span>
        </div>`);
    }

    // ledger
    const row = (k, vHTML, ico = '') => `<div class="mn-led-row"><dt>${ico}${esc(k)}</dt><dd>${vHTML}</dd></div>`;
    const actGems = ACTS.map((a, i) => `<i class="${i < actIdx || victory ? 'done' : (i === actIdx ? 'here' : '')}" style="--a:${a.color}"></i>`).join('');
    const ledger = `
      <dl class="mn-ledger">
        ${row('Class', `<span class="mn-led-cls" data-el="${esc(el)}">${icon(ICON.cls(s.classId), { el, fallback: GLYPH[s.classId] ?? '✦' })}${esc(cls?.name ?? '—')}</span>`)}
        ${row('Act reached', `<span class="mn-led-act"><span class="mn-actgems" aria-hidden="true">${actGems}</span><span class="mn-num-r">${esc(act.numeral)}</span> ${esc(act.name.replace(/^The /, ''))}</span>`)}
        ${row('Time', `<span class="num">${mmss(s.time)}</span>`)}
        ${row('Level', `<span class="num">${esc(s.level ?? 1)}</span>`)}
        ${row('Foes slain', `<span class="num">${fmt(s.kills ?? 0)}</span>`)}
        ${row('Max chain', `<span class="num">×${fmt(s.maxChain ?? 0)}</span>`)}
      </dl>`;

    // reactions as element-gem pairs
    const reacts = Object.entries(s.reactions ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const maxR = reacts[0]?.[1] ?? 1;
    const reactHTML = reacts.map(([type, n]) => {
      const def = REACTIONS[type];
      const gems = hasIcon(ICON.react(type))
        ? icon(ICON.react(type), { cls: 'mn-react-ico' })
        : `<span class="mn-react-pair">${(def?.elements ?? []).map((e) => icon(ICON.el(e), { el: e, fallback: '◆' })).join('')}</span>`;
      return `<li class="mn-react">${gems}<span class="mn-react-name">${esc(titleCase(def?.name ?? type))}</span>
        <span class="mn-react-bar"><i style="transform:scaleX(${(n / maxR).toFixed(3)})"></i></span><span class="num mn-react-n">×${fmt(n)}</span></li>`;
    }).join('');

    const fusions = (s.fusions ?? []).map((name) => {
      const d = fusionByName(name);
      return `<li class="mn-thing mn-fusion" data-el="${esc(d?.element ?? 'arcane')}" title="${esc(name)}">
        <span class="cf-socket mn-thing-sock">${icon(d ? ICON.skill(d.id) : 'x', { el: d?.element ?? 'arcane', fallback: d?.icon ?? '✧' })}</span><span>${esc(name)}</span></li>`;
    }).join('');
    const relicList = s.relics ?? [];
    const compact = relicList.length > 8;
    const relics = relicList.map((name) => {
      const d = relicByName(name);
      const acc = RELIC_TAG_COLOR[d?.tag] ?? 'var(--cf-gilt)';
      return `<li class="mn-thing mn-relic" style="--acc:${esc(acc)}" title="${esc(name)}">
        <span class="cf-socket mn-thing-sock">${icon(d ? ICON.relic(d.id) : 'x', { fallback: d?.icon ?? '◆' })}</span>${compact ? '' : `<span>${esc(name)}</span>`}</li>`;
    }).join('');
    const none = (t, hint = '') => `<p class="mn-none">${t}</p>${hint ? `<p class="mn-hint">${hint}</p>` : ''}`;

    // death recap (stats.hurt); the victory screen stays as it was
    const recap = victory ? null : deathRecap(s.hurt, { el, maxHp: s.maxHp ?? this.game.player?.stats?.maxHp ?? 0, fight: s.fight });

    const sub = [cls?.name, tier > 0 ? `Rift Tier ${tier}` : 'Rift Tier 0'].filter(Boolean).join(' · ');

    this.endEl.innerHTML = `
      <div class="mn-end-shade" aria-hidden="true"></div>
      <div class="mn-end-wrap">
        <header class="mn-end-head">
          ${victory ? '<span class="mn-end-crown" aria-hidden="true"></span>' : ''}
          <div class="mn-eyebrow"><i></i><span>${victory ? 'victory' : 'fallen'}</span><i></i></div>
          <h1 class="mn-end-hero">${esc(hero)}</h1>
          ${victory ? '<div class="cf-prism mn-end-prism" aria-hidden="true"></div>' : (recap ? killerLineHTML(recap) : '<div class="mn-end-rule" aria-hidden="true"></div>')}
          <div class="mn-end-sub" data-el="${esc(el)}">${icon(ICON.cls(s.classId), { el, fallback: GLYPH[s.classId] ?? '✦' })}<span>${esc(sub)}</span></div>
        </header>

        <div class="mn-reward-row">
          <div class="mn-reward" aria-label="${esc(`${shards} Rift Shards earned, ${total} total`)}">
            ${ui('shard', '◆', 'mn-reward-ico')}
            <span class="mn-reward-gain"><span class="num" data-count="${shards}" data-from="0">+0</span><span class="mn-reward-lbl">rift shards</span></span>
            <span class="mn-reward-total"><span class="mn-reward-lbl">total</span><span class="num" data-count="${total}" data-from="${Math.max(0, total - shards)}" data-plain="1">${fmt(Math.max(0, total - shards))}</span></span>
          </div>
          ${callouts.join('')}
        </div>

        ${recap ? deathRecapHTML(recap) : ''}

        <div class="mn-end-grid">
          <section class="cf-frame mn-end-card mn-end-ledger">
            <h3 class="mn-card-h">The Ledger</h3>
            ${ledger}
          </section>
          <section class="cf-frame mn-end-card">
            <h3 class="mn-card-h">Reactions</h3>
            ${reactHTML ? `<ul class="mn-reacts">${reactHTML}</ul>` : none('No Primes collided this run.', `Strike a foe with two Primes: ${icon(ICON.el('fire'), { el: 'fire' })} Fire on ${icon(ICON.el('frost'), { el: 'frost' })} Frost bursts into Steam.`)}
          </section>
          <section class="cf-frame mn-end-card">
            <h3 class="mn-card-h">Fusions forged</h3>
            ${fusions ? `<ul class="mn-things">${fusions}</ul>` : none('None forged.', 'Each fusion needs a specific pair of skills, both at rank 3. Card hints name the partner.')}
            <h3 class="mn-card-h mn-card-h2">Relics bound</h3>
            ${relics ? `<ul class="mn-things${compact ? ' is-compact' : ''}">${relics}</ul>` : none('None bound.', 'The gold-marked Relic Bearer of each Elite Surge carries a chest.')}
          </section>
        </div>

        <div class="mn-end-actions">
          <button type="button" class="cf-btn primary mn-again" data-act="again"><span>Quest Again</span><span class="cf-key">enter</span></button>
          <button type="button" class="cf-btn mn-tosanc" data-act="sanctum"><span>Return to Sanctum</span><span class="cf-key">esc</span></button>
        </div>
      </div>`;
  }

  _startCounts() {
    this._stopCounts();
    const nodes = [...this.endEl.querySelectorAll('[data-count]')];
    const instant = reduceMotion();
    const delay = 420, dur = 1100;
    const t0 = performance.now();
    const paint = (n, v) => { n.textContent = n.dataset.plain ? fmt(v) : `+${fmt(v)}`; };
    if (instant) { nodes.forEach((n) => paint(n, Number(n.dataset.count))); return; }
    const tick = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0 - delay) / dur));
      const e = 1 - Math.pow(1 - k, 3);
      for (const n of nodes) {
        const a = Number(n.dataset.from), b = Number(n.dataset.count);
        paint(n, Math.round(a + (b - a) * e));
      }
      if (k < 1) this._raf.push(requestAnimationFrame(tick));
      else this.endEl.querySelector('.mn-reward')?.classList.add('is-done');
    };
    this._raf.push(requestAnimationFrame(tick));
  }

  _stopCounts() {
    for (const id of this._raf) cancelAnimationFrame(id);
    this._raf.length = 0;
  }

  _onEndClick(e) {
    const btn = e.target?.closest?.('[data-act]');
    if (!btn || !this.endEl.contains(btn)) return;
    if (btn.dataset.act === 'again') this._again();
    else if (btn.dataset.act === 'sanctum') this._toSanctum();
  }

  _again() {
    const s = this.endStats;
    if (!s) return;
    this.hideEnd();
    this.game.start({ classId: s.classId, tier: s.tier ?? 0, player: true });
  }

  _toSanctum() {
    this.hideEnd();
    this.game.quitToTitle();
    // quitToTitle normally calls back into showTitle; make sure the Sanctum appears regardless.
    if (!this.titleOpen) this.showTitle();
  }

  // ---------------------------------------------------------------- keyboard
  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.endOpen) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this._again();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (!e.repeat) this._toSanctum();
      }
      return;
    }
    if (!this.titleOpen) return;
    if (e.key === 'Escape') {
      if (this.pop) { e.preventDefault(); this._setPop(null); }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) this._begin();
      return;
    }
    if (/^[1-4]$/.test(e.key)) {
      const id = CLASS_ORDER[Number(e.key) - 1];
      if (this._unlocked(id)) this._pick(id);
    }
  }

  // ---------------------------------------------------------------- helpers
  _unlocked(id) {
    return !!id && isUnlocked(this.game.meta, id);
  }

  _firstUnlocked() {
    return CLASS_ORDER.find((id) => this._unlocked(id)) ?? 'pyromancer';
  }
}
