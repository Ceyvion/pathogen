import React from 'react';
import { useUiStore } from '../../state/ui';
import { useGameStore } from '../../state/store';
import type { Country } from '../../state/types';

const GENES = [
  { id: 'atp_boost', name: 'ATP Boost', desc: '+10 DNA/Ops at start', category: 'dna' },
  { id: 'efficient_bureaucracy', name: 'Efficient Bureaucracy', desc: '+0.5% cure progress at start (Controller)', category: 'ops' },
  { id: 'urban_adaptation', name: 'Urban Adaptation', desc: '+5% transmission (Architect)', category: 'env' },
] as const;

export function SetupScreen() {
  const { setup, setSetup, pendingMode, pendingStoryId, toGame } = useUiStore();
  const start = useGameStore((s) => s.actions.startNewGame);

  const toggleGene = (id: any) => {
    const has = setup.genes.includes(id);
    setSetup({ genes: has ? (setup.genes.filter((g) => g !== id) as any) : ([...setup.genes, id] as any) });
  };

  const isStory = Boolean(pendingStoryId);
  const campaignKey = pendingStoryId || (pendingMode === 'architect' ? 'architect_free' : 'controller_free');
  const isArchitect = pendingMode === 'architect';

  const begin = () => {
    if (!pendingMode) return;
    const opts: any = { difficulty: setup.difficulty, genes: setup.genes as any, storyId: pendingStoryId };
    if (pendingMode === 'architect') {
      opts.seedMode = setup.seedMode;
      opts.seedAmount = setup.seedAmount;
    } else {
      opts.initialPolicy = setup.initialPolicy as Country['policy'];
      opts.startingOps = setup.startingOps;
    }
    start(pendingMode, opts);
    toGame();
  };

  return (
    <div className="title-screen">
      <div className="title-panel panel" style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Setup</h2>
        <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
          {campaignKey === 'architect_free' && 'Pathogen Architect: free play'}
          {campaignKey === 'controller_free' && 'City Response Controller: free play'}
          {campaignKey === 'architect_patient_zero' && 'Story: Patient Zero — seed and spread stealthily'}
          {campaignKey === 'controller_prologue' && 'Story: First Wave — stabilize hospitals and push the cure'}
        </div>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px' }}>
            <div className="muted" style={{ marginBottom: 6 }}>Difficulty</div>
            <div className="row" style={{ gap: 12 }}>
              {(['casual','normal','brutal'] as const).map(d => (
                <button key={d} type="button" onClick={() => setSetup({ difficulty: d })}
                  className={`chip ${setup.difficulty===d?'active':''}`}
                  aria-pressed={setup.difficulty===d}
                >{d[0].toUpperCase()+d.slice(1)}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: '2 1 420px' }}>
            <div className="muted" style={{ marginBottom: 6 }}>Genes</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
              {GENES.filter(g => isArchitect ? g.id !== 'efficient_bureaucracy' : g.id !== 'urban_adaptation')
                .map(g => (
                <label key={g.id} className={`mode-card`} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={setup.genes.includes(g.id as any)} onChange={() => toggleGene(g.id)} />
                  <div>
                    <div className="mode-title" style={{ margin: 0 }}>{g.name}</div>
                    <div className="mode-desc" style={{ margin: 0 }}>{g.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Campaign-specific options */}
        {campaignKey === 'architect_free' && (
          <div className="row" style={{ gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <div className="panel glass" style={{ padding: 12, flex: '2 1 420px' }}>
              <div className="muted" style={{ marginBottom: 6 }}>Start Method</div>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                {(['pick','random','widespread'] as const).map(m => (
                  <button key={m} className={`chip ${setup.seedMode===m?'active':''}`} onClick={() => setSetup({ seedMode: m })}>{m === 'pick' ? 'Pick on Map' : m === 'random' ? 'Random Borough' : 'Widespread (sandbox)'}</button>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Initial infections</div>
                <input type="range" min={2000} max={50000} step={1000} value={setup.seedAmount} onChange={(e) => setSetup({ seedAmount: Number(e.target.value) })} />
                <div className="muted">{setup.seedAmount.toLocaleString()} people</div>
              </div>
            </div>
          </div>
        )}

        {campaignKey === 'architect_patient_zero' && (
          <div className="panel glass" style={{ padding: 12, marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Patient Zero</div>
            <div className="muted">After you begin, click a borough to place Patient Zero. Tune your starting advantage via genes; seeding amount controls how quickly the outbreak ignites.</div>
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ marginBottom: 6 }}>Seeding intensity</div>
              <input type="range" min={3000} max={40000} step={1000} value={setup.seedAmount} onChange={(e) => setSetup({ seedAmount: Number(e.target.value) })} />
              <div className="muted">{setup.seedAmount.toLocaleString()} people</div>
            </div>
          </div>
        )}

        {campaignKey === 'controller_free' && (
          <div className="row" style={{ gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <div className="panel glass" style={{ padding: 12, flex: '1 1 320px' }}>
              <div className="muted" style={{ marginBottom: 6 }}>Initial Policy</div>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                {(['open','advisory','restrictions','lockdown'] as Country['policy'][]).map(p => (
                  <button key={p} className={`chip ${setup.initialPolicy===p?'active':''}`} onClick={() => setSetup({ initialPolicy: p })}>{p}</button>
                ))}
              </div>
            </div>
            <div className="panel glass" style={{ padding: 12, flex: '1 1 320px' }}>
              <div className="muted" style={{ marginBottom: 6 }}>Starting Ops Points</div>
              <input type="range" min={0} max={24} step={1} value={setup.startingOps} onChange={(e) => setSetup({ startingOps: Number(e.target.value) })} />
              <div className="muted">{setup.startingOps} points</div>
            </div>
          </div>
        )}

        {campaignKey === 'controller_prologue' && (
          <div className="panel glass" style={{ padding: 12, marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>First Wave</div>
            <div className="muted">Hospitals are bracing; public is cautious. Choose your starting posture and ops budget. Accumulate research to push the cure while keeping peak I manageable.</div>
            <div className="row" style={{ gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px' }}>
                <div className="muted" style={{ marginBottom: 6 }}>Initial Policy</div>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  {(['advisory','restrictions'] as Country['policy'][]).map(p => (
                    <button key={p} className={`chip ${setup.initialPolicy===p?'active':''}`} onClick={() => setSetup({ initialPolicy: p })}>{p}</button>
                  ))}
                </div>
              </div>
              <div style={{ flex: '1 1 320px' }}>
                <div className="muted" style={{ marginBottom: 6 }}>Starting Ops Points</div>
                <input type="range" min={6} max={20} step={1} value={setup.startingOps} onChange={(e) => setSetup({ startingOps: Number(e.target.value) })} />
                <div className="muted">{setup.startingOps} points</div>
              </div>
            </div>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
          <div className="muted" style={{ fontSize: 12 }}>
            {isArchitect ? 'Tip: Pick on Map to place Patient Zero precisely.' : 'Tip: Early ops in testing/tracing accelerates the cure.'}
          </div>
          <button className="btn" onClick={begin}>Begin</button>
        </div>
      </div>
    </div>
  );
}
