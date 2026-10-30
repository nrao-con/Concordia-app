import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";
import { OrderCancellationStatus } from "../client/src/components/order-cancellation-status";
import en from "../client/src/i18n/en.json";
import es from "../client/src/i18n/es.json";
const i18n = i18next.createInstance();
await i18n.init({ lng: "en", resources: { en: { translation: en }, es: { translation: es } } });
function render(order: any) {
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n },
    createElement(OrderCancellationStatus, { order: { status: "cancelled", ...order } })));
}
describe("patient cancellation receipt", () => {
  it("distinguishes saved cancellation from pharmacy acknowledgement", () => {
    const html = render({ pharmFlowCancellationStatus: "pending" });
    expect(html).toContain("Waiting for pharmacy cancellation confirmation");
    expect(html).toContain("Your cancellation is saved.");
    expect(html).toContain('href="tel:7183282833"');
    expect(html).not.toContain("Pharmacy cancellation confirmed");
  });
  it("shows confirmed only with persisted confirmation state", () => {
    const html = render({ pharmFlowCancellationStatus: "confirmed", pharmFlowCancellationConfirmedAt: "2026-10-06T12:00:00Z" });
    expect(html).toContain("Pharmacy cancellation confirmed");
    expect(html).toContain("PharmFlow reports this exact order as cancelled.");
    expect(html).not.toContain("Waiting for pharmacy");
  });
  it("keeps failures visible even after the outbox row is removed", () => {
    const html = render({ pharmFlowCancellationStatus: "failed" });
    expect(html).toContain("Automatic attempts have stopped.");
    expect(html).toContain("The pharmacy may still be working");
  });
  it("does not invent pharmacy acknowledgements for historical or OTC cancellations", () => {
    const html = render({});
    expect(html).toContain("Cancelled in the app only");
    expect(html).toContain("No pharmacy cancellation confirmation is recorded");
  });
  it("does not show cancellation messages on an active order", () => {
    expect(render({ status: "preparing" })).toBe("");
  });
  it("provides Spanish cancellation guidance", async () => {
    await i18n.changeLanguage("es");
    try { expect(render({ pharmFlowCancellationStatus: "failed" })).toContain("La farmacia podría seguir trabajando"); }
    finally { await i18n.changeLanguage("en"); }
  });
});
