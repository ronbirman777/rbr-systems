import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Side panel on desktop, bottom sheet on touch. Focus is trapped while open and
 * returned to the trigger on close; Escape always closes.
 */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  description,
  footer,
  children,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  width?: 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      <div
        className="absolute inset-0 bg-forest-deep/25 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-4xl bg-ivory shadow-panel animate-slide-up',
          'sm:max-h-none sm:h-full sm:rounded-none sm:rounded-l-4xl sm:animate-slide-in-right',
          width === 'lg' ? 'sm:w-[36rem]' : 'sm:w-[30rem]',
        )}
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
            <h2 className="editorial text-2xl leading-tight">{title}</h2>
            {description && <p className="mt-2 text-sm text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-full p-2 text-ink-muted transition hover:bg-sage-100 hover:text-forest-900"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-8">{children}</div>
        {footer && (
          <footer className="safe-bottom border-t border-sage-200/70 bg-white/70 px-6 py-4 sm:px-8">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
