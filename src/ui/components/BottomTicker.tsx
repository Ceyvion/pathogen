import React from 'react';
import { useGameStore } from '../../state/store';
import { ShieldCheck, Biohazard, Beaker, Activity, Hospital, AlertTriangle, Trophy, Zap } from 'lucide-react';

function categorize(e: string): { icon: JSX.Element; label: string } {
  const t = e.toLowerCase();
  if (t.startsWith('victory')) return { icon: <Trophy size={14} color="#fbbf24" />, label: 'Victory' };
  if (t.includes('patient zero')) return { icon: <Biohazard size={14} color="#ef4444" />, label: 'Outbreak' };
  if (t.startsWith('day ')) return { icon: <Activity size={14} color="#22d3ee" />, label: 'Daily' };
  if (t.includes('seeded')) return { icon: <Zap size={14} color="#a78bfa" />, label: 'Spawn' };
  if (t.includes('hospital')) return { icon: <Hospital size={14} color="#34d399" />, label: 'Hosp' };
  if (t.includes('policy')) return { icon: <ShieldCheck size={14} color="#10b981" />, label: 'Policy' };
  if (t.includes('cure')) return { icon: <Beaker size={14} color="#60a5fa" />, label: 'Cure' };
  if (t.includes('warning') || t.includes('alert')) return { icon: <AlertTriangle size={14} color="#f59e0b" />, label: 'Alert' };
  return { icon: <Activity size={14} color="#94a3b8" />, label: 'Event' };
}

export function BottomTicker() {
  const events = useGameStore((s) => s.events);
  const [open, setOpen] = React.useState(false);
  const latest = events[0];
  return (
    <div className="panel glass bottom-ticker" aria-live="polite">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 22 }}>
          {latest ? (
            <>
              <div className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0b1220', borderColor: '#1f2937' }}>
                {categorize(latest).icon}
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{categorize(latest).label}</span>
              </div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70vw' }}>
                <span style={{ animation: 'tickerFade 0.6s ease' }}>{latest}</span>
              </div>
            </>
          ) : (
            <span className="muted">No events yet</span>
          )}
        </div>
        <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'History'}</button>
      </div>
      {open && (
        <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
          {events.slice(0, 14).map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px dashed #1f2937' }}>
              <div className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0b1220', borderColor: '#1f2937' }}>
                {categorize(e).icon}
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{categorize(e).label}</span>
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>{e}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
