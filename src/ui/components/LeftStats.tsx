import React from 'react';
import { useGameStore } from '../../state/store';

export function LeftStats() {
  const selId = useGameStore((s) => s.selectedCountryId);
  const countries = useGameStore((s) => s.countries);
  const dna = useGameStore((s) => s.dna);
  const mode = useGameStore((s) => s.mode);

  const totals = Object.values(countries).reduce(
    (acc, c) => {
      acc.S += c.S; acc.E += c.E; acc.I += c.I; acc.R += c.R; acc.D += c.D; acc.N += c.pop; return acc;
    },
    { S: 0, E: 0, I: 0, R: 0, D: 0, N: 0 }
  );
  const sel = selId ? countries[selId] : null;
  const setPolicy = useGameStore((s) => s.actions.setPolicy);

  return (
    <div className="panel glass left-panel">
      <div className="col">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Global</strong>
          <span className="muted">{mode === 'architect' ? 'DNA' : 'Ops'}: {dna.toFixed(1)}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>S</span><span>{totals.S.toFixed(0)}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>E</span><span>{totals.E.toFixed(0)}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>I</span><span style={{ color: 'var(--i)' }}>{totals.I.toFixed(0)}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>R</span><span>{totals.R.toFixed(0)}</span>
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
              <label htmlFor="policy">Policy</label>
              <select
                id="policy"
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
      </div>
    </div>
  );
}
