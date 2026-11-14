"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePortalTarget } from "@/components/ui/Portal";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const portalTarget = usePortalTarget();

  useEffect(() => {
    if (!open || !portalTarget) return;
    const previousFocus = document.activeElement;
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, [open, portalTarget]);

  if (!open || !portalTarget) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
        if (event.key === "Tab") {
          if (event.shiftKey && document.activeElement === cancelRef.current) {
            event.preventDefault();
            confirmRef.current?.focus();
          } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
            event.preventDefault();
            cancelRef.current?.focus();
          }
        }
      }}
    >
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <div className="modal-head">
          <h2 id="confirm-title">{title}</h2>
        </div>
        <p id="confirm-message">{message}</p>
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel} ref={cancelRef}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-danger" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
