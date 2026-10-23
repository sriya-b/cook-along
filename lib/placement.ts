// where the timer goes on screen, given where the pan is in the camera
// frame. pure maths, no react, so it can be tested in node.

import type { Box } from "./flowTracker";

/** the screen and the camera feed behind it, in css pixels */
export type View = {
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
};

/** the parts of the screen the timer must stay out of */
export type Safe = { top: number; bottom: number; side: number };

export type Placement = {
  /** the timer's centre, in css pixels from the top left of the screen */
  x: number;
  y: number;
  scale: number;
  /** how far the pan's plane leans away from the camera, in degrees */
  tilt: number;
  /** pushed to the edge because the pan is off screen or behind a panel */
  parked: boolean;
};

/** below the cookbook, above the assistant panel, off the bezel. the
 *  cookbook's height follows the screen width, so the live value comes
 *  from safeBelow(); this default is a 402pt-wide phone. */
export const SAFE: Safe = { top: 258, bottom: 232, side: 12 };

/** the safe area for a cookbook whose lowest point is `bookBottom` px */
export const safeBelow = (bookBottom: number): Safe => ({ ...SAFE, top: Math.round(bookBottom + 8) });
/** half the timer container at scale 1, with its play or pause mark. its
 *  glow spills past this, which is fine; the digits are what must fit. */
export const TIMER_HALF = { w: 68, h: 26 };
/** the pan at this fraction of the screen width counts as normal size */
const REFERENCE_WIDTH = 0.4;
/** how much of the real lean to apply. all of it is unreadable. */
const TILT_FACTOR = 0.9;
/** how far above the rim the timer floats, in multiples of the rim height */
const FLOAT_ABOVE = 0.34;
/** smaller than this the numbers can't be read across a kitchen; bigger
 *  and the pill covers the food */
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.3;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * the video is drawn with object-cover: scaled until it fills the screen,
 * then centred, with the overflow cut off. the model's box is in the whole
 * camera frame, so it has to go through the same scale and crop (F1).
 */
export function cameraToScreen(u: number, v: number, view: View) {
  const vw = view.videoWidth || view.width;
  const vh = view.videoHeight || view.height;
  const s = Math.max(view.width / vw, view.height / vh);
  return {
    x: (view.width - vw * s) / 2 + u * vw * s,
    y: (view.height - vh * s) / 2 + v * vh * s,
    /** css pixels per unit of the camera frame */
    sx: vw * s,
    sy: vh * s,
  };
}

/**
 * where the timer sits. it hangs just above the pan, leaning with the
 * pan's plane. when the pan is off screen, or behind the cookbook or the
 * assistant panel, it holds on to the nearest edge on the pan's side
 * instead, flat, so it is always there to read and tap.
 */
export function placeTimer(box: Box | null, view: View, safe: Safe = SAFE): Placement {
  const loY = safe.top;
  const hiY = view.height - safe.bottom;

  if (!box) {
    // no pan yet: the middle of the open part of the screen
    return { x: view.width / 2, y: (loY + hiY) / 2, scale: 1, tilt: 0, parked: false };
  }

  const at = cameraToScreen(box.x + box.w / 2, box.y - box.h * FLOAT_ABOVE, view);
  const wPx = box.w * at.sx;
  const hPx = box.h * at.sy;

  // a rim is a circle, so how squashed it looks tells us the lean. this has
  // to compare pixels: in 0..1 units a portrait frame squashes every
  // circle, and the timer leaned even when looking straight down (F6).
  const flat = Math.min(1, hPx / Math.max(wPx, 0.001));
  const tilt = ((Math.acos(flat) * 180) / Math.PI) * TILT_FACTOR;

  const roomW = (view.width - 2 * safe.side) / (2 * TIMER_HALF.w);
  const scale = clamp(wPx / (REFERENCE_WIDTH * view.width), MIN_SCALE, Math.min(MAX_SCALE, roomW));

  const hw = TIMER_HALF.w * scale;
  const hh = TIMER_HALF.h * scale;
  const x = clamp(at.x, safe.side + hw, view.width - safe.side - hw);
  const y = clamp(at.y, loY + hh, Math.max(loY + hh, hiY - hh));
  const parked = Math.abs(x - at.x) > 0.5 || Math.abs(y - at.y) > 0.5;

  return { x, y, scale, tilt: parked ? 0 : tilt, parked };
}

/** a rectangle in an action clip's own 300-unit drawing */
export type ClipFit = { x: number; y: number; w: number; h: number };

export type ClipPlacement = {
  /** the clip's top left and size on screen, in css pixels */
  left: number;
  top: number;
  size: number;
  /** the object is on screen, so there is somewhere to play */
  visible: boolean;
};

/** the clip's drawing is this many units square */
const CLIP_UNITS = 300;
/** never smaller than this on screen, or the action can't be read */
const CLIP_MIN = 150;

/**
 * where an action clip goes so that the object it draws sits on the real
 * one: scaled until the drawn board, bowl or pan is as wide as the real
 * one on screen, then centred on it. the same camera-to-screen mapping
 * as the timer, so both stay on the same object.
 */
export function placeClip(box: Box, fit: ClipFit, view: View): ClipPlacement {
  const tl = cameraToScreen(box.x, box.y, view);
  const w = box.w * tl.sx;
  const h = box.h * tl.sy;
  const cx = tl.x + w / 2;
  const cy = tl.y + h / 2;
  const size = Math.min(view.width * 1.6, Math.max(CLIP_MIN, (CLIP_UNITS * w) / fit.w));
  const s = size / CLIP_UNITS;
  return {
    left: cx - (fit.x + fit.w / 2) * s,
    top: cy - (fit.y + fit.h / 2) * s,
    size,
    visible: cx > 0 && cx < view.width && cy > 0 && cy < view.height,
  };
}
