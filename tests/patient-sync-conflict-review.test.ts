import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("staff patient import conflict review", () => {
  it("protects the read-only conflict feed with both sign-in and staff authorization", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/replit_integrations/auth/routes.ts"), "utf8");
    const route = routes.slice(
      routes.indexOf('app.get("/api/admin/patient-sync-conflicts"'),
      routes.indexOf('app.post("/api/admin/pharmacy-link-requests/:id/decision"'),
    );
    expect(route).toContain("isClerkAuthenticated, adminOnly");
    expect(route).toContain("WHERE status = 'open'");
    expect(route).toContain("LIMIT 20 OFFSET $1");
    expect(route).not.toContain("email");
    expect(route).not.toContain("phone");
  });

  it("shows the review list in the staff-only link page without an auto-merge button", () => {
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/pharmacy-link.tsx"), "utf8");
    const component = readFileSync(resolve(process.cwd(), "client/src/pages/admin/patient-sync-conflicts.tsx"), "utf8");
    expect(page.indexOf("<PatientSyncConflicts />")).toBeGreaterThan(page.indexOf("if (!user?.isAdmin) return"));
    expect(component).toContain("Patient import conflicts");
    expect(component).not.toContain("Approve");
    expect(component).not.toContain("resolve");
  });
});