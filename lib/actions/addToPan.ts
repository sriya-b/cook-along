// a few seconds of something being tipped into a pan, drawn as a pure
// function of time in the soft white style: see-through glowing fills,
// fine grain, and only a few hairlines. the same frames play in the app
// and render to video, so what is approved is what the cook sees.

/** one full play, in seconds */
export const ADD_TO_PAN_DURATION = 3.6;

import { clamp01, easeInOut, easeOut, f, frame, lerp, pan, phase, steam } from "./style.ts";

// --- timing (seconds) ------------------------------------------------------
const PAN_IN = [0, 0.45] as const;
const BOWL_IN = [0.15, 0.6] as const;
/** the bowl tips over the pan, then holds while it pours */
const TIP = [0.55, 1.1] as const;
const TIP_BACK = [2.75, 3.1] as const;
/** each piece leaves the lip this long after the last */
const POUR_START = 1.05;
const POUR_GAP = 0.24;
const FALL = 0.42;
const FADE = [3.15, 3.6] as const;

/** where each piece lands in the pan, and how far it spins on the way */
const PIECES = [
  { x: 112, y: 210, w: 14, h: 11, spin: 140 },
  { x: 152, y: 207, w: 14, h: 11, spin: -110 },
  { x: 131, y: 219, w: 13, h: 10, spin: 90 },
  { x: 172, y: 220, w: 12, h: 10, spin: -150 },
  { x: 95, y: 221, w: 12, h: 9, spin: 120 },
  { x: 146, y: 229, w: 11, h: 9, spin: -80 },
];
/** the bowl's lip, once tipped: where pieces leave from */
const LIP = { x: 128, y: 118 };

/** the bowl at a given tip, in degrees, centred on (x, y) */
function bowl(id: string, x: number, y: number, tip: number) {
  const at = `translate(${f(x)},${f(y)}) rotate(${f(tip)})`;
  return (
    `<g transform="${at}" filter="url(#${id}-grain)">` +
    `<path d="M-40,0 Q-38,38 0,40 Q38,38 40,0 Z" fill="url(#${id}-bowl)"/>` +
    `<ellipse cx="0" cy="0" rx="40" ry="11" fill="#fff" fill-opacity="0.24"/>` +
    `</g>` +
    `<ellipse transform="${at}" cx="0" cy="0" rx="40" ry="11" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="1.2"/>`
  );
}

function piece(id: string, x: number, y: number, w: number, h: number, rot: number) {
  return `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${w}" height="${h}" rx="${f(h * 0.3)}" fill="url(#${id}-bit)" transform="rotate(${f(rot)} ${f(x)} ${f(y)})"/>`;
}

/** where piece i is at time t, or null before it has left the bowl */
function piecePose(i: number, t: number) {
  const p = PIECES[i];
  const leave = POUR_START + i * POUR_GAP;
  if (t < leave) return null;
  const k = clamp01((t - leave) / FALL);
  // across at a steady rate, down under gravity
  let x = lerp(LIP.x + (i % 2 ? 4 : -3), p.x, k);
  let y = lerp(LIP.y, p.y, k * k);
  let rot = p.spin * k;
  // a small bounce as it lands
  const after = t - leave - FALL;
  if (after > 0 && after < 0.18) y -= 5 * Math.sin((Math.PI * after) / 0.18);
  if (after > 0) rot = p.spin;
  // settle the lean once it is down
  if (after > 0.18) {
    x = p.x;
    rot = p.spin * 0.08;
  }
  return { x, y, rot, landed: after > 0 };
}

export type AddToPanOptions = {
  /** prefix for svg ids, so several clips can share a page */
  id?: string;
};

export function addToPanFrame(t: number, opts: AddToPanOptions = {}): string {
  const id = opts.id ?? "addpan";
  const pIn = easeOut(phase(t, PAN_IN));
  const bIn = easeOut(phase(t, BOWL_IN));
  const opacity = 1 - easeInOut(phase(t, FADE));

  // the bowl drifts in from above, tips over the pan, wobbles while it
  // pours, then rights itself
  const tipIn = easeInOut(phase(t, TIP));
  const tipBack = easeInOut(phase(t, TIP_BACK));
  const wobble = t > TIP[1] && t < TIP_BACK[0] ? 2.2 * Math.sin((t - TIP[1]) * 11) : 0;
  const tip = lerp(0, 34, tipIn) - 22 * tipBack + wobble;
  const bx = lerp(112, 96, tipIn) + 6 * tipBack;
  const by = lerp(70, 92, bIn * 0.4 + tipIn * 0.6) - 4 * tipBack;

  const pieces: string[] = [];
  let firstLanding = Infinity;
  PIECES.forEach((p, i) => {
    const pose = piecePose(i, t);
    if (pose) pieces.push(piece(id, pose.x, pose.y, p.w, p.h, pose.rot));
    firstLanding = Math.min(firstLanding, POUR_START + i * POUR_GAP + FALL);
  });

  // the pour's motion lines, only while something is falling
  const pouring = clamp01((t - POUR_START) / 0.2) * (1 - clamp01((t - (POUR_START + PIECES.length * POUR_GAP + 0.2)) / 0.3));
  // sizzle once the first piece lands, drifting up and flickering
  const sizzle = clamp01((t - firstLanding) / 0.3);

  return frame(
    id,
    opacity,
    `<ellipse cx="250" cy="120" rx="18" ry="12" fill="#fff" fill-opacity="${f(0.2 * pIn)}" filter="url(#${id}-haze)"/>` +
      `<g opacity="${f(pIn)}" transform="translate(0 ${f(8 * (1 - pIn))})">${pan(id)}</g>` +
      `<g filter="url(#${id}-grain)">${pieces.join("")}</g>` +
      `<g opacity="${f(bIn)}">${bowl(id, bx, by, tip)}</g>` +
      `<g fill="none" stroke="#fff" stroke-linecap="round">` +
      `<path d="M150,124 Q160,146 156,170" stroke-opacity="${f(0.55 * pouring)}" stroke-width="1"/>` +
      `<path d="M118,134 Q116,152 120,168" stroke-opacity="${f(0.35 * pouring)}" stroke-width="0.9"/>` +
      `</g>` +
      steam(t, sizzle),
  );
}
