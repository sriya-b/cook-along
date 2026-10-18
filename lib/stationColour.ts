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
 *            wood   yellow   dark
 *   board     0.70    0.00    0.07
 *   pan       0.29    0.00    0.43
 *   bowl      0.13    0.64    0.04
 *
 * the thresholds sit in the wide gaps between those columns. note the board
 * has to be recognised on its own evidence rather than being what is left
 * over: treating it as the fallthrough made every wall, hand and worktop
 * read as the cutting board, so step one confirmed the moment it opened.
 */

/** this much of the middle being egg-yellow means the mixing bowl */
export const YELLOW_FRACTION = 0.15;
/** ...and this much being dark means the pan */
export const DARK_FRACTION = 0.25;
/** ...and this much pale warm wood means the cutting board */
export const WOOD_FRACTION = 0.45;

/** a pixel this dark counts toward the pan */
const DARK_VALUE = 0.35;
/** hue window for beaten egg, as a fraction of the wheel (29deg - 68deg) */
const EGG_HUE = [0.08, 0.19] as const;
const EGG_MIN_SAT = 0.45;
const EGG_MIN_VALUE = 0.5;

/** pale warm wood: a warm hue, gently coloured, and clearly lit. the lower
 *  bound is deliberately above skin tone, which otherwise sits inside this
 *  band and makes a hand over the counter read as the board. */
const WOOD_HUE = [0.07, 0.17] as const;
const WOOD_SAT = [0.1, 0.45] as const;
const WOOD_VALUE = [0.45, 0.97] as const;

/** how much of the frame to look at, as a fraction of each side */
export const WINDOW = 0.5;

export type Reading = { yellow: number; dark: number; wood: number };

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
  let wood = 0;
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
      if (
        hue >= WOOD_HUE[0] && hue <= WOOD_HUE[1] &&
        s >= WOOD_SAT[0] && s <= WOOD_SAT[1] &&
        v >= WOOD_VALUE[0] && v <= WOOD_VALUE[1]
      ) {
        wood++;
      }
    }
  }

  if (!n) return { yellow: 0, dark: 0, wood: 0 };
  return { yellow: yellow / n, dark: dark / n, wood: wood / n };
}

export function classify({ yellow, dark, wood }: Reading): Station | null {
  // egg wins first: a bowl sitting on the dark hob is still a bowl
  if (yellow > YELLOW_FRACTION) return "bowl";
  if (dark > DARK_FRACTION) return "pan";
  if (wood > WOOD_FRACTION) return "board";
  // nothing recognised. saying so keeps the screen honestly searching
  // rather than naming whichever station was hardest to rule out.
  return null;
}
