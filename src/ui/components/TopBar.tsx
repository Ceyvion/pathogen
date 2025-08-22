import React, { useEffect } from 'react';
import { useGameStore } from '../../state/store';
import { useUiStore } from '../../state/ui';
import { Wrench, PanelLeft, PanelRight } from 'lucide-react';

export function TopBar() {
  const speed = useGameStore((s) => s.speed);
  const paused = useGameStore((s) => s.paused);
  const day = useGameStore((s) => Math.floor(s.t / s.msPerDay));
  const mode = useGameStore((s) => s.mode);
  const cure = useGameStore((s) => s.cureProgress);
  const actions = useGameStore((s) => s.actions);
  const pacing = useGameStore((s) => (s as any).pacing as 'slow'|'normal'|'fast');
  const toggleStats = useUiStore((s) => s.toggleStats);
  const toggleUpgrades = useUiStore((s) => s.toggleUpgrades);
  const toTitle = useUiStore((s) => s.toTitle);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); actions.togglePause(); }
      if (e.key === '1') actions.setSpeed(1);
      if (e.key === '2') actions.setSpeed(3);
      if (e.key === '3') actions.setSpeed(10);
      if (e.key.toLowerCase() === 'h') toggleHC();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  const setTheme = (theme: 'dark'|'light'|'hc') => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  };
  const toggleHC = () => {
    const cur = document.documentElement.getAttribute('data-theme') as 'dark'|'light'|'hc'|null;
    setTheme(cur === 'hc' ? 'dark' : 'hc');
  };
  useEffect(() => {
    const saved = (localStorage.getItem('theme') as 'dark'|'light'|'hc'|null);
    if (saved) setTheme(saved);
  }, []);

  return (
    <div className="panel glass topbar" aria-label="top bar controls">
      <span className="badge">Day {day}</span>
      <span className="badge">Mode: {mode === 'architect' ? 'Pathogen' : 'Controller'}</span>
      <div className="row" style={{ gap: 6, alignItems: 'center', minWidth: 200 }} title="Cure progress">
        <span className="muted" style={{ fontSize: 12 }}>Cure</span>
        <div style={{ flex: 1, height: 8, background: '#0f172a', borderRadius: 999, overflow: 'hidden', border: '1px solid #1f2937' }}>
          <div style={{ width: `${Math.min(100, cure).toFixed(1)}%`, height: '100%', background: 'linear-gradient(90deg,#06b6d4,#3b82f6)', boxShadow: '0 0 6px #06b6d4' }} />
        </div>
        <span className="badge" style={{ minWidth: 54, textAlign: 'center' }}>{cure.toFixed(1)}%</span>
      </div>
      <div className="row" role="group" aria-label="speed controls">
        <button className={`btn ${!paused && speed === 1 ? 'active' : ''}`} onClick={() => actions.setSpeed(1)}>1×</button>
        <button className={`btn ${!paused && speed === 3 ? 'active' : ''}`} onClick={() => actions.setSpeed(3)}>3×</button>
        <button className={`btn ${!paused && speed === 10 ? 'active' : ''}`} onClick={() => actions.setSpeed(10)}>10×</button>
        <button className="btn" onClick={actions.togglePause}>{paused ? 'Resume' : 'Pause'}</button>
      </div>
      <div className="row" role="group" aria-label="pacing controls">
        <span className="muted" style={{ marginLeft: 8, marginRight: 4 }}>Pacing:</span>
        <button className={`btn ${pacing === 'slow' ? 'active' : ''}`} onClick={() => actions.setPacing('slow')}>Slow</button>
        <button className={`btn ${pacing === 'normal' ? 'active' : ''}`} onClick={() => actions.setPacing('normal')}>Normal</button>
        <button className={`btn ${pacing === 'fast' ? 'active' : ''}`} onClick={() => actions.setPacing('fast')}>Fast</button>
      </div>
      <div className="row" style={{ marginLeft: 'auto' }}>
        <button className="btn" title="Toggle Stats Panel" onClick={toggleStats}><PanelLeft size={16} /> Stats</button>
        <button className="btn" title="Toggle Upgrades Panel" onClick={toggleUpgrades}><PanelRight size={16} /> Upgrades</button>
        <button className="btn" title="Reset map view" onClick={() => (window as any).resetNYCView?.()}>Reset View</button>
        <button className="btn" onClick={actions.saveGame}>Save</button>
        <button className="btn" onClick={actions.loadGame}>Load</button>
        <button className="btn" title="Seed infections (demo)" onClick={() => actions.seedInfection('all')}>Seed I</button>
        <button className="btn" onClick={toggleHC}><Wrench size={16} /> Theme</button>
        <button className="btn" onClick={toTitle}>Menu</button>
      </div>
    </div>
  );
}
