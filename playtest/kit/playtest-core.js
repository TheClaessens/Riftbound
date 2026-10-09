// =====================================================================================
//  Playtest kit — core driver (game-agnostic, no dependencies).
//
//  Lets an LLM playtester play a browser game much faster than real time: the game is
//  stepped synchronously inside each tool call, optional bot "hands" do the motor work,
//  and the playtester (the "brain") makes every real decision. A per-game ADAPTER tells
//  the core how to start, step, read and decide; see adapter.template.js.
//
//    import { createPlaytest } from './kit/playtest-core.js';
//    const PT = createPlaytest(adapter);   export default PT;
//
//  Playtester API (all synchronous unless noted; every call returns plain JSON):
//    PT.init({ persona, skill, fresh, ...gameOpts })  sandbox save, freeze the game's loop
//    PT.meta() / PT.<metaAction>(...)                 out-of-run progression (if the game has it)
//    PT.start({ ... })                                start a run / level / match
//    PT.play({ seconds, stopAt, autoPick, lowHp })    advance; stops early at decisions etc.
//    PT.decision() / PT.choose(i)                     the choice the game is asking for
//    PT.state()  PT.ui()  await PT.shot(name, opts)   look at the game
//    PT.end()  PT.abandon()                           finish / quit the run
//    PT.batch({...}) / await PT.batchWait(ms) / PT.batchResult()   background bot runs
//    PT.<action>(...)                                 game-specific extras from adapter.actions
// =====================================================================================

const OUT_PREFIX = '/__playtest/out/';

// setTimeout is throttled to ~1/min in hidden tabs; a MessageChannel hop is not.
export const yieldNow = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
export const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const r1 = (x) => Math.round(x * 10) / 10;
const roundDeep = (v) => {
  if (typeof v === 'number') return Math.abs(v) >= 10 ? Math.round(v) : r1(v);
  if (Array.isArray(v)) return v.map(roundDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)]));
  return v;
};

