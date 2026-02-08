import React from 'react';
import { useGameStore } from '../../state/store';
import { useUiStore } from '../../state/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from '../system/Tooltip';
import type { AiDirectorMood, NexusPhase } from '../../state/types';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function moodColor(mood?: AiDirectorMood | string): string {
  switch (mood) {
    case 'scheming': return '#fbbf24';
    case 'aggressive': return '#ef4444';
    case 'desperate': return '#a855f7';
    case 'triumphant': return '#22c55e';
    default: return '#94a3b8';
  }
}

function phaseColor(phase?: NexusPhase | string): string {
  switch (phase) {
    case 'probing': return '#60a5fa';
    case 'adapting': return '#fbbf24';
    case 'aggressive': return '#f97316';
    case 'endgame': return '#ef4444';
    default: return '#64748b';
  }
}

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
  const pathogenType = useGameStore((s) => s.pathogenType);
  const mutationDebt = useGameStore((s) => s.mutationDebt);
  const antibioticResistance = useGameStore((s) => s.antibioticResistance);
  const fungusBurstDaysLeft = useGameStore((s) => s.fungusBurstDaysLeft);
  const bioweaponVolatility = useGameStore((s) => s.bioweaponVolatility);
  const cordonDaysLeft = useGameStore((s) => s.cordonDaysLeft);
  const dna = useGameStore((s) => s.dna);
  const upgrades = useGameStore((s) => s.upgrades);
  const aiDirector = useGameStore((s) => s.aiDirector);
  const day = useGameStore((s) => Math.floor(s.day));
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
  const deployCordon = useGameStore((s) => s.actions.deployCordon);

  const pathogenLabel = pathogenType[0].toUpperCase() + pathogenType.slice(1);
  const subsystem = React.useMemo(() => {
    if (pathogenType === 'virus') {
      const v = Math.max(0, Math.min(100, mutationDebt));
      const color = v >= 80 ? '#f87171' : v >= 50 ? '#fbbf24' : '#34d399';
      return { label: 'Mutation debt', valueLabel: `${v.toFixed(0)}/100`, frac: v / 100, color };
    }
    if (pathogenType === 'bacteria') {
      const v = Math.max(0, Math.min(1, antibioticResistance)) * 100;
      const color = v >= 70 ? '#f87171' : v >= 40 ? '#fbbf24' : '#34d399';
      return { label: 'Antibiotic resistance', valueLabel: `${v.toFixed(0)}%`, frac: v / 100, color };
    }
    if (pathogenType === 'fungus') {
      const v = Math.max(0, Math.min(6, Math.floor(fungusBurstDaysLeft)));
      const on = v > 0;
      return { label: 'Spore burst', valueLabel: on ? `${v}d left` : 'dormant', frac: on ? v / 6 : 0, color: on ? '#34d399' : '#64748b' };
    }
    // bioweapon
    const v = Math.max(0, Math.min(1, bioweaponVolatility)) * 100;
    const color = v >= 70 ? '#f87171' : v >= 40 ? '#fbbf24' : '#e5e7eb';
    return { label: 'Volatility', valueLabel: `${v.toFixed(0)}%`, frac: v / 100, color };
  }, [pathogenType, mutationDebt, antibioticResistance, fungusBurstDaysLeft, bioweaponVolatility]);

  const cordonCfg = React.useMemo(() => {
    let cost = 6;
    let days = 4;
    for (const u of Object.values(upgrades)) {
      if (!u.purchased) continue;
      const e: any = u.effects;
      if (typeof e.cordonCostDelta === 'number') cost += e.cordonCostDelta;
      if (typeof e.cordonDaysAdd === 'number') days += e.cordonDaysAdd;
    }
    cost = Math.max(1, Math.round(cost));
    days = Math.max(1, Math.min(10, Math.round(days)));
    return { cost, days };
  }, [upgrades]);

  const iRate = totals.I / Math.max(1, totals.N);
  const hRate = totals.H / Math.max(1, totals.N);

  const content = (
    <div className="col">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Intel</strong>
        <span className="muted">{pathogenLabel} · {mode === 'architect' ? 'Architect' : 'Controller'}</span>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <Ring value={iRate} color="#ef4444" label={`${(iRate*100).toFixed(1)}%`} />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Global Infected</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Ring value={hRate * 6} color="#60a5fa" label={`${(hRate*100).toFixed(2)}%`} />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Hospitalized</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 4, columnGap: 8 }}>
        <Tooltip label="People not yet exposed to the pathogen">
          <div style={{ cursor: 'help' }}>Susceptible</div>
        </Tooltip>
        <div style={{ textAlign: 'right' }}>{formatNumber(totals.S)}</div>

        <Tooltip label="Exposed but not yet infectious (incubating)">
          <div style={{ cursor: 'help', color: 'var(--e)' }}>Exposed</div>
        </Tooltip>
        <div style={{ textAlign: 'right', color: 'var(--e)' }}>{formatNumber(totals.E)}</div>

        <Tooltip label="Currently infectious and spreading the pathogen">
          <div style={{ cursor: 'help', color: 'var(--i)' }}>Infected</div>
        </Tooltip>
        <div style={{ textAlign: 'right', color: 'var(--i)' }}>{formatNumber(totals.I)}</div>

        <Tooltip label="Recovered and immune (for now)">
          <div style={{ cursor: 'help' }}>Recovered</div>
        </Tooltip>
        <div style={{ textAlign: 'right' }}>{formatNumber(totals.R)}</div>

        <Tooltip label="Fatalities from the pathogen">
          <div style={{ cursor: 'help' }}>Deaths</div>
        </Tooltip>
        <div style={{ textAlign: 'right' }}>{formatNumber(totals.D)}</div>
      </div>
      <div style={{ marginTop: 6 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">{subsystem.label}</span>
          <span style={{ fontSize: 12, color: subsystem.color }}>{subsystem.valueLabel}</span>
        </div>
        <div className="progress-track" style={{ height: 6, marginTop: 4 }}>
          <div className="progress-fill" style={{ width: `${Math.floor(subsystem.frac * 100)}%`, background: subsystem.color, boxShadow: 'none' }} />
        </div>
      </div>

      {/* NEXUS AI Director Status */}
      {aiDirector?.enabled && (
        <div style={{ marginTop: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12, letterSpacing: 1 }}>NEXUS</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {aiDirector.phase && aiDirector.phase !== 'dormant' && (
                <span className="badge" style={{
                  background: phaseColor(aiDirector.phase),
                  color: '#000',
                  fontSize: 9,
                  padding: '1px 5px',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  {aiDirector.phase}
                </span>
              )}
              <span className="badge" style={{
                background: moodColor(aiDirector.mood),
                color: '#000',
                fontSize: 10,
                padding: '2px 6px',
              }}>
                {(aiDirector.mood ?? 'calm').toUpperCase()}
              </span>
            </div>
          </div>

          {/* NEXUS Taunt */}
          {aiDirector.taunt && (
            <div style={{
              marginTop: 6,
              padding: '6px 8px',
              background: 'rgba(239, 68, 68, 0.08)',
              borderLeft: `2px solid ${moodColor(aiDirector.mood)}`,
              borderRadius: 4,
              fontSize: 11,
              color: moodColor(aiDirector.mood),
              fontWeight: 500,
            }}>
              &ldquo;{aiDirector.taunt}&rdquo;
            </div>
          )}
          {!aiDirector.taunt && aiDirector.moodNote && (
            <div style={{
              marginTop: 4,
              fontSize: 11,
              fontStyle: 'italic',
              color: 'var(--warn)',
              opacity: 0.9,
            }}>
              &ldquo;{aiDirector.moodNote}&rdquo;
            </div>
          )}

          {/* Intercepted Transmission */}
          {aiDirector.internalMonologue && (
            <div style={{
              marginTop: 4,
              fontSize: 10,
              color: '#64748b',
              fontFamily: 'monospace',
            }}>
              <span style={{ color: '#475569', fontWeight: 600 }}>[INTERCEPTED]</span> {aiDirector.internalMonologue}
            </div>
          )}

          {aiDirector.strategicFocus && (
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              Targeting: {aiDirector.strategicFocus}
            </div>
          )}

          {/* Active NEXUS Effects */}
          {(aiDirector.activeEffects?.length ?? 0) > 0 && (
            <div style={{ marginTop: 4 }}>
              {aiDirector.activeEffects!.filter(e => e.endDay === -1 || day < e.endDay).map((e) => {
                const remaining = e.endDay === -1 ? 'permanent' : `${Math.max(0, e.endDay - day)}d`;
                return (
                  <div key={e.id} style={{ fontSize: 10, color: '#ef4444', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{e.label}</span>
                    <span style={{ color: '#94a3b8' }}>{remaining}</span>
                  </div>
                );
              })}
            </div>
          )}

          <Tooltip label="How threatened NEXUS feels by your progress">
            <div>
              <div className="progress-track" style={{ height: 4, marginTop: 6, cursor: 'help' }}>
                <div className="progress-fill" style={{
                  width: `${Math.floor((aiDirector.playerThreatLevel ?? 0) * 100)}%`,
                  background: 'var(--warn)',
                  boxShadow: 'none',
                }} />
              </div>
              <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                Threat assessment: {Math.round((aiDirector.playerThreatLevel ?? 0) * 100)}%
              </div>
            </div>
          </Tooltip>
        </div>
      )}

      <hr style={{ borderColor: 'var(--border)', width: '100%' }} />
      <strong>Selected</strong>
      {sel ? (
        <div className="col">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>{sel.name}</span>
            <span className="muted">Pop {sel.pop.toLocaleString()}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--i)' }}>Infected</span><span style={{ color: 'var(--i)' }}>{formatNumber(sel.I)}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ color: '#60a5fa' }}>Hospitalized</span><span style={{ color: '#60a5fa' }}>{formatNumber(sel.H)}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Deaths</span><span>{formatNumber(sel.D)}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label htmlFor="policy2">Policy</label>
            {mode === 'controller' ? (
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
            ) : (
              <span className="badge">{sel.policy}</span>
            )}
          </div>
          {mode === 'controller' && pathogenType === 'bioweapon' && (
            <div className="col" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Containment cordon</span>
                {(cordonDaysLeft[sel.id] || 0) > 0 ? (
                  <span className="badge">Active: {cordonDaysLeft[sel.id]}d</span>
                ) : (
                  <button
                    className="btn"
                    disabled={dna < cordonCfg.cost}
                    onClick={() => deployCordon(sel.id)}
                    title="Cuts mobility to/from this borough for a few days"
                  >
                    Deploy ({cordonCfg.cost} Ops)
                  </button>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Tip: Cordons cut travel to/from this borough for ~{cordonCfg.days} days. Use them to keep volatility spikes local.
              </div>
            </div>
          )}
        </div>
      ) : (
        <span className="muted">None</span>
      )}
      <div className="muted" style={{ fontSize: 12 }}>
        {mode === 'controller'
          ? 'Tip: Click a borough to focus, then adjust policy as needed.'
          : 'Tip: In Architect mode, the city shifts policy automatically as cases rise.'}
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
