import { NavLink, useLocation } from 'react-router-dom';
import { Activity, CalendarDays, Home, Leaf, Settings, Users } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { Monogram } from '@/components/ui/Monogram';
import { cn } from '@/utils/cn';

export const NAV = [
  { to: '/practitioner/today', label: 'Today', icon: Home },
  { to: '/practitioner/clients', label: 'Clients', icon: Users },
  { to: '/practitioner/care', label: 'Continuous Care', icon: Activity },
  { to: '/practitioner/sessions', label: 'Sessions', icon: CalendarDays },
  { to: '/practitioner/sanctuary', label: 'Sanctuary', icon: Leaf },
];

/** The deep forest rail from the reference: mark, navigation, practitioner, settings. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { state } = useApp();
  const location = useLocation();

  return (
    <div className="flex h-full flex-col bg-forest px-4 py-6">
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-cream font-display text-[0.6875rem] font-semibold tracking-tight text-forest">
          RBR
        </span>
        <span className="font-display text-xl leading-none text-cream">RBR</span>
      </div>

      <nav className="mt-8 flex-1 space-y-0.5" aria-label="Practitioner">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[2.75rem] items-center gap-3 rounded-[10px] px-3 text-sm transition-colors',
                active ? 'bg-forest-accent text-cream' : 'text-sage hover:bg-forest-accent/50 hover:text-cream',
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-cream"
                />
              )}
              <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-6 space-y-1 border-t border-white/10 pt-5">
        <div className="flex items-center gap-3 px-2 py-1">
          <Monogram person={state.practitioner} size="sm" className="bg-cream/90 text-forest" />
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight text-cream">{state.practitioner.name}</p>
            <p className="truncate text-2xs text-sage">{state.practitioner.title}</p>
          </div>
        </div>
        <NavLink
          to="/practitioner/settings"
          onClick={onNavigate}
          className={cn(
            'flex min-h-[2.75rem] items-center gap-3 rounded-[10px] px-3 text-sm transition-colors',
            location.pathname.startsWith('/practitioner/settings')
              ? 'bg-forest-accent text-cream'
              : 'text-sage hover:bg-forest-accent/50 hover:text-cream',
          )}
        >
          <Settings className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden="true" />
          Settings &amp; Workspace
        </NavLink>
      </div>
    </div>
  );
}
