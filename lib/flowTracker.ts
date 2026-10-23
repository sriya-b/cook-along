// where the pan is, kept up to date between model calls by watching how the
// whole scene moves. no react and no dom here, so it can be tested over
// hundreds of synthetic frames in node.

/** a rectangle in 0..1 of the camera frame. may sit partly or wholly
 *  outside 0..1 once the pan has left the shot. */
export type Box = { x: number; y: number; w: number; h: number };

/** halvings of the frame to track through. plain lucas-kanade only
 *  converges for a pixel or two of movement; the coarse levels catch the
 *  big motion and the fine ones sharpen it. */
const LEVELS = 4;
/** half-width of the window each point is matched over */
const WIN = 4;
/** refinement passes per point per level */
const ITERS = 3;
/** a point that moves further than this in one frame is a mismatch */
const MAX_STEP = 18;
/** how many points to follow across the frame */
const POINTS = 64;
/** the smaller eigenvalue of a point's structure tensor must clear this.
 *  the smaller one, not the sum: a straight edge has one big eigenvalue and
 *  one tiny one, and a point on an edge can't tell sliding along it from
 *  standing still. the sum let those through (F9). */
const MIN_EIG = 40;
/** below this many surviving points the frame is unreadable this time */
const MIN_ALIVE = 10;
/** top the points back up when they thin out below this */
const REFRESH_BELOW = 28;
/** the pan is never estimated further than this outside the frame. past
 *  it, accumulated drift is worth more than the estimate. */
const OFF_FRAME_LIMIT = 2.5;

type Pt = { x: number; y: number };
type Level = { g: Float32Array; w: number; h: number };

function sample(l: Level, x: number, y: number): number {
  if (x < 0 || y < 0 || x > l.w - 2 || y > l.h - 2) return 0;
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * l.w + x0;
  return (
    l.g[i] * (1 - fx) * (1 - fy) +
    l.g[i + 1] * fx * (1 - fy) +
    l.g[i + l.w] * (1 - fx) * fy +
    l.g[i + l.w + 1] * fx * fy
  );
}

