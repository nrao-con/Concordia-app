import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNotifications } from "@/hooks/use-notifications";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { useTranslation } from "react-i18next";
import type { Reminder } from "@shared/schema";
import { useUser } from "@clerk/react";

const CHECK_INTERVAL = 30_000;
const FIRE_WINDOW_MS = 60_000;

const DAY_MAP: Record<number, string> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

function isReminderDueNow(reminder: Reminder): boolean {
  if (!reminder.isActive || !reminder.scheduledTime) return false;

  const now = new Date();
  const todayKey = DAY_MAP[now.getDay()];

  if (reminder.scheduledDays && reminder.scheduledDays.length > 0) {
    if (!reminder.scheduledDays.includes(todayKey)) return false;
  }

  const [hours, minutes] = reminder.scheduledTime.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return false;

  const scheduledToday = new Date();
  scheduledToday.setHours(hours, minutes, 0, 0);

  const diff = now.getTime() - scheduledToday.getTime();
  return diff >= 0 && diff < FIRE_WINDOW_MS;
}

export function useReminderScheduler() {
  const { t } = useTranslation();
  const { user: clerkUser } = useUser();
  const { permission, sendNotification } = useNotifications();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const firedRef = useRef<Set<string>>(new Set());
  const lastResetDateRef = useRef<string>("");

  const { data: reminders } = useQuery<Reminder[]>({
    queryKey: [pUrl("/api/reminders"), clerkUser?.id, activePatientId],
    enabled: !!clerkUser?.id,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    firedRef.current.clear();
    lastResetDateRef.current = "";
  }, [clerkUser?.id, activePatientId]);

  useEffect(() => {
    if (permission !== "granted" || !reminders || reminders.length === 0) return;

    const checkReminders = () => {
      const today = new Date().toDateString();
      if (lastResetDateRef.current !== today) {
        firedRef.current.clear();
        lastResetDateRef.current = today;
      }

      for (const reminder of reminders) {
        const firedKey = `${reminder.id}-${reminder.scheduledTime}-${today}`;

        if (firedRef.current.has(firedKey)) continue;
        if (!isReminderDueNow(reminder)) continue;

        firedRef.current.add(firedKey);

        const typeLabel =
          reminder.type === "medication" ? t("reminders.medication") :
          reminder.type === "refill_alert" ? t("reminders.refillAlert") :
          reminder.type === "pickup" ? t("reminders.pickupReminder") :
          reminder.type === "doctor_visit" ? t("reminders.doctorVisit") :
          t("reminders.medication");

        sendNotification(reminder.title || typeLabel, {
          body: reminder.description || typeLabel,
          tag: `reminder-${reminder.id}`,
        });
      }
    };

    checkReminders();

    const interval = setInterval(checkReminders, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [permission, reminders, sendNotification, t, clerkUser?.id, activePatientId]);
}
