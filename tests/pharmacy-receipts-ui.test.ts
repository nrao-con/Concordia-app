import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeliveryReceipt } from "../client/src/pages/pharmacy-chat";

const render = (status: "sent" | "received" | "read" | null) =>
  renderToStaticMarkup(createElement(DeliveryReceipt, { status }));

describe("outbound pharmacy receipt ticks", () => {
  it("shows one tick for sent", () => {
    const html = render("sent");
    expect(html).toContain('aria-label="Sent"');
    expect(html).not.toContain("lucide-check-check");
    expect(html).not.toContain("text-red-600");
  });
  it("shows neutral double ticks for received", () => {
    const html = render("received");
    expect(html).toContain('aria-label="Received"');
    expect(html).toContain("lucide-check-check");
    expect(html).not.toContain("text-red-600");
  });
  it("shows red double ticks only for a pharmacy read receipt", () => {
    const html = render("read");
    expect(html).toContain('aria-label="Read"');
    expect(html).toContain("lucide-check-check");
    expect(html).toContain("text-red-600");
  });
  it("does not invent receipts for historical messages", () => {
    const html = render(null);
    expect(html).toContain("Delivery unconfirmed");
    expect(html).not.toContain("lucide-check");
  });
});
