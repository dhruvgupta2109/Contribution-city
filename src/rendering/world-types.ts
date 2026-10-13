export interface MapAsset {
  meta: {
    bounds: [number, number, number, number];
    downtown: [number, number];
    goldenGate: [[number, number], [number, number]];
    attribution: string;
  };
  footprints: number[];
  roads: { c: number; p: number[] }[];
  parks: { p: number[] }[];
  landMask: { res: number; data: string };
}
export interface WorldRoute {
  points: Float32Array;
  class: number;
}
export interface MapWorld {
  bounds: [number, number, number, number];
  goldenGate: [[number, number], [number, number]];
  attribution: string;
  arrays: {
    land: Float32Array;
    asphalt: Float32Array;
    sidewalk: Float32Array;
    parks: Float32Array;
  };
  lots: Float32Array;
  trees: Float32Array;
  routes: WorldRoute[];
  parks: { x: number; z: number; radius: number }[];
  parkCount: number;
  radius: number;
}
