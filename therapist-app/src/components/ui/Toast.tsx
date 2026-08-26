import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';

interface ToastItem {
  id: number;
  text: string;
}

const ToastContext = createContext<(text: string) => void>(() => {});

/**
 * Used sparingly, and only to confirm something the person on screen just did
 * themselves. A client completing a practice never raises one in the
 * practitioner workspace — that would turn the product into a notifier.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, text }]);
    window.setTimeout(() => setItems((current) => current.filter((i) => i.id !== id)), 3000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-8"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-forest px-5 py-3 text-[0.8125rem] text-cream shadow-raised animate-rise"
          >
            <Check className="h-3.5 w-3.5 text-sage" aria-hidden="true" />
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
