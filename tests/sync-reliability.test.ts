import { describe, expect, it } from "vitest";
import {
  acceptOrderStatus,
  mapStaffPanelOrderStatus,
  retryDelayMs,
  webhookReceiptKey,
  stablePayloadHash,
  WebhookPayloadConflictError,
} from "../server/sync-reliability";

describe("synchronization reliability policy", () => {
  it("maps staff pickup status aliases without confusing pickup and delivery", () => {
    expect(mapStaffPanelOrderStatus("picked-up")).toBe("picked_up");
    expect(mapStaffPanelOrderStatus("Picked Up")).toBe("picked_up");
    expect(mapStaffPanelOrderStatus("in-progress")).toBe("preparing");
    expect(mapStaffPanelOrderStatus(" canceled ")).toBe("cancelled");
    expect(mapStaffPanelOrderStatus("completed")).toBe("picked_up");
    expect(mapStaffPanelOrderStatus("delivered")).toBeNull();
    expect(acceptOrderStatus("ready", mapStaffPanelOrderStatus("preparing")!)).toBeNull();
  });

  it("rejects stale and terminal regressions", () => {
    expect(acceptOrderStatus("ready", "preparing")).toBeNull();
    expect(acceptOrderStatus("delivered", "ready")).toBeNull();
    expect(acceptOrderStatus("preparing", "ready")).toBe("ready");
  });

  it("uses event IDs for receipts and hashes only without one", () => {
    const first = webhookReceiptKey("pharmflow", "evt-1", { status: "ready" });
    const duplicate = webhookReceiptKey("pharmflow", "evt-1", { status: "ready" });
    expect(first.sourceEventId).toBe("evt-1");
    expect(duplicate.sourceEventId).toBe(first.sourceEventId);
    expect(webhookReceiptKey("pharmflow", undefined, { status: "ready" }).sourceEventId)
      .toMatch(/^payload:[a-f0-9]{64}$/);
  });

  it("schedules bounded exponential retries", () => {
    expect(retryDelayMs(0)).toBe(1000);
    expect(retryDelayMs(3)).toBe(8000);
    expect(retryDelayMs(99)).toBe(86_400_000);
  });

  it("changes profile revisions only when payload changes", () => {
    const one = { phone: "1", name: "A" };
    expect(stablePayloadHash(one)).toBe(stablePayloadHash({ name: "A", phone: "1" }));
    expect(stablePayloadHash(one)).not.toBe(stablePayloadHash({ name: "A", phone: "2" }));
  });

  it("exposes a typed payload mismatch conflict", () => {
    const error = new WebhookPayloadConflictError();
    expect(error.name).toBe("WebhookPayloadConflictError");
    expect(error).toBeInstanceOf(Error);
  });
});