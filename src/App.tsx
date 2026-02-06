import React from 'react';
import { CanvasGame } from './phaser/CanvasGame';
import { Hud } from './ui/Hud';
import { NycMap } from './map/NycMap';
import { TitleScreen } from './ui/screens/TitleScreen';
import { SetupScreen } from './ui/screens/SetupScreen';
import { useUiStore } from './state/ui';
import { BootVideo } from './ui/components/BootVideo';

export default function App() {
  const scene = useUiStore((s) => s.scene);
  return (
    <div className="app-root">
      {scene === 'boot' ? (
        <BootVideo />
      ) : scene === 'title' ? (
        <TitleScreen />
      ) : scene === 'setup' ? (
        <SetupScreen />
      ) : (
        <>
          <NycMap />
          <CanvasGame />
          <Hud />
        </>
      )}
    </div>
  );
}
