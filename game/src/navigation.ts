export interface Obstacle { minX: number; maxX: number; minZ: number; maxZ: number }
export const ROOM = { minX: -7.1, maxX: 7.1, minZ: -6.1, maxZ: 5.5 };

export function canStand(x: number, z: number, obstacles: Obstacle[], radius = .23): boolean {
  return x > ROOM.minX && x < ROOM.maxX && z > ROOM.minZ && z < ROOM.maxZ && !obstacles.some(b => x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius);
}
export function slide(x: number, z: number, dx: number, dz: number, obstacles: Obstacle[]): [number, number] {
  // Small fixed substeps prevent tunnelling through thin furniture at low frame rates.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));
  for (let i = 0; i < steps; i++) {
    if (canStand(x + dx / steps, z, obstacles)) x += dx / steps;
    if (canStand(x, z + dz / steps, obstacles)) z += dz / steps;
  }
  return [x, z];
}

function clearLine(a: [number, number], b: [number, number], obstacles: Obstacle[], radius: number) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .1));
  for (let i = 0; i <= n; i++) { const t = i / n; if (!canStand(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, obstacles, radius)) return false; }
  return true;
}

/**
 * Grid A* (0.2 m cells, 8-neighbour) around furniture colliders, then line-of-sight smoothing.
 * Start/goal may sit just inside a seat footprint; they are snapped to the nearest walkable cell.
 * Returns [x, z] waypoints (excluding the start) or null when no route exists.
 */
export function findPath(start: [number, number], goal: [number, number], obstacles: Obstacle[], radius = .25): [number, number][] | null {
  const cell = .2;
  const W = Math.ceil((ROOM.maxX - ROOM.minX) / cell), H = Math.ceil((ROOM.maxZ - ROOM.minZ) / cell);
  const toCell = (x: number, z: number) => [Math.round((x - ROOM.minX) / cell), Math.round((z - ROOM.minZ) / cell)] as const;
  const toWorld = (i: number, j: number): [number, number] => [ROOM.minX + i * cell, ROOM.minZ + j * cell];
  const free = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const [x, z] = toWorld(i, j); free[j * W + i] = canStand(x, z, obstacles, radius) ? 1 : 0; }
  const snap = (x: number, z: number) => {
    const [ci, cj] = toCell(x, z);
    for (let r = 0; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < W && j < H && free[j * W + i]) return j * W + i;
    }
    return -1;
  };
  const s = snap(...start), g = snap(...goal);
  if (s < 0 || g < 0) return null;
  const gx = g % W, gz = Math.floor(g / W);
  const hcost = (k: number) => { const dx = Math.abs(k % W - gx), dz = Math.abs(Math.floor(k / W) - gz); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
  const gScore = new Float32Array(W * H).fill(Infinity), came = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
  gScore[s] = 0;
  const open: number[] = [s]; const f = new Float32Array(W * H).fill(Infinity); f[s] = hcost(s);
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === g) break;
    closed[cur] = 1;
    const ci = cur % W, cj = Math.floor(cur / W);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const k = j * W + i; if (!free[k] || closed[k]) continue;
      if (di && dj && (!free[cj * W + i] || !free[j * W + ci])) continue; // no corner cutting
      const t = gScore[cur] + (di && dj ? 1.414 : 1);
      if (t < gScore[k]) { gScore[k] = t; came[k] = cur; f[k] = t + hcost(k); if (!open.includes(k)) open.push(k); }
    }
  }
  if (came[g] < 0 && g !== s) return null;
  const cells: [number, number][] = [];
  for (let k = g; k !== s && k >= 0; k = came[k]) cells.push(toWorld(k % W, Math.floor(k / W)));
  cells.reverse();
  cells.push(goal);
  // String-pulling: keep only the waypoints needed to stay clear of furniture.
  const out: [number, number][] = []; let anchor: [number, number] = start;
  for (let i = 0; i < cells.length; i++) {
    const nextIdx = i + 1;
    if (nextIdx >= cells.length || !clearLine(anchor, cells[nextIdx], obstacles, radius * .9)) { out.push(cells[i]); anchor = cells[i]; }
  }
  return out;
}
