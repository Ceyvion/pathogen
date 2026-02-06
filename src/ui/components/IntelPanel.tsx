import React from 'react';
import { useGameStore } from '../../state/store';
import { useUiStore } from '../../state/ui';
import { motion, AnimatePresence } from 'framer-motion';

function Ring({ value, color = '#ef4444', size = 64, stroke = 8, label }: { value: number; color?: string; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  const dash = c * clamped;
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={r} stroke="#1f2937" strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={`${dash} ${c-dash}`} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
      {label && <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="12" fill="#cbd5e1">{label}</text>}
    </svg>
  );
}

export function IntelPanel() {
  const selId = useGameStore((s) => s.selectedCountryId);
  const countries = useGameStore((s) => s.countries);
  const mode = useGameStore((s) => s.mode);
  const hudCompact = useUiStore((s) => (s as any).hudCompact as boolean);
  const [expanded, setExpanded] = React.useState(!hudCompact);
  React.useEffect(() => { setExpanded(!hudCompact); }, [hudCompact]);

  const totals = Object.values(countries).reduce(
    (acc, c) => {
      acc.S += c.S; acc.E += c.E; acc.I += c.I; acc.R += c.R; acc.D += c.D; acc.H += c.H; acc.N += c.pop; return acc;
    },
    { S: 0, E: 0, I: 0, R: 0, D: 0, H: 0, N: 0 }
  );
  const sel = selId ? countries[selId] : null;
  const setPolicy = useGameStore((s) => s.actions.setPolicy);

  const iRate = totals.I / Math.max(1, totals.N);
  const hRate = totals.H / Math.max(1, totals.N);

  const content = (
    <div className="col">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Intel</strong>
        <span className="muted">{mode === 'architect' ? 'Pathogen' : 'Controller'}</span>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <Ring value={iRate} color="#ef4444" label={`${(iRate*100).toFixed(2)}% I`} />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Global Infected</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Ring value={hRate * 6} color="#60a5fa" label={`${(hRate*100).toFixed(2)}% H`} />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Hospitalized</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 4, columnGap: 8 }}>
        <div>S</div><div style={{ textAlign: 'right' }}>{totals.S.toFixed(0)}</div>
        <div>E</div><div style={{ textAlign: 'right' }}>{totals.E.toFixed(0)}</div>
        <div style={{ color: 'var(--i)' }}>I</div><div style={{ textAlign: 'right', color: 'var(--i)' }}>{totals.I.toFixed(0)}</div>
        <div>R</div><div style={{ textAlign: 'right' }}>{totals.R.toFixed(0)}</div>
        <div>D</div><div style={{ textAlign: 'right' }}>{totals.D.toFixed(0)}</div>
      </div>
      <hr style={{ borderColor: 'var(--border)', width: '100%' }} />
      <strong>Selected</strong>
      {sel ? (
        <div className="col">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>{sel.name}</span>
            <span className="muted">Pop {sel.pop.toLocaleString()}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>I</span><span style={{ color: 'var(--i)' }}>{sel.I.toFixed(0)}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label htmlFor="policy2">Policy</label>
            <select
              id="policy2"
              value={sel.policy}
              onChange={(e) => setPolicy(sel.id, e.target.value as any)}
              style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px' }}
            >
              <option value="open">Open</option>
              <option value="advisory">Advisory</option>
              <option value="restrictions">Restrictions</option>
              <option value="lockdown">Lockdown</option>
            </select>
          </div>
        </div>
      ) : (
        <span className="muted">None</span>
      )}
      <div className="muted" style={{ fontSize: 12 }}>
        Tip: Click a borough to focus, then adjust policy as needed.
      </div>
    </div>
  );

  const setHudHovering = useUiStore((s) => (s as any).setHudHovering as (v: boolean) => void);

  return (
    <AnimatePresence>
      <motion.div
        className="panel glass left-panel"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        onMouseEnter={() => { if (hudCompact) setExpanded(true); setHudHovering(true); }}
        onMouseLeave={() => { if (hudCompact) setExpanded(false); setHudHovering(false); }}
        style={hudCompact ? { padding: 0, overflow: 'hidden', width: expanded ? 280 : 24, transition: 'width 200ms ease', display: 'flex' } : undefined}
      >
        {hudCompact ? (
          expanded ? (
            <div style={{ padding: 12, width: 280 }}>{content}</div>
          ) : (
            <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: 6, fontSize: 11, letterSpacing: 1, color: '#94a3b8' }}>Intel</div>
          )
        ) : (
          content
        )}
      </motion.div>
    </AnimatePresence>
  );
}
