import { useState } from 'react';
import { cn } from '@/utils/cn';
import type { Person } from '@/types';

const sizes = {
  xs: 'h-7 w-7 text-[0.6rem]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
  '2xl': 'h-24 w-24 text-2xl',
};

/**
 * Four calm duotones drawn from the palette. Which one a person gets is
 * derived from their id, so it never changes between screens.
 */
const duotones = [
  'from-[#DDE7E0] to-[#B4C4BA] text-forest-700',
  'from-[#F6EEDF] to-[#E3D3B6] text-[#8A6224]',
  'from-[#EAF0EB] to-[#92A99C] text-forest-900',
  'from-[#F5EAEA] to-[#DCC5C5] text-[#8E5F5F]',
];

const toneFor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return duotones[hash % duotones.length];
};

interface AvatarProps {
  person: Pick<Person, 'id' | 'photoUrl' | 'initials' | 'firstName' | 'lastName'>;
  size?: keyof typeof sizes;
  className?: string;
  ring?: boolean;
}

/**
 * Portraits are referenced centrally in `data/people.ts`, so one person always
 * has one face. When a photograph cannot load, a designed monogram takes its
 * place rather than a broken frame — the demo never shows a missing image.
 */
export function Avatar({ person, size = 'md', className, ring = false }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const label = `${person.firstName} ${person.lastName}`;

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br',
        toneFor(person.id),
        ring && 'ring-2 ring-white',
        sizes[size],
        className,
      )}
    >
      {failed ? (
        <span className="editorial select-none pt-px tracking-tight" aria-hidden="true">
          {person.initials}
        </span>
      ) : (
        <img
          src={person.photoUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
