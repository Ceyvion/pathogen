import React, { useMemo, useState } from 'react';
import { useGameStore } from '../../state/store';
import { Biohazard, Droplets, Wind, EyeOff, Skull, Shield, ThermometerSnowflake } from 'lucide-react';

export function RightUpgrades() {
  const upgrades = useGameStore((s) => s.upgrades);
  const dna = useGameStore((s) => s.dna);
  const mode = useGameStore((s) => s.mode);
  const purchase = useGameStore((s) => s.actions.purchaseUpgrade);

  const groups = useMemo(() => {
    const map: Record<string, string[]> = { transmission: [], symptoms: [], abilities: [] };
    Object.values(upgrades).forEach((u) => map[u.branch].push(u.id));
    return map;
  }, [upgrades]);

  const iconFor = (id: string) => {
    if (id.startsWith('tx')) return <Wind size={16} />;
    if (id.startsWith('sym')) return <Biohazard size={16} />;
    if (id.startsWith('ab')) return <Shield size={16} />;
    return <Biohazard size={16} />;
  };

  const [open, setOpen] = useState<Record<string, boolean>>({ transmission: true, symptoms: true, abilities: true });

  const toggle = (k: string) => setOpen((s) => ({ ...s, [k]: !s[k] }));

  const branchLabel = (b: string) => {
    if (mode === 'controller') {
      if (b === 'transmission') return 'Measures';
      if (b === 'symptoms') return 'Public & Policy';
      if (b === 'abilities') return 'Research & Ops';
    }
    return b;
  };

  return (
    <div className="panel glass right-panel">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Upgrades</strong>
        <span className="muted">{mode === 'architect' ? 'DNA' : 'Ops'}: {dna.toFixed(1)}</span>
      </div>
      {(['transmission','symptoms','abilities'] as const).map((branch) => (
        <div key={branch} style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => toggle(branch)}>
            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{branchLabel(branch)}</span>
            <span className="muted">{open[branch] ? '−' : '+'}</span>
          </div>
          {open[branch] && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {groups[branch].map((id) => {
                const u = upgrades[id];
                const locked = (u.prereqs && u.prereqs.some((pid) => !upgrades[pid]?.purchased)) || false;
                const canAfford = dna >= u.cost;
                const classState = u.purchased ? 'purchased' : locked ? 'locked' : canAfford ? 'affordable' : 'unaffordable';
                return (
                  <div key={u.id} className={`upgrade-card ${classState}`} title={u.desc || ''}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="upgrade-title">
                        <span className="icon" style={{ display: 'inline-flex' }}>{iconFor(u.id)}</span>
                        <span>{u.name}</span>
                        {u.purchased && <span className="tag" style={{ background: 'var(--ok)' }}>✓</span>}
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="badge">{mode === 'architect' ? 'DNA' : 'Ops'} {u.cost}</span>
                        <button
                          className="btn"
                          disabled={u.purchased || locked || !canAfford}
                          onClick={() => purchase(u.id)}
                        >Buy</button>
                      </div>
                    </div>
                    {u.desc && <div className="muted" style={{ marginTop: 4 }}>{u.desc}</div>}
                    {locked && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Requires: {u.prereqs?.join(', ')}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
