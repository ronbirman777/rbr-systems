import type { CheckIn } from '@/types';

/** Previously sent supportive messages. Every one was reviewed before sending. */
export const checkIns: CheckIn[] = [
  {
    id: 'ci-daniel-1',
    clientId: 'daniel',
    body: 'Hi Daniel, no need to reply to this. Just a note to say the walk is the one that matters — everything else can wait until we speak.',
    status: 'sent',
    createdAt: '2026-08-24T09:10:00',
    sentAt: '2026-08-24T09:12:00',
  },
  {
    id: 'ci-maya-1',
    clientId: 'maya',
    body: 'Hi Maya, I noticed the week has been full. Nothing to catch up on — we can reshape the plan when we speak on Thursday.',
    status: 'sent',
    createdAt: '2026-08-25T16:40:00',
    sentAt: '2026-08-25T16:42:00',
  },
  {
    id: 'ci-olivia-1',
    clientId: 'olivia',
    body: 'Hi Olivia, thinking of you around the 22nd. No reply needed at all.',
    status: 'sent',
    createdAt: '2026-08-21T10:05:00',
    sentAt: '2026-08-21T10:06:00',
  },
];
