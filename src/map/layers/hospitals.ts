import { ScatterplotLayer } from '@deck.gl/layers';

export type HospitalDot = {
  id: number;
  boroKey: string;
  name: string;
  ll: [number, number];
  capacity: number;
  occupancy: number;
  beds?: number;
};

export function makeHospitalsLayer(opts: {
  data: HospitalDot[];
  onClick?: (obj: HospitalDot) => void;
}) {
  const { data, onClick } = opts;
  return new ScatterplotLayer<HospitalDot>({
    id: 'hospitals-layer',
    data,
    pickable: true,
    radiusUnits: 'pixels',
    stroked: true,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1.2,
    getPosition: (d) => d.ll,
    getRadius: (d) => {
      const load = d.capacity > 0 ? d.occupancy / d.capacity : 0;
      return 6 + Math.min(20, (load * 20));
    },
    getFillColor: (d) => {
      const load = d.capacity > 0 ? d.occupancy / d.capacity : 0;
      if (load < 0.7) return [16,185,129,220]; // green
      if (load < 1.0) return [245,158,11,220]; // amber
      return [239,68,68,220]; // red
    },
    getLineColor: [17, 24, 39, 200],
    onHover: (info: any) => {
      try { (info.layer?.context?.deck?.canvas as HTMLCanvasElement).style.cursor = info?.object ? 'pointer' : ''; } catch {}
    },
    onClick: (info: any) => { if (info?.object && onClick) onClick(info.object as HospitalDot); },
  });
}

