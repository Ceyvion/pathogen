import React from 'react';
import { useGameStore } from '../../state/store';

export function ObjectivesPanel() {
  const story = useGameStore((s) => s.story);
  const cure = useGameStore((s) => s.cureProgress);
  const day = useGameStore((s) => s.day);
  const peakI = useGameStore((s) => s.peakI);
  const countries = useGameStore((s) => s.countries);
  if (!story) return null;
  const infected = Object.values(countries).filter(c => c.I > 0).length;
  return (
    <div className="panel glass objectives-panel" style={{ position: 'absolute', top: 64, left: 308, padding: 10, maxWidth: 360, pointerEvents: 'auto' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{story.title}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {story.objectives.map((o) => {
          const met = o.type==='reach_cure' ? cure >= o.target
            : o.type==='days_survived' ? day >= o.target
            : o.type==='limit_peak_I' ? peakI <= o.target
            : infected >= o.target;
          return (
            <div key={o.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ color: met ? 'var(--ok)' : 'var(--text)' }}>• {o.title}</span>
              <span className="muted">{met ? 'Done' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
