import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import { verifyToken } from "@clerk/express";
import { getClerkSecretKey } from "./clerk-config";

const userConnections = new Map<string, Set<WebSocket>>();

export type WsPharmacyPayload = {
  type: "pharmacy_message";
  payload: Record<string, unknown>;
};

export function pushOrderStatus(userId: string, payload: Record<string, unknown>): void {
  const data = JSON.stringify({ type: "order_status_changed", payload });
  userConnections.get(userId)?.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); } catch {}
    }
  });
}

export function pushPharmacyMessage(userId: string, payload: Record<string, unknown>): void {
  const conns = userConnections.get(userId);
  if (!conns || conns.size === 0) return;
  const data = JSON.stringify({ type: "pharmacy_message", payload } satisfies WsPharmacyPayload);
  conns.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

function addConnection(userId: string, ws: WebSocket): void {
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  userConnections.get(userId)!.add(ws);
}

function removeConnection(userId: string, ws: WebSocket): void {
  const conns = userConnections.get(userId);
  if (!conns) return;
  conns.delete(ws);
  if (conns.size === 0) {
    userConnections.delete(userId);
  }
}

function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key.trim() === name) return rest.join("=");
  }
  return undefined;
}

async function resolveUserId(req: IncomingMessage): Promise<string | null> {
  const secretKey = getClerkSecretKey();
  if (!secretKey) return null;

  // 1. Try query-param token (e.g., ?token=<clerk_session_jwt>)
  const urlToken = req.url ? new URL(req.url, "http://localhost").searchParams.get("token") : null;

  // 2. Fallback: __session cookie (automatically sent for same-origin WS upgrades)
  const cookieToken = getCookieValue(req.headers.cookie, "__session");

  const token = urlToken || cookieToken;
  if (!token) return null;

  try {
    const payload = await verifyToken(token, { secretKey });
    const subject = payload.sub;
    if (!subject) return null;
    const { authStorage } = await import("./replit_integrations/auth/storage");
    const patient = await authStorage.getUserByClerkUserId(subject);
    if (!patient || patient.identityTrustStatus !== "verified" || patient.identityReviewRequired) {
      return null;
    }
    return patient.id;
  } catch {
    return null;
  }
}

export function setupPharmacyWS(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req: IncomingMessage, socket, head) => {
    if (!req.url?.startsWith("/ws/pharmacy-chat")) {
      return;
    }

    const userId = await resolveUserId(req);
    if (!userId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    (req as any)._wsUserId = userId;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const userId = (req as any)._wsUserId as string | undefined;
    if (!userId) {
      ws.close(1008, "Unauthorized");
      return;
    }

    addConnection(userId, ws);
    console.log(`[WS] User ${userId} connected (active: ${userConnections.get(userId)?.size ?? 0})`);

    ws.on("close", () => {
      removeConnection(userId, ws);
      console.log(`[WS] User ${userId} disconnected`);
    });

    ws.on("error", (err) => {
      console.error(`[WS] Error for user ${userId}:`, err.message);
      removeConnection(userId, ws);
    });

    ws.on("pong", () => {});
  });

  const pingInterval = setInterval(() => {
    userConnections.forEach((conns) => {
      conns.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else if (ws.readyState !== WebSocket.CONNECTING) {
          ws.terminate();
        }
      });
    });
  }, 30_000);

  wss.on("close", () => clearInterval(pingInterval));
}
