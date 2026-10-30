import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  isAuthenticated,
  isClerkAuthenticated,
  resolveCanonicalPrincipal,
} from "../server/replit_integrations/auth/replitAuth";
import { getClerkPublishableKey, getClerkSecretKey } from "../server/clerk-config";

const originalNodeEnv = process.env.NODE_ENV;
const originalPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const originalSecretKey = process.env.CLERK_SECRET_KEY;
const originalExternalPublishableKey = process.env.EXTERNAL_CLERK_PUBLISHABLE_KEY;
const originalExternalSecretKey = process.env.EXTERNAL_CLERK_SECRET_KEY;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalPublishableKey === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
  else process.env.CLERK_PUBLISHABLE_KEY = originalPublishableKey;
  if (originalSecretKey === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = originalSecretKey;
  if (originalExternalPublishableKey === undefined) delete process.env.EXTERNAL_CLERK_PUBLISHABLE_KEY;
  else process.env.EXTERNAL_CLERK_PUBLISHABLE_KEY = originalExternalPublishableKey;
  if (originalExternalSecretKey === undefined) delete process.env.EXTERNAL_CLERK_SECRET_KEY;
  else process.env.EXTERNAL_CLERK_SECRET_KEY = originalExternalSecretKey;
});

describe("authentication middleware", () => {
  it("returns a clean 401 when Clerk is not configured", async () => {
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.EXTERNAL_CLERK_PUBLISHABLE_KEY;
    delete process.env.EXTERNAL_CLERK_SECRET_KEY;
    process.env.NODE_ENV = "production";

    const app = express();
    app.get("/protected", isAuthenticated, (_req, res) => {
      res.json({ ok: true });
    });

    const response = await request(app).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: "Authentication not configured" });
  });

  it("accepts the test identity only in the test environment", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;

    const app = express();
    app.get("/protected", isAuthenticated, (req, res) => {
      res.json({ userId: (req as typeof req & { auth: { userId: string } }).auth.userId });
    });

    const response = await request(app)
      .get("/protected")
      .set("X-Test-User-Id", "auth-regression-user");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: "auth-regression-user" });
  });

  it("allows an unlinked subject through the bootstrap-only middleware", async () => {
    process.env.NODE_ENV = "test";
    const app = express();
    app.get("/api/auth/user", isClerkAuthenticated, (req, res) => {
      res.json({ subject: (req as any).auth.userId, canonical: (req as any).canonicalUserId ?? null });
    });
    const response = await request(app).get("/api/auth/user").set("X-Test-User-Id", "clerk-bootstrap-only");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ subject: "clerk-bootstrap-only", canonical: null });
  });

  it("does not retain a legacy external Clerk bootstrap bridge", () => {
    const routes = readFileSync(
      resolve(process.cwd(), "server/replit_integrations/auth/routes.ts"),
      "utf8",
    );
    expect(routes).toContain('error: "identity_link_required"');
    expect(routes).not.toContain("bindClerkUserToPatient(rawSubject");
    expect(routes).not.toContain("getUserByEmail");
  });

  it("attributes admin mutations to the raw Clerk subject", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    expect(routes).toContain("retryFailedPartnerOutbox(id, getRawClerkSubject(req))");
    expect(routes).toContain("const reviewerId = getRawClerkSubject(req);");
  });

  it("blocks unlinked production subjects outside the first-link endpoint", () => {
    const middleware = readFileSync(
      resolve(process.cwd(), "server/replit_integrations/auth/replitAuth.ts"),
      "utf8",
    );
    expect(middleware).not.toContain('req.path === "/api/auth/user"');
    expect(middleware).toContain('error: "pharmacy_identity_required"');
    expect(middleware).toContain("getUserByClerkUserId");
  });

  it("resolves a distinct Clerk subject to the canonical local patient", async () => {
    const lookup = async (subject: string) => subject === "clerk-sub-1"
      ? { id: "local-patient-9", identityTrustStatus: "verified", identityReviewRequired: false }
      : undefined;
    await expect(resolveCanonicalPrincipal("clerk-sub-missing", lookup))
      .resolves.toMatchObject({ status: "unlinked" });
    await expect(resolveCanonicalPrincipal("clerk-sub-1", lookup))
      .resolves.toMatchObject({ status: "linked", user: { id: "local-patient-9" } });
  });

  it("denies held and pending canonical patients", async () => {
    const lookup = async () => ({
      id: "local-patient-held",
      identityTrustStatus: "pending_review",
      identityReviewRequired: true,
    });
    await expect(resolveCanonicalPrincipal("clerk-sub-2", lookup))
      .resolves.toMatchObject({ status: "held", user: { id: "local-patient-held" } });
  });

  it("uses only the managed Clerk pair", () => {
    process.env.NODE_ENV = "production";
    process.env.CLERK_PUBLISHABLE_KEY = "pk_live_managed";
    process.env.CLERK_SECRET_KEY = "sk_live_managed";
    process.env.EXTERNAL_CLERK_PUBLISHABLE_KEY = "pk_live_example";
    process.env.EXTERNAL_CLERK_SECRET_KEY = "sk_live_example";
    expect(getClerkPublishableKey()).toBe("pk_live_managed");
    expect(getClerkSecretKey()).toBe("sk_live_managed");

    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    // External/shared tenant credentials are never selected.
    process.env.EXTERNAL_CLERK_PUBLISHABLE_KEY = "pk_test_example";
    process.env.EXTERNAL_CLERK_SECRET_KEY = "sk_test_example";
    expect(getClerkPublishableKey()).toBeUndefined();
    expect(getClerkSecretKey()).toBeUndefined();

    process.env.NODE_ENV = "development";
    process.env.CLERK_PUBLISHABLE_KEY = "pk_test_standard";
    process.env.CLERK_SECRET_KEY = "sk_test_standard";
    expect(getClerkPublishableKey()).toBe("pk_test_standard");
    expect(getClerkSecretKey()).toBe("sk_test_standard");
  });
});