function halve(l: Level): Level {
  const w = l.w >> 1;
  const h = l.h >> 1;
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * 2 * l.w + x * 2;
      g[y * w + x] = (l.g[i] + l.g[i + 1] + l.g[i + l.w] + l.g[i + l.w + 1]) / 4;
    }
  }
  return { g, w, h };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class FlowTracker {
  readonly width: number;
  readonly height: number;
  /** every object being kept in place, by name. the pan by default. */
  private boxes = new Map<string, Box>();
  private pts: Pt[] = [];
  private prev: Level[] | null = null;

  /** width and height of the greyscale frames that will be passed in.
   *  they should share the camera's shape (F8): a portrait feed squeezed
   *  into a 4:3 canvas smears vertical motion. */
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /** a fresh reading of where an object is, or null to forget it. the
   *  scene's motion moves every object the same way, so following more
   *  of them costs nothing extra. */
  seed(box: Box | null, key = "pan") {
    if (box) this.boxes.set(key, { ...box });
    else this.boxes.delete(key);
  }

  current(key = "pan"): Box | null {
    const b = this.boxes.get(key);
    return b ? { ...b } : null;
  }

  /** every object's current box, by name */
  all(): Record<string, Box> {
    const out: Record<string, Box> = {};
    for (const [k, b] of this.boxes) out[k] = { ...b };
    return out;
  }

  private pyramid(g: Float32Array): Level[] {
    const out: Level[] = [{ g, w: this.width, h: this.height }];
    for (let i = 1; i < LEVELS; i++) out.push(halve(out[i - 1]));
    return out;
  }

  /** points worth following, spread evenly over the whole frame */
  private choosePoints(lv0: Level): Pt[] {
    const margin = WIN + 3;
    const cols = 10;
    const rows = Math.max(6, Math.round((cols * this.height) / this.width));
    const found: Pt[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = margin + ((this.width - 2 * margin) * (c + 0.5)) / cols;
        const y = margin + ((this.height - 2 * margin) * (r + 0.5)) / rows;
        let sxx = 0;
        let sxy = 0;
        let syy = 0;
        for (let dy = -WIN; dy <= WIN; dy += 2) {
          for (let dx = -WIN; dx <= WIN; dx += 2) {
            const ix = (sample(lv0, x + dx + 1, y + dy) - sample(lv0, x + dx - 1, y + dy)) / 2;
            const iy = (sample(lv0, x + dx, y + dy + 1) - sample(lv0, x + dx, y + dy - 1)) / 2;
            sxx += ix * ix;
            sxy += ix * iy;
            syy += iy * iy;
          }
        }
        const half = (sxx + syy) / 2;
        const minEig = half - Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
        if (minEig > MIN_EIG) found.push({ x, y });
      }
    }
    // thin evenly rather than taking the first n, which kept only the top
    // of the frame (F13)
    if (found.length <= POINTS) return found;
    const step = found.length / POINTS;
    return Array.from({ length: POINTS }, (_, i) => found[Math.floor(i * step)]);
  }

  private trackPoint(prev: Level[], next: Level[], p: Pt): Pt | null {
    let dx = 0;
    let dy = 0;
    for (let lv = LEVELS - 1; lv >= 0; lv--) {
      const a = prev[lv];
      const b = next[lv];
      const scale = 1 << lv;
      const px0 = p.x / scale;
      const py0 = p.y / scale;
      if (lv < LEVELS - 1) {
        dx *= 2;
        dy *= 2;
      }
      for (let it = 0; it < ITERS; it++) {
        let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
        for (let wy = -WIN; wy <= WIN; wy++) {
          for (let wx = -WIN; wx <= WIN; wx++) {
            const px = px0 + wx;
            const py = py0 + wy;
            const ix = (sample(a, px + 1, py) - sample(a, px - 1, py)) / 2;
            const iy = (sample(a, px, py + 1) - sample(a, px, py - 1)) / 2;
            const t = sample(b, px + dx, py + dy) - sample(a, px, py);
            a11 += ix * ix;
            a12 += ix * iy;
            a22 += iy * iy;
            b1 -= ix * t;
            b2 -= iy * t;
          }
        }
        const det = a11 * a22 - a12 * a12;
        if (det < 1e-4) return null;
        dx += (a22 * b1 - a12 * b2) / det;
        dy += (a11 * b2 - a12 * b1) / det;
      }
    }
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) > MAX_STEP) return null;
    const out = { x: p.x + dx, y: p.y + dy };
    // a point that has left the frame can't be followed any further
    if (out.x < WIN || out.y < WIN || out.x > this.width - WIN - 2 || out.y > this.height - WIN - 2) return null;
    return out;
  }

  /**
   * take one greyscale frame and return where the pan now is.
   *
   * the pan sits still on the hob, so on screen it moves exactly as the
   * camera makes the whole scene move. following the scene, rather than
   * the texture inside the box, means:
   *  - losing track never makes it adopt whatever is now in the box, a
   *    wall or the floor, as "the pan" (F2)
   *  - it still knows which way the pan went once it has left the shot
   *  - the size is only ever set by the model, so it can't compound (F5)
   */
  update(grey: Float32Array): Box | null {
    const pyr = this.pyramid(grey);
    const prev = this.prev;
    this.prev = pyr;

    if (!prev || this.pts.length < MIN_ALIVE) {
      this.pts = this.choosePoints(pyr[0]);
      return this.current();
    }

    const before: Pt[] = [];
    const after: Pt[] = [];
    for (const p of this.pts) {
      const moved = this.trackPoint(prev, pyr, p);
      if (moved) {
        before.push(p);
        after.push(moved);
      }
    }

    if (after.length < MIN_ALIVE) {
      // the frame couldn't be read: a cut, a blur, a hand over the lens.
      // hold where we were and start fresh points next frame.
      this.pts = [];
      return this.current();
    }

    // what most of the scene agrees on, so a passing hand is outvoted
    const mdx = median(after.map((p, i) => p.x - before[i].x));
    const mdy = median(after.map((p, i) => p.y - before[i].y));

    for (const b of this.boxes.values()) {
      b.x = clamp(b.x + mdx / this.width, -OFF_FRAME_LIMIT, 1 + OFF_FRAME_LIMIT);
      b.y = clamp(b.y + mdy / this.height, -OFF_FRAME_LIMIT, 1 + OFF_FRAME_LIMIT);
    }

    this.pts = after.length < REFRESH_BELOW ? this.choosePoints(pyr[0]) : after;
    return this.current();
  }
}
