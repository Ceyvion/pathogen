import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../state/store';
import { useUiStore } from '../../state/ui';
import { selectCrisisTier } from '../../state/selectors';
import { Tooltip } from '../system/Tooltip';
import { Switch } from '../system/Switch';
import { SeparatorHorizontal, Play, Pause, GaugeCircle, Film, Rocket, RotateCcw, CloudMoon, Palette, Music2, VolumeX, SkipForward, LayoutPanelLeft, Zap, SunMoon } from 'lucide-react';
import * as bgm from '../../audio/bgm';

type GameSpeed = 'crawl' | 'slow' | 'normal' | 'fast' | 'blitz';

const GAME_SPEED_CONFIG: Record<GameSpeed, { speed: 1|3|10; pacing: 'slow'|'normal'|'fast'; label: string }> = {
  crawl:  { speed: 1,  pacing: 'slow',   label: '0.5x' },
  slow:   { speed: 1,  pacing: 'normal', label: '1x' },
  normal: { speed: 3,  pacing: 'normal', label: '3x' },
  fast:   { speed: 3,  pacing: 'fast',   label: '5x' },
  blitz:  { speed: 10, pacing: 'fast',   label: '10x' },
};

function resolveGameSpeed(speed: 1|3|10, pacing: 'slow'|'normal'|'fast'): GameSpeed {
  if (speed === 1 && pacing === 'slow') return 'crawl';
  if (speed === 1) return 'slow';
  if (speed === 3 && pacing === 'fast') return 'fast';
  if (speed === 3) return 'normal';
  return 'blitz';
}

export function CommandBar() {
  const speed = useGameStore((s) => s.speed);
  const paused = useGameStore((s) => s.paused);
  const day = useGameStore((s) => Math.floor(s.day));
  const secPerDay = useGameStore((s) => s.msPerDay / 1000);
  const mode = useGameStore((s) => s.mode);
  const pathogenType = useGameStore((s) => s.pathogenType);
  const cure = useGameStore((s) => s.cureProgress);
  const autoCollect = useGameStore((s) => s.autoCollectBubbles);
  const actions = useGameStore((s) => s.actions);
  const pacing = useGameStore((s) => s.pacing);
  const crisisTier = useGameStore(selectCrisisTier);
  const gameSpeed = resolveGameSpeed(speed, pacing);

  const setGameSpeed = (gs: GameSpeed) => {
    const cfg = GAME_SPEED_CONFIG[gs];
    actions.setSpeed(cfg.speed);
    actions.setPacing(cfg.pacing);
  };

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
  const theme = useUiStore((s) => (s as any).theme as 'dark'|'light');
  const toggleTheme = useUiStore((s) => (s as any).toggleTheme as () => void);
  const nextTheme = theme === 'light' ? 'dark' : 'light';

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
    const speeds: GameSpeed[] = ['crawl', 'slow', 'normal', 'fast', 'blitz'];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); actions.togglePause(); }
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < speeds.length) setGameSpeed(speeds[idx]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  return (
    <motion.div className="cmd-bar panel glass" aria-label="command bar" data-crisis={crisisTier}
      onMouseEnter={() => setHudHovering(true)}
      onMouseLeave={() => setHudHovering(false)}
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 26 }}
    >
      <div className="cmd-left">
        <div className="cmd-title">PATHOGEN</div>
        <div className="cmd-sub">Day {day} · {mode === 'architect' ? 'Pathogen Architect' : 'City Response Controller'} · {pathogenType[0].toUpperCase() + pathogenType.slice(1)}</div>
      </div>
      <div className="cmd-center">
        <div className="progress-wrap" title="Cure progress">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, cure).toFixed(1)}%` }} /></div>
          <div className="progress-label">Cure {cure.toFixed(1)}%</div>
        </div>
        <div className="seg-controls" role="group" aria-label="speed controls" title={`~${secPerDay.toFixed(1)}s per in-game day at current speed`}>
          {(Object.keys(GAME_SPEED_CONFIG) as GameSpeed[]).map((gs) => (
            <button key={gs} className={`seg ${!paused && gameSpeed === gs ? 'active' : ''}`} onClick={() => setGameSpeed(gs)}>
              {GAME_SPEED_CONFIG[gs].label}
            </button>
          ))}
          <button className={`seg`} onClick={actions.togglePause}>{paused ? <><Play size={14}/> Resume</> : <><Pause size={14}/> Pause</>}</button>
        </div>
      </div>
      <div className="cmd-right">
        <Tooltip label={`Switch to ${nextTheme} theme`}>
          <button className="icon-btn" aria-label="Toggle theme" aria-pressed={theme === 'light'} onClick={() => toggleTheme()}><SunMoon size={16} /></button>
        </Tooltip>
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
