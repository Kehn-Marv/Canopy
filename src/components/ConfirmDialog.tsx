import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,

  DialogHeader,
  DialogTitle } from
'./ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  /** When set, the action requires a typed reason — recorded in the ledger. */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  requireReason?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  reasonLabel,
  reasonPlaceholder,
  requireReason,
  onConfirm
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setPending(false);
    }
  }, [open]);

  const submit = async () => {
    if (requireReason && reason.trim().length < 3) {
      setError('Give a short reason. It goes into the permanent record.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !pending && onOpenChange(next)}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md border-border/40 shadow-2xl">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px] tracking-[-0.015em]">{title}</DialogTitle>
            <DialogDescription className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground/90">
              {description}
            </DialogDescription>
          </DialogHeader>
          {reasonLabel &&
          <div className="mt-5 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="confirm-reason" className="text-[13px] font-medium text-foreground/80">{reasonLabel}</Label>
                <span className="text-[11px] font-mono text-muted-foreground/50">{reason.length}/120</span>
              </div>
              <Input
                id="confirm-reason"
                value={reason}
                placeholder={reasonPlaceholder}
                maxLength={120}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && void submit()}
                className="h-11 focus-visible:ring-destructive/30"
                autoFocus />
            </div>
          }
          {error &&
          <div className="mt-5 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3">
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {error}
            </p>
          </div>
          }
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border/40 bg-muted/20 px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending} className="text-[12.5px]">
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => void submit()}
            disabled={pending}
            className="text-[12.5px]">
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>);

}