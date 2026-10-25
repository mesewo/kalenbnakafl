export const ETHIOPIC_CALENDAR_LOCALE = "am-ET-u-ca-ethiopic";

export function intlLocale(locale: string): string {
  return locale === "am" ? ETHIOPIC_CALENDAR_LOCALE : "en";
}