export function createPlaytest(A) {
  const DT = A.dt ?? 1 / 30;
  let S = null;          // driver state (persona, skill, run, decision, batch)
  let hooked = false;

  // ---------------------------------------------------------------- context given to the adapter
  // The adapter reports what happens through ctx; the core turns it into the play() digest.
  const ctx = {
    get persona() { return S?.persona; },
    get skill() { return S?.skill; },
    get running() { return !!S?.run; },
    get decision() { return S?.decision ?? null; },   // the pending choice (for actions like reroll)
    get run() { return S?.run ?? null; },             // per-run scratch space for the adapter (run.opts, ...)
    dt: DT,
    // a choice the game is waiting for: { kind, options:[{...plain data}], pick(i), extra? }
    offer(decision) { if (S) S.decision = decision; },
    clearDecision() { if (S) S.decision = null; },
    // one human-readable line for the event log (time-stamped with the adapter's clock)
    event(text) { if (S?.run) S.run.events.push(`${fmtTime(A.time?.() ?? S.run.t)} ${text}`); },
    // accumulate into this play() window: tally('kills'), tally('dmgBy', 12, 'Ogre')
    tally(key, amount = 1, sub) {
      const w = S?.run?.win; if (!w) return;
      if (sub === undefined) w[key] = (w[key] ?? 0) + amount;
      else { const o = (w[key] ??= {}); o[sub] = (o[sub] ?? 0) + amount; }
    },
    min(key, v) { const w = S?.run?.win; if (w) w[key] = Math.min(w[key] ?? Infinity, v); },
    max(key, v) { const w = S?.run?.win; if (w) w[key] = Math.max(w[key] ?? -Infinity, v); },
    // run every n-th call only (for anything that reads DOM layout: reading it every tick tanks speed)
    every(n, key, fn) { const c = (S._every ??= {}); c[key] = ((c[key] ?? 0) + 1) % n; if (c[key] === 0) fn(); },
    fmtTime,
  };

  // ---------------------------------------------------------------- storage sandbox
  function sandboxStorage() {
    const keys = new Set(A.storageKeys ?? []);
    if (!keys.size && !A.storagePrefix) return;
    const P = Storage.prototype, get = P.getItem, set = P.setItem, rm = P.removeItem;
    const map = (k) => {
      const hit = keys.has(k) || (A.storagePrefix && String(k).startsWith(A.storagePrefix));
      return hit && window.__ptPersona ? `pt.${window.__ptPersona}.${k}` : k;
    };
    P.getItem = function (k) { return get.call(this, map(k)); };
    P.setItem = function (k, v) { return set.call(this, map(k), v); };
    P.removeItem = function (k) { return rm.call(this, map(k)); };
  }
  function wipePersona(persona) {
    const pre = `pt.${persona}.`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(pre)) localStorage.removeItem(k);   // sandboxed keys aren't remapped again
    }
  }

  // ---------------------------------------------------------------- lifecycle
  function init({ persona = 'tester', skill = 'average', fresh = false, ...opts } = {}) {
    if (!A.ready()) throw new Error('game not booted yet; wait a second and retry');
    (A.freeze ?? (() => { window.requestAnimationFrame = () => 0; }))();
    const id = String(persona).replace(/[^\w-]/g, '');
    if (!hooked) { sandboxStorage(); A.install?.(ctx); hooked = true; }
    window.__ptPersona = id;
    if (fresh) wipePersona(id);
    const levels = A.hands?.levels;
    S = { persona: id, skill: levels && !levels[skill] ? 'average' : skill, run: null, decision: null, batch: null };
    const info = A.onInit?.(opts, ctx) ?? {};
    return { persona: id, skill: S.skill, ...info, ...(A.meta ? { meta: roundDeep(A.meta()) } : {}) };
  }

  function need() { if (!S) throw new Error('call PT.init() first'); }

  function start(opts = {}) {
    need();
    S.decision = null;
    S.run = { t: 0, events: [], win: {}, opts };
    const info = A.start(opts, ctx);
    if (info?.error) { S.run = null; return info; }
    A.hands?.reset?.();
    return { started: true, ...info, state: state() };
  }

  // Advance the game. Stops at: a decision, a custom stop (adapter.stops), the run ending, or time.
  function play({ seconds = 30, stopAt, autoPick = false, lowHp = false } = {}) {
    need();
    if (!S.run) return { error: 'no run; call PT.start()' };
    if (S.decision && !autoPick) return { error: 'a decision is waiting: PT.decision() then PT.choose(i)', decision: decision() };
    const stops = stopAt ?? ['decision', ...Object.keys(A.stops ?? {}), 'end'];
    const run = S.run;
    run.win = {}; run.events.length = 0;
    // adapter.stops: { name: () => checker }. The factory runs at the start of each play() call
    // (capture "before" state there); the checker runs after every tick and returns true to stop.
    const custom = Object.entries(A.stops ?? {}).filter(([k]) => stops.includes(k)).map(([k, make]) => [k, make(ctx)]);
    const t0 = A.time?.() ?? run.t;
    let stopped = 'time';
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) {
      const st = A.status();
      if (st === 'won' || st === 'lost') { stopped = st; break; }
      if (S.decision) {
        if (autoPick) autoChoose(); else { stopped = `decision:${S.decision.kind}`; break; }
        continue;
      }
      if (st === 'playing' && A.hands) A.hands.tick(ctx, S.skill);
      A.step(DT, ctx);
      run.t += DT;
      A.afterStep?.(ctx);
      if (lowHp && A.lowHp?.() && !run.lowWarned) { run.lowWarned = true; stopped = 'lowHp'; break; }
      if (A.lowHp && !A.lowHp(0.5)) run.lowWarned = false;
      const hit = custom.find(([, check]) => check());
      if (hit) { stopped = hit[0]; break; }
    }
    const st = A.status();
    if (st === 'won' || st === 'lost') stopped = st;
    else if (S.decision && !autoPick && !stopped.startsWith('decision')) stopped = `decision:${S.decision.kind}`;
    A.afterPlay?.(ctx);
    return {
      stopped, played: r1((A.time?.() ?? run.t) - t0) + 's', state: state(),
      window: roundDeep(Object.fromEntries(Object.entries(run.win).filter(([, v]) => v !== Infinity && v !== -Infinity))),
      events: run.events.slice(0, A.maxEvents ?? 40),
      ...(S.decision ? { decision: decision() } : {}),
    };
  }

  function state() { return roundDeep(A.state(ctx)); }

  // ---------------------------------------------------------------- decisions
  function decision() {
    const d = S?.decision;
    if (!d) return null;
    return { kind: d.kind, ...(d.info ?? {}), options: d.options.map((o, i) => ({ i, ...o })) };
  }

  function choose(i) {
    const d = S?.decision;
    if (!d) return { error: 'no decision waiting' };
    if (!d.options[i]) return { error: `no option ${i}` };
    S.decision = null;
    const picked = d.options[i];
    d.pick(i, ctx);
    A.settle?.(ctx);               // e.g. let the game queue the next decision
    return { picked: picked.name ?? picked.label ?? i, state: state(), ...(S.decision ? { next: decision() } : {}) };
  }

  function autoChoose() {
    const d = S.decision;
    const i = A.autoDecide ? A.autoDecide(d, ctx) : 0;
    return choose(i);
  }

  // ---------------------------------------------------------------- ending
  function end() {
    need();
    const st = A.status();
    if (st !== 'won' && st !== 'lost') return { error: `run still going (${st}); play on or PT.abandon()` };
    const out = A.end?.(ctx) ?? { result: st };
    S.run = null; S.decision = null;
    return roundDeep(out);
  }

  function abandon() {
    need();
    const out = A.abandon?.(ctx) ?? {};
    S.run = null; S.decision = null;
    return { abandoned: true, ...out };
  }

  // ---------------------------------------------------------------- looking
  // Render and save the canvas as <out>/<persona>-<name>.png. around: a world point the
  // adapter can project (adapter.project(point) -> {x, y} in canvas px), cropping ~size units.
  async function shot(name, { around = null, size = 14 } = {}) {
    need();
    A.render?.();
    const src = A.canvas();
    let out = src;
    const at = typeof around === 'string' ? A.focus?.(around) : around;
    if (at && A.project) {
      const { x, y, pxPerUnit } = A.project(at);
      const sh = Math.min(src.height, size * (pxPerUnit ?? src.height / 20)), sw = Math.min(src.width, sh * src.width / src.height);
      const sx = Math.max(0, Math.min(src.width - sw, x - sw / 2)), sy = Math.max(0, Math.min(src.height - sh, y - sh / 2));
      out = document.createElement('canvas');
      out.width = Math.round(sw); out.height = Math.round(sh);
      out.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
    }
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    const file = `${S.persona}-${name}`.replace(/[^\w.-]/g, '_') + '.png';
    const res = await fetch(OUT_PREFIX + file, { method: 'PUT', body: blob });
    return { file: `${A.outDir ?? 'playtest/out'}/${file}`, status: res.status, w: out.width, h: out.height };
  }

  // Everything a player could read on screen right now.
  function ui() {
    const root = A.uiRoot?.() ?? document.body;
    return root.innerText.replace(/\n{2,}/g, '\n').trim().slice(0, A.uiChars ?? 3000);
  }

  // ---------------------------------------------------------------- batches (balance work)
  function batch(opts = {}) {
    need();
    if (S.batch && !S.batch.done) return { error: 'a batch is already running', progress: batchResult() };
    const list = A.batchPlan ? A.batchPlan(opts) : [opts];
    const n = opts.n ?? 4;
    S.batch = { done: false, rows: [], total: list.length * n, waiters: [] };
    runBatch(list, n, opts).catch((e) => { S.batch.error = String(e?.stack ?? e).slice(0, 400); finishBatch(); });
    return { started: true, total: S.batch.total };
  }

  function batchResult() {
    const b = S?.batch;
    if (!b) return { error: 'no batch started' };
    return { done: b.done, finished: b.rows.length, total: b.total, rows: b.rows, error: b.error };
  }

  // Wait inside one tool call until the batch finishes or `ms` passes (deadlines are checked by
  // the batch loop itself: timers are throttled in hidden tabs).
  function batchWait(ms = 35000) {
    const b = S?.batch;
    if (!b || b.done) return Promise.resolve(batchResult());
    return new Promise((resolve) => b.waiters.push({ until: performance.now() + ms, resolve }));
  }

  function wake(all) {
    const b = S.batch, now = performance.now();
    b.waiters = b.waiters.filter((w) => { if (all || now >= w.until) { w.resolve(batchResult()); return false; } return true; });
  }
  function finishBatch() { S.batch.restore?.(); S.batch.done = true; A.batchEnd?.(ctx); wake(true); }

  async function runBatch(list, n, opts) {
    const savedSkill = S.skill;
    if (opts.skill) S.skill = opts.skill;
    // batch runs must not count toward the persona's save: snapshot the sandboxed keys, restore after
    // (if the game also caches its save in memory, reload it in adapter.batchEnd)
    const snap = opts.keepSave ? null : (A.storageKeys ?? []).map((k) => [k, localStorage.getItem(k)]);
    S.batch.restore = () => snap?.forEach(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)));
    A.batchBegin?.(ctx, opts);
    const chunk = opts.chunk ?? 10, cap = opts.maxSeconds ?? A.batchMaxSeconds ?? 1800;
    for (const runOpts of list) {
      for (let k = 0; k < n; k++) {
        const r = start({ ...runOpts, batch: true });
        if (r.error) { S.batch.rows.push({ ...runOpts, error: r.error }); continue; }
        const extra = A.batchTrack?.(ctx) ?? null;
        let t = 0;
        while (t < cap) {
          const st = A.status();
          if (st === 'won' || st === 'lost') break;
          play({ seconds: chunk, stopAt: [], autoPick: true });
          t += chunk;
          wake(false);
          await yieldNow();
        }
        const st = A.status();
        S.batch.rows.push(roundDeep({ ...(A.batchRow?.(ctx, runOpts, extra) ?? state()), result: st === 'won' || st === 'lost' ? st : `unfinished (cap ${cap}s)` }));
        extra?.stop?.();
        if (st === 'won' || st === 'lost') end(); else abandon();
      }
    }
    S.skill = savedSkill;
    finishBatch();
  }

  // ---------------------------------------------------------------- assemble
  const PT = { init, start, play, state, decision, choose, end, abandon, shot, ui, batch, batchWait, batchResult, ctx };
  if (A.meta) PT.meta = () => roundDeep(A.meta());
  for (const [k, f] of Object.entries(A.actions ?? {})) {
    if (PT[k]) throw new Error(`adapter action "${k}" clashes with a core method`);
    PT[k] = (...args) => { need(); const r = f(ctx, ...args); return r instanceof Promise ? r.then(roundDeep) : roundDeep(r); };
  }
  return PT;
}
