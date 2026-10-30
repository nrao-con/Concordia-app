import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { type PharmacyAlertItem } from "@/lib/pharmacy-alerts";
import { useUser } from "@clerk/react";
import { proxyUrl, usePatientContext } from "@/hooks/use-patient-context";

export type { PharmacyAlertItem };

interface NotificationPrefs {
  pharmacyAlertsEnabled: boolean;
  pharmacyAlertMinSeverity: string;
  snoozeUntilAt: string | null;
  inactivityThresholdHours: number;
}

const DEFAULT_THRESHOLD_HOURS = 24;
const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;

function writeLastActive(key: string) {
  localStorage.setItem(key, String(Date.now()));
}

export function useInactivityAlertCheck() {
  const { user } = useUser();
  const { activePatientId, isProxy } = usePatientContext();
  const activityOwnerId = isProxy && activePatientId ? activePatientId : user?.id;
  const lastActiveKey = activityOwnerId ? `lastActiveAt:${activityOwnerId}` : null;
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [missedAlerts, setMissedAlerts] = useState<PharmacyAlertItem[]>([]);
  const [alertsShown, setAlertsShown] = useState(false);
  const activityThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setElapsedMs(null);
    setShowDialog(false);
    setMissedAlerts([]);
    setAlertsShown(false);
    if (!lastActiveKey) return;
    const activityKey = lastActiveKey;

    const lastActive = localStorage.getItem(activityKey);
    const now = Date.now();
    writeLastActive(activityKey);

    if (lastActive) {
      setElapsedMs(now - parseInt(lastActive, 10));
    }

    function startHeartbeat() {
      if (heartbeatRef.current) return;
      heartbeatRef.current = setInterval(() => {
        if (!document.hidden) {
          writeLastActive(activityKey);
        }
      }, HEARTBEAT_INTERVAL_MS);
    }

    function stopHeartbeat() {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    }

    const handleVisibility = () => {
      if (document.hidden) {
        stopHeartbeat();
      } else {
        writeLastActive(activityKey);
        startHeartbeat();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    if (!document.hidden) {
      startHeartbeat();
    }

    const throttledActivity = () => {
      if (activityThrottleRef.current) return;
      writeLastActive(activityKey);
      activityThrottleRef.current = setTimeout(() => {
        activityThrottleRef.current = null;
      }, 60_000);
    };

    const ACTIVITY_EVENTS = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ] as const;

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, throttledActivity, { passive: true })
    );

    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, throttledActivity)
      );
      document.removeEventListener("visibilitychange", handleVisibility);
      stopHeartbeat();
      if (activityThrottleRef.current) {
        clearTimeout(activityThrottleRef.current);
      }
    };
  }, [lastActiveKey]);

  const { data: prefs } = useQuery<NotificationPrefs>({
    queryKey: [pUrl("/api/notification-preferences"), activityOwnerId],
    enabled: elapsedMs !== null && !!activityOwnerId,
  });

  const thresholdMs = (prefs?.inactivityThresholdHours ?? DEFAULT_THRESHOLD_HOURS) * 60 * 60 * 1000;
  const isInactive = elapsedMs !== null && prefs !== undefined && elapsedMs >= thresholdMs;
  const notificationsEnabled = prefs?.pharmacyAlertsEnabled ?? false;

  const { data: alerts } = useQuery<PharmacyAlertItem[]>({
    queryKey: [pUrl("/api/pharmacy-alerts"), activityOwnerId],
    enabled: isInactive && notificationsEnabled && !!activityOwnerId,
  });

  useEffect(() => {
    if (alertsShown) return;
    if (!isInactive || !notificationsEnabled) return;
    if (Array.isArray(alerts) && alerts.length > 0) {
      setMissedAlerts(alerts);
      setShowDialog(true);
      setAlertsShown(true);
    }
  }, [alerts, isInactive, notificationsEnabled, alertsShown]);

  const dismiss = () => {
    setShowDialog(false);
    setMissedAlerts([]);
  };

  return { showDialog, missedAlerts, dismiss };
}
