// js-aruco2 ships no types. only the detector surface is declared here,
// which is all the cook screen uses.
declare module "js-aruco2" {
  export type ArucoMarker = { id: number; corners: { x: number; y: number }[] };
  export class Detector {
    constructor(config: { dictionaryName: string });
    detect(image: ImageData): ArucoMarker[];
  }
  export class Dictionary {
    constructor(name: string);
    generateSVG(id: number): string;
  }
  export const AR: {
    Detector: typeof Detector;
    Dictionary: typeof Dictionary;
  };
}
