import React from 'react';
import { useGameStore } from '../../state/store';
import { useUiStore } from '../../state/ui';
import { VirusMorphingBackdrop } from '../components/VirusMorphingBackdrop';
import { Trophy, Skull, Home } from 'lucide-react';
import { saveHighScore } from '../../sim/scoring';

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function GradeDisplay({ grade }: { grade: string }) {
  const color = grade === 'S' ? '#f59e0b' : grade === 'A' ? '#22c55e' : grade === 'B' ? '#3b82f6' : grade === 'C' ? '#94a3b8' : '#ef4444';
  return (
    <div style={{ textAlign: 'center', margin: '16px 0' }}>
      <div style={{ fontSize: 64, fontWeight: 800, color, lineHeight: 1 }}>{grade}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Rating</div>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

export function GameOverScreen() {
  const result = useGameStore((s) => s.gameResult);
  const toTitle = useUiStore((s) => s.toTitle);

  if (!result) return null;

  // Save high score on mount
  React.useEffect(() => {
    if (result) saveHighScore(result);
  }, [result]);

  const isVictory = result.outcome === 'victory';
  const tone = isVictory ? 'sterile' : 'infected';

  return (
    <div className="title-screen">
      <VirusMorphingBackdrop tone={tone} />
      <div className="title-panel panel" style={{ maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          {isVictory ? <Trophy size={48} color="#f59e0b" /> : <Skull size={48} color="#ef4444" />}
          <h1 style={{ marginTop: 8 }}>{isVictory ? 'Victory' : 'Defeat'}</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            {isVictory
              ? result.mode === 'controller'
                ? 'The city endures. The cure is within reach.'
                : 'The pathogen has overwhelmed the city. There is no stopping it now.'
              : result.mode === 'controller'
                ? 'The city has fallen. The cure came too late.'
                : 'The cure was found before the outbreak could take hold.'
            }
          </p>
        </div>

        <GradeDisplay grade={result.grade} />

        <div style={{ fontSize: 13 }}>
          <StatRow label="Score" value={result.score.toLocaleString()} />
          <StatRow label="Days Survived" value={result.days} />
          <StatRow label="Peak Infected" value={formatNum(result.peakInfected)} />
          <StatRow label="Total Deaths" value={formatNum(result.totalDeaths)} />
          <StatRow label="Total Recovered" value={formatNum(result.totalRecovered)} />
          <StatRow label="Cure Progress" value={`${result.cureProgress.toFixed(1)}%`} />
          <StatRow label="Upgrades" value={`${result.upgradesPurchased} / ${result.totalUpgrades}`} />
          <StatRow label="Difficulty" value={result.difficulty.charAt(0).toUpperCase() + result.difficulty.slice(1)} />
          <StatRow label="Pathogen" value={result.pathogenType.charAt(0).toUpperCase() + result.pathogenType.slice(1)} />
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'center' }}>
          <button className="mode-cta" onClick={toTitle} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px' }}>
            <Home size={16} /> Menu
          </button>
        </div>
      </div>
    </div>
  );
}
