import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@clerk/react";

type NotificationPermissionState = "default" | "granted" | "denied";

async function postToServiceWorker(message: Record<string, unknown>): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage(message);
}

async function clearWebsiteNotifications(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "CLEAR_WEBSITE_NOTIFICATIONS" });
    const notifications = await registration.getNotifications();
    notifications.forEach((notification) => notification.close());
  } catch (err) {
    console.warn("[Push] Failed to clear website notifications:", err instanceof Error ? err.message : err);
  }
}

async function subscribeToPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const res = await fetch("/api/push/vapid-public-key");
    if (!res.ok) return;
    const { publicKey } = await res.json();
    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await apiRequest("POST", "/api/push/subscribe", sub.toJSON());
  } catch (err) {
    console.warn("[Push] Subscribe failed:", err instanceof Error ? err.message : err);
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    await clearWebsiteNotifications();
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return;

    try {
      await apiRequest("DELETE", "/api/push/subscribe", { endpoint: sub.endpoint });
    } catch (err) {
      console.warn("[Push] Server unsubscribe failed:", err instanceof Error ? err.message : err);
    }

    await sub.unsubscribe();
  } catch (err) {
    console.warn("[Push] Browser unsubscribe failed:", err instanceof Error ? err.message : err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

export function useNotifications() {
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const [permission, setPermission] = useState<NotificationPermissionState>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "denied";
    return Notification.permission as NotificationPermissionState;
  });

  const supported = typeof window !== "undefined" && "Notification" in window;

  useEffect(() => {
    if (!supported) return;
    setPermission(Notification.permission as NotificationPermissionState);
  }, [supported]);

  // Re-register even an existing browser subscription whenever the Clerk account
  // changes. Push endpoints belong to the device and survive logout, so this
  // keeps the server-side owner aligned with the current signed-in account.
  useEffect(() => {
    if (!supported || !isClerkLoaded) return;
    postToServiceWorker({
      type: "SET_ACTIVE_NOTIFICATION_USER",
      userId: clerkUser?.id ?? "",
    }).catch(() => {});
    if (!clerkUser?.id) return;
    if (Notification.permission !== "granted") return;
    subscribeToPush().catch(() => {});
  }, [supported, isClerkLoaded, clerkUser?.id]);

  const requestPermission = useCallback(async (): Promise<NotificationPermissionState> => {
    if (!supported) return "denied";
    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermissionState);
      if (result === "granted") {
        subscribeToPush().catch(() => {});
      }
      return result as NotificationPermissionState;
    } catch {
      return "denied";
    }
  }, [supported]);

  const sendNotification = useCallback(
    async (title: string, options?: NotificationOptions & { sound?: boolean }) => {
      if (!supported || permission !== "granted" || !clerkUser?.id) return;

      const notifOptions: NotificationOptions & { vibrate?: number[] } = {
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [200, 100, 200],
        requireInteraction: false,
        ...options,
      };

      if (options?.sound !== false) {
        try {
          const audio = new Audio("/notification-sound.wav");
          audio.volume = 0.7;
          audio.play().catch(() => {});
        } catch {}
      }

      try {
        await postToServiceWorker({
          type: "SHOW_NOTIFICATION",
          userId: clerkUser.id,
          title,
          options: notifOptions,
        });
        return;
      } catch {}

      try {
        new Notification(title, notifOptions);
      } catch {}
    },
    [supported, permission, clerkUser?.id]
  );

  return {
    supported,
    permission,
    requestPermission,
    sendNotification,
  };
}
