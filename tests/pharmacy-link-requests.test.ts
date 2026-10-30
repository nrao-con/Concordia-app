import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routes = readFileSync(resolve(process.cwd(), "server/replit_integrations/auth/routes.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "migrations/0017_pharmacy_link_requests.sql"), "utf8");
const linkPage = readFileSync(resolve(process.cwd(), "client/src/pages/pharmacy-link.tsx"), "utf8");

describe("managed pharmacy link release guards", () => {
  it("keeps both bootstrap endpoints behind raw Clerk auth", () => {
    expect(routes).toMatch(/app\.post\("\/api\/pharmacy-link-requests",\s*isClerkAuthenticated/);
    expect(routes).toMatch(/app\.get\("\/api\/pharmacy-link-requests\/me",\s*isClerkAuthenticated/);
  });

  it("accepts only an exact CP selector and never contact selectors", () => {
    const requestHandler = routes.slice(
      routes.indexOf('app.post("/api/pharmacy-link-requests"'),
      routes.indexOf('app.get("/api/pharmacy-link-requests/me"'),
    );
    expect(requestHandler).toContain('/^CP-\\d{6}$/');
    expect(requestHandler).toContain("Only concordiaId is accepted");
    for (const selector of ["email", "phone", "dateOfBirth", "firstName", "lastName"]) {
      expect(requestHandler).not.toContain(`body.${selector}`);
    }
  });

  it("has durable pending, cooldown, and rolling attempt controls", () => {
    expect(routes).toContain("status = 'pending'");
    expect(routes).toContain("requested_at >= now() - interval '24 hours'");
    expect(routes).toContain("request_temporarily_unavailable");
    expect(routes).toContain(">= 3");
  });

  it("does not let an already-linked sign-in request another patient record", () => {
    const requestHandler = routes.slice(
      routes.indexOf('app.post("/api/pharmacy-link-requests"'),
      routes.indexOf('app.get("/api/pharmacy-link-requests/me"'),
    );
    expect(requestHandler).toContain("storage.getUserByClerkUserId(subject)");
    expect(requestHandler).toContain('error: "already_linked"');
    expect(requestHandler).not.toContain("storage.getUserByConcordiaId(concordiaId)");
    expect(requestHandler.indexOf('error: "already_linked"')).toBeLessThan(
      requestHandler.indexOf("INSERT INTO pharmacy_link_requests"),
    );
  });

  it("uses transactionally complete request audit writes", () => {
    expect(routes).toContain('await client.query("BEGIN")');
    expect(routes).toContain("pharmacy_link_audit");
    expect(routes).toContain("await client.query(\"COMMIT\")");
    expect(routes).toContain("await client.query(\"ROLLBACK\")");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS \"pharmacy_link_audit\"");
    expect(migration).toContain("'approval_failed'");
  });

  it("restricts admin operations and enforces decision vocabulary", () => {
    expect(routes).toMatch(/\/api\/admin\/pharmacy-link-requests.*isClerkAuthenticated,\s*adminOnly/);
    expect(routes).toContain('decision === "approve"');
    expect(routes).toContain('decision === "reject"');
    expect(routes).toContain("ADMIN_USER_IDS");
    expect(routes).toContain("reviewer_subject");
  });

  it("provides the expected patient ID field to reviewers and a manual approval check to patients", () => {
    expect(routes).toContain('concordia_id AS "concordiaId"');
    expect(linkPage).toContain("latest.data?.request?.status === \"pending\"");
    expect(linkPage).toContain("await retryAuth()");
    expect(linkPage).toContain('"Check approval"');
  });

  it("revalidates the exact tuple and ownership before binding", () => {
    expect(routes).toContain("p.pharmacy_patient_id !== row.pharmacy_patient_id");
    expect(routes).toContain("p.identity_trust_status !== \"verified\"");
    expect(routes).toContain("p.identity_review_required");
    expect(routes).toContain("p.clerk_user_id !== row.clerk_subject");
    expect(routes).toContain("UPDATE users SET clerk_user_id=$2");
    expect(routes).toContain("action, actor_subject, reason_code");
  });

  it("keeps managed unlinked identities off the external bridge", () => {
    expect(routes).toContain('error: "identity_link_required"');
    expect(routes).toContain("if (!user)");
    expect(routes).toContain("pharmacy_link_requests");
    expect(routes).toContain("emailNormalized: _emailNormalized");
    expect(routes).toContain("pharmacyPatientId: _pharmacyPatientId");
    expect(routes).toContain("identityTrustStatus: _identityTrustStatus");
  });

  it("makes the migration rerunnable and protects mutable state", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS");
    expect(migration).toContain("IF NOT EXISTS (SELECT 1 FROM pg_constraint");
    expect(migration).toContain("CK_pharmacy_link_requests_reviewed");
    expect(migration).toContain("status\" = 'pending'");
  });
});