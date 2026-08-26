import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Shared behaviour for the drawer and the modal: focus is trapped while open
 * and returned to the trigger on close, Escape always closes, and the page
 * behind cannot scroll.
 */
function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
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
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  return panelRef;
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

function Header({
  eyebrow,
  title,
  description,
  onClose,
}: Pick<OverlayProps, 'eyebrow' | 'title' | 'description' | 'onClose'>) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-sage-line px-6 py-5 sm:px-7">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="font-display text-[1.625rem] leading-tight text-ink">{title}</h2>
        {description && <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">{description}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="tap-target -mr-2.5 -mt-1.5 shrink-0 rounded-control text-ink-faint transition-colors hover:bg-sage-wash hover:text-forest"
      >
        <X className="h-[1.125rem] w-[1.125rem]" />
      </button>
    </header>
  );
}

/** Right-side panel on desktop, bottom sheet on touch. */
export function Drawer({ open, onClose, eyebrow, title, description, footer, children }: OverlayProps) {
  const panelRef = useOverlay(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      <div className="absolute inset-0 bg-forest-deep/25 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-[20px] bg-ivory shadow-panel animate-slide-up',
          'sm:h-full sm:max-h-none sm:w-[30rem] sm:rounded-none sm:animate-slide-in-right',
        )}
      >
        <Header eyebrow={eyebrow} title={title} description={description} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-7">{children}</div>
        {footer && (
          <footer className="safe-bottom border-t border-sage-line bg-white/70 px-6 py-4 sm:px-7">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Centred dialog on desktop, bottom sheet on touch. */
export function Modal({ open, onClose, eyebrow, title, description, footer, children }: OverlayProps) {
  const panelRef = useOverlay(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-forest-deep/25 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92vh] w-full flex-col rounded-t-[20px] bg-ivory shadow-raised animate-slide-up sm:max-w-[34rem] sm:rounded-card sm:animate-scale-in"
      >
        <Header eyebrow={eyebrow} title={title} description={description} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-7">{children}</div>
        {footer && (
          <footer className="safe-bottom border-t border-sage-line bg-white/70 px-6 py-4 sm:px-7">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
