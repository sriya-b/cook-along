"use client";

import { useEffect, useRef, useState } from "react";
import { DICTIONARY } from "./markers";

/** a marker counts as gone only after this many misses, so a hand
 *  passing over the board does not drop the station mid-step. */
const MISS_TOLERANCE = 8;
/** detections per second. the detector is cheap but the phone is not. */
const FPS = 6;
/** frames are scaled down to this width before detection */
const SAMPLE_WIDTH = 480;

type Detector = { detect: (image: ImageData) => { id: number }[] };

/**
 * reads aruco markers out of the live camera frames. it never touches the
 * video element or the dom, so the traced layout is untouched — frames are
 * copied to an offscreen canvas and scanned there.
 */
export function useMarkers(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
) {
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const [ready, setReady] = useState(false);
  const missesRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let detector: Detector | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function boot() {
      try {
        const mod = (await import("js-aruco2")) as unknown as {
          AR?: { Detector: new (c: { dictionaryName: string }) => Detector };
          default?: { AR?: { Detector: new (c: { dictionaryName: string }) => Detector } };
        };
        const AR = mod.AR ?? mod.default?.AR;
        if (!AR || cancelled) return;
        detector = new AR.Detector({ dictionaryName: DICTIONARY });
        setReady(true);
        loop();
      } catch {
        // no detector: the cook screen just falls back to its normal tips
        if (!cancelled) setReady(false);
      }
    }

    function loop() {
      if (cancelled) return;
      timer = setTimeout(loop, 1000 / FPS);

      const video = videoRef.current;
      if (!video || !detector || !ctx) return;
      if (video.readyState < 2 || !video.videoWidth) return;

      const scale = SAMPLE_WIDTH / video.videoWidth;
      canvas.width = SAMPLE_WIDTH;
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      let found: { id: number }[];
      try {
        found = detector.detect(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        return;
      }

      const seen = new Set(found.map((m) => m.id));
      const misses = missesRef.current;
      for (const id of seen) misses.set(id, 0);
      for (const [id, n] of misses) {
        if (!seen.has(id)) {
          if (n + 1 >= MISS_TOLERANCE) misses.delete(id);
          else misses.set(id, n + 1);
        }
      }

      const next = new Set(misses.keys());
      setVisible((prev) => {
        if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
        return next;
      });
    }

    boot();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      missesRef.current.clear();
    };
  }, [active, videoRef]);

  return { visible, ready };
}
