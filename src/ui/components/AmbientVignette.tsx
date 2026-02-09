import React from 'react';
import { useGameStore } from '../../state/store';
import { selectCrisisTier } from '../../state/selectors';

export function AmbientVignette() {
  const crisisTier = useGameStore(selectCrisisTier);
  return <div className="ambient-vignette" data-crisis={crisisTier} aria-hidden />;
}

