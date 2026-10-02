// Bundles a trigger button with dsh's acknowledgement-gated RiskConfirmation
// dialog, including busy state. A failed confirm stays open and its message
// joins the warning text, since RiskConfirmation has no separate error slot.

import { useState, type ReactNode } from 'react';
import { errorMessage } from '../../../api/client';
import { useAction } from '../../../lib/actions';
import { Button } from '../../primitives/Button';
import { RiskConfirmation } from '../../primitives/RiskConfirmation';

export function RiskConfirmButton({
  title,
  description,
  acknowledgeLabel,
  confirmLabel,
  busyLabel = 'Working…',
  trigger,
  triggerVariant = 'ghost',
  disabled = false,
  onConfirm,
}: {
  title: string;
  description: string;
  acknowledgeLabel: string;
  confirmLabel: string;
  busyLabel?: string;
  trigger: ReactNode;
  triggerVariant?: 'ghost' | 'outline';
  disabled?: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const action = useAction();
  return (
    <>
      <Button
        variant={triggerVariant}
        disabled={disabled}
        onClick={() => {
          action.reset();
          setAcknowledged(false);
          setOpen(true);
        }}
      >
        {trigger}
      </Button>
      <RiskConfirmation
        open={open}
        title={title}
        description={
          action.error ? description + ' ' + errorMessage(action.error) : description
        }
        acknowledgeLabel={acknowledgeLabel}
        cancelLabel="Cancel"
        closeLabel="Close dialog"
        confirmLabel={action.busy ? busyLabel : confirmLabel}
        acknowledged={acknowledged}
        disabled={action.busy}
        onAcknowledgedChange={setAcknowledged}
        onCancel={() => {
          if (!action.busy) setOpen(false);
        }}
        onConfirm={() =>
          void action.run(async () => {
            await onConfirm();
            setOpen(false);
          })
        }
      />
    </>
  );
}
