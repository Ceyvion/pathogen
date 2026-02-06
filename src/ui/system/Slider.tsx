import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

export function Slider({ value, onValueChange, min=0, max=100, step=1 }: { value: number; onValueChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <SliderPrimitive.Root className="radix-slider" min={min} max={max} step={step} value={[value]} onValueChange={(v) => onValueChange(v[0] ?? value)}>
      <SliderPrimitive.Track className="radix-slider-track">
        <SliderPrimitive.Range className="radix-slider-range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="radix-slider-thumb" aria-label="value" />
    </SliderPrimitive.Root>
  );
}

