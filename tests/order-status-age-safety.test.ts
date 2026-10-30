import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const fake = vi.hoisted(() => ({
  order: {} as any,
  writes: [] as any[],
}));

vi.mock("../server/db", () => ({
  pool: {},
  db: {
    select: () => ({ from: () => ({ where: async () => [{ ...fake.order }] }) }),
    update: () => ({ set: (values: any) => ({ where: () => ({
      returning: async () => {
        fake.writes.push(values);
        fake.order = { ...fake.order, ...values };
        return [{ ...fake.order }];
      },
    }) }) }),
  },
}));

import { storage } from "../server/storage";

beforeEach(() => {
  const oldDate = new Date("2020-01-01T12:00:00Z");
  fake.order = {
    id: 42, userId: "patient-test", status: "preparing",
    createdAt: oldDate, updatedAt: oldDate,
    statusHistory: [{ status: "preparing", timestamp: oldDate.toISOString() }],
  };
  fake.writes = [];
});

describe("old orders retain their actual fulfillment status", () => {
  it("has no startup/hourly retirement job or age-based fulfillment writer", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(routes).not.toContain('runSingletonJob("stale-order-retirement"');
    expect(routes).not.toContain("retireStaleOrders");
    expect(storage).not.toHaveProperty("retireStaleOrders");
  });

  it("reading a years-old order preserves status, history and last update", async () => {
    const before = structuredClone(fake.order);
    expect(await storage.getOrder(42)).toEqual(before);
    expect(fake.order).toEqual(before);
    expect(fake.writes).toEqual([]);
  });

  it.each(["picked_up", "delivered", "cancelled"])(
    "still accepts an explicit %s update for an old order",
    async (status) => {
      const previous = structuredClone(fake.order.statusHistory);
      const result = await storage.updateOrderStatus(42, status);
      expect(result.status).toBe(status);
      expect(result.statusHistory).toEqual([
        ...previous, { status, timestamp: expect.any(String) },
      ]);
      expect(fake.writes).toHaveLength(1);
      expect(result.updatedAt.getTime()).toBeGreaterThan(new Date("2020-01-01").getTime());
    },
  );

  it.each(["picked_up", "delivered", "cancelled"])(
    "does not reopen a genuine %s order after a stale preparing event",
    async (status) => {
      fake.order.status = status;
      expect((await storage.updateOrderStatus(42, "preparing")).status).toBe(status);
      expect(fake.writes).toEqual([]);
    },
  );
});
