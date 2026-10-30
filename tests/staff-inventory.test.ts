import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mapStaffProducts, StaffInventory, STAFF_BASE_URL } from "../server/staff-inventory";

const product = { id: 7, name: "Fixture only", price: "4.25", stockCount: 6, imageUrl: "/fixture.jpg" };

describe("shared Staff catalog consumers", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  it.each([
    "/api/shop/recommended",
    "/api/recommendations",
    "/api/medications/:id/companion-products",
    "/api/staff/inventory",
    "/api/products/app",
  ])("refreshes Staff before serving products from %s and disables response caching", (path) => {
    const start = routes.indexOf(`app.get("${path}"`);
    expect(start).toBeGreaterThan(-1);
    const end = routes.indexOf("\n  app.", start + 1);
    const handler = routes.slice(start, end < 0 ? undefined : end);
    expect(handler).toContain('res.setHeader("Cache-Control", "no-store")');
    expect(handler).toContain("await staffInventory.snapshot()");
    const read = handler.search(/await storage\.(getOtcProducts|getRecommendedProducts)\(/);
    expect(read).toBeGreaterThan(handler.indexOf("await staffInventory.snapshot()"));
  });
  it("does not suggest stale or non-Staff products in Health Chat", () => {
    const start = routes.indexOf("async function findRelevantProducts(");
    const handler = routes.slice(start, routes.indexOf("const HEALTHCARE_SYSTEM_PROMPT", start));
    expect(handler.indexOf("await staffInventory.snapshot()")).toBeGreaterThan(-1);
    expect(handler.indexOf("await staffInventory.snapshot()")).toBeLessThan(handler.indexOf("await db"));
    expect(handler).toContain('eq(otcProducts.syncSource, "staff_panel")');
    expect(handler).toContain("gt(otcProducts.stockCount, 0)");
  });
});

