import { storage } from "./storage";

export interface PatientIdentityBlock {
  concordiaId: string | null;
  internalId: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  language: string | null;
  loyalty: {
    points: number;
    tier: string;
    memberSince: string | null;
  };
  usingApp: boolean;
  status: string;
}

export async function getPatientIdentityBlock(userId: string): Promise<PatientIdentityBlock | null> {
  const user = await storage.getUser(userId);
  if (!user) return null;

  const loyalty = await storage.getOrCreateLoyaltyPoints(userId);

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Patient";

  return {
    concordiaId: user.concordiaId ?? null,
    internalId: user.id,
    name,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    phone: user.phone ?? null,
    email: user.email ?? null,
    address: user.deliveryAddress ?? null,
    language: user.language ?? "en",
    loyalty: {
      points: loyalty.balance,
      tier: loyalty.tier,
      memberSince: user.createdAt ? user.createdAt.toISOString().split("T")[0] : null,
    },
    usingApp: user.onboardingComplete ?? false,
    status: "active",
  };
}

export async function resolvePatientIdentity(
  query: string
): Promise<PatientIdentityBlock | null> {
  if (!query || !query.trim()) return null;
  const q = query.trim();

  if (/^CP-\d{6}$/i.test(q)) {
    const user = await storage.getUserByConcordiaId(q.toUpperCase());
    if (user) return getPatientIdentityBlock(user.id);
  }

  const byEmail = await storage.getUserByEmail(q);
  if (byEmail) return getPatientIdentityBlock(byEmail.id);

  const byPhone = await storage.findUserByPhone(q);
  if (byPhone) return getPatientIdentityBlock(byPhone.id);

  const byId = await storage.getUser(q);
  if (byId) return getPatientIdentityBlock(byId.id);

  return null;
}
