import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestInventoryRefresh, startInventorySync } from "../client/src/lib/inventory-sync";

class Events extends EventTarget {
  static instances: Events[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(_url: string) { super(); Events.instances.push(this); }
}
let doc: EventTarget & { visibilityState: string };
let win: EventTarget;
let network: { onLine: boolean };
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  win = new EventTarget(); network = { onLine: true };
  vi.stubGlobal("document", doc); vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", network);
  Events.instances = [];
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture(source: any = Events) {
  let revision = "1";
  let stock = 6;
  let details = { price: "4.25", description: "Initial Staff description" };
  let revisionMissing = false;
  const catalog = vi.fn(), state = vi.fn(), order = vi.fn();
  const transport = vi.fn<typeof fetch>(async (url) => new Response(JSON.stringify(
    String(url).endsWith("/revision")
      ? { revision, revisionAvailable: !revisionMissing }
      : { products: [{ id: 901, externalId: "sp:7", staffPanelProductId: 7,
        stockCount: stock, isShopVisible: true, isAvailable: stock > 0, ...details }], checkedAt: Date.now() },
  )));
  stop = startInventorySync({ active: true, onCatalog: catalog, onState: state,
    onOrder: order, transport, eventSource: source });
  return { catalog, state, order, transport,
    change(value: number, update: Partial<typeof details> = {}) {
      stock = value; details = { ...details, ...update }; revision = String(Number(revision) + 1);
    },
    noRevision() { revisionMissing = true; },
    snapshots: () => transport.mock.calls.filter(([url]) => String(url).endsWith("/snapshot")).length,
  };
}
const settle = () => vi.advanceTimersByTimeAsync(0);
describe("shop live refresh and lifecycle", () => {
  it.each(["product_updated", "product_hidden", "product_deleted", "inventory_resync"])(
    "fetches a current complete snapshot on %s without relying on event IDs", async (event) => {
      const f = fixture(); await settle();
      f.change(0);
      Events.instances[0].dispatchEvent(new Event(event)); await settle();
      expect(f.catalog).toHaveBeenLastCalledWith([expect.objectContaining({ id: 901, stockCount: 0 })]);
    });
  it("recovers a missed SSE event through the one-second revision check", async () => {
    const f = fixture(); await settle();
    const before = f.snapshots();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.snapshots()).toBe(before); // unchanged revision => no full reload
    f.change(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.catalog).toHaveBeenLastCalledWith([expect.objectContaining({ stockCount: 2 })]);
    expect(f.snapshots()).toBe(before + 1);
  });
  it("keeps a zero-stock addition in the complete catalog and applies stock/price/description changes without reload", async () => {
    const f = fixture(); await settle();
    f.change(0);
    Events.instances[0].dispatchEvent(new Event("product_updated")); await settle();
    expect(f.catalog).toHaveBeenLastCalledWith([expect.objectContaining({
      id: 901, staffPanelProductId: 7, stockCount: 0, isShopVisible: true, isAvailable: false,
    })]);
    // No browser reload and no product event: revision recovery must replace
    // the entire snapshot, not merge only previously purchasable rows.
    f.change(4, { price: "7.65", description: "Edited in Staff" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.catalog).toHaveBeenLastCalledWith([expect.objectContaining({
      id: 901, staffPanelProductId: 7, stockCount: 4, isShopVisible: true, isAvailable: true,
      price: "7.65", description: "Edited in Staff",
    })]);
  });
  it("polls revisions independently when EventSource cannot connect", async () => {
    class Unavailable { constructor() { throw new Error("SSE blocked"); } }
    const f = fixture(Unavailable); await settle();
    f.change(1); await vi.advanceTimersByTimeAsync(1000);
    expect(f.catalog).toHaveBeenLastCalledWith([expect.objectContaining({ stockCount: 1 })]);
  });
  it("fetches a snapshot on every connection/reconnection even without revision change", async () => {
    const f = fixture(); await settle();
    const count = f.snapshots();
    Events.instances[0].onopen?.(); await settle();
    expect(f.snapshots()).toBe(count + 1);
    Events.instances[0].onerror?.();
    await vi.advanceTimersByTimeAsync(3000);
    expect(Events.instances).toHaveLength(2);
    const reconnectCount = f.snapshots();
    Events.instances[1].onopen?.(); await settle();
    expect(f.snapshots()).toBe(reconnectCount + 1);
  });
  it("pauses in the background and refreshes before relying on resumed availability", async () => {
    const f = fixture(); await settle();
    doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
    const count = f.transport.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.transport).toHaveBeenCalledTimes(count);
    expect(f.state).toHaveBeenLastCalledWith(expect.objectContaining({ stale: true }));
    f.change(0);
    doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(f.catalog).toHaveBeenLastCalledWith([expect.objectContaining({ stockCount: 0 })]);
  });
  it.each(["focus", "online"])("recovers current inventory on %s", async (event) => {
    const f = fixture(); await settle();
    f.change(3);
    win.dispatchEvent(new Event(event)); await settle();
    expect(f.catalog).toHaveBeenLastCalledWith([expect.objectContaining({ stockCount: 3 })]);
  });
  it("reports the missing revision dependency and uses slower same-source recovery", async () => {
    const f = fixture(); await settle(); f.noRevision();
    const before = f.snapshots();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.state).toHaveBeenLastCalledWith(expect.objectContaining({ revisionAvailable: false }));
    expect(f.snapshots()).toBe(before);
    f.change(0); await vi.advanceTimersByTimeAsync(10_000);
    expect(f.catalog).toHaveBeenLastCalledWith([expect.objectContaining({ stockCount: 0 })]);
  });
  it("shows stale state when network checks fail", async () => {
    const f = fixture(); await settle();
    f.transport.mockRejectedValue(new Error("offline"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.state).toHaveBeenLastCalledWith(expect.objectContaining({ stale: true }));
  });
  it("cleans up connections, timers, handlers and aborts pending requests", async () => {
    const f = fixture(); await settle();
    const signal = f.transport.mock.calls[0][1]?.signal;
    stop!(); stop = undefined;
    const calls = f.transport.mock.calls.length;
    expect(signal?.aborted).toBe(true);
    expect(Events.instances[0].close).toHaveBeenCalled();
    win.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.transport).toHaveBeenCalledTimes(calls);
  });
  it("refreshes both order status and Staff inventory after an order event", async () => {
    const f = fixture(); await settle();
    const before = f.snapshots();
    f.change(1);
    Events.instances[0].dispatchEvent(new Event("order_status_changed"));
    expect(f.order).toHaveBeenCalledOnce();
    await settle();
    expect(f.snapshots()).toBe(before + 1);
    expect(f.catalog).toHaveBeenLastCalledWith([expect.objectContaining({ stockCount: 1 })]);
  });
  it("rechecks Staff prices and stock after a local order attempt without waiting for SSE", async () => {
    const f = fixture(); await settle();
    f.change(0);
    requestInventoryRefresh();
    expect(f.state).toHaveBeenLastCalledWith(expect.objectContaining({ stale: true }));
    await settle();
    expect(f.catalog).toHaveBeenLastCalledWith([expect.objectContaining({ stockCount: 0 })]);
  });
  it("does not fetch after a local order signal when offline or after teardown", async () => {
    const f = fixture(); await settle();
    network.onLine = false;
    const calls = f.transport.mock.calls.length;
    requestInventoryRefresh(); await settle();
    expect(f.transport).toHaveBeenCalledTimes(calls);
    expect(f.state).toHaveBeenLastCalledWith(expect.objectContaining({ stale: true }));
    stop!(); stop = undefined; network.onLine = true;
    requestInventoryRefresh(); await settle();
    expect(f.transport).toHaveBeenCalledTimes(calls);
  });
});