function fixture() {
  let rows: any[] = [];
  const store = {
    bulkSyncOtcProducts: vi.fn(async (products: any[]) => {
      rows = products.map(p => ({ ...p, id: 901 }));
      return { upserted: products.length, markedUnavailable: 0 };
    }),
    getOtcProducts: vi.fn(async () => rows.filter(p => p.isShopVisible)),
  };
  const transport = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([product])));
  return { store, transport, service: new StaffInventory(store as any, transport) };
}
describe("authoritative Staff inventory snapshots", () => {
  it("keeps local IDs separate and respects Staff prices, images and visibility", () => {
    expect(mapStaffProducts([product])[0]).toMatchObject({
      externalId: "sp:7", staffPanelProductId: 7, price: "4.25", stockCount: 6,
      imageUrl: `${STAFF_BASE_URL}/fixture.jpg`, isAvailable: true,
      isShopVisible: true,
    });
    for (const override of [{ inStock: false }, { isVisible: false }, { hidden: true },
      { isDeleted: true }, { stockCount: 0 }, { isAvailable: false }]) {
      expect(mapStaffProducts([{ ...product, ...override }])[0].isAvailable).toBe(false);
    }
  });
  it("uses canonical concordiaProductId when supplied, not a line or local ID", () => {
    expect(mapStaffProducts([{ ...product, id: 99, concordiaProductId: "catalog-7" }])[0])
      .toMatchObject({ externalId: "sp:catalog-7", staffPanelProductId: null });
  });
  it("includes visible zero-stock products without making them purchasable", async () => {
    const f = fixture();
    f.transport.mockResolvedValueOnce(new Response(JSON.stringify([
      { ...product, id: 8, stockCount: 0, inStock: false },
    ])));
    const { products } = await f.service.snapshot(true);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ externalId: "sp:8", staffPanelProductId: 8,
      isShopVisible: true, isAvailable: false, stockCount: 0 });
  });
  it("preserves identity and applies stock, price and description edits to a previously empty product", async () => {
    const f = fixture();
    f.transport.mockResolvedValueOnce(new Response(JSON.stringify([{ ...product, stockCount: 0, inStock: false }])));
    const initial = (await f.service.snapshot(true)).products[0];
    f.transport.mockResolvedValueOnce(new Response(JSON.stringify([
      { ...product, stockCount: 3, inStock: true, price: "6.45", description: "Updated Staff description" },
    ])));
    const updated = (await f.service.snapshot(true)).products[0];
    expect(updated).toMatchObject({ id: initial.id, staffPanelProductId: initial.staffPanelProductId,
      stockCount: 3, price: "6.45", description: "Updated Staff description", isAvailable: true, isShopVisible: true });
  });
  it.each([{ isVisible: false }, { hidden: true }, { isDeleted: true }])(
    "excludes hidden/deleted products even at zero stock: %j", async (flags) => {
      const f = fixture();
      f.transport.mockResolvedValueOnce(new Response(JSON.stringify([{ ...product, stockCount: 0, ...flags }])));
      expect((await f.service.snapshot(true)).products).toEqual([]);
    });
  it.each([
    {}, [{ ...product, stockCount: -1 }], [{ ...product, price: "bad" }],
    [{ ...product, id: null }], [product, product], [product, { id: 9 }],
  ])("rejects invalid/partial catalog rather than hiding valid inventory: %j", (value) => {
    expect(() => mapStaffProducts(value)).toThrow();
  });
  it("coalesces simultaneous snapshot refreshes and returns local IDs", async () => {
    const f = fixture();
    const results = await Promise.all([f.service.snapshot(), f.service.snapshot()]);
    expect(f.transport).toHaveBeenCalledTimes(1);
    expect(results[0].products[0]).toMatchObject({ id: 901, externalId: "sp:7" });
    expect(f.transport.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });
  it("refreshes the backend before a changed snapshot can reach the frontend", async () => {
    const f = fixture();
    expect((await f.service.snapshot(true)).products[0].stockCount).toBe(6);
    f.transport.mockResolvedValueOnce(new Response(JSON.stringify([{ ...product, stockCount: 2, price: "5.10" }])));
    expect((await f.service.snapshot(true)).products[0]).toMatchObject({ stockCount: 2, price: "5.10" });
  });
  it("accepts a complete empty snapshot without switching to another catalog", async () => {
    const f = fixture();
    await f.service.snapshot(true);
    f.transport.mockResolvedValueOnce(new Response("[]"));
    expect((await f.service.snapshot(true)).products).toEqual([]);
    expect(f.store.bulkSyncOtcProducts).toHaveBeenLastCalledWith([], "staff_panel");
  });
  it("does not overwrite a good snapshot on invalid or failed Staff responses", async () => {
    const f = fixture();
    await f.service.snapshot(true);
    f.transport.mockResolvedValueOnce(new Response("<html>bad gateway</html>"));
    await expect(f.service.snapshot(true)).rejects.toThrow();
    expect(f.store.bulkSyncOtcProducts).toHaveBeenCalledTimes(1);
    f.transport.mockResolvedValueOnce(new Response("{}", { status: 502 }));
    await expect(f.service.snapshot(true)).rejects.toThrow();
  });
  it("reports revision 404 as a Staff deployment dependency, not an alternate source", async () => {
    const f = fixture();
    f.transport.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect(await f.service.revision()).toEqual({ revision: null, revisionAvailable: false });
    expect(f.transport.mock.calls[0][0]).toBe(`${STAFF_BASE_URL}/api/public/inventory/revision`);
  });
  it("checks only the small revision response without loading the full catalog", async () => {
    const f = fixture();
    f.transport.mockResolvedValueOnce(new Response('{"revision":12}'));
    expect(await f.service.revision()).toEqual({ revision: "12", revisionAvailable: true });
    expect(f.store.bulkSyncOtcProducts).not.toHaveBeenCalled();
  });
});
