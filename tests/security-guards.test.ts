import { describe, expect, it } from "vitest";
import {
  getRequiredPharmFlowApiKey,
  requireProductionHttpsUrl,
  safeApiRouteLabel,
} from "../server/security-guards";

describe("production security guards", () => {
  it("requires a non-empty PharmFlow API key", () => {
    expect(() => getRequiredPharmFlowApiKey({})).toThrow(
      "PharmFlow API key is not configured",
    );
    expect(() =>
      getRequiredPharmFlowApiKey({ PHARMFLOW_API_KEY: "   " }),
    ).toThrow("PharmFlow API key is not configured");
    expect(
      getRequiredPharmFlowApiKey({ PHARMFLOW_API_KEY: "  configured-key  " }),
    ).toBe("configured-key");
  });

  it("requires encrypted partner transport in production", () => {
    expect(() =>
      requireProductionHttpsUrl("CONCORDIA_API_URL", "http://example.com"),
    ).toThrow("CONCORDIA_API_URL must use HTTPS in production");
    expect(() =>
      requireProductionHttpsUrl("PHARMFLOW_API_URL", "not-a-url"),
    ).toThrow("PHARMFLOW_API_URL must be a valid URL");
    expect(() =>
      requireProductionHttpsUrl("PHARMFLOW_API_URL", "https://example.com"),
    ).not.toThrow();
  });

  it("logs route templates without concrete patient identifiers", () => {
    expect(
      safeApiRouteLabel({
        baseUrl: "",
        route: { path: "/api/external/patients/:id/medications" },
      } as never),
    ).toBe("/api/external/patients/:id/medications");
    expect(
      safeApiRouteLabel({ baseUrl: "", route: undefined } as never),
    ).toBe("/api");
  });
});