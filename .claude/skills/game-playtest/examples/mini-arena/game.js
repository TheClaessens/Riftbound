// Mini Arena — a ~150-line 2D canvas survival game used as the game-playtest skill's self-test
// and as a worked adapter example. Survive 90 s; every 8 kills pick 1 of 3 upgrades.
const W = 800, H = 600;
const rnd = (a, b) => a + Math.random() * (b - a);

export class Game {
  constructor(canvas) {
    this.canvas = canvas; this.g = canvas.getContext('2d');
    this.listeners = {}; this.state = 'menu';
    this.keys = new Set(); this.mouse = { x: W / 2, y: H / 2, down: false };
    this.input = { moveX: 0, moveY: 0, aimX: W / 2, aimY: H / 2, fire: false, dash: false, bot: false };
    this.save = JSON.parse(localStorage.getItem('mini.save') || '{"best":0,"runs":0}');
    this.ui = { showUpgrade: (opts, onPick) => this._showUpgrade(opts, onPick), hideUpgrade: () => { document.getElementById('pick').style.display = 'none'; } };
  }
  on(n, f) { (this.listeners[n] ??= []).push(f); return () => { this.listeners[n] = this.listeners[n].filter((x) => x !== f); }; }
  emit(n, e) { (this.listeners[n] ?? []).forEach((f) => f(e)); }

  start() {
    this.state = 'playing'; this.time = 0; this.kills = 0; this.nextPick = 8;
    this.p = { x: W / 2, y: H / 2, r: 10, hp: 100, maxHp: 100, speed: 170, dmg: 10, rate: 3, cd: 0, dashCd: 0, inv: 0 };
    this.enemies = []; this.bullets = []; this.shots = []; this.warns = []; this.spawnT = 0;
    this.emit('runStart', {});
  }

