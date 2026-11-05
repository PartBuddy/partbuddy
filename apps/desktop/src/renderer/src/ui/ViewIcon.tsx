import type { SVGProps } from 'react';

/** Faces of a cube seen from the front right and above, in a 16 px box. */
const FACES = {
  top: '8 2.5 14 5.5 8 8.5 2 5.5',
  front: '2 5.5 8 8.5 8 14.5 2 11.5',
  right: '8 8.5 14 5.5 14 11.5 8 14.5',
} as const;

/**
 * A standard view as CAD programs show it (UI upgrade, professional look): a cube with the face
 * the view looks at filled. Decorative; the button carries the name.
 */
export function ViewIcon({ face, ...props }: { face: keyof typeof FACES } & Omit<SVGProps<SVGSVGElement>, 'children'>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinejoin="round" aria-hidden focusable="false" {...props}>
      {Object.entries(FACES).map(([name, points]) => (
        <polygon key={name} points={points} fill={name === face ? 'currentColor' : 'none'} fillOpacity={name === face ? 0.85 : undefined} />
      ))}
    </svg>
  );
}
