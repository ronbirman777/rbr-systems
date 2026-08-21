import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import {
  createInitialState,
  ecosystemReducer,
  type EcosystemAction,
  type EcosystemState,
} from './ecosystemReducer';
import { clearState, loadState, saveState } from './persistence';

interface EcosystemContextValue {
  state: EcosystemState;
  dispatch: React.Dispatch<EcosystemAction>;
}

const EcosystemContext = createContext<EcosystemContextValue | null>(null);

function init(): EcosystemState {
  return loadState() ?? createInitialState();
}

/**
 * Both applications read and write this single store, which is what makes the
 * demo's central loop visible: an action in the client app shows up in the
 * therapist app with no synchronisation code in between.
 */
export function EcosystemProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(ecosystemReducer, undefined, init);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <EcosystemContext.Provider value={value}>{children}</EcosystemContext.Provider>;
}

export function useEcosystem(): EcosystemContextValue {
  const ctx = useContext(EcosystemContext);
  if (!ctx) throw new Error('useEcosystem must be used inside <EcosystemProvider>');
  return ctx;
}

/** Clears the stored demo and returns the store to its opening state. */
export function resetDemo(dispatch: React.Dispatch<EcosystemAction>): void {
  clearState();
  dispatch({ type: 'demo/reset' });
}
