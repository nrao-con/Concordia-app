import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";
import { RefillSubmissionStatus } from "../client/src/components/refill-submission-status";
import en from "../client/src/i18n/en.json";
import es from "../client/src/i18n/es.json";

const i18n = i18next.createInstance();
await i18n.init({ lng: "en", resources: { en: { translation: en }, es: { translation: es } } });
const base = { orderType: "rx_refill", status: "preparing", pharmFlowSubmitted: false };
function render(order: any) {
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n },
    createElement(RefillSubmissionStatus, { order })));
}
describe("patient refill delivery status", () => {
  it.each(["pending", "processing"])("shows %s honestly without claiming the pharmacy received it", (state) => {
    const html = render({ ...base, pharmFlowSubmissionStatus: state });
    expect(html).toContain("Waiting for pharmacy confirmation");
    expect(html).toContain("The pharmacy has not confirmed receipt yet.");
    expect(html).not.toContain("Sent to pharmacy");
  });
  it("shows stopped retries and a working pharmacy phone link", () => {
    const html = render({ ...base, pharmFlowSubmissionStatus: "failed" });
    expect(html).toContain("Automatic attempts have stopped.");
    expect(html).toContain('href="tel:7183282833"');
  });
  it("does not mislabel accepted, historical, OTC or closed orders as pending", () => {
    for (const override of [
      { pharmFlowSubmitted: true, pharmFlowSubmissionStatus: "pending" },
      {}, { orderType: "otc", pharmFlowSubmissionStatus: "pending" },
      ...["cancelled", "picked_up", "delivered"].map(status => ({ status, pharmFlowSubmissionStatus: "pending" })),
    ]) expect(render({ ...base, ...override })).toBe("");
  });
  it("has equivalent Spanish failure guidance", async () => {
    await i18n.changeLanguage("es");
    try {
      expect(render({ ...base, pharmFlowSubmissionStatus: "failed" })).toContain("Los intentos automáticos se han detenido.");
    } finally { await i18n.changeLanguage("en"); }
  });
});
