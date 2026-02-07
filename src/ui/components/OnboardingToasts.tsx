import React from 'react';
import { useGameStore } from '../../state/store';
import { useToaster } from '../system/Toaster';

const STORAGE_KEY = 'onboardingHudV1';

export function OnboardingToasts() {
  const { push } = useToaster();
  const awaiting = useGameStore((s) => Boolean(s.awaitingPatientZero));
  const t = useGameStore((s) => s.t);
  const mode = useGameStore((s) => s.mode);
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (firedRef.current) return;
    if (awaiting) return;
    // Wait until the sim actually starts ticking so we don't show this during setup overlays.
    if (t <= 0) return;

    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') {
        firedRef.current = true;
        return;
      }
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // If storage is unavailable, still show once per mount.
    }

    const pointsWord = mode === 'controller' ? 'Ops' : 'DNA';
    push({
      title: 'Quick start',
      message: `Keep speed at 1× while you read. Use the rocket icon to open the Lab and spend ${pointsWord}. The gauge icon shows Intel (stats).`,
      level: 'info',
    });
    push({
      message: 'If days feel too fast, switch Pacing to Slow (it controls the in-game clock). Space toggles pause.',
      level: 'info',
    });

    firedRef.current = true;
  }, [awaiting, t, mode, push]);

  return null;
}

