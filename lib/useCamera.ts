"use client";

import { useEffect, useRef, useState } from "react";

export type CameraState = "idle" | "starting" | "live" | "denied" | "unavailable";

/**
 * rear camera feed for the cook screen. the stream is stopped on unmount
 * so the camera light does not stay on after you leave the page.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        setMessage("This browser cannot open a camera.");
        return;
      }
      setState("starting");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // the back camera on a phone. desktops fall back to whatever exists.
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setState("live");
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setState("denied");
          setMessage("Camera access is off. Turn it on to cook along.");
        } else {
          setState("unavailable");
          setMessage("No camera found on this device.");
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, state, message };
}
