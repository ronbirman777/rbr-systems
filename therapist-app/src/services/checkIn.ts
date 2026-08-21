import type { Client } from '@/types';
import type { EngagementReading } from './engagementEngine';

/**
 * A suggested supportive check-in.
 *
 * The system drafts; the therapist decides. Nothing here is ever sent
 * automatically, and the draft deliberately avoids naming a cause, asking the
 * client to explain themselves, or implying that something is wrong.
 */
export interface CheckInSuggestion {
  clientId: string;
  reason: string;
  body: string;
}

export function suggestCheckIn(client: Client, reading: EngagementReading): CheckInSuggestion {
  const name = client.preferredName;
  const evening = reading.observations.find((o) => o.toLowerCase().startsWith('evening'));

  let body: string;
  if (reading.status === 'recently-inactive') {
    body = `Hi ${name}, it has been a quiet few days on your side of the app — which is completely allowed. No need to catch anything up. If the plan needs to be smaller for a while, we can shape that together when we next speak. Hope you're doing okay.`;
  } else if (evening) {
    body = `Hi ${name}, I noticed the evening practices haven't been fitting into the last couple of days. No pressure at all. We can adjust the rhythm together during our next session if needed. Hope you're doing okay.`;
  } else if (reading.status === 'change-detected') {
    body = `Hi ${name}, the last few days have looked a little different from your usual rhythm — nothing to explain, I just wanted to say hello. If the plan is asking too much this week, we can change it. Hope you're doing okay.`;
  } else {
    body = `Hi ${name}, just a short note between sessions — no reply needed. If anything in the plan needs adjusting before we next meet, tell me and we'll change it together.`;
  }

  return { clientId: client.id, reason: reading.headline, body };
}
