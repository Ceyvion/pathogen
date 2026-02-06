// Background music manager: discovers audio files in src/assets and plays them in a loop.
// Vite-only: uses import.meta.glob to collect track URLs at build time.

type BgmState = {
  enabled: boolean;
  playing: boolean;
  volume: number; // 0..1
  trackIndex: number;
  trackName: string | null;
  tracks: string[];
};

type Listener = (s: BgmState) => void;

const listeners: Set<Listener> = new Set();
function emit(state: BgmState) { for (const l of Array.from(listeners)) try { l(state); } catch {} }

const LS_ENABLED = 'bgmEnabledV1';
const LS_VOLUME = 'bgmVolumeV1';

let audioEl: HTMLAudioElement | null = null;
let tracks: string[] = [];
let trackNames: string[] = [];
let enabled = true;
let volume = 0.45;
let trackIndex = 0;
let startedOnce = false;

function loadPrefs() {
  try {
    const e = localStorage.getItem(LS_ENABLED);
    if (e !== null) enabled = e === '1';
  } catch {}
  try {
    const v = parseFloat(localStorage.getItem(LS_VOLUME) || '');
    if (!Number.isNaN(v)) volume = Math.max(0, Math.min(1, v));
  } catch {}
}

function discoverTracks() {
  try {
    // Eagerly import all audio assets under src/assets
    const globs = import.meta.glob('../assets/**/*.{mp3,ogg,wav,m4a}', { as: 'url', eager: true }) as Record<string, string>;
    const entries = Object.entries(globs);
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    tracks = entries.map(([, url]) => url);
    trackNames = entries.map(([path]) => path.split('/assets/')[1] || path);
  } catch {
    tracks = [];
    trackNames = [];
  }
}

function currentState(): BgmState {
  return {
    enabled,
    playing: !!audioEl && !audioEl.paused && !audioEl.ended,
    volume,
    trackIndex,
    trackName: trackNames[trackIndex] || null,
    tracks,
  };
}

function ensureAudioEl() {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.loop = false; // we handle next-track logic manually
    audioEl.volume = volume;
    audioEl.preload = 'auto';
    audioEl.addEventListener('ended', () => {
      // Auto-advance to next track
      nextTrackInternal(true);
    });
  }
  return audioEl;
}

function pickTrack(i: number) {
  if (!tracks.length) return null;
  const idx = ((i % tracks.length) + tracks.length) % tracks.length;
  trackIndex = idx;
  const src = tracks[idx];
  const el = ensureAudioEl();
  if (el.src !== src) el.src = src;
  el.volume = volume;
  emit(currentState());
  return el;
}

async function tryPlay(el: HTMLAudioElement) {
  try {
    await el.play();
    startedOnce = true;
  } catch {
    // Autoplay blocked; will resume on user gesture
  }
  emit(currentState());
}

function nextTrackInternal(autoplay = false) {
  if (!tracks.length) return;
  const el = pickTrack(trackIndex + 1);
  if (!el) return;
  if (enabled && (startedOnce || !autoplay)) tryPlay(el);
}

export function initBgm() {
  loadPrefs();
  discoverTracks();
  pickTrack(trackIndex);
  emit(currentState());
  // Gentle resume on first pointer interaction if previously enabled
  const onFirstGesture = () => {
    document.removeEventListener('pointerdown', onFirstGesture);
    if (!enabled) return;
    const el = ensureAudioEl();
    if (tracks.length && el && el.paused) {
      pickTrack(trackIndex);
      tryPlay(el);
    }
  };
  document.addEventListener('pointerdown', onFirstGesture, { once: true });
}

export function toggleEnabled() {
  enabled = !enabled;
  try { localStorage.setItem(LS_ENABLED, enabled ? '1' : '0'); } catch {}
  const el = ensureAudioEl();
  if (!enabled) {
    try { el.pause(); } catch {}
  } else {
    if (tracks.length) {
      pickTrack(trackIndex);
      tryPlay(el);
    }
  }
  emit(currentState());
}

export function isEnabled() { return enabled; }
export function isPlaying() { return !!audioEl && !audioEl.paused && !audioEl.ended; }

export function play() {
  enabled = true;
  try { localStorage.setItem(LS_ENABLED, '1'); } catch {}
  const el = ensureAudioEl();
  if (tracks.length) {
    pickTrack(trackIndex);
    tryPlay(el);
  }
  emit(currentState());
}

export function pause() {
  const el = ensureAudioEl();
  try { el.pause(); } catch {}
  emit(currentState());
}

export function nextTrack() { nextTrackInternal(false); }

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(LS_VOLUME, String(volume)); } catch {}
  if (audioEl) audioEl.volume = volume;
  emit(currentState());
}

export function subscribe(l: Listener) { listeners.add(l); l(currentState()); return () => { listeners.delete(l); }; }

export function getState(): BgmState { return currentState(); }

