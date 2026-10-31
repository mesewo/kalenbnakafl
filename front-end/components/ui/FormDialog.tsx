"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function FormDialog({
  open,
  title,
  onClose,
  children,
  dirty = false,
  discardTitle,
  discardMessage,
  discardLabel,
  cancelLabel,
  closeLabel,
  wide = false,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode | ((requestClose: () => void) => ReactNode);
  dirty?: boolean;
  discardTitle: string;
  discardMessage: string;
  discardLabel: string;
  cancelLabel: string;
  closeLabel: string;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestClose = useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="modal-backdrop" role="presentation">
        <div
          ref={dialogRef}
          className={`modal${wide ? " modal-wide" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="form-dialog-title"
          onKeyDown={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('[aria-modal="true"]') !== dialogRef.current
            ) {
              return;
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              requestClose();
              return;
            }
            if (event.key !== "Tab" || confirmDiscard || !dialogRef.current) return;
            const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
            );
            const first = focusable.item(0);
            const last = focusable.item(focusable.length - 1);
            if (!first || !last) event.preventDefault();
            else if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div className="modal-head">
            <h2 id="form-dialog-title">{title}</h2>
            <button
              className="close-btn"
              ref={closeRef}
              type="button"
              aria-label={closeLabel}
              onClick={requestClose}
            />
          </div>
          {typeof children === "function" ? children(requestClose) : children}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        title={discardTitle}
        message={discardMessage}
        confirmLabel={discardLabel}
        cancelLabel={cancelLabel}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
