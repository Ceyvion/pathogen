import React from 'react';
import { useUiStore } from '../../state/ui';
import { useGameStore } from '../../state/store';
import { Biohazard, ShieldCheck, Play, BookOpen } from 'lucide-react';
import { STORIES } from '../../story/stories';

export function TitleScreen() {
  const toSetup = useUiStore((s) => s.toSetup);
  const setStory = useUiStore((s) => s.setPendingStory);

  const startMode = (mode: 'architect' | 'controller') => {
    toSetup(mode);
  };

  return (
    <div className="title-screen">
      <div className="title-panel panel">
        <h1>NYC Outbreak</h1>
        <p className="muted">Choose your side and control the fate of the city.</p>
        <div className="mode-grid">
          <button className="mode-card" onClick={() => startMode('architect')}>
            <div className="mode-icon"><Biohazard size={32} /></div>
            <div className="mode-title">Pathogen Architect</div>
            <div className="mode-desc">Evolve your virus, outpace the cure, overwhelm the city.</div>
            <div className="mode-cta"><Play size={16}/> Start</div>
          </button>
          <button className="mode-card" onClick={() => startMode('controller')}>
            <div className="mode-icon"><ShieldCheck size={32} /></div>
            <div className="mode-title">City Response Controller</div>
            <div className="mode-desc">Deploy policies and research to save lives and stabilize NYC.</div>
            <div className="mode-cta"><Play size={16}/> Start</div>
          </button>
        </div>
        <div className="stories">
          <div className="stories-head"><BookOpen size={16}/> Story Mode (beta)</div>
          <div className="stories-grid">
            {STORIES.map((s) => (
              <button key={s.id} className="story-card" onClick={() => toSetup(s.mode, s.id)}>
                <div className="story-title">{s.title}</div>
                <div className="story-mode">{s.mode === 'controller' ? 'Controller' : 'Pathogen'}</div>
                {s.description && <div className="story-desc">{s.description}</div>}
                <div className="mode-cta"><Play size={16}/> Start</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
