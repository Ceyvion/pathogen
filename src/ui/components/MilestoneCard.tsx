import React from 'react';
import { useGameStore } from '../../state/store';
import { Award } from 'lucide-react';

export function MilestoneCard() {
  const pauseReason = useGameStore((s) => s.pauseReason);
  const setPaused = useGameStore((s) => s.actions.setPaused);
  const paused = useGameStore((s) => s.paused);

  // Only show when game is paused with a reason that looks like a milestone
  if (!paused || !pauseReason) return null;

  // Parse milestone info from pauseReason format: "milestone:title|narrative"
  const match = pauseReason.match(/^milestone:(.+?)\|(.+)$/);
  if (!match) return null;

  const title = match[1];
  const narrative = match[2];

  const handleContinue = () => {
    setPaused(false);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
    }}>
      <div className="panel glass" style={{
        maxWidth: 420,
        padding: '28px 32px',
        textAlign: 'center',
        animation: 'fadeIn 0.3s ease-out',
      }}>
        <Award size={32} color="#f59e0b" style={{ marginBottom: 12 }} />
        <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700 }}>{title}</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', opacity: 0.85, margin: '0 0 20px' }}>
          {narrative}
        </p>
        <button
          className="btn"
          onClick={handleContinue}
          style={{ padding: '8px 28px', fontSize: 14 }}
        >
          Continue
        </button>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Press Space to continue</div>
      </div>
    </div>
  );
}
