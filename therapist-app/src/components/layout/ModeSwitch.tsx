import { ArrowRight, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { resetDemo, useApp } from '@/state/AppProvider';
import { cn } from '@/utils/cn';

/**
 * The demo's one control for crossing between the two experiences. It sits low
 * and to the right so it never competes with the product itself.
 */
export function ModeSwitch({ className }: { className?: string }) {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const toClient = state.mode === 'practitioner';
  const client = state.clients.find((c) => c.id === state.activeClientId) ?? state.clients[0];

  return (
    <div className={cn('fixed bottom-5 right-5 z-40 flex items-center gap-2 print:hidden', className)}>
      <button
        type="button"
        onClick={() => {
          resetDemo(dispatch);
          navigate('/practitioner/today');
        }}
        title="Reset the demo to its opening state"
        className="tap-target rounded-full border border-sage-line bg-white/90 text-ink-faint shadow-card backdrop-blur transition-colors hover:text-forest"
      >
        <RotateCcw className="h-4 w-4" />
        <span className="sr-only">Reset demo</span>
      </button>

      <button
        type="button"
        onClick={() => {
          if (toClient) {
            dispatch({ type: 'mode/set', mode: 'client', clientId: client.id });
            navigate(`/client/${client.id}/today`);
          } else {
            dispatch({ type: 'mode/set', mode: 'practitioner' });
            navigate('/practitioner/today');
          }
        }}
        className="flex h-11 items-center gap-2 rounded-full bg-forest px-4 text-[0.8125rem] font-medium text-cream shadow-raised transition-colors hover:bg-forest-accent sm:px-5 sm:text-sm"
      >
        {toClient ? 'Client View' : 'Practitioner View'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
