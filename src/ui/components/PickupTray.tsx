import React from 'react';
import { Zap, Beaker, ChevronDown, ChevronUp } from 'lucide-react';
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
  const collectAll = useGameStore((s) => s.actions.collectAllBankedPickups);
  const purge = useGameStore((s) => s.actions.purgeExpiredPickups);
  const setHudHovering = useUiStore((s) => (s as any).setHudHovering as (v: boolean) => void);
  const [now, setNow] = React.useState(() => Date.now());
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      purge(t);
    }, 250);
    return () => window.clearInterval(id);
  }, [purge]);

  React.useEffect(() => {
    if (!banked.length) setOpen(false);
  }, [banked.length]);

  if (!banked.length) return null;

  const items = [...banked].sort((a, b) => a.expiresAtMs - b.expiresAtMs);

  return (
    <div
      className="pickup-tray"
      style={{
        position: 'absolute',
        // Keep clear of MapLibre bottom-right controls (zoom/attribution).
        right: 64,
        bottom: 74,
        // Above the Lab drawer so banked pickups are always collectible.
        zIndex: 60,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        maxWidth: 'calc(100vw - 24px)',
      }}
      onMouseEnter={() => setHudHovering(true)}
      onMouseLeave={() => setHudHovering(false)}
      aria-label="Banked pickups"
    >
      <button
        className="chip"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Hide banked pickups' : 'Show banked pickups'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
      >
        <Zap size={14} />
        <span style={{ fontSize: 12 }}>Banked</span>
        <span className="badge" style={{ background: '#0b1220', borderColor: '#1f2937' }}>{items.length}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="panel glass" style={{ padding: 8, display: 'flex', gap: 6, alignItems: 'center', maxWidth: 'min(720px, calc(100vw - 24px))' }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: 'min(560px, 62vw)' }}>
            {items.map((p) => {
              const remaining = Math.max(0, p.expiresAtMs - now);
              const ttl = Math.max(250, p.expiresAtMs - p.createdAtMs);
              const frac = Math.max(0, Math.min(1, remaining / ttl));
              return (
                <button
                  key={p.id}
                  className="chip"
                  onClick={() => collect(p.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative', flex: '0 0 auto' }}
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
          <button className="btn" onClick={() => collectAll()} title="Collect everything banked right now">Collect all</button>
        </div>
      )}
    </div>
  );
}
