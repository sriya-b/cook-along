"use client";

import { useEffect, useId, useRef } from "react";

/** frames per second an action clip is redrawn at */
const FPS = 15;

/** draws one frame of an action clip at time t, as an svg string */
export type ActionFrame = (t: number, opts: { id?: string; shadow?: boolean }) => string;

type Props = {
  /** the clip to play, e.g. chopFrame */
  frame: ActionFrame;
  /** its length in seconds, e.g. CHOP_DURATION */
  duration: number;
  /** start playing when true; resets to the start each time it turns on */
  playing: boolean;
  /** how many times to play through before stopping */
  loops?: number;
  onDone?: () => void;
  className?: string;
};

/**
 * plays a short white-linework action clip, like the chop.
 *
 * frames are drawn by the clip's own function of time rather than baked into
 * a video, so they stay crisp at any size and weigh a few kilobytes. the svg
 * is written straight into the dom each frame instead of through react state,
 * which keeps sixty updates a second from re-rendering the whole cook screen.
 */
export function ActionClip({
  frame,
  duration,
  playing,
  loops = 1,
  onDone,
  className,
}: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  // svg ids cannot contain the colons react puts in useId
  const id = `clip${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    // with reduced motion, show the finished action and do not animate
    const still =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!playing || still) {
      el.innerHTML = playing ? frame(duration * 0.85, { id }) : "";
      return;
    }

    let raf = 0;
    const start = performance.now();
    const total = duration * loops;
    // a new frame fifteen times a second, not sixty. each frame rebuilds a
    // drawing full of blur and grain, and at sixty that starved the phone:
    // the page turn froze on the old page and swipes overshot.
    let shown = -1;

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      if (elapsed >= total) {
        el.innerHTML = "";
        done.current?.();
        return;
      }
      const n = Math.floor(elapsed * FPS);
      if (n !== shown) {
        shown = n;
        el.innerHTML = frame((n / FPS) % duration, { id });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frame, duration, loops, id]);

  return <div ref={host} aria-hidden className={className} />;
}
