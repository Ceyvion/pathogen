import React from 'react';
import { TopBar } from './components/TopBar';
import { LeftStats } from './components/LeftStats';
import { RightUpgrades } from './components/RightUpgrades';
import { BottomTicker } from './components/BottomTicker';
import { Legend } from './components/Legend';
import { MapOverlays } from './components/MapOverlays';
import { useUiStore } from '../state/ui';
import { ObjectivesPanel } from './components/ObjectivesPanel';
import { OverlayPrompt } from './components/OverlayPrompt';
import { ISLPanel } from './components/ISLPanel';

export function Hud() {
  const showStats = useUiStore((s) => s.showStats);
  const showUpgrades = useUiStore((s) => s.showUpgrades);
  return (
    <div className="hud">
      <TopBar />
      {showStats && <LeftStats />}
      {showUpgrades && <RightUpgrades />}
      <BottomTicker />
      <Legend />
      <MapOverlays />
      <ISLPanel />
      <ObjectivesPanel />
      <OverlayPrompt />
    </div>
  );
}
