/**
 * This app has one Clerk tenant: the managed tenant provisioned for the
 * Replit app domain. External/shared credentials are intentionally ignored;
 * pharmacy synchronization uses its own server-to-server API keys.
 */
function isValidPair(publishableKey: string | undefined, secretKey: string | undefined): boolean {
  if (publishableKey?.startsWith("pk_live_")) return secretKey?.startsWith("sk_live_") === true;
  if (publishableKey?.startsWith("pk_test_")) return secretKey?.startsWith("sk_test_") === true;
  return false;
}

export function getClerkPublishableKey(): string | undefined {
  const key = process.env.CLERK_PUBLISHABLE_KEY;
  return isValidPair(key, process.env.CLERK_SECRET_KEY) ? key : undefined;
}

export function getClerkSecretKey(): string | undefined {
  const key = process.env.CLERK_PUBLISHABLE_KEY;
  return isValidPair(key, process.env.CLERK_SECRET_KEY) ? process.env.CLERK_SECRET_KEY : undefined;
}

// Compatibility exports for callers that report configuration state. There is
// no runtime tenant switching anymore.
export function usesExternalClerkCredentials(): boolean { return false; }
export function useExternalDevelopmentClerk(): boolean { return false; }
export function usesLiveClerkInDevelopment(): boolean { return false; }