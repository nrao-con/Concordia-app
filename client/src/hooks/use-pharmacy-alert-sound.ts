import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { useAuth } from "@/hooks/use-auth";
import type { Notification } from "@shared/schema";

interface NotificationPrefs {
  pharmacyAlertsEnabled: boolean;
  snoozeUntilAt: string | null;
}

function seenIdsKey(userId: string, patientId: string | null): string {
  return `pharmacy-alert-sound-seen-ids:${userId}:${patientId ?? "self"}`;
}

function loadSeenIds(key: string): Set<number> {
  try {
    const stored = sessionStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(key: string, ids: Set<number>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {}
}

function playSound(volume: number): void {
  try {
    const audio = new Audio("/notification-sound.wav");
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.play().catch(() => {});
  } catch {}
}

export function usePharmacyAlertSound() {
  const { user } = useAuth();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (path: string) => proxyUrl(path, activePatientId, isProxy);

  const storageKey = user ? seenIdsKey(user.id, activePatientId) : null;
  const seenIdsRef = useRef<Set<number>>(
    storageKey ? loadSeenIds(storageKey) : new Set()
  );
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!storageKey) return;
    seenIdsRef.current = loadSeenIds(storageKey);
    initializedRef.current = false;
  }, [storageKey]);

  const { data: notifications, dataUpdatedAt } = useQuery<Notification[]>({
    queryKey: [pUrl("/api/notifications")],
    enabled: !!user,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const { data: prefs } = useQuery<NotificationPrefs>({
    queryKey: [pUrl("/api/notification-preferences"), user?.id, activePatientId],
    enabled: !!user,
    staleTime: 5000,
  });

  useEffect(() => {
    if (!storageKey) return;
    if (dataUpdatedAt === 0) return;

    const seenIds = seenIdsRef.current;
    const notifs = notifications ?? [];

    if (!initializedRef.current) {
      notifs.forEach((n) => seenIds.add(n.id));
      saveSeenIds(storageKey, seenIds);
      initializedRef.current = true;
      return;
    }

    const snoozed =
      prefs?.snoozeUntilAt ? new Date(prefs.snoozeUntilAt) > new Date() : false;
    const alertsEnabled = prefs?.pharmacyAlertsEnabled ?? true;

    let hasNewPharmacyAlert = false;
    let hasNewOtherNotif = false;

    notifs.forEach((n) => {
      if (seenIds.has(n.id)) return;
      seenIds.add(n.id);

      if (n.type === "pharmacy_alert") {
        hasNewPharmacyAlert = true;
      } else {
        hasNewOtherNotif = true;
      }
    });

    saveSeenIds(storageKey, seenIds);

    if (hasNewPharmacyAlert && alertsEnabled && !snoozed) {
      playSound(1.0);
    } else if (hasNewOtherNotif) {
      playSound(0.35);
    }
  }, [dataUpdatedAt, storageKey, prefs]);
}
