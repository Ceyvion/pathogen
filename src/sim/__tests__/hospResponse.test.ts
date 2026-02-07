import { describe, it, expect } from 'vitest';

import { nextHospResponseTier, targetHospResponseTier } from '../hospResponse';

describe('Hospital Response Tier', () => {
  it('selects a target tier from base load thresholds', () => {
    expect(targetHospResponseTier(0.5)).toBe(0);
    expect(targetHospResponseTier(1.0)).toBe(1);
    expect(targetHospResponseTier(1.24)).toBe(1);
    expect(targetHospResponseTier(1.25)).toBe(2);
    expect(targetHospResponseTier(1.6)).toBe(3);
  });

  it('escalates immediately to the target tier', () => {
    expect(nextHospResponseTier(0, 1.02, 1.02)).toBe(1);
    expect(nextHospResponseTier(1, 1.3, 1.13)).toBe(2);
    expect(nextHospResponseTier(0, 1.7, 1.05)).toBe(3);
  });

  it('uses hysteresis to avoid flapping when stepping down', () => {
    // Still high effective load: hold tier.
    expect(nextHospResponseTier(2, 1.1, 1.02)).toBe(2);
    expect(nextHospResponseTier(1, 0.95, 0.82)).toBe(1);

    // Calm enough effective load: step down.
    expect(nextHospResponseTier(3, 1.4, 1.15)).toBe(2);
    expect(nextHospResponseTier(2, 1.05, 0.97)).toBe(1);
    expect(nextHospResponseTier(1, 0.9, 0.79)).toBe(0);
  });
});

