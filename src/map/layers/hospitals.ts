import { IconLayer } from '@deck.gl/layers';

export type HospitalDot = {
  id: number;
  boroKey: string;
  name: string;
  ll: [number, number];
  capacity: number;
  occupancy: number;
  beds?: number;
};

const ICONS = {
  green: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" ry="10" fill="#16a34a"/><path d="M28 12h8v16h16v8H36v16h-8V36H12v-8h16z" fill="#EAECEF"/></svg>')}`,
  amber: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" ry="10" fill="#f59e0b"/><path d="M28 12h8v16h16v8H36v16h-8V36H12v-8h16z" fill="#1E1E1E"/></svg>')}`,
  red: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" ry="10" fill="#C62828"/><path d="M28 12h8v16h16v8H36v16h-8V36H12v-8h16z" fill="#EAECEF"/></svg>')}`,
};

export function makeHospitalsLayer(opts: {
  data: HospitalDot[];
  onClick?: (obj: HospitalDot) => void;
}) {
  const { data, onClick } = opts;
  return new IconLayer<HospitalDot>({
    id: 'hospitals-layer',
    data,
    pickable: true,
    sizeUnits: 'pixels',
    getPosition: (d) => d.ll,
    getIcon: (d) => {
      const load = d.capacity > 0 ? d.occupancy / d.capacity : 0;
      const url = load < 0.7 ? ICONS.green : load < 1.0 ? ICONS.amber : ICONS.red;
      return { url, width: 64, height: 64, anchorY: 64 } as any;
    },
    getSize: (d) => {
      const load = d.capacity > 0 ? d.occupancy / d.capacity : 0;
      return 22 + Math.min(12, load * 18);
    },
    onHover: (info: any) => {
      try { (info.layer?.context?.deck?.canvas as HTMLCanvasElement).style.cursor = info?.object ? 'pointer' : ''; } catch {}
    },
    onClick: (info: any, ev: any) => {
      // Prevent MapLibre drag-pan from "stealing" short clicks on icons.
      try { ev?.srcEvent?.preventDefault?.(); ev?.srcEvent?.stopPropagation?.(); } catch {}
      if (info?.object && onClick) onClick(info.object as HospitalDot);
    },
  }) as any;
}
