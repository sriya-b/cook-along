"use client";

import { useEffect, useRef, useState } from "react";

export type Box = { x: number; y: number; w: number; h: number };

/** the frame is tracked at this size. bigger is steadier but slower. */
const W = 240;
const H = 180;
/** tracking passes per second */
const FPS = 15;
/** how many points to follow inside the pan */
const POINTS = 44;
/** half-width of the window each point is matched over */
const WIN = 4;
/** refinement passes per point per frame */
const ITERS = 3;
/** a point whose window is this featureless cannot be followed */
const MIN_EIGEN = 180;
/** a point that moves this far in one frame is a mismatch, not motion */
const MAX_STEP = 14;
/** how many halvings of the frame to track through. plain lucas-kanade
 *  only converges for a pixel or two of movement, which a handheld phone
 *  blows past constantly; the coarse levels catch the big motion and the
 *  fine ones sharpen it. */
const LEVELS = 4;
/** below this many surviving points the track is dead and we wait for
 *  the model to tell us where the pan is again */
const MIN_ALIVE = 8;

type Pt = { x: number; y: number };

/** one level of the pyramid: the image plus its own dimensions */
type Level = { g: Float32Array; w: number; h: number };

/** greyscale, with bilinear sampling so points can sit between pixels */
function sample(l: Level, x: number, y: number): number {
  if (x < 0 || y < 0 || x > l.w - 2 || y > l.h - 2) return 0;
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * l.w + x0;
  const a = l.g[i];
  const b = l.g[i + 1];
  const c = l.g[i + l.w];
  const d = l.g[i + l.w + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/** halve the image, averaging each 2x2 block */
function halve(l: Level): Level {
  const w = l.w >> 1;
  const h = l.h >> 1;
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * 2) * l.w + x * 2;
      g[y * w + x] = (l.g[i] + l.g[i + 1] + l.g[i + l.w] + l.g[i + l.w + 1]) / 4;
    }
  }
  return { g, w, h };
}

function pyramid(g: Float32Array): Level[] {
  const out: Level[] = [{ g, w: W, h: H }];
  for (let i = 1; i < LEVELS; i++) out.push(halve(out[i - 1]));
  return out;
}

/**
 * follows the pan by watching its surface move.
 *
 * this is the opposite trick to image recognition. the speckles on the pan
 * are useless for recognising it, because every speckle looks like every
 * other one, but they are ideal for this: optical flow only needs lots of
 * small points it can match from one frame to the next, and it does not
 * care whether they are unique. so the thing that made the pan hard to
 * identify is the thing that makes it easy to follow.
 */
