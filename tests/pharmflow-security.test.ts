import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

describe("PharmFlow outbound request safeguards", () => {
  it("does not construct an optional PharmFlow credential", () => {
    expect(routesSource).not.toContain("PHARMFLOW_API_KEY ?? \"\"");
    expect(routesSource).not.toMatch(
      /if\s*\(process\.env\.PHARMFLOW_API_KEY\)\s*\{[^}]*x-api-key/,
    );
  });

  it("does not log PharmFlow payloads or partner exception details", () => {
    expect(routesSource).not.toMatch(/\[PharmFlow\].*Payload/);
    expect(routesSource).not.toMatch(/console\.(?:error|warn)\([^;]*PharmFlow[^;]*,\s*(?:err|pharmFlowError)/);
  });

  it("accepts either authorized pharmacy partner for blister-pack creation", () => {
    expect(routesSource).toContain(
      'const concordiaOrPharmFlowApi = requireApiKey("concordia", "pharmflow");',
    );
    expect(routesSource).toContain(
      'app.post("/api/external/create-blister-pack", concordiaOrPharmFlowApi,',
    );
    expect(routesSource).not.toContain(
      "[External BlisterPack] Matched patient by ${matchMethod}: ${resolvedUserId}",
    );
  });
});