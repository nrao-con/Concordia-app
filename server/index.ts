import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cors from "cors";
import { clerkMiddleware, createClerkClient } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requireProductionHttpsUrl, safeApiRouteLabel } from "./security-guards";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
// Production sessions must be checked against the signing keys for the
// managed secret, not an ambient legacy CLERK_JWT_KEY from another instance.
const productionClerkClient = process.env.NODE_ENV === "production"
  ? createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY, jwtKey: "" })
  : undefined;
app.use(clerkMiddleware((req) => ({
  ...(productionClerkClient ? { clerkClient: productionClerkClient } : {}),
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
  })));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const isApiRequest = req.path.startsWith("/api");

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (isApiRequest) {
      // Do not serialize API response bodies: patient, medication, order, and
      // chat payloads may contain protected health information. Log only the
      // matched route template so concrete patient/resource IDs stay private.
      const holdReason = req.path === "/api/auth/user" && res.statusCode === 423
        ? res.locals.authHoldReason
        : undefined;
      const staffReview = holdReason === "identity_link_required"
        ? ` staffReviewAvailable=${res.locals.authStaffReviewAvailable === true}`
        : "";
      log(`${req.method} ${safeApiRouteLabel(req)} ${res.statusCode}${holdReason ? ` hold=${holdReason}${staffReview}` : ""} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // Production must never start with integrations silently disabled. Development
  // remains usable with local/test credentials and optional integrations absent.
  const missingVars: string[] = [];
  if (!process.env.DATABASE_URL) missingVars.push("DATABASE_URL");
  if (process.env.NODE_ENV === "production") {
    const requiredProductionVars = [
      "CONCORDIA_API_URL",
      "CONCORDIA_API_KEY",
      "PHARMFLOW_API_URL",
      "PHARMFLOW_API_KEY",
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
    ];
    for (const name of requiredProductionVars) {
      if (!process.env[name]?.trim()) missingVars.push(name);
    }
    if (!process.env.CLERK_PUBLISHABLE_KEY?.trim() || !process.env.CLERK_SECRET_KEY?.trim()) {
      missingVars.push("managed Clerk key pair");
    }
    for (const name of ["CONCORDIA_API_URL", "PHARMFLOW_API_URL"]) {
      const value = process.env[name];
      if (value) {
        try {
          requireProductionHttpsUrl(name, value);
        } catch (error) {
          missingVars.push(error instanceof Error ? error.message : `${name} (must be valid HTTPS URL)`);
        }
      }
    }
  }
  if (missingVars.length > 0) {
    console.error(
      `[Startup] FATAL: Missing required environment variables: ${missingVars.join(", ")}. ` +
      `The server cannot start safely without these values.`
    );
    process.exit(1);
  }

  // Warn about optional-but-important integrations in development only.
  const warnVars: [string, string][] = [
    ["CONCORDIA_API_URL", "Concordia website sync will be disabled"],
    ["CONCORDIA_API_KEY", "Concordia website sync will be disabled"],
    ["VAPID_PUBLIC_KEY", "Push notifications will be disabled"],
    ["VAPID_PRIVATE_KEY", "Push notifications will be disabled"],
    ["PHARMFLOW_API_URL", "PharmFlow pharmacy integration will be disabled"],
    ["FRAUD_INGESTION_SECRET", "signed fraud-event ingestion will remain disabled"],
  ];
  for (const [v, note] of warnVars) {
    if (!process.env[v]) console.warn(`[Startup] WARNING: ${v} not set — ${note}.`);
  }
  if (!process.env.CLERK_SECRET_KEY) {
    console.warn("[Startup] WARNING: Managed Clerk secret key is missing — Clerk authentication will not work.");
  }
  if (process.env.NODE_ENV !== "production" &&
      !process.env.CLERK_PUBLISHABLE_KEY) {
    console.warn("[Startup] WARNING: Managed Clerk publishable key is missing — Clerk middleware requires it.");
  }
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );      
})();
