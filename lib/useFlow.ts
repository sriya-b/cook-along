"use client";

import { useEffect, useRef, useState } from "react";
import { FlowTracker, type Box } from "./flowTracker";

export type { Box };

/** the longer side of the frame the tracker reads. bigger is steadier but
 *  slower. the shorter side follows the camera's own shape. */
const LONG_SIDE = 240;
/** tracking passes per second */
const FPS = 15;

function same(a: Box | null, b: Box | null) {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * keeps the pan's box up to date between model calls.
 *
 * the model says where the pan is every so often; in between, this watches
 * how the whole scene shifts and moves the box with it. the pan does not
 * move on the hob, so when the scene slides left by ten pixels the pan has
 * too, including after it has slid out of the shot.
 */
export function useFlow(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  seed: Box | null,
) {
  const [box, setBox] = useState<Box | null>(seed);
  const seedRef = useRef<Box | null>(seed);
  const trackerRef = useRef<FlowTracker | null>(null);

  useEffect(() => {
    seedRef.current = seed;
    trackerRef.current?.seed(seed);
    setBox(seed);
  }, [seed]);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let last: Box | null = null;

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
        tracker.seed(seedRef.current);
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

      const next = tracker.update(grey);
      if (!same(next, last)) {
        last = next;
        setBox(next);
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

  return box;
}
