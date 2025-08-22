import { ScatterplotLayer } from '@deck.gl/layers';

export type Bubble = { id: number; ll: [number, number]; type: 'dna'|'ops'|'cure'; ttl: number; born: number };

const colorOf = (type: 'dna'|'ops'|'cure'): [number, number, number, number] =>
  type === 'cure' ? [96, 165, 250, 220] : type === 'ops' ? [52, 211, 153, 220] : [255, 105, 97, 220];

export function makeBubblesLayer(opts: {
  data: Bubble[];
  t: number;
  onClick?: (obj: Bubble) => void;
}) {
  const { data, t, onClick } = opts;
  return new ScatterplotLayer<Bubble>({
    id: 'bubbles-layer',
    data,
    pickable: true,
    radiusUnits: 'pixels',
    getPosition: (d) => d.ll,
    getRadius: (d) => {
      const age = Math.max(0, t - d.born);
      const base = 8 + 4 * Math.sin((age / 1000) * Math.PI);
      return base;
    },
    getFillColor: (d) => colorOf(d.type),
    onClick: (info: any) => { if (info?.object && onClick) onClick(info.object as Bubble); },
    updateTriggers: { data: data.length, t }
  });
}

