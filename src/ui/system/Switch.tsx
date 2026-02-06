import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

export function Switch({ checked, onCheckedChange, label, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: React.ReactNode; id?: string }) {
  const switchEl = (
    <SwitchPrimitive.Root id={id} className={`radix-switch ${checked ? 'checked' : ''}`} checked={checked} onCheckedChange={onCheckedChange}>
      <SwitchPrimitive.Thumb className="radix-switch-thumb" />
    </SwitchPrimitive.Root>
  );
  if (!label) return switchEl;
  return (
    <label htmlFor={id} className="radix-switch-wrap">
      {switchEl}
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
    </label>
  );
}

