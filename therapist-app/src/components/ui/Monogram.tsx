import { cn } from '@/utils/cn';
import type { Person } from '@/types';

const sizes = {
  xs: 'h-7 w-7 text-[0.5625rem]',
  sm: 'h-8 w-8 text-[0.625rem]',
  md: 'h-10 w-10 text-[0.6875rem]',
  lg: 'h-12 w-12 text-xs',
  xl: 'h-14 w-14 text-sm',
};

/**
 * People are shown by monogram rather than photograph.
 *
 * The references draw it this way, and it is also the honest choice for a demo:
 * a licensed portrait of a therapy client is not something a prototype should
 * invent. Four calm tints are derived from the person's id, so the same person
 * always looks the same on every screen.
 */
const tints = [
  'bg-sage-soft text-forest',
  'bg-[#F4E6D4] text-amber-deep',
  'bg-[#E7EDE8] text-forest-accent',
  'bg-[#F5E2E0] text-rose-deep',
];

const tintFor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return tints[hash % tints.length];
};

export function Monogram({
  person,
  size = 'md',
  className,
}: {
  person: Pick<Person, 'id' | 'name' | 'initials'>;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase tracking-wider',
        tintFor(person.id),
        sizes[size],
        className,
      )}
    >
      <span aria-hidden="true">{person.initials}</span>
      <span className="sr-only">{person.name}</span>
    </span>
  );
}
