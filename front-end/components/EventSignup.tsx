"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type EventItem, type PageResponse } from "@/lib/api";
import { useApiWakeup } from "@/lib/use-api-wakeup";

export default function EventSignup({ event }: { event: EventItem }) {
  const t = useTranslations("events");
  const common = useTranslations("common");
  const isWaking = useApiWakeup();
  const locale = useLocale();
  const { user, isLoading } = useAuth();
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    let active = true;
    apiFetch<PageResponse<EventItem>>("/me/signups?limit=50")
      .then((data) => {
        if (active) setSigned(data.items.some((item) => item.id === event.id));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, event.id]);
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/events/${event.id}/signup`, { method: signed ? "DELETE" : "POST" });
      setSigned(!signed);
    } catch (err) {
      setError(err instanceof Error ? err.message : common("error"));
    } finally {
      setBusy(false);
    }
  }
  if (!user || isLoading)
    return (
      <Link
        className="btn btn-sun btn-small"
        href={`/auth/login?next=${encodeURIComponent(`/${locale}/events`)}`}
      >
        {t("login")}
      </Link>
    );
  return (
    <>
      {isWaking && (
        <p className="status" role="status" aria-live="polite">
          {common("serverWaking")}
        </p>
      )}
      <button className="btn btn-sun btn-small" onClick={() => void toggle()} disabled={busy}>
        {busy ? t("saving") : signed ? t("cancel") : t("signup")}
      </button>
      {error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
