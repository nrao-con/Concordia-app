/**
 * End-to-end tests for Care Navigator API endpoints.
 *
 * These tests run against a dedicated test server spawned by the Vitest
 * globalSetup (tests/global-setup.ts) on port 5001 with NODE_ENV=test.
 * Run:  npx vitest run tests/care-navigator.test.ts
 *
 * Auth model:
 *  - /api/external/care-navigator/*  — X-API-KEY (isValidApiKey)
 *  - /api/admin/patients/:id/*        — session cookie (isAuthenticated)
 *  - /api/internal/patients/:id/*     — session cookie (isAuthenticated)
 *  - /api/shop/recommended            — session cookie (isAuthenticated)
 *  - /api/care-navigator/*            — session cookie (isAuthenticated)
 *
 * Session-gated routes are tested using the isAuthenticated test bypass: when
 * NODE_ENV === "test", a request carrying X-Test-User-Id is treated as an
 * authenticated session for that userId. This bypass only activates in the
 * dedicated test server (NODE_ENV=test); the dev server runs with
 * NODE_ENV=development, so the bypass is never active there.
 *
 * Coverage:
 *  - X-API-KEY enforcement on all /api/external/care-navigator/* routes
 *  - Session auth enforcement on /api/admin/patients/:id/conditions
 *    (route uses isAuthenticated per task spec)
 *  - Session auth enforcement on /api/internal/patients/:id/conditions
 *  - Session auth enforcement on /api/shop/recommended
 *  - Full CRUD lifecycle for patient_conditions (create, list, update, soft-delete)
 *  - Soft-delete sets status="resolved" (row is NOT physically removed)
 *  - /explain shape: { conditionName, icd10Code, aiGenerated:true, disclaimer, generatedAt }
 *  - AI explainer cache: repeated call within TTL returns identical generatedAt
 *  - GET /api/shop/recommended → empty products array for user with no conditions
 *  - GET /api/shop/recommended → populated array for user with an active condition
 *  - Medication-condition link create & delete
 *  - Health journal create & list
 *  - /next-steps and /recommended-products endpoints
 *  - Input validation (missing required fields → 400)
 *  - Ownership enforcement (wrong userId → 403)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

const BASE = "http://localhost:5001";
const API_KEY = process.env.CONCORDIA_API_KEY ?? "";
const PHARMFLOW_KEY = process.env.PHARMFLOW_API_KEY ?? "";
const STAFF_KEY = process.env.CONCORDIA_STAFF_WEBHOOK_KEY ?? process.env.STAFF_API_KEY ?? "";
const EXT = "/api/external/care-navigator";

function authed(req: request.Test) {
  return req.set("X-API-KEY", API_KEY);
}

describe("partner API key scoping", () => {
  it("rejects the PharmFlow key on Concordia Care Navigator routes", async () => {
    if (!PHARMFLOW_KEY) return;
    const res = await request(BASE)
      .get(`${EXT}/conditions?userId=scope-test`)
      .set("X-API-KEY", PHARMFLOW_KEY);
    expect(res.status).toBe(401);
  });

  it("accepts the Concordia key on the website order-sync route", async () => {
    const res = await request(BASE)
      .post("/api/orders/sync")
      .set("X-API-KEY", API_KEY)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects the PharmFlow key on the website order-sync route", async () => {
    if (!PHARMFLOW_KEY) return;
    const res = await request(BASE)
      .post("/api/orders/sync")
      .set("X-API-KEY", PHARMFLOW_KEY)
      .send({});
    expect(res.status).toBe(401);
  });

  it("rejects the Concordia key on staff inventory routes", async () => {
    if (!STAFF_KEY || STAFF_KEY === API_KEY) return;
    const res = await request(BASE)
      .get("/api/staff/inventory")
      .set("X-API-KEY", API_KEY);
    expect(res.status).toBe(401);
  });

  it("rejects the Concordia key for arbitrary patient-card scans", async () => {
    const res = await request(BASE)
      .get("/api/patient-card/scope-test")
      .set("X-API-KEY", API_KEY);
    expect(res.status).toBe(401);
  });
});

/**
 * Simulate an authenticated session via the NODE_ENV=test bypass in
 * isAuthenticated.  Works only against the test server (port 5001).
 */
