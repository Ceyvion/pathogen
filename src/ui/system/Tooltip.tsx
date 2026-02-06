import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export function Tooltip({ label, children, side = 'top' as const }: { label: React.ReactNode; children: React.ReactNode; side?: 'top'|'right'|'bottom'|'left' }) {
  return (
    <TooltipPrimitive.Provider delayDuration={140}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children as any}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content side={side} className="radix-tooltip" sideOffset={8}>
            {label}
            <TooltipPrimitive.Arrow className="radix-tooltip-arrow" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

