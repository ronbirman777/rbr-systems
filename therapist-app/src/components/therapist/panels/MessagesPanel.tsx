import type { Client } from '@/types';
import { MessageThread } from '@/components/shared/MessageThread';

/** The same conversation the client sees, from the practitioner's side. */
export function MessagesPanel({ client }: { client: Client }) {
  return (
    <div className="px-6 py-8 sm:px-10 lg:px-12">
      <h2 className="font-display text-[1.625rem] leading-tight text-ink">Messages</h2>
      <p className="mt-1.5 max-w-xl text-[0.9375rem] text-ink-soft">
        Asynchronous by design. Nobody is expected to be waiting at the other end.
      </p>
      <MessageThread clientId={client.id} viewer="practitioner" className="mt-6 max-h-[36rem]" />
    </div>
  );
}
