import React from 'react';
import { useUiStore } from '../../state/ui';
import { Layers3, Hospital, Route, Sparkles, Shield, SlidersHorizontal, Info } from 'lucide-react';

export function OverlayChips() {
  const overlays = useUiStore((s) => s.mapOverlays);
  const toggle = useUiStore((s) => s.toggleOverlay);
  const [openWeights, setOpenWeights] = React.useState(false);
  const [openDock, setOpenDock] = React.useState(false);
  const weights = useUiStore((s) => (s as any).routeWeights as Record<string, number>);
  const setWeight = useUiStore((s) => (s as any).setRouteWeight as (id: string, w: number) => void);
  const resetWeights = useUiStore((s) => (s as any).resetRouteWeights as () => void);
  const [showLegend, setShowLegend] = React.useState(false);
  const activeCount = Number(Boolean(overlays.hospitals)) + Number(Boolean(overlays.flows)) + Number(Boolean(overlays.bubbles)) + Number(Boolean(overlays.policy));

  return (
    <div
      className="overlay-chips"
      // Keep these off the ticker so headlines stay readable.
      onMouseEnter={() => useUiStore.getState().setHudHovering(true as any)}
      onMouseLeave={() => useUiStore.getState().setHudHovering(false as any)}
    >
      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          className={`chip overlay-dock-btn ${openDock ? 'active' : ''}`}
          title="Map overlays"
          onClick={() => { setOpenDock((v) => !v); setOpenWeights(false); setShowLegend(false); }}
          aria-expanded={openDock}
          aria-label={`Overlays (${activeCount} enabled)`}
        >
          <Layers3 size={14} /> Overlays
          <span aria-hidden className="badge" style={{ marginLeft: 6, background: '#0b1220', borderColor: '#1f2937' }}>{activeCount}</span>
        </button>
      </div>

      {openDock && (
        <div className="panel glass overlay-dock-panel" style={{ padding: 8, width: 260 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button className={`chip ${overlays.hospitals ? 'active' : ''}`} title="Hospitals" onClick={() => toggle('hospitals')}><Hospital size={14} /> Hospitals</button>
            <button className={`chip ${overlays.flows ? 'active' : ''}`} title="Commute flows" onClick={() => toggle('flows')}><Route size={14} /> Flows</button>
            <button className={`chip ${overlays.bubbles ? 'active' : ''}`} title="Resource bubbles" onClick={() => toggle('bubbles')}><Sparkles size={14} /> Bubbles</button>
            <button className={`chip ${overlays.policy ? 'active' : ''}`} title="Policy heat" onClick={() => toggle('policy')}><Shield size={14} /> Policy</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="chip" title="Legend" onClick={() => setShowLegend((v) => !v)}><Info size={14} /> Legend</button>
            <button className="chip" title="Route weights" onClick={() => setOpenWeights((v) => !v)}><SlidersHorizontal size={14} /> Routes</button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Tip: keep only what you need on. Flows and bubbles add the most visual noise.
          </div>
        </div>
      )}
      {showLegend && (
        <div className="panel glass" style={{ padding: 8, width: 240 }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>Infections (per capita)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[0.1,0.3,0.5,0.7,0.9].map((a,i) => (
              <div key={i} style={{ width: 24, height: 10, background: `rgba(255,45,45,${a})`, borderRadius: 2 }} />
            ))}
          </div>
        </div>
      )}
      {openWeights && (
        <div className="panel glass" style={{ padding: 8, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Route Weights</div>
            <button className="btn" onClick={() => setOpenWeights(false)} style={{ padding: '2px 8px' }}>Close</button>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>Adjust individual bridge/route weights in the Overlays panel (advanced). Use the existing panel for detailed control.</div>
          <div style={{ marginTop: 6 }}>
            <button className="btn" onClick={resetWeights}>Reset Weights</button>
          </div>
        </div>
      )}
    </div>
  );
}
