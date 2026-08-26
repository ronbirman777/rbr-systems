import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { BookOpen, CalendarDays, Home, Leaf } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { ModeSwitch } from './ModeSwitch';
import { cn } from '@/utils/cn';

/**
 * The client companion is mobile first. On a larger screen it is presented as
 * one calm column rather than stretched into a dashboard — this is a personal
 * space, not a workspace.
 */
export function ClientShell() {
  const { clientId = 'emma' } = useParams();
  const { state, dispatch } = useApp();
  const location = useLocation();

  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;

  useEffect(() => {
    dispatch({ type: 'mode/set', mode: 'client', clientId: client.id });
  }, [dispatch, client.id]);

  const nav = [
    { to: `${base}/today`, label: 'Today', icon: Home },
    { to: `${base}/journey`, label: 'Journey', icon: Leaf },
    { to: `${base}/resources`, label: 'Resources', icon: BookOpen },
    { to: `${base}/sessions`, label: 'Sessions', icon: CalendarDays },
  ];

  return (
    <div className="min-h-screen bg-sage-wash/50">
      <div className="mx-auto flex min-h-screen w-full max-w-[26.5rem] flex-col bg-ivory sm:border-x sm:border-sage-line">
        <main className="flex-1 px-5 pb-44 pt-6">
          <Outlet />
        </main>

        <nav
          aria-label="Client"
          className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[26.5rem] border-t border-sage-line bg-ivory/97 backdrop-blur"
        >
          <ul className="grid grid-cols-4">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[3.5rem] flex-col items-center justify-center gap-1 pt-1.5 text-[0.625rem] font-medium transition-colors',
                      active ? 'text-forest' : 'text-ink-faint',
                    )}
                  >
                    <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                    {item.label}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-1 w-1 rounded-full transition-opacity',
                        active ? 'bg-forest opacity-100' : 'opacity-0',
                      )}
                    />
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <ModeSwitch className="bottom-[5.25rem] sm:bottom-5" />
    </div>
  );
}
