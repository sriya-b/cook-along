"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * how much the phone has turned since the last frame, in degrees.
 * positive gamma is turning right, positive beta is tipping down.
 */
export type Turn = { yaw: number; pitch: number };

/** ios will not hand over motion data without being asked from a tap */
type MotionCtor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export type MotionState = "unasked" | "granted" | "denied" | "unavailable";

/**
 * the phone's own sense of which way it is pointing.
 *
 * this is what keeps a cue stuck to the pan between looks. the model only
 * speaks every fifteen seconds, and in that time the phone moves; rotation
 * is the part of that movement we can measure for free, so we undo it.
 */
export function useMotion() {
  const [state, setState] = useState<MotionState>("unasked");
  /** accumulated turn since the last time someone read it */
  const turn = useRef<Turn>({ yaw: 0, pitch: 0 });
  const last = useRef<number | null>(null);

  const start = useCallback(async () => {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      setState("unavailable");
      return;
    }
    const Ctor = window.DeviceMotionEvent as MotionCtor;
    if (typeof Ctor.requestPermission === "function") {
      try {
        const res = await Ctor.requestPermission();
        setState(res === "granted" ? "granted" : "denied");
        return;
      } catch {
        setState("denied");
        return;
      }
    }
    // android and desktop need no asking
    setState("granted");
  }, []);

  useEffect(() => {
    if (state !== "granted") return;

    function onMotion(e: DeviceMotionEvent) {
      const r = e.rotationRate;
      if (!r) return;
      const now = performance.now();
      const prev = last.current;
      last.current = now;
      if (prev === null) return;
      // rotationRate is degrees per second, so a gap of dt seconds turns it
      // into degrees turned
      const dt = Math.min(0.1, (now - prev) / 1000);
      turn.current.yaw += (r.gamma ?? 0) * dt;
      turn.current.pitch += (r.beta ?? 0) * dt;
    }

    window.addEventListener("devicemotion", onMotion);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      last.current = null;
    };
  }, [state]);

  /** read the turn since the last read, and reset the tally */
  const drain = useCallback((): Turn => {
    const out = { ...turn.current };
    turn.current = { yaw: 0, pitch: 0 };
    return out;
  }, []);

  return { state, start, drain };
}
