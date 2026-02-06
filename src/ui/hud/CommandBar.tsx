import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../state/store';
import { useUiStore } from '../../state/ui';
import { Tooltip } from '../system/Tooltip';
import { Switch } from '../system/Switch';
import { SeparatorHorizontal, Play, Pause, GaugeCircle, Film, Rocket, RotateCcw, CloudMoon, Palette, Music2, VolumeX, SkipForward, LayoutPanelLeft, Zap } from 'lucide-react';
import * as bgm from '../../audio/bgm';

export function CommandBar() {
  const speed = useGameStore((s) => s.speed);
  const paused = useGameStore((s) => s.paused);
  const day = useGameStore((s) => Math.floor(s.t / s.msPerDay));
  const mode = useGameStore((s) => s.mode);
  const pathogenType = useGameStore((s) => s.pathogenType);
  const cure = useGameStore((s) => s.cureProgress);
  const autoCollect = useGameStore((s) => s.autoCollectBubbles);
  const actions = useGameStore((s) => s.actions);
  const pacing = useGameStore((s) => (s as any).pacing as 'slow'|'normal'|'fast');

  const toggleStats = useUiStore((s) => s.toggleStats);
  const toggleUpgrades = useUiStore((s) => s.toggleUpgrades);
  const showStats = useUiStore((s) => s.showStats);
  const showUpgrades = useUiStore((s) => s.showUpgrades);
  const toTitle = useUiStore((s) => s.toTitle);
  const cinematic = useUiStore((s) => (s as any).cinematic as boolean);
  const setCinematic = useUiStore((s) => (s as any).setCinematic as (v: boolean) => void);
  const setHudHovering = useUiStore((s) => (s as any).setHudHovering as (v: boolean) => void);
  const preset = useUiStore((s) => (s as any).preset as 'default'|'neo'|'emergency');
  const setPreset = useUiStore((s) => (s as any).setPreset as (p: 'default'|'neo'|'emergency') => void);
  const hudCompact = useUiStore((s) => (s as any).hudCompact as boolean);
  const setHudCompact = useUiStore((s) => (s as any).setHudCompact as (v: boolean) => void);

  useEffect(() => {
    // init background music discovery/playback
    bgm.initBgm();
  }, []);

  const [musicEnabled, setMusicEnabled] = React.useState(bgm.isEnabled());
  const [trackName, setTrackName] = React.useState<string | null>(null);
  const [hasMultiple, setHasMultiple] = React.useState(false);
  useEffect(() => {
    const unsub = bgm.subscribe((s) => {
      setMusicEnabled(s.enabled);
      setTrackName(s.trackName);
      setHasMultiple((s.tracks || []).length > 1);
    });
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); actions.togglePause(); }
      if (e.key === '1') actions.setSpeed(1);
      if (e.key === '2') actions.setSpeed(3);
      if (e.key === '3') actions.setSpeed(10);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  return (
    <motion.div className="cmd-bar panel glass" aria-label="command bar"
      onMouseEnter={() => setHudHovering(true)}
      onMouseLeave={() => setHudHovering(false)}
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 26 }}
    >
      <div className="cmd-left">
        <div className="cmd-title">NYC Outbreak</div>
        <div className="cmd-sub">Day {day} · {mode === 'architect' ? 'Pathogen Architect' : 'City Response Controller'} · {pathogenType[0].toUpperCase() + pathogenType.slice(1)}</div>
      </div>
      <div className="cmd-center">
        <div className="progress-wrap" title="Cure progress">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, cure).toFixed(1)}%` }} /></div>
          <div className="progress-label">Cure {cure.toFixed(1)}%</div>
        </div>
        <div className="seg-controls" role="group" aria-label="speed controls">
          <button className={`seg ${!paused && speed === 1 ? 'active' : ''}`} onClick={() => actions.setSpeed(1)}>1×</button>
          <button className={`seg ${!paused && speed === 3 ? 'active' : ''}`} onClick={() => actions.setSpeed(3)}>3×</button>
          <button className={`seg ${!paused && speed === 10 ? 'active' : ''}`} onClick={() => actions.setSpeed(10)}>10×</button>
          <button className={`seg`} onClick={actions.togglePause}>{paused ? <><Play size={14}/> Resume</> : <><Pause size={14}/> Pause</>}</button>
        </div>
        <div className="seg-controls" role="group" aria-label="pacing controls">
          <button className={`seg ${pacing === 'slow' ? 'active' : ''}`} onClick={() => actions.setPacing('slow')}>Slow</button>
          <button className={`seg ${pacing === 'normal' ? 'active' : ''}`} onClick={() => actions.setPacing('normal')}>Normal</button>
          <button className={`seg ${pacing === 'fast' ? 'active' : ''}`} onClick={() => actions.setPacing('fast')}>Fast</button>
        </div>
      </div>
      <div className="cmd-right">
        <Tooltip label={`Theme: ${preset}`}>
          <button className="icon-btn" aria-label="Cycle theme preset" onClick={() => {
            const order: any = { 'default': 'neo', 'neo': 'emergency', 'emergency': 'default' };
            setPreset(order[preset]);
            try { document.documentElement.setAttribute('data-preset', order[preset]); } catch {}
          }}><Palette size={16} /></button>
        </Tooltip>
        <Tooltip label={hudCompact ? 'Expand HUD panels' : 'Compact HUD panels'}>
          <button className="icon-btn" aria-label={hudCompact ? 'Expand HUD panels' : 'Compact HUD panels'} aria-pressed={hudCompact} onClick={() => setHudCompact(!hudCompact)}><LayoutPanelLeft size={16} /></button>
        </Tooltip>
        <Tooltip label={musicEnabled ? (trackName ? `Music: ${trackName}` : 'Music on') : 'Music off'}>
          <button className="icon-btn" aria-label={musicEnabled ? 'Turn music off' : 'Turn music on'} aria-pressed={musicEnabled} onClick={() => bgm.toggleEnabled()}>{musicEnabled ? <Music2 size={16} /> : <VolumeX size={16} />}</button>
        </Tooltip>
        <Tooltip label={hasMultiple ? 'Next track' : 'Next track (no other tracks found)'}>
          <button className="icon-btn" aria-label="Next music track" onClick={() => bgm.nextTrack()} disabled={!hasMultiple}><SkipForward size={16} /></button>
        </Tooltip>
        <Tooltip label="Toggle Stats Panel">
          <button className="icon-btn" aria-label="Toggle stats panel" aria-pressed={showStats} onClick={toggleStats}><GaugeCircle size={16} /></button>
        </Tooltip>
        <Tooltip label="Toggle Upgrades">
          <button className="icon-btn" aria-label="Toggle upgrades panel" aria-expanded={showUpgrades} onClick={toggleUpgrades}><Rocket size={16} /></button>
        </Tooltip>
        <Tooltip label="Cinematic Map">
          <div><Switch checked={cinematic} onCheckedChange={setCinematic} label={<span style={{display:'inline-flex',alignItems:'center',gap:6}}><Film size={14}/>Cinematic</span>} /></div>
        </Tooltip>
        <Tooltip label={autoCollect ? 'Auto-collect pickups (reduced value)' : 'Auto-collect pickups (reduced value)'}>
          <div><Switch checked={autoCollect} onCheckedChange={(v) => actions.setAutoCollectBubbles(v)} label={<span style={{display:'inline-flex',alignItems:'center',gap:6}}><Zap size={14}/>Auto</span>} /></div>
        </Tooltip>
        <Tooltip label="Reset Map View">
          <button className="icon-btn" aria-label="Reset map view" onClick={() => (window as any).resetNYCView?.()}><RotateCcw size={16} /></button>
        </Tooltip>
        <Tooltip label="Menu">
          <button className="icon-btn" aria-label="Return to menu" onClick={toTitle}><CloudMoon size={16} /></button>
        </Tooltip>
      </div>
    </motion.div>
  );
}
