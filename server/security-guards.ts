import type { Request } from "express";

export function getRequiredPharmFlowApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = env.PHARMFLOW_API_KEY?.trim();
  if (!key) throw new Error("PharmFlow API key is not configured");
  return key;
}

export function requireProductionHttpsUrl(name: string, value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production`);
  }
}

export function safeApiRouteLabel(
  req: Pick<Request, "baseUrl" | "route">,
): string {
  const routePath = req.route?.path;
  if (typeof routePath !== "string" || !routePath.startsWith("/")) {
    return "/api";
  }
  const label = `${req.baseUrl || ""}${routePath}`;
  return label.startsWith("/api") ? label : "/api";
}