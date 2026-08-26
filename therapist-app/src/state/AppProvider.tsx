import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { createInitialState, reducer, type Action, type AppState } from './store';
import { clearState, loadState, saveState } from './persistence';

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

const init = (): AppState => loadState() ?? createInitialState();

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Clears stored demo changes and returns the app to its opening state. */
export function resetDemo(dispatch: React.Dispatch<Action>): void {
  clearState();
  dispatch({ type: 'demo/reset' });
}