export function useFlow(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  seed: Box | null,
) {
  const [box, setBox] = useState<Box | null>(null);
  const seedRef = useRef<Box | null>(null);
  const boxRef = useRef<Box | null>(null);
  const ptsRef = useRef<Pt[]>([]);
  const prevRef = useRef<Level[] | null>(null);

  useEffect(() => {
    seedRef.current = seed;
    boxRef.current = seed;
    // a new reading from the model means picking fresh points to follow
    ptsRef.current = [];
    setBox(seed);
  }, [seed]);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    /** pick points worth following: corners and speckles, spread out */
    function choosePoints(lv0: Level, b: Box): Pt[] {
      const x0 = Math.max(WIN + 1, b.x * W);
      const x1 = Math.min(W - WIN - 2, (b.x + b.w) * W);
      const y0 = Math.max(WIN + 1, b.y * H);
      const y1 = Math.min(H - WIN - 2, (b.y + b.h) * H);
      const cols = 9;
      const rows = 7;
      const out: Pt[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = x0 + ((x1 - x0) * (c + 0.5)) / cols;
          const y = y0 + ((y1 - y0) * (r + 0.5)) / rows;
          if (x1 - x0 < 4 || y1 - y0 < 4) continue;
          // how much texture is in this window
          let gxx = 0;
          for (let dy = -WIN; dy <= WIN; dy += 2) {
            for (let dx = -WIN; dx <= WIN; dx += 2) {
              const ix = sample(lv0, x + dx + 1, y + dy) - sample(lv0, x + dx - 1, y + dy);
              const iy = sample(lv0, x + dx, y + dy + 1) - sample(lv0, x + dx, y + dy - 1);
              gxx += ix * ix + iy * iy;
            }
          }
          if (gxx > MIN_EIGEN) out.push({ x, y });
        }
      }
      return out.slice(0, POINTS);
    }

    /** where one point went, tracked coarse to fine down the pyramid */
    function trackPoint(prev: Level[], next: Level[], p: Pt): Pt | null {
      let dx = 0;
      let dy = 0;

      for (let lv = LEVELS - 1; lv >= 0; lv--) {
        const a = prev[lv];
        const b = next[lv];
        const scale = 1 << lv;
        const px0 = p.x / scale;
        const py0 = p.y / scale;
        // carry the coarse estimate down to this level
        dx *= 2;
        dy *= 2;
        if (lv === LEVELS - 1) {
          dx = 0;
          dy = 0;
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

      if (Math.hypot(dx, dy) > MAX_STEP) return null;
      return { x: p.x + dx, y: p.y + dy };
    }

    function median(xs: number[]): number {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    }

    function scan() {
      if (cancelled) return;
      timer = setTimeout(scan, 1000 / FPS);

      const video = videoRef.current;
      const from = boxRef.current;
      if (!ctx || !video || !from || video.readyState < 2 || !video.videoWidth) return;

      ctx.drawImage(video, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      const grey = new Float32Array(W * H);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        grey[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      }

      const pyr = pyramid(grey);
      const prev = prevRef.current;
      prevRef.current = pyr;

      if (!prev || ptsRef.current.length === 0) {
        ptsRef.current = choosePoints(pyr[0], from);
        return;
      }

      // follow each point into the new frame
      const before: Pt[] = [];
      const after: Pt[] = [];
      for (const p of ptsRef.current) {
        const moved = trackPoint(prev, pyr, p);
        if (moved) {
          before.push(p);
          after.push(moved);
        }
      }

      if (after.length < MIN_ALIVE) {
        // lost it. hold still and wait for the model to point us again.
        ptsRef.current = [];
        return;
      }

      // the pan's movement is what most of its points agree on, which
      // shrugs off the few that latched onto a passing hand
      const mdx = median(after.map((p, i) => p.x - before[i].x));
      const mdy = median(after.map((p, i) => p.y - before[i].y));

      // how much the points spread apart tells us if it came nearer
      let spreadBefore = 0;
      let spreadAfter = 0;
      const cxB = before.reduce((s, p) => s + p.x, 0) / before.length;
      const cyB = before.reduce((s, p) => s + p.y, 0) / before.length;
      const cxA = after.reduce((s, p) => s + p.x, 0) / after.length;
      const cyA = after.reduce((s, p) => s + p.y, 0) / after.length;
      for (let i = 0; i < before.length; i++) {
        spreadBefore += Math.hypot(before[i].x - cxB, before[i].y - cyB);
        spreadAfter += Math.hypot(after[i].x - cxA, after[i].y - cyA);
      }
      const scale =
        spreadBefore > 1 ? Math.min(1.08, Math.max(0.93, spreadAfter / spreadBefore)) : 1;

      const next: Box = {
        x: from.x + mdx / W - (from.w * (scale - 1)) / 2,
        y: from.y + mdy / H - (from.h * (scale - 1)) / 2,
        w: from.w * scale,
        h: from.h * scale,
      };

      ptsRef.current = after;
      boxRef.current = next;
      setBox(next);
    }

    scan();
    return () => {
      cancelled = true;
      prevRef.current = null;
      if (timer) clearTimeout(timer);
    };
  }, [active, videoRef]);

  return box;
}
