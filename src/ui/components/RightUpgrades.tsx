import React, { useMemo, useState } from 'react';
import { useGameStore, EMERGENCY_ACTIONS } from '../../state/store';
import { Biohazard, Droplets, Wind, EyeOff, Skull, Shield, ThermometerSnowflake, Zap, ShieldAlert } from 'lucide-react';

function EmergencyActionsPanel() {
  const dna = useGameStore((s) => s.dna);
  const mode = useGameStore((s) => s.mode);
  const day = useGameStore((s) => Math.floor(s.day));
  const cooldowns = useGameStore((s) => s.emergencyCooldowns);
  const activeEffects = useGameStore((s) => s.activeEmergencyEffects);
  const aiDirector = useGameStore((s) => s.aiDirector);
  const activate = useGameStore((s) => s.actions.activateEmergencyAction);
  const selectedCountryId = useGameStore((s) => s.selectedCountryId);

  const nexusPhase = aiDirector?.phase ?? 'dormant';
  const showCounterNexus = aiDirector?.enabled && (nexusPhase === 'aggressive' || nexusPhase === 'endgame');
  const hasActiveNexusEffect = Boolean(aiDirector?.activeEffects?.some((e) => e.endDay === -1 || day < e.endDay));

  const available = useMemo(() =>
    EMERGENCY_ACTIONS.filter(a => {
      if (a.mode !== mode) return false;
      if (a.category === 'counter_nexus' && !showCounterNexus) return false;
      return true;
    }),
    [mode, showCounterNexus]
  );

  const emergencyActions = available.filter(a => a.category === 'emergency');
  const counterActions = available.filter(a => a.category === 'counter_nexus');

  return (
    <div>
      <div style={{
        padding: '6px 8px',
        background: 'rgba(239, 68, 68, 0.08)',
        borderRadius: 6,
        marginBottom: 8,
        textAlign: 'center',
        fontSize: 11,
        color: '#ef4444',
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        Arsenal Unlocked
      </div>

      {/* Active emergency effects */}
      {activeEffects.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Active</div>
          {activeEffects.map((e, i) => {
            const def = EMERGENCY_ACTIONS.find(a => a.id === e.actionId);
            const remaining = Math.max(0, e.endDay - day);
            return (
              <div key={i} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#22c55e' }}>
                <span>{def?.name ?? e.actionId}</span>
                <span style={{ color: '#94a3b8' }}>{remaining}d left</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Emergency actions */}
      <div style={{ display: 'grid', gap: 6 }}>
        {emergencyActions.map((a) => {
          const cd = cooldowns[a.id] ?? 0;
          const onCooldown = day < cd;
          const canAfford = dna >= a.cost;
          const needsTarget = a.id === 'em_targeted';
          const missingTarget = needsTarget && !selectedCountryId;
          const disabled = onCooldown || !canAfford || missingTarget;
          return (
            <div key={a.id} className={`upgrade-card ${onCooldown ? 'locked' : canAfford ? 'affordable' : 'unaffordable'}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="upgrade-title">
                  <span className="icon" style={{ display: 'inline-flex' }}><Zap size={14} /></span>
                  <span>{a.name}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge">{mode === 'architect' ? 'DNA' : 'Ops'} {a.cost}</span>
                  <button
                    className="btn"
                    disabled={disabled}
                    onClick={() => activate(a.id, needsTarget ? (selectedCountryId ?? undefined) : undefined)}
                  >
                    {onCooldown ? `${cd - day}d` : missingTarget ? 'Select' : 'Deploy'}
                  </button>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{a.desc}</div>
            </div>
          );
        })}
      </div>

      {/* Anti-NEXUS countermeasures */}
      {counterActions.length > 0 && (
        <>
          <div style={{
            marginTop: 10,
            marginBottom: 6,
            fontSize: 11,
            color: '#a855f7',
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}>
            Counter-NEXUS
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
	            {counterActions.map((a) => {
	              const cd = cooldowns[a.id] ?? 0;
	              const onCooldown = day < cd;
	              const canAfford = dna >= a.cost;
	              const noEffect = a.id === 'cn_firewall' && !hasActiveNexusEffect;
	              const disabled = onCooldown || !canAfford || noEffect;
	              return (
	                <div key={a.id} className={`upgrade-card ${onCooldown ? 'locked' : canAfford ? 'affordable' : 'unaffordable'}`}>
	                  <div className="row" style={{ justifyContent: 'space-between' }}>
	                    <div className="upgrade-title">
	                      <span className="icon" style={{ display: 'inline-flex' }}><ShieldAlert size={14} /></span>
	                      <span>{a.name}</span>
	                    </div>
	                    <div className="row" style={{ gap: 6 }}>
	                      <span className="badge">{mode === 'architect' ? 'DNA' : 'Ops'} {a.cost}</span>
	                      <button
	                        className="btn"
	                        disabled={disabled}
	                        onClick={() => activate(a.id)}
	                      >
	                        {onCooldown ? `${cd - day}d` : noEffect ? 'No Effect' : 'Deploy'}
	                      </button>
	                    </div>
	                  </div>
	                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{a.desc}</div>
	                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function RightUpgrades() {
  const upgrades = useGameStore((s) => s.upgrades);
  const dna = useGameStore((s) => s.dna);
  const mode = useGameStore((s) => s.mode);
  const purchase = useGameStore((s) => s.actions.purchaseUpgrade);

  const allPurchased = useMemo(() =>
    Object.values(upgrades).every(u => u.purchased),
    [upgrades]
  );

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
        <strong>{allPurchased ? 'Arsenal' : 'Upgrades'}</strong>
        <span className="muted">{mode === 'architect' ? 'DNA' : 'Ops'}: {dna.toFixed(1)}</span>
      </div>

      {allPurchased && <EmergencyActionsPanel />}

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
                    {locked && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Requires: {u.prereqs?.map(pid => upgrades[pid]?.name ?? pid).join(', ')}</div>}
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
