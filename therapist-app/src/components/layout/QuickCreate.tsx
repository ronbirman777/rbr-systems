import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Bell, CalendarPlus, LibraryBig, MessageCircle, Plus, Sparkles } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { notificationsFor, unreadNotifications } from '@/services/selectors';
import { SessionFormDrawer } from '@/components/therapist/SessionFormDrawer';
import { BlockTimeDrawer } from '@/components/therapist/BlockTimeDrawer';
import { AssignPracticeDrawer } from '@/components/therapist/AssignPracticeDrawer';
import { ResourceFormDrawer } from '@/components/therapist/ResourceFormDrawer';
import { timeAgo } from '@/utils/date';
import { cn } from '@/utils/cn';

type Panel = 'create' | 'notifications' | null;

/**
 * One quiet control in the header rather than a scattering of buttons: the
 * things John starts most often, and the few events worth surfacing once.
 */
export function QuickCreate() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [resourceOpen, setResourceOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const notifications = notificationsFor(state, 'practitioner');
  const unread = unreadNotifications(state, 'practitioner');

  useEffect(() => {
    if (!panel) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setPanel(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setPanel(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  const actions = [
    { label: 'New Session', icon: CalendarPlus, run: () => setSessionOpen(true) },
    { label: 'Assign Practice', icon: Sparkles, run: () => setPracticeOpen(true) },
    { label: 'Add Resource', icon: LibraryBig, run: () => setResourceOpen(true) },
    { label: 'Block Time', icon: Ban, run: () => setBlockOpen(true) },
    { label: 'Message Client', icon: MessageCircle, run: () => navigate('/practitioner/clients') },
  ];

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setPanel(panel === 'notifications' ? null : 'notifications')}
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={panel === 'notifications'}
        className="tap-target relative rounded-control text-ink-soft transition-colors hover:bg-sage-wash hover:text-forest"
      >
        <Bell className="h-[1.125rem] w-[1.125rem]" />
        {unread > 0 && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber ring-2 ring-ivory" />
        )}
      </button>

      <button
        type="button"
        onClick={() => setPanel(panel === 'create' ? null : 'create')}
        aria-expanded={panel === 'create'}
        className="inline-flex h-9 items-center gap-1.5 rounded-control bg-forest px-3 text-[0.8125rem] font-medium text-cream transition-colors hover:bg-forest-accent"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Create</span>
      </button>

      {panel === 'create' && (
        <div className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-card border border-sage-line bg-white shadow-raised animate-scale-in">
          <ul className="hairlines">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <li key={action.label}>
                  <button
                    type="button"
                    onClick={() => {
                      setPanel(null);
                      action.run();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-[0.875rem] text-ink transition-colors hover:bg-cream/70"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-forest-accent" aria-hidden="true" />
                    {action.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {panel === 'notifications' && (
        <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-card border border-sage-line bg-white shadow-raised animate-scale-in">
          <div className="flex items-center justify-between border-b border-sage-line px-4 py-3">
            <p className="eyebrow">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'notification/read-all', audience: 'practitioner' })}
                className="text-2xs font-medium text-forest-accent hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.8125rem] text-ink-soft">
              You&rsquo;re all caught up.
            </p>
          ) : (
            <ul className="hairlines max-h-80 overflow-y-auto">
              {notifications.slice(0, 8).map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'notification/read', notificationId: notification.id });
                      setPanel(null);
                      if (notification.href) navigate(notification.href);
                    }}
                    className={cn(
                      'block w-full px-4 py-3 text-left transition-colors hover:bg-cream/70',
                      !notification.read && 'bg-sage-wash/40',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[0.875rem] font-medium text-ink">{notification.title}</span>
                      <span className="shrink-0 text-2xs text-ink-faint">{timeAgo(notification.at)}</span>
                    </span>
                    {notification.body && (
                      <span className="mt-0.5 block truncate text-[0.8125rem] text-ink-soft">
                        {notification.body}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-sage-line px-4 py-2.5 text-2xs leading-relaxed text-ink-faint">
            Completed practices are not notified — they appear in Recent Activity.
          </p>
        </div>
      )}

      <SessionFormDrawer open={sessionOpen} onClose={() => setSessionOpen(false)} />
      <BlockTimeDrawer open={blockOpen} onClose={() => setBlockOpen(false)} />
      <AssignPracticeDrawer open={practiceOpen} onClose={() => setPracticeOpen(false)} />
      <ResourceFormDrawer open={resourceOpen} onClose={() => setResourceOpen(false)} />
    </div>
  );
}
