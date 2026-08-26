import { useApp, resetDemo } from '@/state/AppProvider';
import { PageHeader } from '@/components/therapist/PageHeader';
import { Monogram } from '@/components/ui/Monogram';
import { Button } from '@/components/ui/Button';
import { Card, Eyebrow } from '@/components/ui/Primitives';
import { defaultBaselineConfig } from '@/services/baselineEngine';
import { useNavigate } from 'react-router-dom';

/**
 * Workspace settings. This is a prototype, so it states plainly what is real
 * and what is not, rather than showing switches that do nothing.
 */
export default function Settings() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const config = defaultBaselineConfig;

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 py-8 sm:px-10 lg:px-12">
        <PageHeader eyebrow="Settings & Workspace" title="Your workspace" />
      </div>

      <div className="max-w-3xl px-6 py-8 sm:px-10 lg:px-12">
        <section>
          <Eyebrow className="mb-3">Practitioner</Eyebrow>
          <Card className="flex items-center gap-4 p-5">
            <Monogram person={state.practitioner} size="lg" />
            <div>
              <p className="font-display text-xl leading-tight text-ink">{state.practitioner.name}</p>
              <p className="text-[0.8125rem] text-ink-soft">
                {state.practitioner.title} · {state.clients.length} active clients
              </p>
            </div>
          </Card>
        </section>

        <section className="mt-9">
          <Eyebrow className="mb-3">Baseline intelligence</Eyebrow>
          <Card className="p-5">
            <p className="text-[0.9375rem] leading-relaxed text-ink">
              Each client is read against their own learned rhythm over{' '}
              <strong className="font-semibold">21 days</strong>, with the last{' '}
              <strong className="font-semibold">{config.window} days</strong> weighted most recently. There is
              no universal target and no comparison between clients.
            </p>
            <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                { label: 'Change detected at', value: `${config.changePoints} points below usual` },
                { label: 'Check in suggested at', value: `${config.checkInPoints} points below usual` },
                { label: 'Recently inactive at', value: `${config.inactiveDays} days without activity` },
                {
                  label: 'Re-engaged at',
                  value: `a full day back after ${config.quietDaysBeforeReturn} quiet days`,
                },
              ].map((row) => (
                <div key={row.label}>
                  <dt className="eyebrow">{row.label}</dt>
                  <dd className="mt-1 text-[0.875rem] text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-2xs leading-relaxed text-ink-faint">
              These readings are private to you. Nothing in this section is visible in the client companion.
            </p>
          </Card>
        </section>

        <section className="mt-9">
          <Eyebrow className="mb-3">About this prototype</Eyebrow>
          <Card className="p-5">
            <ul className="space-y-2.5 text-[0.9375rem] leading-relaxed text-ink-soft">
              <li>All data is demonstration data held in this browser. There is no server and no account.</li>
              <li>
                No authentication is implemented, so this is not secure clinical infrastructure and makes no
                compliance claim.
              </li>
              <li>Reminders and notifications exist in the data model but are not delivered.</li>
              <li>Audio players run the timing; no recordings are bundled.</li>
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => {
                  resetDemo(dispatch);
                  navigate('/practitioner/today');
                }}
              >
                Reset demonstration data
              </Button>
              <p className="text-2xs text-ink-faint">Returns every screen to its opening state.</p>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
