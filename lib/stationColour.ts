import type { Station } from "./recipe";

/**
 * a last-resort way to tell the stations apart with nothing printed and no
 * model trained.
 *
 * this counts *how many* pixels look a certain way rather than averaging the
 * whole frame. averaging failed in practice: a frame that was 64% beaten egg
 * still came out unsaturated, because the white bowl and pale counter around
 * it pulled the mean down. fractions do not have that problem.
 *
 * measured from frames of this kitchen, sampling the middle half:
 *
 *            yellow   dark
 *   board     0.00    0.07     pale wood, nothing dark, nothing yellow
 *   pan       0.00    0.43     the dark pan and the black grates
 *   bowl      0.64    0.04     beaten egg fills the middle
 *
 * the thresholds sit in the wide gaps between those columns.
 */

/** this much of the middle being egg-yellow means the mixing bowl */
export const YELLOW_FRACTION = 0.15;
/** ...and this much being dark means the pan */
export const DARK_FRACTION = 0.25;

/** a pixel this dark counts toward the pan */
const DARK_VALUE = 0.35;
/** hue window for beaten egg, as a fraction of the wheel (29deg - 68deg) */
const EGG_HUE = [0.08, 0.19] as const;
const EGG_MIN_SAT = 0.45;
const EGG_MIN_VALUE = 0.5;

/** how much of the frame to look at, as a fraction of each side */
export const WINDOW = 0.5;

export type Reading = { yellow: number; dark: number };

function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** count the telling pixels in the middle of the frame */
export function readCentre(data: Uint8ClampedArray, w: number, h: number): Reading {
  const m = (1 - WINDOW) / 2;
  const x0 = Math.floor(w * m);
  const x1 = Math.ceil(w * (1 - m));
  const y0 = Math.floor(h * m);
  const y1 = Math.ceil(h * (1 - m));

  let yellow = 0;
  let dark = 0;
  let n = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const { h: hue, s, v } = hsv(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      n++;
      if (v < DARK_VALUE) dark++;
      if (hue >= EGG_HUE[0] && hue <= EGG_HUE[1] && s > EGG_MIN_SAT && v > EGG_MIN_VALUE) {
        yellow++;
      }
    }
  }

  if (!n) return { yellow: 0, dark: 0 };
  return { yellow: yellow / n, dark: dark / n };
}

export function classify({ yellow, dark }: Reading): Station | null {
  // egg wins first: a bowl sitting on the dark hob is still a bowl
  if (yellow > YELLOW_FRACTION) return "bowl";
  if (dark > DARK_FRACTION) return "pan";
  return "board";
}