  update(dt) {
    if (this.state !== 'playing') return;
    const p = this.p, inp = this.input;
    this.time += dt;
    if (this.time >= 90) return this._end(true);
    // input (bot hands write this.input; humans use keys/mouse)
    let mx = inp.bot ? inp.moveX : (this.keys.has('d') - this.keys.has('a'));
    let my = inp.bot ? inp.moveY : (this.keys.has('s') - this.keys.has('w'));
    const ml = Math.hypot(mx, my) || 1;
    p.x = Math.max(p.r, Math.min(W - p.r, p.x + mx / ml * p.speed * dt));
    p.y = Math.max(p.r, Math.min(H - p.r, p.y + my / ml * p.speed * dt));
    p.dashCd -= dt; p.inv -= dt;
    if ((inp.bot ? inp.dash : this.keys.has(' ')) && p.dashCd <= 0) { p.dashCd = 2; p.inv = 0.25; p.x += mx / ml * 60; p.y += my / ml * 60; this.emit('dash', {}); }
    // shooting
    p.cd -= dt;
    const ax = inp.bot ? inp.aimX : this.mouse.x, ay = inp.bot ? inp.aimY : this.mouse.y;
    if ((inp.bot ? inp.fire : this.mouse.down) && p.cd <= 0) {
      p.cd = 1 / p.rate; const d = Math.hypot(ax - p.x, ay - p.y) || 1;
      this.shots.push({ x: p.x, y: p.y, vx: (ax - p.x) / d * 420, vy: (ay - p.y) / d * 420, life: 1.2 });
    }
    // spawning: grunts, shooters, and brutes that telegraph a slam
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = Math.max(0.25, 1.1 - this.time / 120);
      const side = Math.random() * 4 | 0, x = side < 2 ? rnd(0, W) : side === 2 ? -10 : W + 10, y = side >= 2 ? rnd(0, H) : side === 0 ? -10 : H + 10;
      const kind = Math.random() < 0.15 ? 'brute' : Math.random() < 0.3 ? 'shooter' : 'grunt';
      const T = { grunt: { name: 'Grunt', hp: 20, r: 9, sp: 70, dmg: 8 }, shooter: { name: 'Spitter', hp: 15, r: 9, sp: 45, dmg: 6 }, brute: { name: 'Brute', hp: 80, r: 16, sp: 40, dmg: 25 } }[kind];
      this.enemies.push({ kind, ...T, x, y, t: rnd(0, 2) });
    }
    for (const e of this.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.x += dx / d * e.sp * dt; e.y += dy / d * e.sp * dt; e.t -= dt;
      if (e.kind === 'shooter' && e.t <= 0) { e.t = 2.2; this.bullets.push({ x: e.x, y: e.y, vx: dx / d * 200, vy: dy / d * 200, r: 5, dmg: e.dmg, life: 3 }); }
      if (e.kind === 'brute' && e.t <= 0 && d < 140) {
        e.t = 4;
        const tx = p.x, ty = p.y;   // slam where the player stands now; it lands 1 s later
        this.telegraph(tx, ty, 45, 1.0, () => { if (Math.hypot(this.p.x - tx, this.p.y - ty) < 45) this._hurt(e.dmg, { name: 'Brute slam' }); });
      }
      if (d < e.r + p.r) this._hurt(e.dmg * dt * 2, e);
    }
    for (const w of this.warns) { w.t += dt; if (w.t >= w.life && !w.done) { w.done = true; w.onDone(); } }
    this.warns = this.warns.filter((w) => !w.done);
    for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r) { b.life = 0; this._hurt(b.dmg, { name: 'Spitter bolt' }); } }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    for (const s of this.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      for (const e of this.enemies) if (e.hp > 0 && Math.hypot(s.x - e.x, s.y - e.y) < e.r + 3) { e.hp -= p.dmg; s.life = 0; break; }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const e of this.enemies) if (e.hp <= 0) { this.kills++; this.emit('kill', { enemy: e }); }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    if (this.kills >= this.nextPick) { this.nextPick += 8; this._offerUpgrade(); }
  }

  telegraph(x, y, r, life, onDone) { const w = { x, y, r, life, t: 0, onDone, done: false }; this.warns.push(w); this.emit('telegraph', w); return w; }
  _hurt(n, src) { const p = this.p; if (p.inv > 0) return; p.hp -= n; this.emit('hit', { amount: n, source: src }); if (p.hp <= 0) this._end(false); }
  _end(won) {
    this.state = won ? 'won' : 'lost';
    this.save.runs++; this.save.best = Math.max(this.save.best, Math.floor(this.time));
    localStorage.setItem('mini.save', JSON.stringify(this.save));
    this.emit('end', { won });
  }
  _offerUpgrade() {
    const all = [
      { id: 'dmg', name: 'Sharper Shots', desc: '+5 damage', apply: (p) => { p.dmg += 5; } },
      { id: 'rate', name: 'Quick Hands', desc: '+1 shot per second', apply: (p) => { p.rate += 1; } },
      { id: 'speed', name: 'Light Boots', desc: '+25 move speed', apply: (p) => { p.speed += 25; } },
      { id: 'hp', name: 'Thick Skin', desc: '+30 max HP and heal 30', apply: (p) => { p.maxHp += 30; p.hp += 30; } },
    ].sort(() => Math.random() - 0.5).slice(0, 3);
    this.state = 'choosing';
    this.ui.showUpgrade(all, (u) => { u.apply(this.p); this.ui.hideUpgrade(); this.state = 'playing'; this.emit('upgrade', { u }); });
  }
  _showUpgrade(opts, onPick) {
    const el = document.getElementById('pick');
    el.innerHTML = '<b>Choose an upgrade</b>' + opts.map((o, i) => `<button data-i="${i}">${o.name}: ${o.desc}</button>`).join('');
    el.style.display = 'block';
    el.onclick = (ev) => { const i = ev.target.dataset?.i; if (i !== undefined) onPick(opts[+i]); };
  }

  render() {
    const g = this.g; g.fillStyle = '#20302a'; g.fillRect(0, 0, W, H);
    if (!this.p) return;
    for (const w of this.warns) { g.strokeStyle = '#ff4040'; g.lineWidth = 3; g.beginPath(); g.arc(w.x, w.y, w.r, 0, 7); g.stroke(); g.fillStyle = `rgba(255,60,60,${0.4 * w.t / w.life})`; g.fill(); }
    for (const e of this.enemies) { g.fillStyle = { grunt: '#8bc34a', shooter: '#ce93d8', brute: '#a1887f' }[e.kind]; g.beginPath(); g.arc(e.x, e.y, e.r, 0, 7); g.fill(); }
    g.fillStyle = '#ff4fa0'; for (const b of this.bullets) { g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fill(); }
    g.fillStyle = '#fff59d'; for (const s of this.shots) g.fillRect(s.x - 2, s.y - 2, 4, 4);
    g.fillStyle = this.p.inv > 0 ? '#ffffff' : '#4fc3f7'; g.beginPath(); g.arc(this.p.x, this.p.y, this.p.r, 0, 7); g.fill();
    document.getElementById('hud').textContent = `HP ${Math.ceil(this.p.hp)}/${this.p.maxHp} · ${Math.floor(this.time)}s / 90s · kills ${this.kills}`;
  }
}
