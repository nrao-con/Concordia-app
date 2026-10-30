import { getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import type { Express, Request, RequestHandler } from "express";
import { getClerkProxyHost } from "../../middlewares/clerkProxyMiddleware";

export type AuthPrincipalRequest = Request & {
  canonicalUserId?: string;
  adminPrincipal?: boolean;
  auth?: { userId?: string };
};
export type CanonicalPrincipalUser = {
  id: string;
  identityTrustStatus: string | null;
  identityReviewRequired: boolean | null;
};
export type CanonicalResolution =
  | { status: "unlinked" }
  | { status: "held"; user: CanonicalPrincipalUser }
  | { status: "linked"; user: CanonicalPrincipalUser };

export async function resolveCanonicalPrincipal(
  clerkSubject: string,
  lookup: (subject: string) => Promise<CanonicalPrincipalUser | undefined>,
): Promise<CanonicalResolution> {
  const user = await lookup(clerkSubject);
  if (!user) return { status: "unlinked" };
  if (user.identityTrustStatus !== "verified" || user.identityReviewRequired) {
    return { status: "held", user };
  }
  return { status: "linked", user };
}

/**
 * Resolves the current authenticated user for route handlers. The test header
 * is deliberately honored only by the dedicated NODE_ENV=test server.
 */
export function getAuthenticatedUserId(req: Request): string | null {
  if (process.env.NODE_ENV === "test") {
    const testUserId = req.header("x-test-user-id")?.trim();
    if (testUserId) return testUserId;
  }
  return getAuth(req).userId;
}

export function getRawClerkSubject(req: Request): string | null {
  return getAuthenticatedUserId(req);
}

export function getCanonicalUserId(req: Request): string | null {
  return (req as AuthPrincipalRequest).canonicalUserId ?? null;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
}

function clerkPairDiagnostics(req: Request): string {
  const forwardedHost = getClerkProxyHost(req);
  let browserHost: string | undefined;
  try {
    if (req.headers.referer) browserHost = new URL(req.headers.referer).hostname;
  } catch {
    // A missing or malformed Referer is diagnostic-only; never use it for auth.
  }
  let serverHost: string | undefined;
  try {
    if (forwardedHost) serverHost = new URL(`https://${forwardedHost}`).hostname;
  } catch {
    // Leave the host comparison unknown rather than guessing.
  }
  const hostMatch = browserHost && serverHost ? String(browserHost === serverHost) : "unknown";
  const clientFallback = process.env.VITE_CLERK_PUBLISHABLE_KEY;
  const serverFallback = process.env.CLERK_PUBLISHABLE_KEY;
  let keyMatch = "unknown";
  try {
    if (browserHost && serverHost && clientFallback && serverFallback) {
      keyMatch = String(
        publishableKeyFromHost(browserHost, clientFallback) ===
        publishableKeyFromHost(serverHost, serverFallback),
      );
    }
  } catch {
    // Diagnostics must never turn an authentication rejection into a 500.
  }
  const secretLive = String(process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") === true);
  const publicLive = String(serverFallback?.startsWith("pk_live_") === true);
  return `hostMatch=${hostMatch} derivedKeyMatch=${keyMatch} secretLive=${secretLive} publicLive=${publicLive} ambientJwtKeyPresent=${Boolean(process.env.CLERK_JWT_KEY)}`;
}

async function validateClerk(req: Request, res: any): Promise<string | null> {
  if (process.env.NODE_ENV === "test") {
    const testUserId = getAuthenticatedUserId(req);
    if (testUserId) {
      (req as Request & { auth?: unknown }).auth = {
        userId: testUserId,
        sessionId: "test-session",
        sessionClaims: {},
      };
      return testUserId;
    }
  }

  let auth: ReturnType<typeof getAuth>;
  try {
    auth = getAuth(req);
  } catch {
    if (req.path.startsWith("/api/auth/")) {
      console.warn("[Auth] account bootstrap 401: Clerk middleware unavailable");
    }
    res.status(401).json({ message: "Authentication not configured" });
    return null;
  }
  if (!auth.userId) {
    if (req.path.startsWith("/api/auth/")) {
      const cookie = req.headers.cookie ?? "";
      // Clerk's reason is a short error code. Never log the debug object,
      // which also contains credential and session metadata.
      const reason = auth.debug().reason;
      const safeReason = typeof reason === "string" && /^[a-z][a-z0-9-]{0,80}$/.test(reason)
        ? reason
        : "unavailable";
      const sessionCookies = cookie.match(/(?:^|;\s*)__session=/g) ?? [];
      console.warn(
        `[Auth] account bootstrap 401: reason=${safeReason} ${clerkPairDiagnostics(req)} sessionCookiePresent=${sessionCookies.length > 0} duplicateSessionCookies=${sessionCookies.length > 1} anyCookiePresent=${Boolean(cookie)} authorizationHeaderPresent=${Boolean(req.headers.authorization)}`,
      );
    }
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  return auth.userId;
}

export const isClerkAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = await validateClerk(req, res);
  if (userId) next();
};

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = await validateClerk(req, res);
  if (!userId) return;
  if (process.env.NODE_ENV === "test") {
    (req as AuthPrincipalRequest).canonicalUserId = userId;
    return next();
  }
  // Keep the storage import lazy so lightweight middleware tests do not need
  // to initialize the database layer.
  const { authStorage } = await import("./storage");
  const resolution = await resolveCanonicalPrincipal(
    userId,
    (subject) => authStorage.getUserByClerkUserId(subject),
  );
  if (resolution.status === "unlinked") {
    const legacy = await authStorage.getUser(userId);
    if (
      legacy &&
      legacy.id === userId &&
      !legacy.clerkUserId &&
      !legacy.concordiaId &&
      (legacy.userRole === "caregiver" || legacy.userRole === "admin") &&
      legacy.identityTrustStatus === "verified" &&
      !legacy.identityReviewRequired
    ) {
      await authStorage.bindClerkUserToPatient(userId, legacy.id);
      (req as AuthPrincipalRequest).canonicalUserId = legacy.id;
      return next();
    }
    const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    if (adminIds.includes(userId)) {
      const isAdminRoute = req.path.startsWith("/api/admin") || req.path === "/api/push-config";
      if (!isAdminRoute) {
        return res.status(423).json({
          error: "pharmacy_identity_required",
          message: "An administrator account must be linked to a patient before using patient features.",
        });
      }
      (req as AuthPrincipalRequest).adminPrincipal = true;
      return next();
    }
    return res.status(423).json({
      error: "pharmacy_identity_required",
      message: "Your account is not linked to a verified pharmacy patient record.",
    });
  }
  if (resolution.status === "held") {
    return res.status(423).json({
      error: "verification_required",
      message: "Pharmacy identity review is required before protected data can be accessed.",
    });
  }
  (req as AuthPrincipalRequest).canonicalUserId = resolution.user.id;
  return next();
};

export function getSession() {
  return (_req: any, _res: any, next: any) => next();
}
