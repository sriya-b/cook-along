"use client";

import { useEffect, useRef, useState } from "react";
import type { Box } from "./flowTracker";
import { placeTimer, safeBelow, type Placement, type View } from "./placement";
import { bookBottom } from "./bookGeometry";

export type { Placement };

/** how fast the timer chases its target each animation frame. the tracker
 *  moves the target fifteen times a second, so this mostly smooths those
 *  steps; a new reading from the model glides in over half a second. */
const EASE = 0.25;

function viewOf(video: HTMLVideoElement | null): View | null {
  if (!video || !video.clientWidth || !video.clientHeight) return null;
  return {
    width: video.clientWidth,
    height: video.clientHeight,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
  };
}

/**
 * where the timer is on screen, eased so it glides rather than jumps. it
 * always has a place: over the pan, parked at the edge nearest the pan,
 * or in the middle before the pan has been found.
 */
export function useAnchor(
  box: Box | null,
  videoRef: React.RefObject<HTMLVideoElement | null>,
): Placement | null {
  const [placed, setPlaced] = useState<Placement | null>(null);
  const boxRef = useRef(box);
  useEffect(() => {
    boxRef.current = box;
  }, [box]);

  useEffect(() => {
    let raf = 0;
    let current: Placement | null = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const view = viewOf(videoRef.current);
      if (!view) return;
      const t = placeTimer(boxRef.current, view, safeBelow(bookBottom(view.width)));
      if (!current) {
        current = t;
        setPlaced(t);
        return;
      }
      const c: Placement = current;
      const next: Placement = {
        x: c.x + (t.x - c.x) * EASE,
        y: c.y + (t.y - c.y) * EASE,
        scale: c.scale + (t.scale - c.scale) * EASE,
        tilt: c.tilt + (t.tilt - c.tilt) * EASE,
        parked: t.parked,
      };
      const moved =
        Math.abs(next.x - c.x) > 0.1 ||
        Math.abs(next.y - c.y) > 0.1 ||
        Math.abs(next.scale - c.scale) > 0.001 ||
        Math.abs(next.tilt - c.tilt) > 0.05 ||
        next.parked !== c.parked;
      if (moved) {
        current = next;
        setPlaced(next);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  return placed;
}

/** the css for the timer sitting on the pan's plane */
export function anchorStyle(p: Placement): React.CSSProperties {
  return {
    left: `${p.x}px`,
    top: `${p.y}px`,
    transform: [
      "translate(-50%, -50%)",
      `rotateX(${p.tilt.toFixed(1)}deg)`,
      `scale(${p.scale.toFixed(3)})`,
    ].join(" "),
  };
}
