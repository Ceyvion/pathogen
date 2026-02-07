import React, { useEffect, useMemo, useRef } from 'react';
import type { VirusMorphingQuality, VirusMorphingTone } from '../effects/virusMorphingParticles';

type Props = {
  tone?: VirusMorphingTone;
  quality?: VirusMorphingQuality;
  className?: string;
};

export function VirusMorphingBackdrop({ tone = 'neutral', quality, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const effectiveQuality = useMemo<VirusMorphingQuality>(() => {
    if (quality) return quality;
    // Title/setup screens are UI-heavy; bias towards stable FPS.
    if (typeof window === 'undefined') return 'medium';
    if (window.innerWidth < 760) return 'low';
    return 'medium';
  }, [quality]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect reduced motion across the app.
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
    } catch {}

    let cleanup: (() => void) | undefined;
    let stopped = false;

    (async () => {
      try {
        const { startVirusMorphingParticles } = await import('../effects/virusMorphingParticles');
        if (stopped) return;
        cleanup = await startVirusMorphingParticles(canvas, { tone, quality: effectiveQuality });
      } catch (err) {
        // Never block UI on background effects.
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[VirusMorphingBackdrop] disabled:', err);
        }
      }
    })();

    return () => {
      stopped = true;
      cleanup?.();
    };
  }, [tone, effectiveQuality]);

  return (
    <canvas
      ref={canvasRef}
      className={['virus-morphing-backdrop', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  );
}

