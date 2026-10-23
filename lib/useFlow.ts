"use client";

import { useEffect, useRef, useState } from "react";
import { FlowTracker, type Box } from "./flowTracker";

export type { Box };
/** the objects being kept in place, by name: pan, board, bowl */
export type Boxes = Record<string, Box | null>;

/** the longer side of the frame the tracker reads. bigger is steadier but
 *  slower. the shorter side follows the camera's own shape. */
const LONG_SIDE = 240;
/** tracking passes per second */
const FPS = 15;

function sameBox(a: Box | null | undefined, b: Box | null | undefined) {
  if (!a || !b) return !a === !b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
function sameBoxes(a: Boxes, b: Boxes) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!sameBox(a[k], b[k])) return false;
  return true;
}

/**
 * keeps every object's box up to date between model calls.
 *
 * the model says where things are every so often; in between, this watches
 * how the whole scene shifts and moves every box with it. the pan, board
 * and bowl do not move on the counter, so when the scene slides left by
 * ten pixels they have too, including after they have slid out of shot.
 */
export function useFlow(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  seeds: Boxes,
) {
  const [boxes, setBoxes] = useState<Boxes>(seeds);
  const seedsRef = useRef<Boxes>(seeds);
  const trackerRef = useRef<FlowTracker | null>(null);

  // only a seed that actually changed resets that object's box
  useEffect(() => {
    const before = seedsRef.current;
    seedsRef.current = seeds;
    for (const [k, b] of Object.entries(seeds)) {
      if (!sameBox(before[k], b) || !trackerRef.current?.current(k)) trackerRef.current?.seed(b ?? null, k);
    }
    setBoxes((now) => {
      const next = { ...now };
      for (const [k, b] of Object.entries(seeds)) if (!sameBox(before[k], b)) next[k] = b;
      return sameBoxes(now, next) ? now : next;
    });
  }, [seeds]);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let last: Boxes = {};

    function scan() {
      if (cancelled) return;
      timer = setTimeout(scan, 1000 / FPS);

      const video = videoRef.current;
      if (!ctx || !video || video.readyState < 2 || !video.videoWidth) return;

      // the canvas takes the camera's shape. squeezing a portrait feed into
      // a landscape canvas smeared vertical motion (F8).
      const portrait = video.videoHeight > video.videoWidth;
      const w = portrait ? Math.round((LONG_SIDE * video.videoWidth) / video.videoHeight) : LONG_SIDE;
      const h = portrait ? LONG_SIDE : Math.round((LONG_SIDE * video.videoHeight) / video.videoWidth);
      let tracker = trackerRef.current;
      if (!tracker || tracker.width !== w || tracker.height !== h) {
        tracker = new FlowTracker(w, h);
        for (const [k, b] of Object.entries(seedsRef.current)) tracker.seed(b ?? null, k);
        trackerRef.current = tracker;
        canvas.width = w;
        canvas.height = h;
      }

      ctx.drawImage(video, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const grey = new Float32Array(w * h);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        grey[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      }

      tracker.update(grey);
      const next: Boxes = {};
      for (const k of Object.keys(seedsRef.current)) next[k] = tracker.current(k);
      if (!sameBoxes(next, last)) {
        last = next;
        setBoxes(next);
      }
    }

    scan();
    return () => {
      cancelled = true;
      // a fresh start next time, rather than matching against a frame from
      // before the camera went away
      trackerRef.current = null;
      if (timer) clearTimeout(timer);
    };
  }, [active, videoRef]);

  return boxes;
}
