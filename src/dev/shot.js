// =====================================================================================
//  Headless screenshots (dev only). The browser pane is usually hidden, so its own
//  screenshots are stale. This renders a frame and uploads the canvas as a PNG to the
//  shots server (launch config "riftbound-shots", port 8097, writes to dev/shots/).
//  Open the game FROM that server (http://localhost:8097/?unlockall) so the PUT is same-origin.
//
//    const S = await import('/src/dev/shot.js?v=' + Date.now());
//    await S.shot('blizzard-r5');                         // whole canvas → dev/shots/blizzard-r5.png
//    await S.shot('hero-close', { around: player.pos, size: 8 });   // crop a box of ~8 m around a point
//  Then Read the file dev/shots/<name>.png.
//
//  Scene helpers for VFX work (god-mode run, no HUD, synchronous stepping):
//    await S.stage({ classId: 'cryomancer', act: 0, zoom: 1.6, enemies: true })
//    S.castAt('blizzard', 5, 4, -3)    // cast skill id at rank, at player + (dx, dz)
//    S.step(1.2)                       // advance the game 1.2 s synchronously (30 Hz) and render
//    S.clearEnemies()
// =====================================================================================
import * as THREE from 'three';

const _v = new THREE.Vector3();

export async function shot(name, { around = null, size = 10, scale = 1 } = {}) {
  const g = window.__game;
  g.engine.render();
  const src = g.engine.renderer.domElement;
  let out = src;
  if (around || scale !== 1) {
    let sx = 0, sy = 0, sw = src.width, sh = src.height;
    if (around) {
      // screen-space box of `size` metres (vertical) centred on `around`
      const cam = g.engine.camera;
      _v.set(around.x, (around.y ?? 0) + 1, around.z).project(cam);
      const cx = (_v.x * 0.5 + 0.5) * src.width, cy = (-_v.y * 0.5 + 0.5) * src.height;
      const ppu = src.height * cam.zoom / (cam.top - cam.bottom);
      sh = Math.min(src.height, size * ppu); sw = Math.min(src.width, sh * 16 / 9);
      sx = Math.max(0, Math.min(src.width - sw, cx - sw / 2)); sy = Math.max(0, Math.min(src.height - sh, cy - sh / 2));
    }
    const c = document.createElement('canvas');
    c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
    c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    out = c;
  }
  return upload(out, name);
}

// Upload any canvas as dev/shots/<name>.png (call right after rendering into it).
export async function upload(canvas, name) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = name.replace(/[^\w.-]/g, '_');
  const res = await fetch(`/__promo/out/${file}.png`, { method: 'PUT', body: blob });
  return { name: `dev/shots/${file}.png`, status: res.status, w: canvas.width, h: canvas.height };
}

// A hidden pane reports a 0×0 window. Pin the viewport to a fixed size so frames are real.
export function pinSize(w = 1280, h = 720) {
  if (window.__pinned === `${w}x${h}`) return;
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => h });
  window.__game.engine.renderer.setPixelRatio(1);
  window.__game.engine.resize();
  window.__pinned = `${w}x${h}`;
}

export async function stage({ classId = 'pyromancer', act = 0, zoom = 1.6, seconds = 1, enemies = true, boss = false } = {}) {
  const g = window.__game;
  pinSize();
  const { snap } = await import('/src/dev/sim.js?v=' + Date.now());
  await snap({ act, seconds: 0.1, classId, zoom, boss });
  if (!enemies) clearEnemies();
  if (!enemies) {
    g.spawner.update = () => {};
    // restore the real spawner on the next run start (sim lanes after a stage used to stay empty)
    const off = g.events.on('runStart', () => { delete g.spawner.update; off(); });
  }
  step(seconds);
  return { player: g.player.pos.clone(), enemies: g.enemies.length };
}

export function clearEnemies() {
  const g = window.__game;
  for (const e of g.enemies) if (!e.inert) e.dead = true;
}

// Cast skill `id` at rank, aimed at player + (dx, dz). Plays the hero's cast pose and the cast-flash hook
// like a real cast. slot: 0 = starter pose (default for starters and LMB fusions), else 1+.
const LMB = new Set(['arcaneBolt', 'cinderBolt', 'iceShard', 'spark', 'starfall', 'hailstorm', 'tempest', 'arcaneBarrage']);
export async function castAt(id, rank, dx, dz, slot) {
  const g = window.__game, p = g.player;
  const { ALL_DEFS } = await import('/src/game/skills/registry.js');
  const { HERO_FX } = await import('/src/game/vfx/heroFx.js');
  const def = ALL_DEFS[id];
  if (!def) throw new Error('no skill ' + id);
  const o = p.pos.clone(); o.y = 0;
  const t = o.clone().add(new THREE.Vector3(dx, 0, dz));
  const dir = t.clone().sub(o).setY(0).normalize();
  p.facing.copy(dir);
  g.input.mouseGround.set(t.x, 0, t.z);
  p.lastElement = def.element;
  def.cast(g, { rank, origin: o, dir, target: t, player: p, state: {} });
  const s = slot ?? (LMB.has(id) ? 0 : 1);
  p.model?.cast(def, s);
  HERO_FX.cast(g, p, def, s);
  return def.id;
}

export function step(sec, dt = 1 / 30) {
  const g = window.__game;
  for (let i = 0; i < Math.round(sec / dt); i++) {
    g.update(dt);
    if (g.state === 'levelup' || g.state === 'relic') g.state = 'playing';
  }
  g.engine.render();
}
