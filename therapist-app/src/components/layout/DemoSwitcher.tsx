import { useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { resetDemo, useEcosystem } from '@/state/EcosystemProvider';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/utils/cn';

/**
 * "View as" — the demo's single control for moving between the two sides of the
 * relationship. It reads as part of the product, not as a developer toggle.
 */
export function DemoSwitcher({ compact = false }: { compact?: boolean }) {
  const { state, dispatch } = useEcosystem();
  const navigate = useNavigate();
  const client = state.clients.find((c) => c.id === state.activeClientId) ?? state.clients[0];

  const go = (view: 'therapist' | 'client') => {
    dispatch({ type: 'view/set', viewAs: view, clientId: client.id });
    navigate(view === 'therapist' ? '/therapist/today' : `/client/${client.id}/today`);
  };

  const options = [
    { view: 'therapist' as const, person: state.therapist, label: state.therapist.firstName },
    { view: 'client' as const, person: client, label: client.firstName },
  ];

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex items-center gap-1 rounded-full border border-sage-300/80 bg-white/80 p-1 backdrop-blur',
          compact && 'p-0.5',
        )}
      >
        {!compact && (
          <span className="hidden pl-2.5 pr-1 text-2xs font-semibold uppercase tracking-widest2 text-ink-faint sm:inline">
            View as
          </span>
        )}
        {options.map((option) => {
          const active = state.viewAs === option.view;
          return (
            <button
              key={option.view}
              type="button"
              onClick={() => go(option.view)}
              aria-pressed={active}
              className={cn(
                'flex items-center gap-2 rounded-full py-1 pl-1 text-sm font-medium transition',
                compact ? 'pr-1 xs:pr-3' : 'pr-3',
                active
                  ? 'bg-forest-900 text-cream shadow-soft'
                  : 'text-ink-muted hover:bg-sage-100 hover:text-forest-900',
              )}
            >
              <Avatar person={option.person} size="xs" ring={active} />
              <span className={compact ? 'hidden xs:inline' : undefined}>{option.label}</span>
              <span className="sr-only">View as {option.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          resetDemo(dispatch);
          navigate('/therapist/today');
        }}
        title="Reset the demo to its starting state"
        className="rounded-full p-2 text-ink-faint transition hover:bg-sage-100 hover:text-forest-700"
      >
        <RotateCcw className="h-4 w-4" />
        <span className="sr-only">Reset demo</span>
      </button>
    </div>
  );
}
