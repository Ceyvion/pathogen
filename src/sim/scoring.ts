import type { WorldState, GameOutcome, GameEndStats, LetterGrade } from '../state/types';

export function computeGameEndStats(state: WorldState, outcome: GameOutcome): GameEndStats {
  const countries = Object.values(state.countries);
  const totalPop = countries.reduce((s, c) => s + c.pop, 0);
  const totalDeaths = countries.reduce((s, c) => s + c.D, 0);
  const totalRecovered = countries.reduce((s, c) => s + c.R, 0);
  const totalInfected = countries.reduce((s, c) => s + c.I + c.R + c.D + c.E, 0);
  const upgradesPurchased = Object.values(state.upgrades).filter(u => u.purchased).length;
  const totalUpgrades = Object.values(state.upgrades).length;

  const score = computeScore(state, outcome, totalPop, totalDeaths);
  const grade = gradeFromScore(score);

  return {
    outcome,
    days: Math.floor(state.day),
    totalDeaths: Math.round(totalDeaths),
    totalRecovered: Math.round(totalRecovered),
    totalInfected: Math.round(totalInfected),
    peakInfected: Math.round(state.peakI),
    cureProgress: state.cureProgress,
    upgradesPurchased,
    totalUpgrades,
    mode: state.mode,
    pathogenType: state.pathogenType,
    difficulty: state.difficulty,
    score,
    grade,
  };
}

function computeScore(
  state: WorldState,
  outcome: GameOutcome,
  totalPop: number,
  totalDeaths: number,
): number {
  const diffMul = state.difficulty === 'casual' ? 0.6 : state.difficulty === 'brutal' ? 1.5 : 1.0;

  if (state.mode === 'controller') {
    // Controller: reward low deaths, fast cure, low peak
    const base = outcome === 'victory' ? 1000 : 200;
    const deathPenalty = (totalDeaths / Math.max(1, totalPop)) * 5000;
    const cureBonus = state.cureProgress * 5;
    const peakPenalty = (state.peakI / Math.max(1, totalPop)) * 2000;
    const speedBonus = Math.max(0, 200 - state.day * 2);
    return Math.round((base + cureBonus + speedBonus - deathPenalty - peakPenalty) * diffMul);
  }

  // Architect: reward high infection, high deaths, slow cure
  const base = outcome === 'victory' ? 1000 : 200;
  const infectBonus = (state.peakI / Math.max(1, totalPop)) * 2000;
  const deathBonus = (totalDeaths / Math.max(1, totalPop)) * 3000;
  const curePenalty = state.cureProgress * 3;
  const dayBonus = Math.min(300, state.day * 2);
  return Math.round((base + infectBonus + deathBonus + dayBonus - curePenalty) * diffMul);
}

function gradeFromScore(score: number): LetterGrade {
  if (score >= 2000) return 'S';
  if (score >= 1500) return 'A';
  if (score >= 1000) return 'B';
  if (score >= 500) return 'C';
  if (score >= 0) return 'D';
  return 'F';
}

// Persist and retrieve high scores
const STORAGE_KEY = 'highScoresV1';

interface HighScoreEntry {
  score: number;
  grade: LetterGrade;
  date: string;
  mode: string;
  pathogenType: string;
  difficulty: string;
  days: number;
}

export function saveHighScore(stats: GameEndStats): void {
  try {
    const existing: Record<string, HighScoreEntry> = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const key = `${stats.mode}_${stats.pathogenType}_${stats.difficulty}`;
    const prev = existing[key];
    if (!prev || stats.score > prev.score) {
      existing[key] = {
        score: stats.score,
        grade: stats.grade,
        date: new Date().toISOString(),
        mode: stats.mode,
        pathogenType: stats.pathogenType,
        difficulty: stats.difficulty,
        days: stats.days,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    }
  } catch {}
}
