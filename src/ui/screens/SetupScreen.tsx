import React from 'react';
import { useUiStore } from '../../state/ui';
import { useGameStore } from '../../state/store';
import type { Country } from '../../state/types';
import { ArrowLeft, SunMoon } from 'lucide-react';

const PATHOGENS = [
  { id: 'virus', name: 'Virus', desc: 'Rapid mutation. Unpredictable. What evolves fast can spiral out of control.' },
  { id: 'bacteria', name: 'Bacteria', desc: 'Resilient. Persistent. Antibiotics will fail when you need them most.' },
  { id: 'fungus', name: 'Fungus', desc: 'It waits. It erupts in waves. When conditions align, containment collapses.' },
  { id: 'bioweapon', name: 'Bioweapon', desc: 'Engineered lethality. Every hour without containment is another body count.' },
] as const;

const GENES = [
  { id: 'atp_boost', name: 'ATP Boost', desc: '+10 DNA/Ops at start', category: 'dna' },
  { id: 'efficient_bureaucracy', name: 'Efficient Bureaucracy', desc: '+0.5% cure progress at start (Controller)', category: 'ops' },
  { id: 'urban_adaptation', name: 'Urban Adaptation', desc: '+5% transmission (Architect)', category: 'env' },
] as const;

export function SetupScreen() {
  const { setup, setSetup, pendingMode, pendingStoryId, toGame } = useUiStore();
  const start = useGameStore((s) => s.actions.startNewGame);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toTitle = useUiStore((s) => s.toTitle);

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
    opts.pathogenType = setup.pathogenType;
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
    <div className="title-screen setup-screen">
      <div className="title-panel panel glass setup-panel">
        <div className="setup-top">
          <button className="btn" onClick={toTitle} title="Back to mode select"><ArrowLeft size={16} /> Back</button>
          <div className="setup-top-right">
            <button className="btn" onClick={toggleTheme} title="Toggle light/dark theme">
              <SunMoon size={16} /> Theme: {theme === 'light' ? 'Light' : 'Dark'}
            </button>
            <button className="btn" onClick={begin}>Begin</button>
          </div>
        </div>

        <div className="setup-head">
          <h2>Mission Brief</h2>
          <div className="setup-sub">
            {campaignKey === 'architect_free' && 'Pathogen Architect: free play'}
            {campaignKey === 'controller_free' && 'City Response Controller: free play'}
            {campaignKey === 'architect_patient_zero' && 'Story: Patient Zero — seed and spread stealthily'}
            {campaignKey === 'controller_prologue' && 'Story: First Wave — stabilize hospitals and push the cure'}
          </div>
        </div>

        <div className="setup-grid">
          <div className="setup-col">
            <div className="setup-block">
              <div className="setup-kicker">Difficulty</div>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                {(['casual','normal','brutal'] as const).map(d => (
                  <button key={d} type="button" onClick={() => setSetup({ difficulty: d })}
                    className={`chip ${setup.difficulty===d?'active':''}`}
                    aria-pressed={setup.difficulty===d}
                  >{d[0].toUpperCase()+d.slice(1)}</button>
                ))}
              </div>
            </div>

            {!isStory && (
              <div className="setup-block">
                <div className="setup-kicker">Pathogen Type</div>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  {PATHOGENS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip ${setup.pathogenType === p.id ? 'active' : ''}`}
                      onClick={() => setSetup({ pathogenType: p.id as any })}
                      aria-pressed={setup.pathogenType === p.id}
                      title={p.desc}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {PATHOGENS.find((p) => p.id === setup.pathogenType)?.desc}
                </div>
              </div>
            )}

            <div className="setup-block">
              <div className="setup-kicker">How This Run Starts</div>
              <div className="setup-how">
                <div className="setup-step"><span className="badge">1</span> Press <span className="setup-mono">Begin</span></div>
                <div className="setup-step"><span className="badge">2</span> Click a borough on the map to place Patient Zero / set focus</div>
                <div className="setup-step"><span className="badge">3</span> Spend {isArchitect ? 'DNA' : 'Ops'} in the Lab and watch the city react</div>
              </div>
            </div>
          </div>

          <div className="setup-col">
            <div className="setup-block">
              <div className="setup-kicker">Genes</div>
              <div className="setup-genes">
                {GENES.filter(g => isArchitect ? g.id !== 'efficient_bureaucracy' : g.id !== 'urban_adaptation')
                  .map(g => (
                  <label key={g.id} className="setup-gene">
                    <input type="checkbox" checked={setup.genes.includes(g.id as any)} onChange={() => toggleGene(g.id)} />
                    <div>
                      <div className="setup-gene-name">{g.name}</div>
                      <div className="setup-gene-desc">{g.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Campaign-specific options */}
        {campaignKey === 'architect_free' && (
          <div className="setup-wide">
            <div className="panel glass setup-wide-card">
              <div className="setup-kicker">Start Method</div>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                {(['pick','random','widespread'] as const).map(m => (
                  <button key={m} className={`chip ${setup.seedMode===m?'active':''}`} onClick={() => setSetup({ seedMode: m })}>{m === 'pick' ? 'Pick on Map' : m === 'random' ? 'Random Borough' : 'Widespread (sandbox)'}</button>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="setup-kicker">Initial infections</div>
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
          <div className="setup-wide">
            <div className="panel glass setup-wide-card">
              <div className="setup-kicker">Initial Policy</div>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                {(['open','advisory','restrictions','lockdown'] as Country['policy'][]).map(p => (
                  <button key={p} className={`chip ${setup.initialPolicy===p?'active':''}`} onClick={() => setSetup({ initialPolicy: p })}>{p}</button>
                ))}
              </div>
            </div>
            <div className="panel glass setup-wide-card">
              <div className="setup-kicker">Starting Ops Points</div>
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
        <div className="muted" style={{ fontSize: 12, marginTop: 14 }}>
          {isArchitect ? 'Tip: Pick on Map to place Patient Zero precisely.' : 'Tip: After you begin, click a borough to start the scenario and set your initial focus.'}
        </div>
      </div>
    </div>
  );
}
