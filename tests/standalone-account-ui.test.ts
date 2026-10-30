import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import StandaloneAccount from "../client/src/pages/standalone-account";

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { id: "app-subject", primaryEmailAddress: { emailAddress: "returning@example.com" } } }),
}));

describe("separate sign-in entry", () => {
  it("sends an authorized staff sign-in to the review queue even if its local profile is separate", () => {
    const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    expect(app).toMatch(/if \(user\.pharmacyAccess === false\) \{\s*if \(user\.isAdmin\) \{\s*return <PharmacyLinkRequests staffMode \/>/);
    expect(app).toContain("return <UnlinkedLayout name={user.firstName}");
  });

  it("opens the catalog directly for an existing separate app account without a connection gate", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["/api/pharmacy-link-requests/me"], { request: null });
    queryClient.setQueryData(["/api/otc/products"], []);
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(StandaloneAccount, { name: null, lastName: null, onSignOut: () => {} }),
      ),
    );

    expect(markup).toContain('id="standalone-shop-title"');
    expect(markup).toContain("Search products");
    expect(markup).toContain("button-standalone-shop-tab");
    expect(markup).toContain("button-standalone-profile-tab");
    expect(markup).toContain("button-standalone-records-tab");
    expect(markup).toContain("App sign-in: returning@example.com");
    expect(markup).not.toContain("Send to pharmacy for review");
    expect(markup).not.toContain("You're signed in.");
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/standalone-account.tsx"), "utf8");
    expect(page).toContain("Send to pharmacy for review");
    expect(page).toContain("text-standalone-signin-id");
  });

  it("keeps the pharmacy connection inside the original app shell without the replacement navigation", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["/api/pharmacy-link-requests/me"], { request: null });
    queryClient.setQueryData(["/api/otc/products"], []);
    const renderSection = (section: "shop" | "profile" | "records") => renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(StandaloneAccount, { name: null, lastName: null, onSignOut: () => {}, section }),
      ),
    );

    expect(renderSection("shop")).toContain("Search products");
    expect(renderSection("profile")).toContain("input-standalone-first-name");
    expect(renderSection("records")).toContain("Send to pharmacy for review");
    expect(renderSection("records")).not.toContain("button-standalone-shop-tab");
    const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    expect(app).toContain('location === "/records"');
    expect(app).toContain(': <Router />}');
    expect(app).toContain('<Route path="/" component={Home} />');
    expect(app).toContain('<Route path="/shop" component={Shop} />');
    expect(app).toContain("banner-records-not-connected");
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/home.tsx"), "utf8");
    expect(home).toContain("const hasPharmacyRecords = !!user && user.pharmacyAccess !== false");
    expect(home.match(/enabled: hasPharmacyRecords/g)).toHaveLength(7);
  });

  it("restores the fourth Home tile to the Health Chat page without exposing records to unlinked sign-ins", () => {
    const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/home.tsx"), "utf8");
    const inquiry = readFileSync(resolve(process.cwd(), "client/src/pages/inquiry.tsx"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const english = readFileSync(resolve(process.cwd(), "client/src/i18n/en.json"), "utf8");
    expect(home).toContain('testId: "tile-health-assistant"');
    expect(home).toContain('href: hasPharmacyRecords ? "/medications" : "/records"');
    expect(home).toContain('href: "/shop"');
    expect(home).toContain('t("home.medicationRecordsNotConnected")');
    expect(home).toContain('label: t("home.healthChat")');
    expect(home).toContain('href: "/inquiry"');
    expect(app).toContain('<Route path="/inquiry" component={Inquiry} />');
    expect(inquiry).toContain("enabled: hasPharmacyRecords");
    expect(inquiry).toContain('t("inquiry.unlinkedNotice")');
    expect(english).toContain("this chat cannot see your medications");
    expect(inquiry).not.toContain("getSafetyBadge");
    expect(inquiry).not.toContain("PharmacistAvatar");
    expect(inquiry).toContain("if (!completed && !streamError) throw");
    expect(routes).toContain('const verified = caller.identityTrustStatus === "verified"');
    expect(routes).toContain("const activeMeds = verified");
    expect(routes).toContain("const suggestedProducts = verified ?");
    expect(routes).toContain('model: "gpt-5-mini"');
    expect(routes).not.toContain("const staticReply =");
    expect(routes).not.toContain('End with one brief sentence:');
  });
});