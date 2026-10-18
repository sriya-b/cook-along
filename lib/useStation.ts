"use client";

import { useEffect, useRef, useState } from "react";
import type { Station } from "./recipe";
import { STATION_MARKER } from "./markers";
import { useMarkers } from "./useMarkers";

/** where the current station reading came from */
export type StationSource = "model" | "marker";

/** teachable machine export lives here. absent until one is trained. */
const MODEL_URL = "/model/model.json";
const METADATA_URL = "/model/metadata.json";

/** a class has to beat this to count as a sighting at all */
const CONFIDENCE = 0.85;
/** ...and win this many frames in a row before we act on it */
const AGREEMENT = 3;
/** classifications per second */
const FPS = 4;
/** teachable machine image models take 224x224 */
const INPUT = 224;

/** map whatever the classes were named to our three stations */
function toStation(label: string): Station | null {
  const l = label.toLowerCase();
  if (l.includes("board")) return "board";
  if (l.includes("bowl")) return "bowl";
  if (l.includes("pan") || l.includes("skillet")) return "pan";
  return null;
}

type Tf = typeof import("@tensorflow/tfjs");
type Model = import("@tensorflow/tfjs").LayersModel;

/**
 * which station the phone is pointed at.
 *
 * a teachable machine classifier is used when one has been trained and
 * dropped into /public/model, because pointing at the real pan demos far
 * better than pointing at a printed square. the aruco markers stay on as a
 * fallback, so bad light or a cluttered counter cannot strand the cook.
 */
export function useStation(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
) {
  const markers = useMarkers(videoRef, active);
  const [modelStation, setModelStation] = useState<Station | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const runRef = useRef<{ last: Station | null; count: number }>({
    last: null,
    count: 0,
  });

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tf: Tf | null = null;
    let model: Model | null = null;
    let labels: string[] = [];

    async function boot() {
      try {
        // no model trained yet is the normal case, not an error
        const probe = await fetch(MODEL_URL, { method: "HEAD" });
        if (!probe.ok || cancelled) return;

        const meta = await fetch(METADATA_URL).then((r) => r.json());
        labels = meta.labels ?? [];
        if (!labels.length || cancelled) return;

        tf = await import("@tensorflow/tfjs");
        model = await tf.loadLayersModel(MODEL_URL);
        if (cancelled) {
          model.dispose();
          return;
        }
        setModelReady(true);
        loop();
      } catch {
        if (!cancelled) setModelReady(false);
      }
    }

    async function loop() {
      if (cancelled) return;

      const video = videoRef.current;
      if (video && tf && model && video.readyState >= 2 && video.videoWidth) {
        try {
          const probs = tf.tidy(() => {
            const pixels = tf!.browser.fromPixels(video);
            const resized = tf!.image.resizeBilinear(pixels, [INPUT, INPUT]);
            // teachable machine's mobilenet wants [-1, 1], not [0, 1]
            const normalized = resized.toFloat().div(127.5).sub(1);
            const out = model!.predict(normalized.expandDims(0));
            return (Array.isArray(out) ? out[0] : out).dataSync();
          });

          let top = 0;
          for (let i = 1; i < probs.length; i++) if (probs[i] > probs[top]) top = i;
          const guess =
            probs[top] >= CONFIDENCE ? toStation(labels[top] ?? "") : null;

          // a single confident frame is not enough; the counter is busy
          const run = runRef.current;
          if (guess === run.last) run.count += 1;
          else {
            run.last = guess;
            run.count = 1;
          }
          if (run.count >= AGREEMENT) setModelStation(guess);
        } catch {
          // a bad frame is not worth tearing the loop down for
        }
      }

      if (!cancelled) timer = setTimeout(loop, 1000 / FPS);
    }

    boot();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      model?.dispose();
      runRef.current = { last: null, count: 0 };
    };
  }, [active, videoRef]);

  /** is this the station in front of us, by either route? */
  function at(station: Station): StationSource | null {
    if (modelReady && modelStation === station) return "model";
    if (markers.ready && markers.visible.has(STATION_MARKER[station])) return "marker";
    return null;
  }

  return {
    at,
    /** true once at least one of the two can actually report something */
    ready: modelReady || markers.ready,
  };
}
