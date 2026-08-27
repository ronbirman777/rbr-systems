import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { Sidebar } from './Sidebar';
import { QuickCreate } from './QuickCreate';
import { ModeSwitch } from './ModeSwitch';

/**
 * Desktop and tablet-landscape use the fixed rail. Below that the rail becomes
 * a sheet reached from a header — the navigation adapts rather than shrinking.
 */
export function PractitionerShell() {
  const { dispatch } = useApp();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // The route is the source of truth for which experience is on screen.
  useEffect(() => {
    dispatch({ type: 'mode/set', mode: 'practitioner' });
  }, [dispatch]);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-ivory lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[15rem] shrink-0 lg:block">
        <Sidebar />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sage-line bg-ivory/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-forest font-display text-[0.625rem] font-semibold text-cream">
            RBR
          </span>
          <span className="font-display text-lg leading-none text-ink">RBR</span>
        </div>
        <div className="flex items-center gap-1.5">
          <QuickCreate />
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="tap-target -mr-2 rounded-control text-ink-soft transition-colors hover:bg-sage-wash"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-forest-deep/30 animate-fade-in"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative h-full w-[16rem] animate-slide-in-right">
            <Sidebar onNavigate={() => setNavOpen(false)} />
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-6 rounded-control p-2 text-sage hover:text-cream"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 hidden justify-end border-b border-sage-line bg-ivory/95 px-6 py-2.5 backdrop-blur sm:px-10 lg:flex lg:px-12">
          <QuickCreate />
        </div>
        <main className="min-w-0 flex-1 pb-24">
          <Outlet />
        </main>
      </div>

      <ModeSwitch />
    </div>
  );
}
