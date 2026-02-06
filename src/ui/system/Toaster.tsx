import * as React from 'react';
import * as Toast from '@radix-ui/react-toast';

type ToastItem = { id: number; title?: string; message: string; level?: 'info'|'success'|'warning'|'error' };

const ToasterContext = React.createContext<{ push: (t: Omit<ToastItem,'id'>) => void } | null>(null);

export function useToaster() {
  const ctx = React.useContext(ToasterContext);
  if (!ctx) throw new Error('Toaster not mounted');
  return ctx;
}

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const push = React.useCallback((t: Omit<ToastItem,'id'>) => {
    setItems((s) => [...s, { ...t, id: Date.now() + Math.random() }]);
  }, []);
  const remove = (id: number) => setItems((s) => s.filter(i => i.id !== id));
  return (
    <ToasterContext.Provider value={{ push }}>
      <Toast.Provider swipeDirection="right">
        {children}
        <div className="radix-toast-viewport">
          {items.map((i, idx) => (
            <Toast.Root key={i.id} className={`radix-toast ${i.level || 'info'}`} onOpenChange={(open) => { if (!open) remove(i.id); }} defaultOpen
              style={{ opacity: 1 - Math.min(0.5, idx * 0.08) }}
            >
              {i.title && <Toast.Title className="radix-toast-title">{i.title}</Toast.Title>}
              <Toast.Description className="radix-toast-desc">{i.message}</Toast.Description>
              <Toast.Close className="radix-toast-close" aria-label="Close">×</Toast.Close>
            </Toast.Root>
          ))}
        </div>
      </Toast.Provider>
    </ToasterContext.Provider>
  );
}
