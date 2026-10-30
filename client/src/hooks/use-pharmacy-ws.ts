import { useEffect, useRef, useCallback } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { PharmacyMessage } from "@shared/schema";

type WsPharmacyPayload = {
  type: "pharmacy_message";
  payload: PharmacyMessage;
};

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export type UsePharmacyWSReturn = {
  sendMessage: (opts: { message: string; category?: string; relatedOrderId?: number | null }) => Promise<void>;
};

export function usePharmacyWS(queryKey: string[]): UsePharmacyWSReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;

  const handleMessage = useCallback((event: MessageEvent) => {
    let data: WsPharmacyPayload;
    try {
      data = JSON.parse(event.data as string) as WsPharmacyPayload;
    } catch {
      return;
    }
    if (data.type !== "pharmacy_message" || !data.payload) return;

    const incoming = data.payload;

    queryClient.setQueryData<PharmacyMessage[]>(
      queryKeyRef.current,
      (prev) => {
        if (!prev) return [incoming];
        const existingIndex = prev.findIndex((m) => m.id === incoming.id);
        if (existingIndex !== -1) {
          return prev.map((message, index) =>
            index === existingIndex ? { ...message, ...incoming } : message
          );
        }
        return [incoming, ...prev];
      }
    );
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/pharmacy-chat`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      const wasReconnect = attemptRef.current > 0;
      attemptRef.current = 0;
      console.log("[WS] Pharmacy chat connected");
      if (wasReconnect) {
        queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
      }
    };

    ws.onmessage = handleMessage;

    ws.onerror = (err) => {
      console.warn("[WS] Pharmacy chat error:", err);
    };

    ws.onclose = (ev) => {
      wsRef.current = null;
      if (ev.code === 1000 || ev.code === 1001) return;
      const delay = Math.min(
        BASE_BACKOFF_MS * 2 ** attemptRef.current,
        MAX_BACKOFF_MS
      );
      attemptRef.current += 1;
      console.log(`[WS] Reconnecting in ${delay}ms (attempt ${attemptRef.current})`);
      reconnectTimerRef.current = setTimeout(() => connect(), delay);
    };
  }, [handleMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendMessage = useCallback(
    async (opts: { message: string; category?: string; relatedOrderId?: number | null }) => {
      const url = queryKeyRef.current[0];
      const res = await apiRequest("POST", url, {
        message: opts.message,
        category: opts.category ?? "general",
        relatedOrderId: opts.relatedOrderId ?? null,
      });
      const msg = (await res.json()) as PharmacyMessage;
      queryClient.setQueryData<PharmacyMessage[]>(queryKeyRef.current, (prev) => {
        if (!prev) return [msg];
        const existingIndex = prev.findIndex((m) => m.id === msg.id);
        if (existingIndex !== -1) {
          return prev.map((message, index) =>
            index === existingIndex ? { ...message, ...msg } : message
          );
        }
        return [msg, ...prev];
      });
    },
    []
  );

  return { sendMessage };
}
