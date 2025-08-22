import type { CountryID } from '../state/types';

export type BridgeRoute = {
  id: string;
  name: string;
  from: CountryID;
  to: CountryID;
  weight?: number; // share when multiple routes exist
  path: [number, number][]; // [lng, lat]
};

// Simplified polylines approximating key NYC inter-borough bridges.
// These are intentionally lightweight; easy to refine with more points later.
export const BRIDGE_ROUTES: BridgeRoute[] = [
  // Manhattan ↔ Brooklyn (East River): Brooklyn Bridge
  {
    id: 'brooklyn_bridge', name: 'Brooklyn Bridge', from: 'manhattan', to: 'brooklyn', weight: 0.4,
    path: [
      [-74.0006, 40.7113],
      [-73.9985, 40.7089],
      [-73.9970, 40.7060],
      [-73.9955, 40.7050],
      [-73.9942, 40.7034],
    ],
  },
  // Manhattan Bridge
  {
    id: 'manhattan_bridge', name: 'Manhattan Bridge', from: 'manhattan', to: 'brooklyn', weight: 0.35,
    path: [
      [-73.9931, 40.7130],
      [-73.9920, 40.7103],
      [-73.9909, 40.7072],
      [-73.9893, 40.7050],
      [-73.9877, 40.7033],
    ],
  },
  // Williamsburg Bridge
  {
    id: 'williamsburg_bridge', name: 'Williamsburg Bridge', from: 'manhattan', to: 'brooklyn', weight: 0.25,
    path: [
      [-73.9786, 40.7188],
      [-73.9755, 40.7165],
      [-73.9723, 40.7137],
      [-73.9710, 40.7120],
      [-73.9697, 40.7102],
    ],
  },

  // Manhattan ↔ Queens: Queensboro Bridge (59th St)
  {
    id: 'queensboro_bridge', name: 'Queensboro Bridge', from: 'manhattan', to: 'queens', weight: 1.0,
    path: [
      [-73.9624, 40.7592],
      [-73.9599, 40.7582],
      [-73.9568, 40.7570],
      [-73.9542, 40.7542],
      [-73.9510, 40.7548],
      [-73.9490, 40.7556],
    ],
  },

  // Manhattan ↔ Bronx: Third Avenue Bridge (Harlem River)
  {
    id: 'third_ave_bridge', name: 'Third Avenue Bridge', from: 'manhattan', to: 'bronx', weight: 1.0,
    path: [
      [-73.9367, 40.8077],
      [-73.9346, 40.8076],
      [-73.9325, 40.8076],
      [-73.9307, 40.8079],
      [-73.9290, 40.8081],
    ],
  },

  // Queens ↔ Brooklyn: Kosciuszko Bridge (Newtown Creek)
  {
    id: 'kosciuszko_bridge', name: 'Kosciuszko Bridge', from: 'brooklyn', to: 'queens', weight: 0.6,
    path: [
      [-73.9364, 40.7337],
      [-73.9330, 40.7310],
      [-73.9293, 40.7282],
      [-73.9260, 40.7262],
      [-73.9225, 40.7240],
    ],
  },
  // Queens ↔ Brooklyn: Pulaski Bridge
  {
    id: 'pulaski_bridge', name: 'Pulaski Bridge', from: 'brooklyn', to: 'queens', weight: 0.4,
    path: [
      [-73.9553, 40.7423],
      [-73.9541, 40.7407],
      [-73.95306, 40.73917],
      [-73.9521, 40.7376],
      [-73.9510, 40.7362],
    ],
  },

  // Staten Island ↔ Brooklyn: Verrazzano-Narrows Bridge
  {
    id: 'verrazzano_bridge', name: 'Verrazzano-Narrows Bridge', from: 'staten_island', to: 'brooklyn', weight: 1.0,
    path: [
      [-74.0447, 40.6066],
      [-74.0428, 40.6050],
      [-74.0407, 40.6038],
      [-74.0385, 40.6020],
      [-74.0362, 40.6005],
    ],
  },

  // Queens ↔ Bronx: Throgs Neck Bridge
  {
    id: 'throgs_neck_bridge', name: 'Throgs Neck Bridge', from: 'queens', to: 'bronx', weight: 1.0,
    path: [
      [-73.7960, 40.8040],
      [-73.7920, 40.8025],
      [-73.7878, 40.8010],
      [-73.7840, 40.7995],
      [-73.7800, 40.7980],
    ],
  },
];

export function routesFor(from: CountryID, to: CountryID, overrides?: Record<string, number>): BridgeRoute[] {
  const out: BridgeRoute[] = [];
  for (const r of BRIDGE_ROUTES) {
    if ((r.from === from && r.to === to) || (r.from === to && r.to === from)) {
      // Ensure path direction follows from->to for spark interpolation
      const w = overrides && overrides[r.id] != null ? overrides[r.id]! : r.weight;
      const base = { ...r, weight: w };
      if (r.from === from) out.push(base);
      else out.push({ ...base, path: [...r.path].reverse(), from, to });
    }
  }
  return out;
}
