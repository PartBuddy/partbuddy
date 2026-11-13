import { useTranslation } from 'react-i18next';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import { useStudio, type ExportTarget } from '../state/store';
import { Button } from '../ui/Button';
import { useFindingText, useUnmeasuredText } from './PrintCheckChip';
import { asksBeforeExport } from './report';
import { modalClass, overlayClass } from '../ui/Dialog';

/**
 * Asks once before an export while the ready-to-print check is red (decided 2026-11-05): the user
 * may know better, so it only asks, it does not stop the export. It asks the same while SolidCraft still measures
 * gaps and joints, or when that measure failed (audit X-1): one pattern, and the dialog follows the light, so the user
 * sees the measure come in and decides then. Waiting instead would need a progress and a cancel of its own.
 */
export function ExportConfirm({ onConfirm }: { onConfirm: (target: ExportTarget) => void }) {
  const { t } = useTranslation();
  const format = useStudio((s) => s.exportConfirm);
  const setFormat = useStudio((s) => s.setExportConfirm);
  // Selected as it is and read after: a fresh `[]` from the selector would re-render forever.
  const check = useStudio((s) => s.printCheck);
  const findings = check?.result.findings ?? [];
  const text = useFindingText();
  const unmeasured = useUnmeasuredText()(check?.unmeasured ?? []);
  const blocking = findings.filter((finding) => finding.severity === 'block');
  return (
    <ModalOverlay
      isOpen={format !== null}
      onOpenChange={(open) => {
        if (!open) setFormat(null);
      }}
      isDismissable
      className={overlayClass}
    >
      <Modal className={modalClass('sm')}>
        <Dialog role="alertdialog" className="flex flex-col gap-3 p-5 outline-none" data-testid="export-confirm">
          {({ close }) => (
            <>
              <Heading slot="title" className="text-lg font-semibold text-text">
                {t('check.confirm.title')}
              </Heading>
              {blocking.length > 0 ? (
                <>
                  <p className="text-sm text-text-muted">{t('check.confirm.body')}</p>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text">
                    {blocking.map((finding, i) => (
                      <li key={`${finding.kind}-${String(i)}`}>{text(finding)}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {check?.measuring ? <p className="text-sm text-text-muted">{t('check.confirm.measuring')}</p> : null}
              {unmeasured ? <p className="text-sm text-text-muted">{t('check.confirm.unmeasured', { what: unmeasured })}</p> : null}
              {/* The measure came in green while the dialog stood open. */}
              {asksBeforeExport(check) ? null : <p className="text-sm text-text-muted">{t('check.confirm.done')}</p>}
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
