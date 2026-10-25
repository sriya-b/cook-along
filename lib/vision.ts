// the contract between the cook screen and the vision route. kept in one
// place so the client and the server cannot drift apart.

export type LookRequest = {
  /** a jpeg frame, base64, without the data: prefix */
  frame: string;
  /** which step the app currently believes we are on, 1-based */
  stepN: number;
  /** ingredient keys the cook has dropped, so the model is not told to
   *  add things that are not in the kitchen */
  omitted?: string[];
};

import type { Station } from "./recipe";

/** a rectangle in 0..1 of the camera frame */
export type Box = { x: number; y: number; w: number; h: number };

/** the box for a station, from one look */
export function boxFor(r: LookResult, station: Station): Box | null {
  if (station === "pan") return r.panBox;
  if (station === "board") return r.boardBox ?? null;
  return r.bowlBox ?? null;
}

export type LookResult = {
  /** one short lowercase line for the assistant zone */
  tip: string;
  /** does the pan look ready to move on from this step? */
  stepLooksComplete: boolean;
  /** 0 to 1. below ~0.6 the app should not act on it */
  confidence: number;
  /** which step the model thinks it is actually seeing, 1-based, or null
   *  when it cannot tell. lets the app catch a cook who skipped ahead. */
  seesStep: number | null;
  /** where the pan is in the frame, 0..1 of the width and height, or null
   *  when there is no pan in shot. this is what the timer anchors to. */
  panBox: Box | null;
  /** where the cutting board and the mixing bowl are, the same way. the
   *  action clips sit on these. */
  boardBox?: Box | null;
  bowlBox?: Box | null;
  /** the food is still on an earlier step, like vegetables that need more
   *  sautéing before the eggs go in: how much longer, and at what. the app
   *  runs a short timer for it before the step's own. */
  catchUp?: { seconds: number; what: string } | null;
  /** which station is in shot, if any. this replaces the colour guesswork:
   *  the model knows a cutting board from across the room. */
  seesStation: Station | null;
  /** true when this came from the mock, not the model */
  mocked?: boolean;
  /** google refused for quota (429). the caller should back off rather
   *  than ask again in a few seconds and make it worse. */
  limited?: boolean;
  /** set when the look could not happen at all. shown to the cook rather
   *  than swallowed, because a silent failure looks identical to a slow
   *  answer and there is no way to tell them apart from the outside. */
  error?: string;
};

export function isLookResult(v: unknown): v is LookResult {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.tip === "string" &&
    typeof r.stepLooksComplete === "boolean" &&
    typeof r.confidence === "number"
  );
}
