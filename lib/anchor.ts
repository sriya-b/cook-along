"use client";

import { useEffect, useRef, useState } from "react";
import type { LookResult } from "./vision";

export type Anchor = {
  /** where to put the cue, in 0..1 of the screen */
  left: number;
  top: number;
  /** 1 is the pan filling about 40% of the width. bigger when it is nearer. */
  scale: number;
  /** how far the pan's plane leans away from the camera, in degrees */
  tilt: number;
};

/** the pan at this fraction of the frame width counts as "normal" size */
const REFERENCE_WIDTH = 0.4;
/** how much of the real lean to apply. all of it is unreadable. */
const TILT_FACTOR = 0.9;
/** how far above the rim the cue floats, in multiples of the rim height */
const FLOAT_ABOVE = 0.34;
/** how fast the anchor chases a new reading. the model only speaks every
 *  fifteen seconds or so, so this has to glide rather than jump. */
const EASE = 0.12;

/**
 * turns the pan's bounding box into a place to hang a cue.
 *
 * the rim is a circle, so how squashed its box is tells us how far the pan
 * leans away from the camera: square means straight down on it, flat means
 * a low angle. that is where the perspective comes from.
 */
export function anchorFromBox(box: NonNullable<LookResult["panBox"]>): Anchor {
  const flat = Math.min(1, box.h / Math.max(box.w, 0.001));
  return {
    left: box.x + box.w / 2,
    top: box.y - box.h * FLOAT_ABOVE,
    scale: box.w / REFERENCE_WIDTH,
    tilt: (Math.acos(flat) * 180) / Math.PI,
  };
}

/**
 * eases towards each new reading so the cue drifts into place instead of
 * teleporting every time the model answers.
 */
export function useAnchor(box: LookResult["panBox"]): Anchor | null {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const target = useRef<Anchor | null>(null);
  const current = useRef<Anchor | null>(null);

  useEffect(() => {
    target.current = box ? anchorFromBox(box) : null;
    // first sighting lands straight away; there is nothing to ease from
    if (target.current && !current.current) {
      current.current = target.current;
      setAnchor(target.current);
    }
    if (!box) {
      current.current = null;
      setAnchor(null);
    }
  }, [box]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = target.current;
      const c = current.current;
      if (t && c) {
        const next: Anchor = {
          left: c.left + (t.left - c.left) * EASE,
          top: c.top + (t.top - c.top) * EASE,
          scale: c.scale + (t.scale - c.scale) * EASE,
          tilt: c.tilt + (t.tilt - c.tilt) * EASE,
        };
        const moved =
          Math.abs(next.left - c.left) > 0.0004 ||
          Math.abs(next.top - c.top) > 0.0004 ||
          Math.abs(next.scale - c.scale) > 0.002 ||
          Math.abs(next.tilt - c.tilt) > 0.08;
        if (moved) {
          current.current = next;
          setAnchor(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return anchor;
}

/** the css for a cue sitting on the pan's plane */
export function anchorStyle(a: Anchor): React.CSSProperties {
  return {
    left: `${a.left * 100}%`,
    top: `${a.top * 100}%`,
    transform: [
      "translate(-50%, -50%)",
      `rotateX(${(a.tilt * TILT_FACTOR).toFixed(1)}deg)`,
      `scale(${Math.min(1.8, Math.max(0.45, a.scale)).toFixed(2)})`,
    ].join(" "),
  };
}
