import { ArcLayer, ScatterplotLayer, PathLayer } from '@deck.gl/layers';
import { GL } from '@luma.gl/constants';

export type Flow = {
  source: [number, number];
  target: [number, number];
  daily: number;
  iPrev: number;
};

export function makeFlowsLayer(opts: { data: Flow[]; t?: number }) {
  const { data, t = 0 } = opts;
  const pulse = 0.5 + 0.5 * Math.sin((t || 0) * 0.004);
  const alpha = 70 + Math.floor(100 * pulse);
  return new ArcLayer<Flow>({
    id: 'flows-layer',
    data,
    getSourcePosition: (d) => d.source,
    getTargetPosition: (d) => d.target,
    getWidth: (d) => 1 + Math.min(6, d.daily / 30000) * (0.7 + 0.3 * pulse),
    getSourceColor: (d) => [200 * Math.min(1, d.iPrev * 40), 40, 30, alpha],
    getTargetColor: (d) => [200 * Math.min(1, d.iPrev * 40), 40, 30, alpha],
    greatCircle: true,
    pickable: false,
    parameters: {
      blend: true,
      blendFunc: [GL.SRC_ALPHA, GL.ONE, GL.ONE, GL.ONE_MINUS_SRC_ALPHA],
      blendEquation: GL.FUNC_ADD,
    } as any,
  });
}

// Lightweight TripsLayer-style moving particles to indicate direction
export function makeFlowSparksLayer(opts: { data: Flow[]; t: number }) {
  const { data, t } = opts;
  // Generate a few particles per edge, moving from source->target
  const points: Array<{ ll: [number, number]; size: number; alpha: number } & Flow> = [];
  const baseSpeed = 0.00025; // controls overall speed
  for (const f of data) {
    // scale speed by daily volume and infection prevalence
    const speedMul = Math.min(3, 0.8 + (f.daily / 30000) + (f.iPrev * 4));
    const speed = baseSpeed * speedMul;
    // a few runners per edge
    for (let i = 0; i < 3; i++) {
      const phase = ((t * speed) + i * 0.33) % 1; // 0..1
      const u = phase;
      const x = f.source[0] + (f.target[0] - f.source[0]) * u;
      const y = f.source[1] + (f.target[1] - f.source[1]) * u;
      const size = 3 + Math.min(6, f.daily / 25000);
      const alpha = 120 + Math.floor(100 * (0.5 + 0.5 * Math.sin((t * 0.01) + i)));
      points.push({ ...f, ll: [x, y], size, alpha });
    }
  }
  return new ScatterplotLayer({
    id: 'flow-sparks-layer',
    data: points,
    getPosition: (d: any) => d.ll,
    getRadius: (d: any) => d.size,
    radiusUnits: 'pixels',
    stroked: false,
    pickable: false,
    getFillColor: (d: any) => [200 * Math.min(1, d.iPrev * 40 + 0.2), 60, 40, d.alpha],
    parameters: {
      blend: true,
      blendFunc: [GL.SRC_ALPHA, GL.ONE, GL.ONE, GL.ONE_MINUS_SRC_ALPHA],
      blendEquation: GL.FUNC_ADD,
    } as any,
  });
}

type BridgeFlow = { path: [number, number][], daily: number, iPrev: number };

export function makeBridgePathsLayer(opts: { data: BridgeFlow[] }) {
  const { data } = opts;
  return new PathLayer<BridgeFlow>({
    id: 'flow-bridges-paths-layer',
    data,
    getPath: (d) => d.path,
    widthMinPixels: 1,
    widthMaxPixels: 8,
    getWidth: (d) => 1 + Math.min(6, d.daily / 30000),
    getColor: (d) => [200 * Math.min(1, d.iPrev * 40), 50, 40, 180],
    pickable: false,
    parameters: { depthTest: false } as any,
  });
}

function samplePath(path: [number, number][], u: number): [number, number] {
  if (!path || path.length < 2) return path?.[0] || [0, 0];
  // compute cumulative lengths (approx using euclidean in lon/lat space)
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    total += len; segs.push(total);
  }
  const target = Math.max(0, Math.min(1, u)) * total;
  let i = 0; while (i < segs.length && segs[i] < target) i++;
  const prevCum = i === 0 ? 0 : segs[i - 1];
  const segLen = segs[i] - prevCum || 1e-6;
  const t = (target - prevCum) / segLen;
  const A = path[i], B = path[i + 1];
  const x = A[0] + (B[0] - A[0]) * t;
  const y = A[1] + (B[1] - A[1]) * t;
  return [x, y];
}

export function makeBridgeSparksLayer(opts: { data: BridgeFlow[]; t: number }) {
  const { data, t } = opts;
  const points: Array<{ ll: [number, number]; size: number; alpha: number; iPrev: number; daily: number }> = [];
  for (const f of data) {
    const speedMul = Math.min(3, 0.8 + (f.daily / 30000) + (f.iPrev * 4));
    const baseSpeed = 0.18; // unit per second along [0..1]
    const speed = baseSpeed * speedMul;
    for (let i = 0; i < 3; i++) {
      const u = ((t / 1000) * speed + i * 0.33) % 1;
      const ll = samplePath(f.path, u);
      const size = 3 + Math.min(6, f.daily / 25000);
      const alpha = 120 + Math.floor(100 * (0.5 + 0.5 * Math.sin((t * 0.01) + i)));
      points.push({ ll, size, alpha, iPrev: f.iPrev, daily: f.daily });
    }
  }
  return new ScatterplotLayer({
    id: 'flow-bridges-sparks-layer',
    data: points,
    getPosition: (d: any) => d.ll,
    getRadius: (d: any) => d.size,
    radiusUnits: 'pixels',
    stroked: false,
    pickable: false,
    getFillColor: (d: any) => [200 * Math.min(1, d.iPrev * 40 + 0.2), 60, 40, d.alpha],
    parameters: {
      depthTest: false,
      blend: true,
      blendFunc: [GL.SRC_ALPHA, GL.ONE, GL.ONE, GL.ONE_MINUS_SRC_ALPHA],
      blendEquation: GL.FUNC_ADD,
    } as any,
  });
}
