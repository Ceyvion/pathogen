import React from 'react';
import { useGameStore } from '../../state/store';
import { useToaster } from '../system/Toaster';

export function EventToasts() {
  const { push } = useToaster();
  const events = useGameStore((s) => s.events);
  const latest = events[0];
  const lastRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!latest || lastRef.current === latest) return;
    lastRef.current = latest;
    const msg = String(latest);
    let level: 'info'|'success'|'warning'|'error' = 'info';
    if (/victory/i.test(msg)) level = 'success';
    if (/warning|alert/i.test(msg)) level = 'warning';
    if (/failed|error/i.test(msg)) level = 'error';
    push({ message: msg, level });
  }, [latest, push]);
  return null;
}

