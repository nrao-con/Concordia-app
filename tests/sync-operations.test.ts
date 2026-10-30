import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
const storage = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");

describe("clinic-safe sync operations API", () => {
  it("declares authentication and admin guards on every operator endpoint", () => {
    expect(routes).toContain('app.get("/api/admin/sync-operations", isAuthenticated, isAdminUser');
    expect(routes).toContain('app.post("/api/admin/sync-operations/:id/retry", isAuthenticated, isAdminUser');
    expect(routes).toContain('app.get("/api/admin/sync-operations/audit", isAuthenticated, isAdminUser');
  });

  it("selects and serializes no payload, credentials, leases, raw errors, or PHI identifiers", () => {
    const start = routes.indexOf('app.get("/api/admin/sync-operations"');
    const end = routes.indexOf('app.post("/api/admin/sync-operations/:id/retry"', start);
    const source = routes.slice(start, end);
    for (const forbidden of ["payload", "idempotencyKey", "leaseToken", "lastError", "patient", "orderId", "userId"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(storage).toContain("lastError: partnerOutbox.lastError");
    expect(storage).toContain("safeCategory(lastError)");
    expect(storage).not.toContain("...row, lastError");
  });

  it("bounds pagination and restricts status filters", () => {
    expect(routes).toContain("Math.min(Math.max(rawLimit, 1), 100)");
    expect(routes).toContain("Math.min(Math.max(rawOffset, 0), 1000000)");
    expect(routes).toContain('["pending", "processing", "completed", "failed"].includes(requestedStatus)');
  });

  it("requeues only failed rows atomically and fences concurrent retries", () => {
    const start = storage.indexOf("async retryFailedPartnerOutbox");
    const source = storage.slice(start, storage.indexOf("async getSyncOperationAudit", start));
    expect(source).toContain('eq(partnerOutbox.status, "failed")');
    expect(source).toContain('status: "pending"');
    expect(source).toContain("lastError: null");
    expect(source).toContain("leaseToken: null");
    expect(source).toContain("db.transaction");
    expect(source).toContain('result: row ? "requeued" : (status === undefined ? "not_found" : "already_requeued")');
  });

  it("records PHI-free audit fields and handles missing rows without invalid audit references", () => {
    expect(storage).toContain("actorUserId, operationId: id, action: \"retry\"");
    expect(storage).toContain("result: row ? \"requeued\"");
    expect(storage).not.toContain("references(() => partnerOutbox");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0013_sync_operation_audit.sql"), "utf8");
    expect(migration).not.toMatch(/payload|patient|order_id/i);
  });
});