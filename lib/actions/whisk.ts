// a few seconds of whisking, drawn as a pure function of time in the soft
// white style: the whisk circles through the egg, the swirl turns with it,
// and small bubbles rise and pop. the same frames play in the app and
// render to video, so what is approved is what the cook sees.

import { clamp01, easeInOut, easeOut, f, frame, lerp, phase } from "./style.ts";

/** one full play, in seconds */
export const WHISK_DURATION = 3.4;

const BOWL_IN = [0, 0.45] as const;
const WHISK_IN = [0.2, 0.7] as const;
const STIR = [0.7, 2.9] as const;
const FADE = [3.0, 3.4] as const;
/** turns of the whisk per second while it stirs */
const TURNS = 1.6;

/** the egg's surface, which the swirl and bubbles sit on */
const EGG = { cx: 150, cy: 176, rx: 70, ry: 22 };

function bowl(id: string) {
  return (
    `<g filter="url(#${id}-grainLight)">` +
    `<path d="M66,168 Q70,256 150,258 Q230,256 234,168 Q226,214 150,216 Q74,214 66,168 Z" fill="url(#${id}-wall)"/>` +
    `<path d="M66,168 Q70,256 150,258 Q230,256 234,168 Z" fill="#fff" fill-opacity="0.1"/>` +
    `</g>` +
    `<g filter="url(#${id}-grain)">` +
    `<path fill-rule="evenodd" fill="url(#${id}-rim)" d="M66,168 a84,32 0 1 0 168,0 a84,32 0 1 0 -168,0 Z M76,170 a74,26 0 1 0 148,0 a74,26 0 1 0 -148,0 Z"/>` +
    `<ellipse cx="${EGG.cx}" cy="${EGG.cy}" rx="${EGG.rx}" ry="${EGG.ry}" fill="url(#${id}-egg)"/>` +
    `</g>` +
    `<path d="M86,162 Q150,132 214,162" fill="none" stroke="#fff" stroke-opacity="0.65" stroke-width="1.2" stroke-linecap="round"/>`
  );
}

/** a spiral on the egg's surface, turned by `turn` radians */
function swirl(turn: number, strength: number) {
  const pts: string[] = [];
  for (let a = 0.9; a <= 3.4 * Math.PI; a += 0.18) {
    const r = 6 + 3.9 * a;
    pts.push(`${f(EGG.cx + r * Math.cos(a + turn))},${f(EGG.cy + 0.31 * r * Math.sin(a + turn))}`);
  }
  return `<path d="M${pts.join(" L")}" fill="none" stroke="#fff" stroke-opacity="${f(0.55 * strength)}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** the whisk: a filled handle and wire loops as hairlines, its head at (x, y) */
function whisk(id: string, x: number, y: number, sway: number) {
  const at = `translate(${f(x - 190)} ${f(y - 120)}) rotate(${f(sway)} 190 120)`;
  return (
    `<g transform="${at}">` +
    `<g filter="url(#${id}-grain)"><path d="M236,44 Q244,40 246,48 L196,124 Q190,130 184,124 Q182,118 186,114 Z" fill="url(#${id}-handle)"/></g>` +
    `<g fill="none" stroke="#fff" stroke-linecap="round" stroke-width="1.3">` +
    `<path d="M190,120 Q150,128 152,176 Q170,168 190,120" stroke-opacity="0.85"/>` +
    `<path d="M190,120 Q132,140 150,182 Q182,170 190,120" stroke-opacity="0.7"/>` +
    `<path d="M190,120 Q170,140 162,178 Q190,160 190,120" stroke-opacity="0.6"/>` +
    `<path d="M190,120 Q140,124 140,168" stroke-opacity="0.5"/>` +
    `</g></g>`
  );
}

/** bubbles: each grows on the surface and pops on its own clock */
function bubbles(t: number, strength: number) {
  const spots = [[-0.62, 0.1], [0.35, 0.45], [0.1, -0.4], [-0.25, 0.6], [0.6, -0.1]];
  return spots
    .map(([u, v], i) => {
      const life = ((t * 1.3 + i * 0.37) % 1);
      const r = lerp(0.8, 2.8, life);
      const o = (life < 0.85 ? 0.6 : 0.6 * (1 - (life - 0.85) / 0.15)) * strength;
      return `<circle cx="${f(EGG.cx + u * EGG.rx * 0.8)}" cy="${f(EGG.cy + v * EGG.ry * 0.7)}" r="${f(r)}" fill="none" stroke="#fff" stroke-opacity="${f(o)}" stroke-width="0.9"/>`;
    })
    .join("");
}

export type WhiskOptions = {
  /** prefix for svg ids, so several clips can share a page */
  id?: string;
};

export function whiskFrame(t: number, opts: WhiskOptions = {}): string {
  const id = opts.id ?? "whisk";
  const pBowl = easeOut(phase(t, BOWL_IN));
  const pWhisk = easeOut(phase(t, WHISK_IN));
  const opacity = 1 - easeInOut(phase(t, FADE));
  // stirring eases in and out, so the whisk starts and stops gently
  const stir = clamp01(phase(t, [STIR[0], STIR[0] + 0.3])) * (1 - clamp01(phase(t, [STIR[1] - 0.3, STIR[1]])));
  const angle = 2 * Math.PI * TURNS * Math.max(0, t - STIR[0]);
  const hx = 190 + 16 * Math.cos(angle) * stir;
  const hy = 120 + 6 * Math.sin(angle) * stir + 26 * (1 - pWhisk) * -1;
  const sway = 6 * Math.sin(angle) * stir;
  // the swirl keeps turning a little after the whisk slows, like liquid does
  const turn = -angle * 0.9;
  const surface = clamp01(phase(t, [STIR[0], STIR[0] + 0.5]));
  // two short arcs either side of the whisk, while it is moving
  const arcs = stir;

  return frame(
    id,
    opacity,
    `<ellipse cx="250" cy="90" rx="18" ry="12" fill="#fff" fill-opacity="${f(0.2 * pBowl)}" filter="url(#${id}-haze)"/>` +
      `<g opacity="${f(pBowl)}" transform="translate(0 ${f(8 * (1 - pBowl))})">${bowl(id)}</g>` +
      swirl(turn, surface) +
      bubbles(t, surface) +
      `<g opacity="${f(pWhisk)}">${whisk(id, hx + 30 * (1 - pWhisk), hy, sway)}</g>` +
      `<g fill="none" stroke="#fff" stroke-linecap="round" stroke-width="1">` +
      `<path d="M118,128 Q100,150 118,166" stroke-opacity="${f(0.55 * arcs)}"/>` +
      `<path d="M214,140 Q226,156 212,170" stroke-opacity="${f(0.45 * arcs)}"/>` +
      `</g>`,
  );
}
