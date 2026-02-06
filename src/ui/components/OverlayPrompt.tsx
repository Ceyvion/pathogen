import React from 'react';
import { useGameStore } from '../../state/store';

export function OverlayPrompt() {
  const awaiting = useGameStore((s) => s.awaitingPatientZero);
  const mode = useGameStore((s) => s.mode);
  if (!awaiting) return null;
  const title = mode === 'controller' ? 'Select Your Focus' : 'Select Patient Zero';
  const body = mode === 'controller'
    ? 'Click a borough to begin the outbreak and set your initial response focus. The clock starts after you choose.'
    : 'Click a borough on the map to begin the outbreak.';
  return (
    <div className="overlay-prompt" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div className="panel glass" style={{ pointerEvents: 'auto', padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
        <div className="muted">{body}</div>
      </div>
    </div>
  );
}
