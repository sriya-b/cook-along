// a few seconds of folding, drawn as a pure function of time in the soft
// white style: cheese lands on the omelette, the spatula slides under the
// right half, and that half swings over on its hinge like closing a book.
// the same frames play in the app and render to video.

import { clamp01, drawOn, easeInOut, easeOut, f, frame, lerp, pan, phase, spatula, steam } from "./style.ts";

/** one full play, in seconds */
export const FOLD_DURATION = 3.6;

const PAN_IN = [0, 0.45] as const;
const OMELETTE_IN = [0.15, 0.6] as const;
const CHEESE_IN = [0.4, 0.85] as const;
const SPATULA_IN = [0.6, 1.05] as const;
const FOLD = [1.15, 2.45] as const;
const FADE = [3.2, 3.6] as const;

const PAN_DROP = 12;
/** the omelette in the pan, and the hinge down its middle */
const O = { cx: 140, cy: 230, rx: 64, ry: 25 };
const CHEESE = [[104, 226, 2.4], [118, 238, 2], [126, 222, 2.2], [96, 236, 1.8], [130, 244, 1.6]];

/** a point on the right half's edge, at angle a, lifted by `lift` radians
 *  about the hinge. at pi it lies exactly over the left half. */
function lifted(a: number, lift: number): [number, number] {
  const x = O.cx + O.rx * Math.cos(a) * Math.cos(lift);
  const y = O.cy + O.ry * Math.sin(a) - O.rx * Math.cos(a) * Math.sin(lift) * 0.92;
  return [x, y];
}

function flap(id: string, lift: number) {
  const pts: [number, number][] = [];
  for (let d = -90; d <= 90; d += 6) pts.push(lifted((d * Math.PI) / 180, lift));
  const d = `M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" L")} Z`;
  const edge = `M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" L")}`;
  // past upright, we see its cooked underside
  const under = lift > Math.PI / 2;
  return (
    `<g filter="url(#${id}-grain)"><path d="${d}" fill="url(#${id}-${under ? "eggUnder" : "egg"})"/>` +
    `<path d="${d}" fill="#fff" fill-opacity="${under ? 0.06 : 0.12}"/></g>` +
    `<path d="${edge}" fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="1.1"/>`
  );
}

export type FoldOptions = {
  /** prefix for svg ids, so several clips can share a page */
  id?: string;
};

export function foldFrame(t: number, opts: FoldOptions = {}): string {
  const id = opts.id ?? "fold";
  const pPan = easeOut(phase(t, PAN_IN));
  const pOm = easeOut(phase(t, OMELETTE_IN));
  const pCheese = easeOut(phase(t, CHEESE_IN));
  const pSp = easeOut(phase(t, SPATULA_IN));
  const fold = easeInOut(phase(t, FOLD));
  const lift = Math.PI * fold;
  const opacity = 1 - easeInOut(phase(t, FADE));

  // the spatula rides under the flap's edge until it is past upright, then
  // slides back out to the right
  const tip = lifted(0, Math.min(lift, Math.PI * 0.62));
  const away = easeInOut(phase(t, [1.95, 2.45]));
  const spx = lerp(tip[0] + 80, tip[0] + 40, pSp) + 50 * away;
  const spy = tip[1] + 4 + 20 * away;
  const spRot = lerp(0, -28, clamp01(lift / (Math.PI * 0.62)));

  const arrow = phase(t, [1.05, 2.0]);
  const arrowFade = 1 - phase(t, [2.5, 2.9]);
  const hiss = phase(t, [2.45, 2.8]) * (1 - phase(t, [3.0, 3.3]));

  const leftHalf = `M${O.cx},${O.cy - O.ry} A${O.rx},${O.ry} 0 0 0 ${O.cx},${O.cy + O.ry} Z`;
  return frame(
    id,
    opacity,
    `<g opacity="${f(pPan)}" transform="translate(0 ${f(8 * (1 - pPan))})">${pan(id, PAN_DROP)}</g>` +
      `<g opacity="${f(pOm)}">` +
      `<g filter="url(#${id}-grain)"><path d="${leftHalf}" fill="url(#${id}-egg)"/></g>` +
      `<path d="M${O.cx},${O.cy - O.ry} A${O.rx},${O.ry} 0 0 0 ${O.cx},${O.cy + O.ry}" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1"/>` +
      // cheese drops onto the half that stays down
      `<g fill="#fff" opacity="${f(pCheese)}" transform="translate(0 ${f(-10 * (1 - pCheese))})">` +
      CHEESE.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill-opacity="0.8"/>`).join("") +
      `</g>` +
      // the spatula goes under the flap while the flap is on the right,
      // and is covered by it as it lifts
      (lift < Math.PI / 2 ? spatula(id, spx, spy, spRot, pSp * (1 - away)) : "") +
      flap(id, lift) +
      (lift >= Math.PI / 2 ? spatula(id, spx, spy, spRot, pSp * (1 - away)) : "") +
      `<path d="M${O.cx},${O.cy - O.ry} L${O.cx},${O.cy + O.ry}" stroke="#fff" stroke-opacity="0.5" stroke-width="1"/>` +
      `</g>` +
      drawOn(`M${f(O.cx + 54)},${f(O.cy - 84)} Q${O.cx},${f(O.cy - 132)} ${f(O.cx - 50)},${f(O.cy - 76)}`, arrow, 0.7 * arrowFade) +
      (arrow > 0.95
        ? `<path d="M${f(O.cx - 50)},${f(O.cy - 76)} L${f(O.cx - 50)},${f(O.cy - 87)} M${f(O.cx - 50)},${f(O.cy - 76)} L${f(O.cx - 40)},${f(O.cy - 80)}" fill="none" stroke="#fff" stroke-opacity="${f(0.7 * arrowFade)}" stroke-width="1.2" stroke-linecap="round"/>`
        : "") +
      steam(t, hiss, [[120, 206], [136, 212], [150, 204]]),
  );
}
