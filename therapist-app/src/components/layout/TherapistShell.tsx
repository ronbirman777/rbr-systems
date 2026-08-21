import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  HeartHandshake,
  LibraryBig,
  MessageCircle,
  Plus,
  Sunrise,
  Users,
} from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { totalUnreadForTherapist } from '@/services/selectors';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { DemoSwitcher } from './DemoSwitcher';
import { AssignActivityDrawer } from '@/components/practices/AssignActivityDrawer';
import { longDate } from '@/utils/date';
import { cn } from '@/utils/cn';

interface AssignApi {
  openAssign: (options?: { clientIds?: string[]; resourceId?: string }) => void;
}

const AssignContext = createContext<AssignApi>({ openAssign: () => {} });
export const useAssign = () => useContext(AssignContext);

const NAV = [
  { to: '/therapist/today', label: 'Today', icon: Sunrise },
  { to: '/therapist/clients', label: 'Clients', icon: Users },
  { to: '/therapist/care', label: 'Continuous Care', icon: HeartHandshake },
  { to: '/therapist/sessions', label: 'Sessions', icon: CalendarDays },
  { to: '/therapist/messages', label: 'Messages', icon: MessageCircle },
  { to: '/therapist/resources', label: 'Resources', icon: LibraryBig },
];

const MOBILE_NAV = [
  { to: '/therapist/today', label: 'Today', icon: Sunrise },
  { to: '/therapist/clients', label: 'Clients', icon: Users },
  { to: '/therapist/sessions', label: 'Sessions', icon: CalendarDays },
  { to: '/therapist/messages', label: 'Messages', icon: MessageCircle },
];

export function TherapistShell() {
  const { state, dispatch } = useEcosystem();
  const location = useLocation();
  const unread = totalUnreadForTherapist(state);

  useEffect(() => {
    dispatch({ type: 'view/set', viewAs: 'therapist' });
  }, [dispatch]);

  const [assignOpen, setAssignOpen] = useState(false);
  const [presetClients, setPresetClients] = useState<string[]>([]);
  const [presetResource, setPresetResource] = useState<string | undefined>();

  const openAssign = useCallback((options?: { clientIds?: string[]; resourceId?: string }) => {
    setPresetClients(options?.clientIds ?? []);
    setPresetResource(options?.resourceId);
    setAssignOpen(true);
  }, []);

  const api = useMemo(() => ({ openAssign }), [openAssign]);

  return (
    <AssignContext.Provider value={api}>
      <div className="min-h-screen bg-ivory lg:flex">
        {/* Desktop rail */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-forest-900 px-5 py-7 lg:flex">
          <div className="px-2">
            <p className="editorial text-xl text-cream">RBR</p>
            <p className="mt-0.5 text-2xs uppercase tracking-widest2 text-sage-400">
              Therapist Companion
            </p>
          </div>

          <nav className="mt-9 flex-1 space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                    active
                      ? 'bg-forest-600 text-cream'
                      : 'text-sage-300 hover:bg-forest-700/60 hover:text-cream',
                  )}
                >
                  <Icon className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  {item.label === 'Messages' && unread > 0 && (
                    <span className="rounded-full bg-cream px-1.5 py-0.5 text-2xs font-semibold text-forest-900">
                      {unread}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-6 border-t border-forest-600/50 pt-5">
            <div className="flex items-center gap-3 px-1">
              <Avatar person={state.therapist} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm text-cream">
                  {state.therapist.firstName} {state.therapist.lastName}
                </p>
                <p className="truncate text-2xs text-sage-400">{state.therapist.title}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-sage-200/70 bg-ivory/85 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
              <div className="shrink-0 lg:hidden">
                <p className="editorial text-lg leading-none text-forest-900">RBR</p>
                <p className="whitespace-nowrap text-2xs uppercase tracking-widest2 text-ink-faint">
                  Companion
                </p>
              </div>
              <p className="hidden min-w-0 truncate text-sm text-ink-muted lg:block">
                {longDate()}
              </p>
              <div className="flex items-center gap-2 sm:gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => openAssign()}
                  icon={<Plus className="h-4 w-4" />}
                  className="hidden sm:inline-flex"
                >
                  Assign activity
                </Button>
                <DemoSwitcher />
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-28 pt-6 sm:px-8 lg:pb-16">
            <Outlet />
          </main>
        </div>

        {/* Mobile bar */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-sage-200 bg-ivory/95 backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-2 pt-1.5">
            {MOBILE_NAV.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-2xs font-medium transition-colors',
                    active ? 'text-forest-900' : 'text-ink-faint',
                  )}
                >
                  <span className="relative">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {item.label === 'Messages' && unread > 0 && (
                      <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-amber-soft ring-2 ring-ivory" />
                    )}
                  </span>
                  {item.label}
                </NavLink>
              );
            })}
            <button
              type="button"
              onClick={() => openAssign()}
              className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-1 text-2xs font-medium text-forest-900"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest-900 text-cream">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </span>
              Assign
            </button>
          </div>
        </nav>

        <AssignActivityDrawer
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          presetClientIds={presetClients}
          presetResourceId={presetResource}
        />
      </div>
    </AssignContext.Provider>
  );
}
