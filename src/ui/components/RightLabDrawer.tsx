import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { motion } from 'framer-motion';
import { useUiStore } from '../../state/ui';
import { useGameStore } from '../../state/store';
import { Tooltip } from '../system/Tooltip';
import { X, Info } from 'lucide-react';

export function RightLabDrawer() {
  const open = useUiStore((s) => s.showUpgrades);
  const toggle = useUiStore((s) => s.toggleUpgrades);
  const upgrades = useGameStore((s) => s.upgrades);
  const dna = useGameStore((s) => s.dna);
  const mode = useGameStore((s) => s.mode);
  const purchase = useGameStore((s) => s.actions.purchaseUpgrade);

  const groups = React.useMemo(() => {
    const map: Record<string, string[]> = { transmission: [], symptoms: [], abilities: [] };
    Object.values(upgrades).forEach((u) => map[u.branch].push(u.id));
    return map;
  }, [upgrades]);

  const renderCard = (id: string) => {
    const u = upgrades[id];
    const locked = (u.prereqs && u.prereqs.some((pid) => !upgrades[pid]?.purchased)) || false;
    const canAfford = dna >= u.cost;
    const classState = u.purchased ? 'purchased' : locked ? 'locked' : canAfford ? 'affordable' : 'unaffordable';
    return (
      <div key={u.id} className={`upgrade-card ${classState}`}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="upgrade-title">
            <span>{u.name}</span>
            {u.purchased && <span className="tag" style={{ background: 'var(--ok)' }}>✓</span>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge">{mode === 'architect' ? 'DNA' : 'Ops'} {u.cost}</span>
            <Tooltip label={u.desc || 'No description'}>
              <button className="icon-btn" aria-label="Details"><Info size={14} /></button>
            </Tooltip>
            <button className="btn" disabled={u.purchased || locked || !canAfford} onClick={() => purchase(u.id)}>Buy</button>
          </div>
        </div>
        {u.desc && <div className="muted" style={{ marginTop: 4 }}>{u.desc}</div>}
        {locked && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Requires: {u.prereqs?.join(', ')}</div>}
      </div>
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={toggle}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content asChild>
          <motion.div className="sheet-right"
            initial={{ x: 460, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 460, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 28 }}
          >
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, position: 'sticky', top: 0, zIndex: 1, background: 'rgba(17,24,39,0.97)', paddingBottom: 8, borderBottom: '1px solid rgba(148,163,184,0.18)' }}>
              <Dialog.Title asChild>
                <strong>Lab</strong>
              </Dialog.Title>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span className="badge">{mode === 'architect' ? 'DNA' : 'Ops'}: {dna.toFixed(1)}</span>
                <Dialog.Close asChild>
                  <button className="icon-btn" aria-label="Close"><X size={16} /></button>
                </Dialog.Close>
              </div>
            </div>
            <Dialog.Description asChild>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Spend {mode === 'architect' ? 'DNA' : 'Ops'} to purchase upgrades. Some upgrades require prerequisites.</div>
            </Dialog.Description>
            <Tabs.Root defaultValue="transmission">
              <Tabs.List className="tabs-list">
                <Tabs.Trigger value="transmission" className="tab">Transmission</Tabs.Trigger>
                <Tabs.Trigger value="symptoms" className="tab">Symptoms</Tabs.Trigger>
                <Tabs.Trigger value="abilities" className="tab">Abilities</Tabs.Trigger>
              </Tabs.List>
              <div style={{ marginTop: 10 }}>
                <Tabs.Content value="transmission">
                  <div className="grid-upgrades">{groups.transmission.map(renderCard)}</div>
                </Tabs.Content>
                <Tabs.Content value="symptoms">
                  <div className="grid-upgrades">{groups.symptoms.map(renderCard)}</div>
                </Tabs.Content>
                <Tabs.Content value="abilities">
                  <div className="grid-upgrades">{groups.abilities.map(renderCard)}</div>
                </Tabs.Content>
              </div>
            </Tabs.Root>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
