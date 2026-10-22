"use client";

import { useEffect, useRef, useState } from "react";
import type { Turn } from "./useMotion";

export type Box = { x: number; y: number; w: number; h: number };

/** the frame is scanned at this size. small is cheap and plenty. */
const W = 160;
const H = 120;
/** scans per second. this is what makes the cue stick between model calls. */
const FPS = 12;
/** how far outside the last known box to look, as a fraction of its size.
 *  the pan does not teleport, so a modest margin is enough and it keeps
 *  the stainless backsplash out of the search entirely. */
const MARGIN = 0.45;
/** a pixel belongs to the pan if it is this much brighter than the median
 *  inside the search window */
const BRIGHT_OVER_MEDIAN = 12;
/** ...and this grey. a pan is colourless; wood and tile are not. */
const MAX_SAT = 0.3;
/** a reading this far from the seed is a mistake, not a movement */
const MAX_DRIFT = 0.28;
/** ...and the pan cannot change size by more than this either. without a
 *  ceiling the box grows to fit whatever bright thing it catches, which
 *  widens the next search, which catches more: it inflates off-screen. */
const MIN_SIZE_RATIO = 0.6;
const MAX_SIZE_RATIO = 1.5;
/** how fast the tracked box follows the pixels */
const EASE = 0.35;
/** the rear camera sees about this many degrees across. turning the phone
 *  by one degree slides the scene by 1/FOV of the frame, which is how the
 *  cue stays put while the phone moves. */
const FOV_X = 64;
const FOV_Y = 48;
/** this many scans with nothing pan-shaped and the cue lets go. at 12fps
 *  that is about half a second, so a hand passing over does not drop it
 *  but turning away from the hob does. */
const LOST_AFTER = 7;

/**
 * follows the pan between model calls.
 *
 * on its own this would be hopeless: the first version of this searched the
 * whole frame and locked onto the oven's steel backsplash, which is bigger
 * and brighter than any pan. seeded with "the pan was about here", the
 * search window excludes the backsplash and the job becomes easy.
 */
export function usePan(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  seed: Box | null,
  /** how far the phone has turned since the last frame, if it will say */
  drainTurn?: () => Turn,
) {
  const [box, setBox] = useState<Box | null>(null);
  const seedRef = useRef<Box | null>(null);
  const liveRef = useRef<Box | null>(null);
  const missRef = useRef(0);

  // a fresh reading from the model replaces whatever we were following
  useEffect(() => {
    seedRef.current = seed;
    missRef.current = 0;
    if (seed) {
      liveRef.current = seed;
      setBox(seed);
    } else {
      liveRef.current = null;
      setBox(null);
    }
  }, [seed]);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    function scan() {
      if (cancelled) return;
      timer = setTimeout(scan, 1000 / FPS);

      const video = videoRef.current;
      // the window is anchored to what the model said, not to where we have
      // drifted to. this is what stops the runaway.
      const from = seedRef.current;
      if (!ctx || !video || !from || video.readyState < 2 || !video.videoWidth) return;

      /** nothing pan-shaped this frame. let go once that keeps happening. */
      function missed() {
        missRef.current += 1;
        if (missRef.current >= LOST_AFTER) {
          liveRef.current = null;
          setBox(null);
        }
      }

      // undo the phone's own rotation before looking: if it turned right,
      // the pan slid left by a predictable amount.
      const turned = drainTurn?.();
      if (turned && liveRef.current) {
        const shifted = {
          ...liveRef.current,
          x: liveRef.current.x - turned.yaw / FOV_X,
          y: liveRef.current.y - turned.pitch / FOV_Y,
        };
        liveRef.current = shifted;
        setBox(shifted);
      }

      ctx.drawImage(video, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;

      // the search window: the last known box, grown a little
      const mx = from.w * MARGIN;
      const my = from.h * MARGIN;
      const x0 = Math.max(0, Math.floor((from.x - mx) * W));
      const x1 = Math.min(W, Math.ceil((from.x + from.w + mx) * W));
      const y0 = Math.max(0, Math.floor((from.y - my) * H));
      const y1 = Math.min(H, Math.ceil((from.y + from.h + my) * H));
      if (x1 - x0 < 4 || y1 - y0 < 4) return missed();

      // median brightness inside the window, so the threshold adapts to
      // however the hob happens to be lit
      const lums: number[] = [];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          lums.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        }
      }
      lums.sort((a, b) => a - b);
      const cut = lums[Math.floor(lums.length / 2)] + BRIGHT_OVER_MEDIAN;

      let n = 0, sx = 0, sy = 0, bx0 = x1, bx1 = x0, by0 = y1, by1 = y0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const mxc = Math.max(r, g, b), mnc = Math.min(r, g, b);
          if (mxc === 0) continue;
          if ((mxc - mnc) / mxc > MAX_SAT) continue;
          if (r * 0.299 + g * 0.587 + b * 0.114 < cut) continue;
          n++; sx += x; sy += y;
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
      }
      if (n < 60) return missed();

      // the rim's size comes from the model and is left alone. only the
      // centre is tracked, because growing the box from whatever pixels
      // happened to be bright is what pulled the ring off the rim.
      const cx = sx / n / W;
      const cy = sy / n / H;
      const next: Box = {
        x: cx - from.w / 2,
        y: cy - from.h / 2,
        w: from.w,
        h: from.h,
      };

      // a reading that has wandered, or changed size implausibly, is a
      // reflection or a hand rather than the pan. drop it and keep the
      // last good box.
      const dx = next.x + next.w / 2 - (from.x + from.w / 2);
      const dy = next.y + next.h / 2 - (from.y + from.h / 2);
      if (Math.hypot(dx, dy) > MAX_DRIFT) return missed();

      const cur = liveRef.current ?? next;
      const eased: Box = {
        x: cur.x + (next.x - cur.x) * EASE,
        y: cur.y + (next.y - cur.y) * EASE,
        w: cur.w + (next.w - cur.w) * EASE,
        h: cur.h + (next.h - cur.h) * EASE,
      };
      missRef.current = 0;
      liveRef.current = eased;
      setBox(eased);
    }

    scan();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, videoRef]);

  return box;
}
