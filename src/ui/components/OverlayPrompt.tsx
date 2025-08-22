import React from 'react';
import { useGameStore } from '../../state/store';

export function OverlayPrompt() {
  const awaiting = useGameStore((s) => s.awaitingPatientZero);
  if (!awaiting) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div className="panel glass" style={{ pointerEvents: 'auto', padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Select Patient Zero</div>
        <div className="muted">Click a borough on the map to begin the outbreak.</div>
      </div>
    </div>
  );
}
