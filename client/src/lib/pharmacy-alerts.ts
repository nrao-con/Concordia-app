export interface PharmacyAlertItem {
  id?: string | number;
  title?: string;
  message?: string;
  body?: string;
  type?: string;
  severity?: string;
}

export function severityBadgeClass(severity?: string): string {
  switch (severity?.toLowerCase()) {
    case "urgent": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "high": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "medium": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    default: return "bg-muted text-muted-foreground";
  }
}

export const INACTIVITY_ALERT_THRESHOLD_MS = 24 * 60 * 60 * 1000;
