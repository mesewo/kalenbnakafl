import { useTranslations } from "next-intl";

export default function Toast({
  message,
  tone,
  onDismiss,
}: {
  message: string;
  tone: "success" | "error";
  onDismiss: () => void;
}) {
  const t = useTranslations("dashboard");
  return (
    <div className={`toast toast-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {message}
      <button type="button" aria-label={t("dismissNotification")} onClick={onDismiss}>
        {t("dismissNotification")}
      </button>
    </div>
  );
}
