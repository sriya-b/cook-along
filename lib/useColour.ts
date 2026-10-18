"use client";

import { useEffect, useRef, useState } from "react";
import type { Station } from "./recipe";
import { classify, readCentre } from "./stationColour";

/** readings per second */
const FPS = 5;
/** frames that must agree before the station changes */
const AGREEMENT = 4;
/** frames are scaled down to this width before averaging */
const SAMPLE_WIDTH = 160;
/** anything smaller is a placeholder stream, not a camera. a 2x2 black frame
 *  reads as 100% dark, which would otherwise look exactly like the pan. */
const MIN_FRAME = 64;

/**
 * the zero-setup fallback: guess the station from the colour of the frame.
 * see stationColour.ts for why this works and why it is a last resort.
 */
export function useColour(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
) {
  const [station, setStation] = useState<Station | null>(null);
  const [ready, setReady] = useState(false);
  // read inside the loop without making the loop depend on it
  const readyRef = useRef(false);
  const runRef = useRef<{ last: Station | null; count: number }>({
    last: null,
    count: 0,
  });

  useEffect(() => {
    if (!active) {
      readyRef.current = false;
      setReady(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    function loop() {
      if (cancelled) return;
      timer = setTimeout(loop, 1000 / FPS);

      const video = videoRef.current;
      if (!video || !ctx || video.readyState < 2) return;
      if (video.videoWidth < MIN_FRAME || video.videoHeight < MIN_FRAME) return;

      const scale = SAMPLE_WIDTH / video.videoWidth;
      canvas.width = SAMPLE_WIDTH;
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      let guess: Station | null;
      try {
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        guess = classify(readCentre(frame.data, canvas.width, canvas.height));
      } catch {
        return;
      }

      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }

      const run = runRef.current;
      if (guess === run.last) run.count += 1;
      else {
        run.last = guess;
        run.count = 1;
      }
      if (run.count >= AGREEMENT) setStation(guess);
    }

    loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      runRef.current = { last: null, count: 0 };
    };
  }, [active, videoRef]);

  return { station, ready };
}
