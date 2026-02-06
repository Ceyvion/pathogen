import React from 'react';
import { useGameStore } from '../../state/store';
import { selectISL } from '../../state/selectors';

export function ISLPanel() {
  const st = useGameStore((s) => s);
  const { infectivity, severity, lethality } = selectISL(st as any);
  const Bar = ({ label, value, grad }: { label: string; value: number; grad: string }) => (
    <div className="row" style={{ alignItems: 'center', gap: 8 }}>
      <span className="muted" style={{ fontSize: 12, width: 72 }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'rgba(15,23,42,0.6)', borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(51,65,85,0.6)' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, value)).toFixed(1)}%`, height: '100%', background: grad, boxShadow: '0 0 8px rgba(0,0,0,0.25)' }} />
      </div>
      <span className="badge" style={{ minWidth: 48, textAlign: 'center' }}>{value.toFixed(0)}%</span>
    </div>
  );
  return (
    <div className="panel glass isl-panel" style={{ position: 'absolute', top: 64, left: 308, padding: 10, maxWidth: 360, pointerEvents: 'auto' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Pathogen Profile</div>
      <div className="col" style={{ gap: 8 }}>
        <Bar label="Infectivity" value={infectivity} grad="linear-gradient(90deg,#22c55e,#16a34a)" />
        <Bar label="Severity" value={severity} grad="linear-gradient(90deg,#f59e0b,#d97706)" />
        <Bar label="Lethality" value={lethality} grad="linear-gradient(90deg,#ef4444,#b91c1c)" />
      </div>
    </div>
  );
}
