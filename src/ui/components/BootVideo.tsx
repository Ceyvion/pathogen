import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../state/ui';
import videoSrc from '../../assets/Generating_City_Zero_Title_Screen_Video.mp4';
import poster from '../../assets/patient-zero-splash.jpg';

export function BootVideo() {
  const toTitle = useUiStore((s) => s.toTitle);
  const cinematic = useUiStore((s) => s.cinematic);
  const [blocked, setBlocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const startedRef = useRef(false);

  const finish = useCallback(() => {
    setHidden(true);
    try { sessionStorage.setItem('bootVideoPlayed', '1'); } catch {}
    toTitle();
  }, [toTitle]);

  useEffect(() => {
    // Once per browser session
    try {
      if (sessionStorage.getItem('bootVideoPlayed') === '1') {
        setHidden(true);
        toTitle();
        return;
      }
    } catch {}

    // Respect the in-game cinematic toggle: skip intro video.
    if (!cinematic) {
      setHidden(true);
      try { sessionStorage.setItem('bootVideoPlayed', '1'); } catch {}
      toTitle();
      return;
    }

    // Respect reduced-motion: skip video
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setHidden(true);
        try { sessionStorage.setItem('bootVideoPlayed', '1'); } catch {}
        toTitle();
        return;
      }
    } catch {}

    const v = videoRef.current;
    if (!v) return;

    // If the video doesn't start quickly (codec/autoplay/canplay issues), don't trap the UI
    // behind a black screen. We still show explicit controls, but also auto-skip after a short grace period.
    startedRef.current = false;
    const onPlaying = () => { startedRef.current = true; setBlocked(false); };
    v.addEventListener('playing', onPlaying);
    const fallback = window.setTimeout(() => {
      if (!startedRef.current) finish();
    }, 5000);

    // Attempt autoplay programmatically to handle some browsers
    const playPromise = v.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => setBlocked(true));
    }

    return () => {
      window.clearTimeout(fallback);
      v.removeEventListener('playing', onPlaying);
    };
  }, [cinematic, finish, toTitle]);

  if (hidden) return null;

  return (
    <div
      onClick={finish}
      style={{
        position: 'absolute',
        inset: 0,
        background: '#000',
        zIndex: 20000,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
      }}
    >
      <video
        ref={videoRef}
        src={videoSrc}
        poster={poster}
        autoPlay
        muted
        playsInline
        onEnded={finish}
        onError={finish}
        onPlaying={() => { startedRef.current = true; setBlocked(false); }}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* Skip / Unblock overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          className="btn"
          onClick={(e) => { e.stopPropagation(); finish(); }}
          aria-label="Skip intro"
        >
          Skip intro
        </button>
        {blocked && (
          <button
            className="btn"
            onClick={(e) => {
              e.stopPropagation();
              try { videoRef.current?.play(); setBlocked(false); } catch {}
            }}
            aria-label="Play intro"
          >
            Play
          </button>
        )}
      </div>
    </div>
  );
}
