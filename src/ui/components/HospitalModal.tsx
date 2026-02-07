import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { X, Building2, Activity } from 'lucide-react';
import { useUiStore } from '../../state/ui';
import { useGameStore } from '../../state/store';
import hospitalsJson from '../../assets/nyc-hospitals.json';
import {
  BORO_PERSONALITIES,
  getProtocolsForBoro,
  type BoroKey,
} from '../../data/boroughLore';
import { HOSP_RESPONSE_TIERS } from '../../sim/hospResponse';

type HospitalEntry = { name: string; boroKey: string; ll: [number, number]; beds: number };
const HOSPITALS = hospitalsJson as HospitalEntry[];

function boroTotalBeds(boroKey: string) {
  return HOSPITALS.filter((h) => h.boroKey === boroKey).reduce((s, h) => s + h.beds, 0);
}

export function HospitalModal() {
  const hospitalId = useUiStore((s) => s.hospitalModalId);
  const setHospitalId = useUiStore((s) => s.setHospitalModalId);
  const countries = useGameStore((s) => s.countries);
  const pathogenType = useGameStore((s) => s.pathogenType);
  const mode = useGameStore((s) => s.mode);
  const params = useGameStore((s) => s.params);
  const upgrades = useGameStore((s) => s.upgrades);
  const hospResponseTier = useGameStore((s) => s.hospResponseTier);

  const hospital = React.useMemo(
    () => (hospitalId ? HOSPITALS.find((h) => h.name === hospitalId) : null),
    [hospitalId],
  );

  if (!hospital) {
    return (
      <Dialog.Root open={false} onOpenChange={() => setHospitalId(null)}>
        <Dialog.Portal><span /></Dialog.Portal>
      </Dialog.Root>
    );
  }

  const boro = countries[hospital.boroKey as keyof typeof countries];
  const personality = BORO_PERSONALITIES[hospital.boroKey as BoroKey];
  const totalBeds = boroTotalBeds(hospital.boroKey);
  const boroH = boro?.H ?? 0;
  const bedShare = totalBeds > 0 ? hospital.beds / totalBeds : 0;
  const demand = boroH * bedShare;
  let hospCapacityMulUp = 1;
  for (const u of Object.values(upgrades || {})) {
    if (!u.purchased) continue;
    const e: any = u.effects;
    if (typeof e.hospCapacityMul === 'number') hospCapacityMulUp *= e.hospCapacityMul;
  }
  const respCapMul = HOSP_RESPONSE_TIERS[hospResponseTier]?.capMul ?? 1;
  const respLabel = HOSP_RESPONSE_TIERS[hospResponseTier]?.label ?? 'Normal operations';
  const capPerPerson = (params.hospCapacityPerK / 1000) * hospCapacityMulUp * respCapMul;
  const capBoro = capPerPerson * Math.max(1, boro?.pop || 1);
  const capacity = capBoro * bedShare;
  const occupied = Math.min(demand, capacity);
  const overflow = Math.max(0, demand - capacity);
  const demandLoad = capacity > 0 ? (demand / capacity) : 0;
  const occLoad = capacity > 0 ? (occupied / capacity) : 0;

  const protocols = getProtocolsForBoro(hospital.boroKey as BoroKey, pathogenType).map((p) => ({
    ...p,
    status: (p.status === 'classified' ? 'classified' : hospResponseTier >= 1 ? 'active' : 'standby') as 'active' | 'standby' | 'classified',
  }));

  const siblings = HOSPITALS.filter(
    (h) => h.boroKey === hospital.boroKey && h.name !== hospital.name,
  );

  const loadColor = demandLoad < 0.7 ? 'var(--ok)' : demandLoad < 1.0 ? 'var(--warn)' : 'var(--err)';
  const demandPct = demandLoad > 0 && demandLoad < 0.001 ? '<0.1' : (demandLoad * 100).toFixed(1);
  const loadLabel = demandLoad > 1 ? 'demand' : 'load';

  return (
    <Dialog.Root open={!!hospitalId} onOpenChange={(open) => { if (!open) setHospitalId(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content asChild>
          <motion.div
            className="hospital-modal"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            {/* Header */}
            <div className="hospital-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Building2 size={16} style={{ color: 'var(--text)', flexShrink: 0 }} />
                <Dialog.Title asChild>
                  <span className="hospital-name">{hospital.name}</span>
                </Dialog.Title>
                {personality && (
                  <span className="hospital-boro-badge">{personality.displayName}</span>
                )}
              </div>
              <Dialog.Close asChild>
                <button className="icon-btn" aria-label="Close"><X size={16} /></button>
              </Dialog.Close>
            </div>

            {/* Borough Personality */}
            {personality && (
              <div className="hospital-personality">
                <div className="hospital-tagline">{personality.tagline}</div>
                <div className="hospital-character">{personality.character}</div>
              </div>
            )}

            {/* Capacity */}
            <div className="hospital-capacity">
              <div className="hospital-beds-label">
                <span>{hospital.beds} beds</span>
                <span style={{ color: loadColor, fontWeight: 600 }}>
                  {demandPct}% {loadLabel}
                </span>
              </div>
              <div className="progress-track" style={{ height: 8, borderColor: loadColor }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, occLoad * 100)}%`,
                    background: loadColor,
                    transition: 'width 0.4s ease, background 0.4s ease',
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {Math.round(occupied)} / {Math.round(capacity)} occupied
                {overflow > 0 ? ` (+${Math.round(overflow)} overflow)` : ''}
              </div>
              {hospResponseTier > 0 && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Response: {respLabel}
                </div>
              )}
            </div>

            {/* Treatment Protocols */}
            <div className="hospital-section-kicker" style={{ marginTop: 14 }}>
              <Activity size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
              TREATMENT PROTOCOLS
            </div>
            <Dialog.Description asChild>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                {mode === 'architect'
                  ? 'Intelligence on enemy treatment operations in this sector.'
                  : 'Active and available treatment protocols for this facility.'}
              </div>
            </Dialog.Description>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {protocols.map((tp) => (
                <div key={tp.id} className="treatment-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span className="treatment-name">{tp.name}</span>
                    <span className={`treatment-status ${tp.status}`}>
                      {tp.status === 'active' ? 'ACTIVE' : tp.status === 'standby' ? 'STANDBY' : 'CLASSIFIED'}
                    </span>
                  </div>
                  <div className="treatment-desc">{tp.desc}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontStyle: 'italic' }}>
                    {tp.effectHint}
                  </div>
                </div>
              ))}
              {protocols.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                  No treatment protocols on file for this facility.
                </div>
              )}
            </div>

            {/* Neighboring Hospitals */}
            {siblings.length > 0 && (
              <>
                <div className="hospital-section-kicker">
                  OTHER {personality?.displayName?.toUpperCase() || hospital.boroKey.toUpperCase()} FACILITIES
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {siblings.map((sib) => {
                    const share = totalBeds > 0 ? (sib.beds / totalBeds) : 0;
                    const sibDemand = boroH * share;
                    const sibCap = capBoro * share;
                    const sibDemandLoad = sibCap > 0 ? (sibDemand / sibCap) : 0;
                    const sibOccLoad = sibCap > 0 ? (Math.min(sibDemand, sibCap) / sibCap) : 0;
                    const sibColor = sibDemandLoad < 0.7 ? 'var(--ok)' : sibDemandLoad < 1.0 ? 'var(--warn)' : 'var(--err)';
                    return (
                      <div
                        key={sib.name}
                        className="neighbor-row"
                        onClick={() => setHospitalId(sib.name)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') setHospitalId(sib.name); }}
                      >
                        <span className="neighbor-name">{sib.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="neighbor-beds">{sib.beds} beds</span>
                          <div className="neighbor-load-bar">
                            <div style={{ width: `${Math.min(100, sibOccLoad * 100)}%`, height: '100%', background: sibColor, transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
