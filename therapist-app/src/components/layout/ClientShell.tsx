import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams, useLocation } from 'react-router-dom';
import { BookOpen, Compass, LibraryBig, MessageCircle, MoreHorizontal, ShieldCheck, Sun, X } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { unreadForClient } from '@/services/selectors';
import { Avatar } from '@/components/ui/Avatar';
import { DemoSwitcher } from './DemoSwitcher';
import { cn } from '@/utils/cn';

/**
 * The client experience is mobile-first. On larger screens it is presented as a
 * single calm column rather than being stretched into a dashboard — this is a
 * personal space, not a workspace.
 */
export function ClientShell() {
  const { clientId = 'emma' } = useParams();
  const { state, dispatch } = useEcosystem();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const unread = unreadForClient(state, client.id);

  // The route is the source of truth for which experience is on screen, so a
  // direct link keeps the "View as" control honest.
  useEffect(() => {
    dispatch({ type: 'view/set', viewAs: 'client', clientId: client.id });
  }, [dispatch, client.id]);
  const base = `/client/${client.id}`;

  const nav = [
    { to: `${base}/today`, label: 'Today', icon: Sun },
    { to: `${base}/practices`, label: 'Practices', icon: Compass },
    { to: `${base}/journey`, label: 'Journey', icon: BookOpen },
    { to: `${base}/messages`, label: 'Messages', icon: MessageCircle, badge: unread },
  ];

  const more = [
    { to: `${base}/resources`, label: 'Resources for you', icon: LibraryBig },
    { to: `${base}/privacy`, label: 'Profile & Privacy', icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto min-h-screen w-full max-w-[30rem] bg-ivory shadow-[0_0_80px_-40px_rgba(24,60,50,0.5)] lg:my-0 lg:min-h-screen">
        <header className="sticky top-0 z-30 border-b border-sage-200/70 bg-ivory/90 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar person={client} size="sm" />
              <div className="hidden min-w-0 xs:block">
                <p className="truncate text-sm font-medium leading-tight text-ink">{client.firstName}</p>
                <p className="truncate text-2xs text-ink-faint">
                  with {state.therapist.firstName} {state.therapist.lastName}
                </p>
              </div>
            </div>
            <DemoSwitcher compact />
          </div>
        </header>

        <main className="px-5 pb-32 pt-6">
          <Outlet />
        </main>

        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[30rem] border-t border-sage-200 bg-ivory/95 backdrop-blur">
          <div className="grid grid-cols-5 items-end px-2 pt-1.5">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 text-2xs font-medium transition-colors',
                    active ? 'text-forest-900' : 'text-ink-faint',
                  )}
                >
                  <span className="relative">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {Boolean(item.badge) && (
                      <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-amber-soft ring-2 ring-ivory" />
                    )}
                  </span>
                  {item.label}
                </NavLink>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 text-2xs font-medium text-ink-faint"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              More
            </button>
          </div>
        </nav>
      </div>

      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-forest-deep/25 backdrop-blur-[2px] animate-fade-in"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className="safe-bottom relative w-full max-w-[30rem] rounded-t-4xl bg-ivory px-5 pb-6 pt-5 shadow-lift animate-slide-up"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="editorial text-xl">More</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="rounded-full p-2 text-ink-muted hover:bg-sage-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="hairline-list overflow-hidden rounded-xl2 border border-sage-200 bg-white">
              {more.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      navigate(item.to);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-4 text-left text-sm text-ink transition hover:bg-sage-100/60"
                  >
                    <Icon className="h-5 w-5 text-forest-600" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
