import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../state/store';
import splashImg from '../../assets/patient-zero-splash.jpg';

export function StorySplash() {
  const awaiting = useGameStore((s) => s.awaitingPatientZero);
  const storyId = useGameStore((s) => s.story?.id);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (awaiting) setVisible(true);
  }, [awaiting]);

  if (!awaiting || storyId !== 'architect_patient_zero' || !visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Patient Zero Story Loading"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10000,
        display: 'grid',
        placeItems: 'center',
        backgroundColor: '#000',
      }}
      onClick={() => setVisible(false)}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${splashImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.9,
        }}
      />
      <div
        className="panel glass"
        style={{
          position: 'relative',
          padding: 14,
          maxWidth: 520,
          textAlign: 'center',
          background: 'rgba(15,23,42,0.72)',
          border: '1px solid rgba(148,163,184,0.25)',
        }}
      >
        <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>Patient Zero</div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Story intro. Click to continue.
        </div>
        <button
          className="btn"
          autoFocus
          onClick={(e) => { e.stopPropagation(); setVisible(false); }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
