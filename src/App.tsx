import React, { useEffect } from 'react';
import { CanvasGame } from './phaser/CanvasGame';
import { Hud } from './ui/Hud';
import { NycMap } from './map/NycMap';
import { TitleScreen } from './ui/screens/TitleScreen';
import { SetupScreen } from './ui/screens/SetupScreen';
import { useUiStore } from './state/ui';
import { BootVideo } from './ui/components/BootVideo';
import { useGameStore } from './state/store';

export default function App() {
  const scene = useUiStore((s) => s.scene);
  const resumeOnLoad = useUiStore((s) => s.resumeOnLoad);
  const clearResumeOnLoad = useUiStore((s) => s.clearResumeOnLoad);

  // If the user refreshed while in-game, rehydrate from localStorage and continue.
  // This prevents "blank map" reports that are really a scene reset to Title.
  useEffect(() => {
    if (!resumeOnLoad) return;
    try {
      useGameStore.getState().actions.loadGame();
    } finally {
      clearResumeOnLoad();
    }
  }, [resumeOnLoad, clearResumeOnLoad]);

  // Auto-save on reload/close while in gameplay, so a refresh reliably restores the map + state.
  useEffect(() => {
    if (scene !== 'game') return;
    const handler = () => {
      try { localStorage.setItem('sceneV1', 'game'); } catch {}
      try { useGameStore.getState().actions.saveGame(); } catch {}
    };
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, [scene]);

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
