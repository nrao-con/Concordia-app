import { useState, useEffect, useCallback, useRef } from "react";
import { useClerk } from "@clerk/react";
import { unsubscribeFromPush } from "@/hooks/use-notifications";
import { useQueryClient } from "@tanstack/react-query";

const WARNING_BEFORE_MS = 2 * 60 * 1000;
const DEFAULT_TIMEOUT_MIN = 8 * 60;
export const INACTIVITY_TIMEOUT_KEY = "inactivity-timeout-minutes";

export function getInactivityTimeoutMs(): number {
  try {
    const stored = localStorage.getItem(INACTIVITY_TIMEOUT_KEY);
    if (stored) {
      const min = parseInt(stored, 10);
      if (!isNaN(min) && min > 0) return min * 60 * 1000;
    }
  } catch {
  }
  return DEFAULT_TIMEOUT_MIN * 60 * 1000;
}

function isStandalonePWA(): boolean {
  try {
    if ((window.navigator as any).standalone === true) return true;
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    return false;
  } catch {
    return false;
  }
}

export function useInactivityLogout() {
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [enabled, setEnabled] = useState(false);

  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef(Date.now());
  const warningVisibleRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    logoutTimerRef.current = null;
    warningTimerRef.current = null;
    countdownRef.current = null;
  }, []);

  const performLogout = useCallback(async () => {
    clearAllTimers();
    await unsubscribeFromPush();
    queryClient.clear();
    signOut({ redirectUrl: "/" }).catch(() => {
      window.location.replace("/");
    });
  }, [clearAllTimers, queryClient, signOut]);

  const startTimers = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    warningVisibleRef.current = false;
    setSecondsLeft(60);
    lastActivityRef.current = Date.now();

    const timeoutMs = getInactivityTimeoutMs();
    const warningAtMs = Math.max(timeoutMs - WARNING_BEFORE_MS, 0);

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      warningVisibleRef.current = true;
      setSecondsLeft(60);

      countdownRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            performLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, warningAtMs);

    logoutTimerRef.current = setTimeout(() => {
      performLogout();
    }, timeoutMs);
  }, [clearAllTimers, performLogout]);

  const staySignedIn = useCallback(() => {
    if (!enabled) return;
    clearAllTimers();
    setShowWarning(false);
    warningVisibleRef.current = false;
    setSecondsLeft(60);
    startTimers();
  }, [enabled, clearAllTimers, startTimers]);

  useEffect(() => {
    if (isStandalonePWA()) {
      setEnabled(false);
      clearAllTimers();
      return;
    }
    setEnabled(true);
  }, [clearAllTimers]);

  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      return;
    }

    startTimers();

    const events = ["mousedown", "touchstart", "keydown", "scroll", "mousemove"] as const;

    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const handleActivity = () => {
      if (warningVisibleRef.current) return;
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (warningVisibleRef.current) return;
        const now = Date.now();
        if (now - lastActivityRef.current > 1000) {
          lastActivityRef.current = now;
          startTimers();
        }
      }, 500);
    };

    for (const event of events) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      clearAllTimers();
      if (throttleTimer) clearTimeout(throttleTimer);
      for (const event of events) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [enabled, startTimers, clearAllTimers]);

  return {
    showWarning,
    secondsLeft,
    staySignedIn,
    enabled,
  };
}
