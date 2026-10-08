// Uniform-grid spatial hash for fast "enemies near point" queries on the XZ plane.
export class SpatialHash {
  constructor(cell = 4) {
    this.cell = cell;
    this.map = new Map();
  }
  _key(cx, cz) { return (cx + 50000) * 100000 + (cz + 50000); }
  clear() { for (const arr of this.map.values()) arr.length = 0; }
  insert(e) {
    const cx = Math.floor(e.pos.x / this.cell), cz = Math.floor(e.pos.z / this.cell);
    const k = this._key(cx, cz);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(e);
  }
  // Entities whose circle (pos, radius) intersects the query circle.
  query(x, z, r, out = []) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r - 2) / c), x1 = Math.floor((x + r + 2) / c);
    const z0 = Math.floor((z - r - 2) / c), z1 = Math.floor((z + r + 2) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.map.get(this._key(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          if (e.dead) continue;
          const dx = e.pos.x - x, dz = e.pos.z - z, rr = r + (e.radius || 0);
          if (dx * dx + dz * dz <= rr * rr) out.push(e);
        }
      }
    }
    return out;
  }
}
