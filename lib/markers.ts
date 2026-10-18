import type { Station } from "./recipe";

/**
 * aruco marker ids, one per cooking station. ARUCO_MIP_36h12 is a 6x6
 * dictionary with a hamming distance of 12 between codes, so a misread
 * is very unlikely — worth it when a false positive would skip a step.
 */
export const DICTIONARY = "ARUCO_MIP_36h12";

export const STATION_MARKER: Record<Station, number> = {
  board: 1,
  bowl: 2,
  pan: 3,
};

export const MARKER_STATION: Record<number, Station> = {
  1: "board",
  2: "bowl",
  3: "pan",
};
