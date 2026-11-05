import type { SVGProps } from 'react';

import { zooIcons, type ZooIconName } from './zooIcons';

export type CadIconName = ZooIconName;

/**
 * Icon for a CAD operation (ADR 0023): Zoo Design Studio's filled glyphs, used like a Tabler icon
 * (`className` sets size and colour, `currentColor` fills). The view box crops Zoo's 20 px grid to
 * its 16 px drawing area, so a glyph fills the same space as a Tabler icon of the same size.
 * Decorative unless an `aria-label` is given.
 */
export function CadIcon({ name, ...props }: { name: CadIconName } & Omit<SVGProps<SVGSVGElement>, 'children'>) {
  const labelled = props['aria-label'] !== undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="2 2 16 16"
      fill="currentColor"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {zooIcons[name].map(({ d, evenOdd }) => (
        <path key={d} d={d} fillRule={evenOdd ? 'evenodd' : undefined} clipRule={evenOdd ? 'evenodd' : undefined} />
      ))}
    </svg>
  );
}
