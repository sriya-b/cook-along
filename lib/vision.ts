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
  panBox: { x: number; y: number; w: number; h: number } | null;
  /** which station is in shot, if any. this replaces the colour guesswork:
   *  the model knows a cutting board from across the room. */
  seesStation: Station | null;
  /** true when this came from the mock, not the model */
  mocked?: boolean;
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
