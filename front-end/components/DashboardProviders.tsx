"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

type Toast = { id: number; message: string; tone: "success" | "error" };
type ToastContextValue = { showToast: (message: string, tone?: Toast["tone"]) => void };
type Confirmation = { message: string; confirmLabel: string };
type ConfirmationContextValue = (message: string, confirmLabel?: string) => Promise<boolean>;

const ToastContext = createContext<ToastContextValue | null>(null);
const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

export function DashboardProviders({ children }: { children: React.ReactNode }) {
  const t = useTranslations("dashboard");
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: true, retry: false },
          mutations: { retry: false },
        },
      }),
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationResolver = useRef<((accepted: boolean) => void) | null>(null);
  const showToast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      5000,
    );
  }, []);
  const confirm = useCallback<ConfirmationContextValue>(
    (message, confirmLabel = t("confirmAction")) =>
      new Promise((resolve) => {
        confirmationResolver.current?.(false);
        confirmationResolver.current = resolve;
        setConfirmation({ message, confirmLabel });
      }),
    [t],
  );
  const resolveConfirmation = useCallback((accepted: boolean) => {
    confirmationResolver.current?.(accepted);
    confirmationResolver.current = null;
    setConfirmation(null);
  }, []);
  const toastValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastContext.Provider value={toastValue}>
        <ConfirmationContext.Provider value={confirm}>
          {children}
          <ConfirmDialog
            open={confirmation !== null}
            title={t("confirmActionTitle")}
            message={confirmation?.message ?? ""}
            confirmLabel={confirmation?.confirmLabel ?? t("confirmAction")}
            cancelLabel={t("cancel")}
            onConfirm={() => resolveConfirmation(true)}
            onCancel={() => resolveConfirmation(false)}
          />
          <div className="toast-region" aria-live="polite" aria-relevant="additions">
            {toasts.map((toast) => (
              <div
                className={`toast toast-${toast.tone}`}
                key={toast.id}
                role={toast.tone === "error" ? "alert" : "status"}
              >
                {toast.message}
                <button
                  type="button"
                  aria-label={t("dismissNotification")}
                  onClick={() =>
                    setToasts((current) => current.filter((item) => item.id !== toast.id))
                  }
                >
                  {t("dismissNotification")}
                </button>
              </div>
            ))}
          </div>
        </ConfirmationContext.Provider>
      </ToastContext.Provider>
    </QueryClientProvider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmationContext);
  if (!context) {
    // eslint-disable-next-line no-restricted-syntax -- developer-only provider invariant
    throw new Error("useConfirm must be used inside DashboardProviders");
  }
  return context;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // eslint-disable-next-line no-restricted-syntax -- developer-only provider invariant
    throw new Error("useToast must be used inside DashboardProviders");
  }
  return context.showToast;
}
