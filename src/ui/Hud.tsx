import React from 'react';
// import { TopBar } from './components/TopBar';
// import { LeftStats } from './components/LeftStats';
// import { RightUpgrades } from './components/RightUpgrades';
import { IntelPanel } from './components/IntelPanel';
import { RightLabDrawer } from './components/RightLabDrawer';
import { BottomTicker } from './components/BottomTicker';
// import { Legend } from './components/Legend';
// import { MapOverlays } from './components/MapOverlays';
import { OverlayChips } from './components/OverlayChips';
import { useUiStore } from '../state/ui';
import { ObjectivesPanel } from './components/ObjectivesPanel';
import { OverlayPrompt } from './components/OverlayPrompt';
import { ISLPanel } from './components/ISLPanel';
import { StorySplash } from './components/StorySplash';
import { ToasterProvider } from './system/Toaster';
import { AmbientVignette } from './components/AmbientVignette';
import { CommandBar } from './hud/CommandBar';
import { EventToasts } from './components/EventToasts';
import { PickupTray } from './components/PickupTray';
import { OnboardingToasts } from './components/OnboardingToasts';

export function Hud() {
  const showStats = useUiStore((s) => s.showStats);
  const cinematic = useUiStore((s) => (s as any).cinematic as boolean);
  const hudHovering = useUiStore((s) => (s as any).hudHovering as boolean);
  const hudCompact = useUiStore((s) => (s as any).hudCompact as boolean);
  const preset = useUiStore((s) => (s as any).preset as 'default'|'neo'|'emergency');
  return (
    <ToasterProvider>
      <div
        className="hud"
        data-cinematic={cinematic ? '1' : '0'}
        data-hover={hudHovering ? '1' : '0'}
        data-compact={hudCompact ? '1' : '0'}
        data-preset={preset}
      >
        <AmbientVignette />
        <CommandBar />
        <PickupTray />
        {showStats && <IntelPanel />}
        <RightLabDrawer />
        <BottomTicker />
        <OverlayChips />
        <ISLPanel />
        <ObjectivesPanel />
        <OverlayPrompt />
        <StorySplash />
        <OnboardingToasts />
        <EventToasts />
      </div>
    </ToasterProvider>
  );
}
