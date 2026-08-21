import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';

interface ToastMessage {
  id: number;
  text: string;
}

const ToastContext = createContext<(text: string) => void>(() => {});

/**
 * Deliberately sparing. Practice completions do NOT raise a toast — the
 * therapist's Recent Activity updates quietly instead. This exists only to
 * confirm an action the person on screen just took themselves.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMessage[]>([]);

  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, text }]);
    window.setTimeout(() => setItems((current) => current.filter((i) => i.id !== id)), 3200);
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
            className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-forest-900 px-5 py-3 text-sm text-cream shadow-lift animate-rise"
          >
            <Check className="h-4 w-4 text-sage-300" aria-hidden="true" />
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
