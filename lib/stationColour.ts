import type { Station } from "./recipe";

/**
 * a last-resort way to tell the stations apart with nothing printed and no
 * model trained. it reads the average colour of the middle of the frame and
 * leans on how differently the three stations photograph:
 *
 *   cutting board   bright, washed out, warm      value .72  sat .20
 *   pan             dark                          value .37  sat .15
 *   mixing bowl     bright and strongly yellow    value .86  sat .62
 *
 * those numbers were measured from photographs of this kitchen, so this is a
 * stopgap for demoing before a model exists — not a real classifier. the
 * printed markers and a teachable machine model both outrank it.
 */

/** below this the frame is the dark pan rather than the pale board */
export const DARK = 0.5;
/** above this the frame is the yellow of beaten egg */
export const YELLOW = 0.4;
/** ...but only when it is also bright, so a dark warm frame is not "egg" */
export const YELLOW_MIN_VALUE = 0.6;

export type Reading = { value: number; saturation: number };

/** average the middle of the frame, where the station actually is */
export function readCentre(data: Uint8ClampedArray, w: number, h: number): Reading {
  const x0 = Math.floor(w / 4);
  const x1 = Math.ceil((w * 3) / 4);
  const y0 = Math.floor(h / 4);
  const y1 = Math.ceil((h * 3) / 4);

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  if (!n) return { value: 0, saturation: 0 };
  r /= n * 255;
  g /= n * 255;
  b /= n * 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return { value: max, saturation: max === 0 ? 0 : (max - min) / max };
}

export function classify({ value, saturation }: Reading): Station | null {
  if (saturation > YELLOW && value > YELLOW_MIN_VALUE) return "bowl";
  if (value < DARK) return "pan";
  if (value > 0) return "board";
  return null;
}
