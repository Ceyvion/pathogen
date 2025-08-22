let audioCtx: AudioContext | null = null;
function getCtx() {
  try {
    const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

export function playBubble(type: 'dna'|'ops'|'cure') {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const base = type === 'cure' ? 560 : type === 'ops' ? 380 : 320;
  const freq = base + (Math.random() * 40 - 20);
  osc.frequency.value = freq; osc.type = type === 'cure' ? 'sine' : 'triangle';
  gain.gain.setValueAtTime(0.07, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.13);
}

export function playMilestone(kind: 'day'|'objective'|'victory'|'alert'='day') {
  const ctx = getCtx();
  if (!ctx) return;
  const seq: number[] = kind === 'victory' ? [660, 880, 990] : kind === 'objective' ? [520, 650] : kind === 'alert' ? [300, 260] : [420, 520];
  const now = ctx.currentTime;
  seq.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = f; osc.type = 'sine';
    const t0 = now + i * 0.08;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.05, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.20);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.22);
  });
}

