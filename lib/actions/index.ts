// every action clip, the station it plays on, and which part of its own
// drawing must line up with that station on screen. the drawing is 300
// units square; `fit` is the board, bowl or pan inside it, so a clip can
// be scaled and moved until its drawn pan sits on the real one.

import type { Station } from "../recipe.ts";
import { chopFrame, CHOP_DURATION } from "./chop.ts";
import { whiskFrame, WHISK_DURATION } from "./whisk.ts";
import { addToPanFrame, ADD_TO_PAN_DURATION } from "./addToPan.ts";
import { flipFrame, FLIP_DURATION } from "./flip.ts";
import { foldFrame, FOLD_DURATION } from "./fold.ts";

export type ActionName = "chop" | "whisk" | "addToPan" | "flip" | "fold";

/** draws one frame at time t, as an svg string */
export type ActionFrame = (t: number, opts: { id?: string }) => string;

/** a rectangle in the clip's own 300-unit space */
export type Fit = { x: number; y: number; w: number; h: number };

export type Action = {
  frame: ActionFrame;
  duration: number;
  station: Station;
  fit: Fit;
};

/** the skillet's rim and body as every pan clip draws it, before any drop */
const PAN: Fit = { x: 48, y: 160, w: 184, h: 94 };
const dropped = (dy: number): Fit => ({ ...PAN, y: PAN.y + dy });

export const ACTIONS: Record<ActionName, Action> = {
  chop: { frame: chopFrame, duration: CHOP_DURATION, station: "board", fit: { x: 50, y: 138, w: 216, h: 121 } },
  whisk: { frame: whiskFrame, duration: WHISK_DURATION, station: "bowl", fit: { x: 66, y: 136, w: 168, h: 122 } },
  addToPan: { frame: addToPanFrame, duration: ADD_TO_PAN_DURATION, station: "pan", fit: PAN },
  flip: { frame: flipFrame, duration: FLIP_DURATION, station: "pan", fit: dropped(28) },
  fold: { frame: foldFrame, duration: FOLD_DURATION, station: "pan", fit: dropped(12) },
};
