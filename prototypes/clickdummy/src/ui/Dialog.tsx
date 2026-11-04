import type { ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

export function ModalDialog({
  isOpen,
  onOpenChange,
  title,
  children,
  wide = false,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay pt-dialog-offset"
    >
      <Modal
        className={`${wide ? 'w-dialog-lg' : 'w-dialog-sm'} max-w-full rounded-lg border border-border bg-surface-raised shadow-3 outline-none`}
      >
        <Dialog className="outline-none">
          <Heading slot="title" className="border-b border-border px-4 py-3 text-lg font-semibold text-text">
            {title}
          </Heading>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
