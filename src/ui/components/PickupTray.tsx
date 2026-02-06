import React from 'react';
import { Zap, Beaker } from 'lucide-react';
import { useGameStore } from '../../state/store';
import { useUiStore } from '../../state/ui';
import type { BankedPickup } from '../../state/types';

function iconFor(p: BankedPickup) {
  if (p.type === 'cure') return <Beaker size={14} />;
  return <Zap size={14} />;
}

function labelFor(p: BankedPickup) {
  if (p.type === 'cure') return `Cure ${p.amount.toFixed(1)}%`;
  return `+${p.amount}`;
}

export function PickupTray() {
  const banked = useGameStore((s) => s.bankedPickups);
  const collect = useGameStore((s) => s.actions.collectBankedPickup);
  const purge = useGameStore((s) => s.actions.purgeExpiredPickups);
  const setHudHovering = useUiStore((s) => (s as any).setHudHovering as (v: boolean) => void);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      purge(t);
    }, 250);
    return () => window.clearInterval(id);
  }, [purge]);

  if (!banked.length) return null;

  const items = [...banked].sort((a, b) => a.expiresAtMs - b.expiresAtMs);
  return (
    <div
      className="panel glass pickup-tray"
      style={{
        position: 'absolute',
        top: 58,
        right: 12,
        padding: 8,
        zIndex: 9000,
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: 'calc(100vw - 24px)',
      }}
      onMouseEnter={() => setHudHovering(true)}
      onMouseLeave={() => setHudHovering(false)}
      aria-label="Banked pickups"
    >
      <div className="muted" style={{ fontSize: 11, letterSpacing: 0.3 }}>Banked</div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {items.map((p) => {
          const remaining = Math.max(0, p.expiresAtMs - now);
          const ttl = Math.max(250, p.expiresAtMs - p.createdAtMs);
          const frac = Math.max(0, Math.min(1, remaining / ttl));
          return (
            <button
              key={p.id}
              className="chip"
              onClick={() => collect(p.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative' }}
              aria-label={`Collect ${labelFor(p)}`}
            >
              {iconFor(p)}
              <span style={{ fontSize: 12 }}>{labelFor(p)}</span>
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 6,
                  right: 6,
                  bottom: 2,
                  height: 2,
                  background: 'rgba(148,163,184,0.18)',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                <span style={{ display: 'block', height: '100%', width: `${Math.floor(frac * 100)}%`, background: 'rgba(59,130,246,0.9)' }} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
