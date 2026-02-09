import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../state/store';
import { useUiStore } from '../../state/ui';

interface TutorialStep {
  id: number;
  message: string;
  hint: string;
  condition: (game: { day: number; awaitingPatientZero?: boolean; upgradesPurchased: number }) => boolean;
}

const STEPS: TutorialStep[] = [
  {
    id: 0,
    message: 'Click a borough on the map to begin.',
    hint: 'This will place Patient Zero and start the simulation.',
    condition: (g) => Boolean(g.awaitingPatientZero),
  },
  {
    id: 1,
    message: 'Open the Lab to spend your points.',
    hint: 'Use the flask icon in the top bar to open upgrades.',
    condition: (g) => !g.awaitingPatientZero && g.day < 3 && g.upgradesPurchased === 0,
  },
  {
    id: 2,
    message: 'Watch the Intel panel for infection stats.',
    hint: 'The gauge icon toggles the left panel with SEIR data.',
    condition: (g) => g.upgradesPurchased >= 1 && g.day < 8,
  },
  {
    id: 3,
    message: 'Adjust speed to your comfort.',
    hint: 'Use 1x/3x/10x or keyboard 1-3. Space to pause.',
    condition: (g) => g.day >= 5 && g.day < 12,
  },
  {
    id: 4,
    message: 'Milestones will pause the game at key moments.',
    hint: 'Take time to plan your next move when they appear.',
    condition: (g) => g.day >= 10 && g.day < 20,
  },
];

export function TutorialOverlay() {
  const tutorialStep = useUiStore((s) => s.tutorialStep);
  const setTutorialStep = useUiStore((s) => s.setTutorialStep);
  const dismissTutorial = useUiStore((s) => s.dismissTutorial);

  const day = useGameStore((s) => s.day);
  const awaitingPatientZero = useGameStore((s) => s.awaitingPatientZero);
  const upgradesPurchased = useGameStore((s) =>
    Object.values(s.upgrades).filter(u => u.purchased).length
  );

  const [visible, setVisible] = useState(false);

  const gameState = { day, awaitingPatientZero, upgradesPurchased };

  // Auto-advance to next applicable step
  useEffect(() => {
    if (tutorialStep < 0) return; // dismissed
    const currentStep = STEPS[tutorialStep];
    if (!currentStep) {
      // All steps done
      dismissTutorial();
      return;
    }
    if (currentStep.condition(gameState)) {
      setVisible(true);
    } else {
      // Current step no longer applies, advance
      setVisible(false);
      if (tutorialStep < STEPS.length - 1) {
        setTutorialStep(tutorialStep + 1);
      } else {
        dismissTutorial();
      }
    }
  }, [tutorialStep, day, awaitingPatientZero, upgradesPurchased]);

  if (tutorialStep < 0 || !visible) return null;

  const step = STEPS[tutorialStep];
  if (!step) return null;

  const handleNext = () => {
    setVisible(false);
    if (tutorialStep < STEPS.length - 1) {
      setTutorialStep(tutorialStep + 1);
    } else {
      dismissTutorial();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 8000,
      pointerEvents: 'auto',
    }}>
      <div className="panel glass" style={{
        padding: '12px 20px',
        maxWidth: 380,
        textAlign: 'center',
        animation: 'fadeIn 0.3s ease-out',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{step.message}</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{step.hint}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn" onClick={handleNext} style={{ fontSize: 12, padding: '4px 12px' }}>
            Got it
          </button>
          <button className="btn" onClick={dismissTutorial} style={{ fontSize: 12, padding: '4px 12px', opacity: 0.6 }}>
            Skip tutorial
          </button>
        </div>
      </div>
    </div>
  );
}
