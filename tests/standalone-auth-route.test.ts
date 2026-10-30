import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserByClerkUserId: vi.fn(),
  createStandaloneUser: vi.fn(),
  updateStandaloneName: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../server/replit_integrations/auth/storage", () => ({
  authStorage: {
    getUserByClerkUserId: mocks.getUserByClerkUserId,
    createStandaloneUser: mocks.createStandaloneUser,
    updateStandaloneName: mocks.updateStandaloneName,
  },
}));
vi.mock("../server/replit_integrations/auth/replitAuth", () => ({
  isClerkAuthenticated: (req: any, _res: any, next: any) => {
    req.auth = { userId: "signed-in-subject" };
    next();
  },
}));
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: "signed-in-subject" }),
}));
vi.mock("../server/db", () => ({ pool: { query: mocks.query } }));
vi.mock("../server/storage", () => ({ storage: {} }));

import { registerAuthRoutes } from "../server/replit_integrations/auth/routes";

const standalone = {
  id: "separate-local-id",
  clerkUserId: "signed-in-subject",
  concordiaId: null,
  pharmacyPatientId: null,
  identityTrustStatus: "unverified",
  identityReviewRequired: false,
  firstName: null,
  onboardingComplete: false,
};

describe("account bootstrap for an unlinked sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_USER_IDS;
    mocks.getUserByClerkUserId.mockResolvedValue(undefined);
    mocks.createStandaloneUser.mockResolvedValue(standalone);
  });

  it("returns a separate signed-in account without requesting a pharmacy link", async () => {
    const app = express();
    registerAuthRoutes(app);
    const response = await request(app).get("/api/auth/user");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: "separate-local-id",
      pharmacyAccess: false,
      onboardingComplete: false,
    });
    expect(response.body).not.toHaveProperty("clerkUserId");
    expect(response.body).not.toHaveProperty("pharmacyPatientId");
    expect(mocks.createStandaloneUser).toHaveBeenCalledWith("signed-in-subject");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not manufacture a new profile for a verified linked patient", async () => {
    mocks.getUserByClerkUserId.mockResolvedValue({
      ...standalone,
      identityTrustStatus: "verified",
      concordiaId: "CP-123456",
    });
    const app = express();
    registerAuthRoutes(app);
    const response = await request(app).get("/api/auth/user");

    expect(response.status).toBe(200);
    expect(response.body.pharmacyAccess).toBe(true);
    expect(mocks.createStandaloneUser).not.toHaveBeenCalled();
  });

  it("saves only local name fields and refuses pharmacy identifiers", async () => {
    mocks.updateStandaloneName.mockResolvedValue({ ...standalone, firstName: "Alex", lastName: "Doe" });
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app);

    const rejected = await request(app).patch("/api/auth/standalone-profile").send({
      firstName: "Alex", lastName: "Doe", concordiaId: "CP-123456",
    });
    expect(rejected.status).toBe(400);
    expect(mocks.updateStandaloneName).not.toHaveBeenCalled();

    const accepted = await request(app).patch("/api/auth/standalone-profile").send({
      firstName: " Alex ", lastName: " Doe ",
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ firstName: "Alex", lastName: "Doe" });
    expect(mocks.updateStandaloneName).toHaveBeenCalledWith("signed-in-subject", "Alex", "Doe");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("cannot edit a linked or held profile through the standalone route", async () => {
    mocks.updateStandaloneName.mockResolvedValue(undefined);
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app);
    const response = await request(app).patch("/api/auth/standalone-profile").send({
      firstName: "Alex", lastName: "Doe",
    });
    expect(response.status).toBe(403);
  });
});