import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import type { ExportFormat } from '../../../shared/contract';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import { useFindingText } from './PrintCheckChip';

/**
 * Asks once before an export while the ready-to-print check is red (decided 2026-11-05): the user
 * may know better, so it only asks, it does not stop the export.
 */
export function ExportConfirm({ onConfirm }: { onConfirm: (format: ExportFormat) => void }) {
  const { t } = useTranslation();
  const format = useStudio((s) => s.exportConfirm);
  const setFormat = useStudio((s) => s.setExportConfirm);
  // Selected as it is and read after: a fresh `[]` from the selector would re-render forever.
  const check = useStudio((s) => s.printCheck);
  const findings = check?.result.findings ?? [];
  const text = useFindingText();
  const blocking = findings.filter((finding) => finding.severity === 'block');
  return (
    <ModalOverlay
      isOpen={format !== null}
      onOpenChange={(open) => {
        if (!open) setFormat(null);
      }}
      isDismissable
      className="fixed inset-0 z-10 flex items-start justify-center bg-overlay px-4 pt-dialog-offset"
    >
      <Modal className="w-dialog-sm max-w-full rounded-lg border border-border bg-surface-raised shadow-3">
        <Dialog role="alertdialog" className="flex flex-col gap-3 p-5 outline-none" data-testid="export-confirm">
          {({ close }) => (
            <>
              <Heading slot="title" className="text-lg font-semibold text-text">
                {t('check.confirm.title')}
              </Heading>
              <p className="text-sm text-text-muted">{t('check.confirm.body')}</p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text">
                {blocking.map((finding, i) => (
                  <li key={`${finding.kind}-${String(i)}`}>{text(finding)}</li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <Button onPress={close} data-testid="export-confirm-cancel" autoFocus>
                  {t('check.confirm.cancel')}
                </Button>
                <Button
                  variant="primary"
                  data-testid="export-confirm-go"
                  onPress={() => {
                    if (format) onConfirm(format);
                    close();
                  }}
                >
                  {t('check.confirm.go')}
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