function asUser(req: request.Test, userId: string) {
  return req.set("X-Test-User-Id", userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared state populated during lifecycle tests
// ─────────────────────────────────────────────────────────────────────────────
let testUserId = "";
let createdConditionId = 0;
let createdJournalId = 0;
let createdLinkId = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Resolve a real patient userId. Fails loudly so nothing silently skips.
// ─────────────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  expect(API_KEY.length).toBeGreaterThan(0);

  const res = await request(BASE)
    .get("/api/external/patients?limit=1")
    .set("X-API-KEY", API_KEY);

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty("patients");
  expect(Array.isArray(res.body.patients)).toBe(true);
  expect(res.body.patients.length).toBeGreaterThan(0);

  testUserId = res.body.patients[0].id;
  expect(typeof testUserId).toBe("string");
  expect(testUserId.length).toBeGreaterThan(0);
});

afterAll(async () => {
  if (createdConditionId && testUserId) {
    await authed(
      request(BASE).delete(`${EXT}/conditions/${createdConditionId}?userId=${testUserId}`)
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. X-API-KEY enforcement on all external care-navigator routes
// ─────────────────────────────────────────────────────────────────────────────
describe("X-API-KEY enforcement on /api/external/care-navigator routes", () => {
  const routes: Array<{ method: "get" | "post" | "patch" | "delete"; path: string }> = [
    { method: "get",    path: `${EXT}/conditions?userId=x` },
    { method: "post",   path: `${EXT}/conditions` },
    { method: "patch",  path: `${EXT}/conditions/1` },
    { method: "delete", path: `${EXT}/conditions/1` },
    { method: "get",    path: `${EXT}/conditions/1/explain?userId=x` },
    { method: "get",    path: `${EXT}/conditions/1/prescriptions?userId=x` },
    { method: "post",   path: `${EXT}/medication-condition-link` },
    { method: "delete", path: `${EXT}/medication-condition-link/1` },
    { method: "get",    path: `${EXT}/journal?userId=x` },
    { method: "post",   path: `${EXT}/journal` },
    { method: "get",    path: `${EXT}/conditions/1/next-steps?userId=x` },
    { method: "get",    path: `${EXT}/conditions/1/recommended-products?userId=x` },
  ];

  for (const { method, path } of routes) {
    it(`${method.toUpperCase()} ${path} → 401 without key`, async () => {
      const res = await (request(BASE) as any)[method](path);
      expect(res.status).toBe(401);
    });

    it(`${method.toUpperCase()} ${path} → 401 with wrong key`, async () => {
      const res = await (request(BASE) as any)[method](path).set("X-API-KEY", "bad-key");
      expect(res.status).toBe(401);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. /api/admin/patients/:id/conditions — requires session auth (isAuthenticated)
//    This is the patient-facing admin view, protected by browser session.
//    API-key-only callers cannot access it.
// ─────────────────────────────────────────────────────────────────────────────
describe("/api/admin/patients/:id/conditions — requires session auth", () => {
  it("GET → 401 without any credentials", async () => {
    const res = await request(BASE).get(`/api/admin/patients/${testUserId}/conditions`);
    expect(res.status).toBe(401);
  });

  it("GET → 401 with API key only (no session)", async () => {
    const res = await authed(
      request(BASE).get(`/api/admin/patients/${testUserId}/conditions`)
    );
    expect(res.status).toBe(401);
  });

  it("GET → 200 when session-authenticated", async () => {
    const res = await asUser(
      request(BASE).get(`/api/admin/patients/${testUserId}/conditions`),
      testUserId
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. /api/internal/patients/:id/conditions — requires session auth
// ─────────────────────────────────────────────────────────────────────────────
describe("/api/internal/patients/:id/conditions — requires session auth", () => {
  it("GET → 401 without session", async () => {
    const res = await request(BASE).get(`/api/internal/patients/${testUserId}/conditions`);
    expect(res.status).toBe(401);
  });

  it("GET → 401 with API key only", async () => {
    const res = await authed(
      request(BASE).get(`/api/internal/patients/${testUserId}/conditions`)
    );
    expect(res.status).toBe(401);
  });

  it("GET → 200 when session-authenticated as the patient", async () => {
    const res = await asUser(
      request(BASE).get(`/api/internal/patients/${testUserId}/conditions`),
      testUserId
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Input validation
// ─────────────────────────────────────────────────────────────────────────────
describe("Input validation", () => {
  it("POST conditions without userId → 400", async () => {
    const res = await authed(
      request(BASE).post(`${EXT}/conditions`).send({ conditionName: "Hypertension" })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  it("POST conditions without conditionName → 400", async () => {
    const res = await authed(
      request(BASE).post(`${EXT}/conditions`).send({ userId: "x" })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/conditionName/i);
  });

  it("GET conditions without userId query param → 400", async () => {
    const res = await authed(request(BASE).get(`${EXT}/conditions`));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  it("PATCH conditions without userId in body → 400", async () => {
    const res = await authed(
      request(BASE).patch(`${EXT}/conditions/999`).send({ conditionName: "Test" })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  it("DELETE conditions without userId → 400", async () => {
    const res = await authed(request(BASE).delete(`${EXT}/conditions/999`));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  it("POST journal without userId → 400", async () => {
    const res = await authed(
      request(BASE).post(`${EXT}/journal`).send({ notes: "feeling okay" })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  it("POST medication-condition-link missing conditionId → 400", async () => {
    const res = await authed(
      request(BASE).post(`${EXT}/medication-condition-link`).send({ userId: "x" })
    );
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Full CRUD lifecycle for patient_conditions
// ─────────────────────────────────────────────────────────────────────────────
describe("Full CRUD lifecycle for patient_conditions", () => {
  it("POST → 201 with condition object (status=active)", async () => {
    const res = await authed(
      request(BASE)
        .post(`${EXT}/conditions`)
        .send({
          userId: testUserId,
          conditionName: "Test Hypertension E2E",
          icd10Code: "I10",
          notes: "Created by automated test",
        })
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId: testUserId,
      conditionName: "Test Hypertension E2E",
      icd10Code: "I10",
      status: "active",
    });
    expect(typeof res.body.id).toBe("number");
    createdConditionId = res.body.id;
  });

  it("GET → lists active conditions including the new one", async () => {
    const res = await authed(
      request(BASE).get(`${EXT}/conditions?userId=${testUserId}&status=active`)
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((c: any) => c.id === createdConditionId);
    expect(found).toBeDefined();
    expect(found.conditionName).toBe("Test Hypertension E2E");
  });

  it("PATCH → updates conditionName, returns updated object", async () => {
    const res = await authed(
      request(BASE)
        .patch(`${EXT}/conditions/${createdConditionId}`)
        .send({ userId: testUserId, conditionName: "Test Hypertension E2E (Updated)" })
    );
    expect(res.status).toBe(200);
    expect(res.body.conditionName).toBe("Test Hypertension E2E (Updated)");
    expect(res.body.status).toBe("active");
  });

  it("PATCH → 400 for invalid status value", async () => {
    const res = await authed(
      request(BASE)
        .patch(`${EXT}/conditions/${createdConditionId}`)
        .send({ userId: testUserId, status: "deleted" })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  it("PATCH → 403 when userId does not own the condition", async () => {
    const res = await authed(
      request(BASE)
        .patch(`${EXT}/conditions/${createdConditionId}`)
        .send({ userId: "wrong-user-id-xyz", conditionName: "Hacked" })
    );
    expect(res.status).toBe(403);
  });

  it("DELETE → soft-deletes: status=resolved, row remains, absent from active list", async () => {
    const deleteRes = await authed(
      request(BASE).delete(`${EXT}/conditions/${createdConditionId}?userId=${testUserId}`)
    );
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const listActive = await authed(
      request(BASE).get(`${EXT}/conditions?userId=${testUserId}&status=active`)
    );
    expect(listActive.status).toBe(200);
    expect(listActive.body.find((c: any) => c.id === createdConditionId)).toBeUndefined();

    const listResolved = await authed(
      request(BASE).get(`${EXT}/conditions?userId=${testUserId}&status=resolved`)
    );
    expect(listResolved.status).toBe(200);
    const resolved = listResolved.body.find((c: any) => c.id === createdConditionId);
    expect(resolved).toBeDefined();
    expect(resolved.status).toBe("resolved");

    createdConditionId = 0;
  });

  it("DELETE → 403 when userId does not own the condition", async () => {
    const createRes = await authed(
      request(BASE)
        .post(`${EXT}/conditions`)
        .send({ userId: testUserId, conditionName: "Ownership Test Condition" })
    );
    expect(createRes.status).toBe(201);
    const tempId = createRes.body.id;

    const res = await authed(
      request(BASE).delete(`${EXT}/conditions/${tempId}?userId=wrong-user-id-xyz`)
    );
    expect(res.status).toBe(403);

    await authed(
      request(BASE).delete(`${EXT}/conditions/${tempId}?userId=${testUserId}`)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. /explain — response shape and cache behavior
// ─────────────────────────────────────────────────────────────────────────────
describe("/explain endpoint response shape and cache", () => {
  it("404 for a non-existent condition", async () => {
    const res = await authed(
      request(BASE).get(`${EXT}/conditions/9999999/explain?userId=${testUserId}`)
    );
    expect(res.status).toBe(404);
  });

  it("200 with correct shape: conditionName, icd10Code, aiGenerated:true, disclaimer, generatedAt", async () => {
    const createRes = await authed(
      request(BASE)
        .post(`${EXT}/conditions`)
        .send({ userId: testUserId, conditionName: "Type 2 Diabetes", icd10Code: "E11" })
    );
    expect(createRes.status).toBe(201);
    const condId = createRes.body.id;

    const r1 = await authed(
      request(BASE).get(`${EXT}/conditions/${condId}/explain?userId=${testUserId}`)
    );
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ conditionName: "Type 2 Diabetes", icd10Code: "E11", aiGenerated: true });
    expect(typeof r1.body.disclaimer).toBe("string");
    expect(r1.body.disclaimer.length).toBeGreaterThan(0);
    expect(typeof r1.body.generatedAt).toBe("string");
    expect(r1.body.generatedAt.length).toBeGreaterThan(0);

    // Second call within TTL → cache hit → same generatedAt
    const r2 = await authed(
      request(BASE).get(`${EXT}/conditions/${condId}/explain?userId=${testUserId}`)
    );
    expect(r2.status).toBe(200);
    expect(r2.body.generatedAt).toBe(r1.body.generatedAt);

    await authed(
      request(BASE).delete(`${EXT}/conditions/${condId}?userId=${testUserId}`)
    );
  });

  it("403 when userId does not own the condition", async () => {
    const createRes = await authed(
      request(BASE)
        .post(`${EXT}/conditions`)
        .send({ userId: testUserId, conditionName: "Arthritis" })
    );
    expect(createRes.status).toBe(201);
    const condId = createRes.body.id;

    const res = await authed(
      request(BASE).get(`${EXT}/conditions/${condId}/explain?userId=wrong-user`)
    );
    expect(res.status).toBe(403);

    await authed(
      request(BASE).delete(`${EXT}/conditions/${condId}?userId=${testUserId}`)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET /api/shop/recommended — session-gated
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/shop/recommended", () => {
  it("401 without session", async () => {
    const res = await request(BASE).get("/api/shop/recommended");
    expect(res.status).toBe(401);
  });

  it("returns { products: [], conditionNames: [] } when user has no active conditions", async () => {
    const noConditionsUserId = `test-no-conditions-${Date.now()}`;
    const res = await asUser(request(BASE).get("/api/shop/recommended"), noConditionsUserId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ products: [], conditionNames: [] });
    expect(res.body.products.length).toBe(0);
  });

  it("returns conditionNames when user has an active condition", async () => {
    const createRes = await authed(
      request(BASE)
        .post(`${EXT}/conditions`)
        .send({ userId: testUserId, conditionName: "Hypertension", icd10Code: "I10" })
    );
    expect(createRes.status).toBe(201);
    const condId = createRes.body.id;

    const res = await asUser(request(BASE).get("/api/shop/recommended"), testUserId);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(Array.isArray(res.body.conditionNames)).toBe(true);
    expect(res.body.conditionNames).toContain("Hypertension");

    await authed(
      request(BASE).delete(`${EXT}/conditions/${condId}?userId=${testUserId}`)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Health journal CRUD
// ─────────────────────────────────────────────────────────────────────────────
describe("Health journal CRUD", () => {
  it("POST → 201 with mood and userId", async () => {
    const res = await authed(
      request(BASE)
        .post(`${EXT}/journal`)
        .send({ userId: testUserId, mood: 7, energyLevel: 6, notes: "Automated test journal entry" })
    );
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(testUserId);
    expect(res.body.mood).toBe(7);
    createdJournalId = res.body.id;
  });

  it("GET → lists entries including the newly created one", async () => {
    expect(createdJournalId).toBeGreaterThan(0);
    const res = await authed(request(BASE).get(`${EXT}/journal?userId=${testUserId}`));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    const found = res.body.entries.find((e: any) => e.id === createdJournalId);
    expect(found).toBeDefined();
    expect(found.notes).toBe("Automated test journal entry");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. /next-steps and /recommended-products
// ─────────────────────────────────────────────────────────────────────────────
describe("/next-steps and /recommended-products", () => {
  it("next-steps returns { conditionName, nextSteps: non-empty array }", async () => {
    const createRes = await authed(
      request(BASE).post(`${EXT}/conditions`).send({ userId: testUserId, conditionName: "Hypertension" })
    );
    expect(createRes.status).toBe(201);
    const condId = createRes.body.id;

    const res = await authed(
      request(BASE).get(`${EXT}/conditions/${condId}/next-steps?userId=${testUserId}`)
    );
    expect(res.status).toBe(200);
    expect(res.body.conditionName).toBe("Hypertension");
    expect(Array.isArray(res.body.nextSteps)).toBe(true);
    expect(res.body.nextSteps.length).toBeGreaterThan(0);

    await authed(request(BASE).delete(`${EXT}/conditions/${condId}?userId=${testUserId}`));
  });

  it("recommended-products returns { conditionName, productIds, products }", async () => {
    const createRes = await authed(
      request(BASE).post(`${EXT}/conditions`).send({ userId: testUserId, conditionName: "Diabetes" })
    );
    expect(createRes.status).toBe(201);
    const condId = createRes.body.id;

    const res = await authed(
      request(BASE).get(`${EXT}/conditions/${condId}/recommended-products?userId=${testUserId}`)
    );
    expect(res.status).toBe(200);
    expect(res.body.conditionName).toBe("Diabetes");
    expect(Array.isArray(res.body.productIds)).toBe(true);
    expect(Array.isArray(res.body.products)).toBe(true);

    await authed(request(BASE).delete(`${EXT}/conditions/${condId}?userId=${testUserId}`));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Medication-condition link lifecycle
// ─────────────────────────────────────────────────────────────────────────────
describe("Medication-condition link lifecycle", () => {
  it("POST → creates a link (201); DELETE → removes it (200)", async () => {
    const condRes = await authed(
      request(BASE).post(`${EXT}/conditions`).send({ userId: testUserId, conditionName: "Link Test Condition" })
    );
    expect(condRes.status).toBe(201);
    const condId = condRes.body.id;

    const linkRes = await authed(
      request(BASE)
        .post(`${EXT}/medication-condition-link`)
        .send({ userId: testUserId, medicationId: "metformin", conditionId: condId })
    );
    expect(linkRes.status).toBe(201);
    expect(linkRes.body.userId).toBe(testUserId);
    expect(linkRes.body.conditionId).toBe(condId);
    createdLinkId = linkRes.body.id;

    const delRes = await authed(
      request(BASE).delete(`${EXT}/medication-condition-link/${createdLinkId}?userId=${testUserId}`)
    );
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    await authed(request(BASE).delete(`${EXT}/conditions/${condId}?userId=${testUserId}`));
  });
});
