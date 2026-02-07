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
        <div className="muted" style={{ display: 'grid', gap: 6 }}>
          <div>{body}</div>
          <div>
            Tip: start at 1× speed. If it feels overwhelming, set Pacing to <strong>Slow</strong> in the top bar.
          </div>
          <div>
            Intel (stats) is the gauge icon, upgrades are in the rocket icon.
          </div>
        </div>
      </div>
    </div>
  );
}
