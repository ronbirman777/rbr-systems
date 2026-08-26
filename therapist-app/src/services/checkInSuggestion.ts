import type { Client } from '@/types';
import type { BaselineReading } from './baselineEngine';

/**
 * A suggested supportive message.
 *
 * The system drafts; the practitioner reviews, edits and sends. Nothing is ever
 * sent automatically. The wording names what was observed and never why — it
 * makes no request to catch up, and asks nobody to explain themselves.
 */
export function suggestCheckIn(client: Client, reading: BaselineReading): string {
  const name = client.name;

  if (reading.state === 'recently-inactive') {
    return `Hi ${name}, just checking in. It has been a quiet few days and that is completely fine. Nothing to catch up on — I simply wanted to see how you're doing.`;
  }

  if (reading.insight?.startsWith('Evening')) {
    return `Hi ${name}, just checking in. I noticed things have been a little quieter this week, particularly in the evenings. No pressure to catch up on anything. I simply wanted to see how you're doing.`;
  }

  if (reading.state === 'change-detected') {
    return `Hi ${name}, just checking in. I noticed things have been a little quieter this week. No pressure to catch up on anything. I simply wanted to see how you're doing.`;
  }

  if (reading.state === 're-engaged') {
    return `Hi ${name}, good to see you back in the rhythm this week. No reply needed — just wanted to say hello between sessions.`;
  }

  return `Hi ${name}, a short note between sessions — no reply needed. If anything in the plan needs adjusting before we next meet, tell me and we can change it together.`;
}
