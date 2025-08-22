import React, { useEffect, useMemo, useState } from 'react';
import { useUiStore } from '../../state/ui';
import { BRIDGE_ROUTES } from '../../map/bridges';
import { useGameStore } from '../../state/store';

export function MapOverlays() {
  const overlays = useUiStore((s) => s.mapOverlays);
  const toggle = useUiStore((s) => s.toggleOverlay);
  const [open, setOpen] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  const weights = useUiStore((s) => (s as any).routeWeights as Record<string, number>);
  const setWeight = useUiStore((s) => (s as any).setRouteWeight as (id: string, w: number) => void);
  const resetWeights = useUiStore((s) => (s as any).resetRouteWeights as () => void);
  const countries = useGameStore((s) => s.countries);

  // load persisted weights on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('routeWeightsV1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([id, w]) => {
            if (typeof w === 'number') setWeight(id, w);
          });
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<string, { label: string; routes: typeof BRIDGE_ROUTES }> = {} as any;
    for (const r of BRIDGE_ROUTES) {
      const key = [r.from, r.to].sort().join('|');
      const a = countries[r.from]?.name || r.from; const b = countries[r.to]?.name || r.to;
      const label = [a, b].sort().join(' ↔ ');
      if (!groups[key]) groups[key] = { label, routes: [] as any } as any;
      (groups[key].routes as any).push(r);
    }
    return Object.values(groups).filter(g => g.routes.length > 1);
  }, [countries]);
  return (
    <div style={{ position: 'absolute', left: 12, bottom: 150, pointerEvents: 'auto' }}>
      {!open ? (
        <button className="btn" onClick={() => setOpen(true)} style={{ padding: '6px 8px' }} aria-label="Open map overlays">Overlays</button>
      ) : (
        <div className="panel glass" style={{ padding: 8, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Map Overlays</div>
            <button className="btn" onClick={() => setOpen(false)} style={{ padding: '2px 8px' }}>Close</button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input type="checkbox" checked={overlays.hospitals} onChange={() => toggle('hospitals')} /> Hospitals
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input type="checkbox" checked={overlays.flows} onChange={() => toggle('flows')} /> Commute Flows
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input type="checkbox" checked={overlays.bubbles} onChange={() => toggle('bubbles')} /> Resource Bubbles
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input type="checkbox" checked={overlays.policy} onChange={() => toggle('policy')} /> Policy Heat
          </label>

          <div style={{ marginTop: 8, borderTop: '1px solid #1f2937', paddingTop: 8 }}>
            <button className="btn" onClick={() => setShowRoutes(!showRoutes)} style={{ width: '100%' }}>{showRoutes ? 'Hide Route Weights' : 'Route Weights'}</button>
            {showRoutes && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {grouped.map((g, idx) => (
                  <div key={idx} style={{ background: 'rgba(11,18,32,0.6)', padding: 6, borderRadius: 8, border: '1px solid #1f2937' }}>
                    <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 4 }}>{g.label}</div>
                    {g.routes.map((r) => {
                      const defaultW = r.weight ?? 1;
                      const w = weights[r.id] ?? defaultW;
                      return (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 120, fontSize: 12, color: '#94a3b8' }}>{r.name}</div>
                          <input type="range" min={0} max={2} step={0.05} value={w}
                            onChange={(e) => setWeight(r.id, Number(e.target.value))}
                            style={{ flex: 1 }} />
                          <div className="badge" style={{ minWidth: 40, textAlign: 'center' }}>{w.toFixed(2)}</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <button className="btn" onClick={resetWeights}>Reset Weights</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
