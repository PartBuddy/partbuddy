import { IconChevronRight, IconLoader2 } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';

/** The surface of every card in the chat (plan, questions, sources, a refused call). */
export const card = 'flex min-w-0 flex-col rounded-lg border bg-surface-raised shadow-1';

/** The icon of a fold's line: turning while the work in it runs, its own icon once done. */
export function LiveIcon({ live, icon: Icon }: { live: boolean; icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }) {
  return live ? (
    <IconLoader2 className="size-icon-sm shrink-0 animate-spin text-accent" aria-hidden />
  ) : (
    <Icon className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
  );
}

/**
 * One line that opens to its details (chat polish): the shape every piece of the assistant's work
 * shares – steps, queries, tool details. The body slides open and is inert while closed.
 */
export function Fold({
  summary,
  children,
  testId,
  summaryTestId,
  className = '',
  defaultOpen = false,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  summaryTestId?: string;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const body = useId();
  return (
    <section className={`flex min-w-0 flex-col ${className}`} data-testid={testId} data-open={open}>
      <AriaButton
        aria-expanded={open}
        aria-controls={body}
        onPress={() => {
          setOpen(!open);
        }}
        className="flex min-h-control-sm min-w-0 items-center gap-2 rounded-md px-1 text-left text-sm text-text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
        data-testid={summaryTestId}
      >
        <IconChevronRight className={`size-icon-sm shrink-0 text-text-subtle transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
        {summary}
      </AriaButton>
      {/* Hidden (not only clipped) once closed: visibility switches at the end of the slide. */}
      <div id={body} inert={!open} className={`grid transition-[grid-template-rows,visibility] ${open ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="ml-3 flex flex-col gap-1 border-l border-border py-1 pl-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
