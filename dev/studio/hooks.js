// =====================================================================================
//  Studio hooks (dev only; the game never imports this). studio.json → play.hooks and assets.capture.
//  Called by the Studio page with the game's (or the creature viewer's) iframe window.
// =====================================================================================

// A play moment, descriptive only: read from the game's debug handle (window.__game, src/main.js).
export function snapshot(win) {
  const g = win.__game, p = g?.player;
  if (!g) return null;
  return {
    state: g.state, act: g.act, time: +g.time.toFixed(1), tier: g.tier, enemies: g.enemies.length, boss: g.boss?.name ?? null,
    player: p && { classId: p.classId, level: p.level, hp: Math.round(p.hp), x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1) },
  };
}

// The renderer has no preserveDrawingBuffer, so the canvas reads blank between frames (and the viewer
// renders on demand): render a frame, then read the canvas in the same task.
export function capture(win) {
  const engine = win.__game?.engine ?? win.engine;   // the game, or dev/creatures.html
  engine.render();
  return new Promise((resolve, reject) =>
    engine.renderer.domElement.toBlob((b) => (b ? resolve(b) : reject(new Error('the canvas could not be read'))), 'image/png'));
}
