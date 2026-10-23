// a few seconds of flipping, drawn as a pure function of time in the soft
// white style: the spatula slides under, lifts, and the omelette turns over
// in the air, showing its golden underside, then lands with a small
// bounce. the same frames play in the app and render to video.

import { blob, clamp01, drawOn, easeInOut, easeOut, f, frame, lerp, pan, phase, spatula, steam } from "./style.ts";

/** one full play, in seconds */
export const FLIP_DURATION = 3.6;

const PAN_IN = [0, 0.45] as const;
const OMELETTE_IN = [0.15, 0.6] as const;
const SPATULA_IN = [0.45, 0.95] as const;
const LIFT = [1.0, 1.35] as const;
const TURN = [1.35, 2.15] as const;
const LAND = [2.15, 2.4] as const;
const FADE = [3.2, 3.6] as const;

const PAN_DROP = 28;
/** the omelette at rest in the pan */
const REST = { x: 140, y: 240, rx: 58, ry: 22 };
const LIFTED_Y = 212;

function omelette(id: string, x: number, y: number, ry: number, rot: number, underside: boolean, opacity: number) {
  const shape = blob(x, y, REST.rx, Math.max(0.6, Math.abs(ry)), rot);
  const below = blob(x, y + Math.min(6, Math.abs(ry) * 0.3), REST.rx, Math.max(0.6, Math.abs(ry)), rot);
  // the underside is browned: dimmer, with more specks
  const specks = (underside ? [[-30, -4], [-12, 6], [6, -6], [22, 4], [36, -2], [-20, -10], [14, 10]] : [[-22, 0], [4, -6], [20, 4]])
    .map(([dx, dy], i) => {
      const a = (rot * Math.PI) / 180;
      const sy = dy * (Math.abs(ry) / REST.ry);
      const px = x + dx * Math.cos(a) - sy * Math.sin(a);
      const py = y + dx * Math.sin(a) + sy * Math.cos(a);
      return `<circle cx="${f(px)}" cy="${f(py)}" r="${underside ? 1.8 : 2}" fill="#fff" fill-opacity="${underside ? 0.45 + (i % 3) * 0.1 : 0.75}"/>`;
    })
    .join("");
  return (
    `<g opacity="${f(opacity)}">` +
    `<g filter="url(#${id}-grain)">` +
    `<path d="${below}" fill="#fff" fill-opacity="0.26"/>` +
    `<path d="${shape}" fill="url(#${id}-${underside ? "eggUnder" : "egg"})"/>` +
    `</g>` +
    `<path d="${shape}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="1.1"/>` +
    (Math.abs(ry) > 5 ? specks : "") +
    `</g>`
  );
}

export type FlipOptions = {
  /** prefix for svg ids, so several clips can share a page */
  id?: string;
};

export function flipFrame(t: number, opts: FlipOptions = {}): string {
  const id = opts.id ?? "flip";
  const pPan = easeOut(phase(t, PAN_IN));
  const pOm = easeOut(phase(t, OMELETTE_IN));
  const pSp = easeOut(phase(t, SPATULA_IN));
  const lift = easeInOut(phase(t, LIFT));
  const turn = easeInOut(phase(t, TURN));
  const land = phase(t, LAND);
  const opacity = 1 - easeInOut(phase(t, FADE));

  // up on the spatula, then an arc through the air and back down
  let x = REST.x;
  let y = lerp(REST.y, LIFTED_Y, lift);
  let rot = lerp(0, -10, lift);
  if (t >= TURN[0]) {
    x = lerp(REST.x, REST.x - 6, turn);
    y = lerp(LIFTED_Y, REST.y, turn) - 72 * Math.sin(Math.PI * turn);
    rot = lerp(-10, 0, turn);
  }
  // the turn, seen edge-on: the height shrinks to nothing and comes back
  // as the other face
  const phi = Math.PI * turn;
  let ry = REST.ry * Math.cos(phi);
  // a small squash as it lands
  if (land > 0 && land < 1) ry *= 1 - 0.14 * Math.sin(Math.PI * land);
  const underside = Math.cos(phi) < 0;

  // the spatula slides in under the right edge, rises with the lift, then
  // pulls away to the right as the omelette turns
  const away = easeInOut(phase(t, [1.45, 1.95]));
  const spx = lerp(REST.x + REST.rx + 70, REST.x + REST.rx + 8, pSp) + 60 * away;
  const spy = lerp(REST.y + 6, LIFTED_Y + 8, lift) + 30 * away;
  const spRot = lerp(0, -10, lift);

  const arrow = phase(t, [1.25, 2.0]);
  const arrowFade = 1 - phase(t, [2.4, 2.8]);
  const hiss = phase(t, [2.3, 2.6]);

  return frame(
    id,
    opacity,
    `<g opacity="${f(pPan)}" transform="translate(0 ${f(8 * (1 - pPan))})">${pan(id, PAN_DROP)}</g>` +
      spatula(id, spx, spy, spRot, pSp * (1 - away)) +
      omelette(id, x, y, ry, rot, underside, pOm) +
      drawOn("M212,112 Q206,72 156,70 Q114,72 100,104", arrow, 0.7 * arrowFade) +
      (arrow > 0.95 ? `<path d="M100,104 L98,93 M100,104 L109,98" fill="none" stroke="#fff" stroke-opacity="${f(0.7 * arrowFade)}" stroke-width="1.2" stroke-linecap="round"/>` : "") +
      steam(t, hiss * (1 - clamp01(phase(t, [3.0, 3.3]))), [[180, 214], [196, 222], [100, 220]]),
  );
}
