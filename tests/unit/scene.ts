// a synthetic counter for the tracker to watch: a big textured "world"
// and a camera that looks at a window of it. moving the window is moving
// the phone, so where the pan should be is known exactly at every frame.

/** a small seeded random, so every run sees the same counter */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type World = { g: Float32Array; w: number; h: number };

/** value noise over a few octaves: blotches as big as a tile down to
 *  speckles a few pixels across, like a worktop */
export function makeWorld(w: number, h: number, seed = 1): World {
  const rand = rng(seed);
  const g = new Float32Array(w * h);
  for (const [cell, amp] of [[48, 70], [16, 50], [5, 40], [2, 20]] as const) {
    const cw = Math.ceil(w / cell) + 2;
    const ch = Math.ceil(h / cell) + 2;
    const grid = Float32Array.from({ length: cw * ch }, () => rand());
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = x / cell;
        const gy = y / cell;
        const x0 = gx | 0;
        const y0 = gy | 0;
        let fx = gx - x0;
        let fy = gy - y0;
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        const i = y0 * cw + x0;
        const v =
          grid[i] * (1 - fx) * (1 - fy) +
          grid[i + 1] * fx * (1 - fy) +
          grid[i + cw] * (1 - fx) * fy +
          grid[i + cw + 1] * fx * fy;
        g[y * w + x] += v * amp;
      }
    }
  }
  return { g, w, h };
}

/** what the camera sees with its top left corner at (ox, oy) in the world */
export function view(world: World, ox: number, oy: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = Math.min(world.w - 2, Math.max(0, ox + x));
      const wy = Math.min(world.h - 2, Math.max(0, oy + y));
      const x0 = wx | 0;
      const y0 = wy | 0;
      const fx = wx - x0;
      const fy = wy - y0;
      const i = y0 * world.w + x0;
      out[y * w + x] =
        world.g[i] * (1 - fx) * (1 - fy) +
        world.g[i + 1] * fx * (1 - fy) +
        world.g[i + world.w] * (1 - fx) * fy +
        world.g[i + world.w + 1] * fx * fy;
    }
  }
  return out;
}
