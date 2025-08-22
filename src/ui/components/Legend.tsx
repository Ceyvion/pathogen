import React from 'react';

export function Legend() {
  const stops = [
    { label: 'Low', alpha: 0.1 },
    { label: '', alpha: 0.3 },
    { label: '', alpha: 0.5 },
    { label: '', alpha: 0.7 },
    { label: 'High', alpha: 0.9 },
  ];
  return (
    <div style={{ position: 'absolute', left: 12, bottom: 80, pointerEvents: 'auto' }}>
      <div className="panel glass" style={{ padding: 8 }}>
        <div style={{ fontSize: 12, marginBottom: 6 }}>Infections (per capita)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {stops.map((s, i) => (
            <div key={i} title={s.label} style={{ width: 24, height: 10, background: `rgba(255,45,45,${s.alpha})`, borderRadius: 2 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
