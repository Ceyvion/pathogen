import React, { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../state/ui';
import videoSrc from '../../assets/Generating_City_Zero_Title_Screen_Video.mp4';
import poster from '../../assets/patient-zero-splash.jpg';

export function BootVideo() {
  const toTitle = useUiStore((s) => s.toTitle);
  const [blocked, setBlocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Once per browser session
    try {
      if (sessionStorage.getItem('bootVideoPlayed') === '1') {
        setHidden(true);
        toTitle();
        return;
      }
    } catch {}

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
    // Attempt autoplay programmatically to handle some browsers
    const playPromise = v.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => setBlocked(true));
    }
  }, [toTitle]);

  if (hidden) return null;

  const finish = () => {
    setHidden(true);
    try { sessionStorage.setItem('bootVideoPlayed', '1'); } catch {}
    toTitle();
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#000',
        zIndex: 20000,
        display: 'grid',
        placeItems: 'center',
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
        <button className="btn" onClick={finish} aria-label="Skip intro">Skip</button>
        {blocked && (
          <button
            className="btn"
            onClick={() => {
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
