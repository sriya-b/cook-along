"use client";

import { useCallback, useRef, useState } from "react";
import type { LookResult } from "./vision";

/** a look that could not happen, as a result rather than a silent null */
function failed(why: string): LookResult {
  return {
    tip: why,
    stepLooksComplete: false,
    confidence: 0,
    seesStep: null,
    seesStation: null,
    panBox: null,
    error: why,
  };
}

/** frames are downscaled before sending. the model does not need pixels. */
const MAX_WIDTH = 512;
const JPEG_QUALITY = 0.6;
/** never send two frames closer together than this. a safety net under
 *  the cook screen's own pacing, not the pacing itself. */
const MIN_GAP_MS = 4000;
/** ...except the first look at a new page, which the cook is waiting on */
const MIN_GAP_URGENT_MS = 1500;

/** grab the current video frame as base64 jpeg, without the data: prefix */
export function grabFrame(video: HTMLVideoElement): string | null {
  if (video.readyState < 2 || !video.videoWidth) return null;

  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);

  const url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const comma = url.indexOf(",");
  return comma < 0 ? null : url.slice(comma + 1);
}

/**
 * one look at the counter, judged by the model.
 *
 * nothing here runs on a timer. the caller decides when a look is worth
 * taking, so the app never spends a request on an unchanged pan.
 */
export function useVision(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [result, setResult] = useState<LookResult | null>(null);
  const [looking, setLooking] = useState(false);
  const lastAt = useRef(0);
  const inFlight = useRef(false);

  const look = useCallback(
    async (stepN: number, omitted: string[] = [], urgent = false): Promise<LookResult | null> => {
      const now = Date.now();
      // one at a time, and not too often. a cook moving the phone around
      // should not queue up a dozen calls.
      const gap = urgent ? MIN_GAP_URGENT_MS : MIN_GAP_MS;
      if (inFlight.current || now - lastAt.current < gap) return null;

      const video = videoRef.current;
      if (!video) return failed("No camera to look through.");
      const frame = grabFrame(video);
      if (!frame) return failed("Waiting for the camera to warm up.");

      inFlight.current = true;
      lastAt.current = now;
      setLooking(true);
      try {
        const res = await fetch("/api/look", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ frame, stepN, omitted }),
        });
        if (!res.ok) return failed(`The assistant is unreachable (${res.status}).`);
        const data = (await res.json()) as LookResult;
        setResult(data);
        return data;
      } catch {
        return failed("No connection to the assistant.");
      } finally {
        inFlight.current = false;
        setLooking(false);
      }
    },
    [videoRef],
  );

  return { look, looking, result };
}
