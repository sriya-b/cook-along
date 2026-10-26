"use client";

// the app's few sounds, played through web audio so they line up with
// their clip. each file starts on its first sound, with no silence in
// front (browsers can drop leading silence), and the caller says how far
// into the clip that first sound falls: the knife's first impact, the
// first piece landing in the pan.

export type SoundName = "chop" | "whisk" | "sizzle" | "page-turn" | "timer";

const NAMES: SoundName[] = ["chop", "whisk", "sizzle", "page-turn", "timer"];

let ctx: AudioContext | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
let loading: Promise<void> | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function load() {
  const c = context();
  if (!c || loading) return loading;
  loading = Promise.all(
    NAMES.map(async (name) => {
      try {
        const res = await fetch(`/sounds/${name}.m4a`);
        buffers.set(name, await c.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // a sound that won't load is silence, never an error on screen
      }
    }),
  ).then(() => undefined);
  return loading;
}

/**
 * safari keeps web audio silent until the person has tapped something on
 * the page. this listens for that first tap anywhere in the app (the
 * "start" button does it) and wakes audio up, then loads the sounds.
 */
export function installAudioUnlock() {
  if (typeof window === "undefined") return;
  // load straight away, so a clip that starts the moment the camera finds
  // something already has its sound; only playing needs the tap
  load();
  const wake = () => {
    const c = context();
    if (!c) return;
    if (c.state !== "running") c.resume().catch(() => {});
    load();
  };
  for (const ev of ["touchend", "pointerdown", "keydown"]) window.addEventListener(ev, wake, { passive: true });
}

/** play a sound once, `delay` seconds from now. returns a function that
 *  stops it, whether or not it has started yet. */
export function play(name: SoundName, volume = 1, delay = 0): () => void {
  const c = context();
  const buffer = buffers.get(name);
  if (!c || !buffer || c.state !== "running") return () => {};
  const src = c.createBufferSource();
  const gain = c.createGain();
  gain.gain.value = volume;
  src.buffer = buffer;
  src.connect(gain).connect(c.destination);
  src.start(c.currentTime + delay);
  return () => {
    try {
      // a short fade rather than a click
      gain.gain.setTargetAtTime(0, c.currentTime, 0.05);
      src.stop(c.currentTime + 0.2);
    } catch {}
  };
}
