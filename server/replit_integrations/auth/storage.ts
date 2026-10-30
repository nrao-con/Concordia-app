import { users, type User, type UpsertUser } from "@shared/schema";
import { db } from "../../db";
import { and, eq, isNull } from "drizzle-orm";
import { normalizeEmail, normalizePhone } from "@shared/identity";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByClerkUserId(clerkUserId: string): Promise<User | undefined>;
  createStandaloneUser(clerkUserId: string): Promise<User>;
  updateStandaloneName(clerkUserId: string, firstName: string | null, lastName: string | null): Promise<User | undefined>;
  bindClerkUserToPatient(clerkUserId: string, patientId: string): Promise<User>;
  bindAuthoritativePharmacyIdentity(clerkUserId: string, pharmacyPatientId: string, concordiaId: string): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByClerkUserId(clerkUserId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    return user;
  }

  async createStandaloneUser(clerkUserId: string): Promise<User> {
    // A Clerk session alone cannot identify an existing pharmacy patient.
    // Never copy contact fields or try to match an existing row by email/phone.
    await db.insert(users).values({
      clerkUserId,
      identityTrustStatus: "unverified",
      onboardingComplete: false,
    }).onConflictDoNothing();
    const user = await this.getUserByClerkUserId(clerkUserId);
    if (!user) throw new Error("Could not initialize the signed-in account");
    return user;
  }

  async updateStandaloneName(clerkUserId: string, firstName: string | null, lastName: string | null): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ firstName, lastName, updatedAt: new Date() })
      .where(and(
        eq(users.clerkUserId, clerkUserId),
        eq(users.identityTrustStatus, "unverified"),
        eq(users.identityReviewRequired, false),
        isNull(users.concordiaId),
        isNull(users.pharmacyPatientId),
      ))
      .returning();
    return user;
  }

  async bindClerkUserToPatient(clerkUserId: string, patientId: string): Promise<User> {
    return db.transaction(async (tx) => {
      const [subject] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkUserId, clerkUserId))
        .for("update");
      if (subject && subject.id !== patientId) {
        const error = new Error("This sign-in identity is already linked to another patient");
        (error as any).code = "CLERK_ID_ALREADY_BOUND";
        throw error;
      }

      const [patient] = await tx
        .select()
        .from(users)
        .where(eq(users.id, patientId))
        .for("update");
      if (!patient) throw new Error("Canonical pharmacy patient was not found");
      if (patient.clerkUserId && patient.clerkUserId !== clerkUserId) {
        const error = new Error("This pharmacy patient is already linked to another sign-in identity");
        (error as any).code = "PATIENT_ALREADY_BOUND";
        throw error;
      }

      const [bound] = await tx
        .update(users)
        .set({
          clerkUserId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, patientId))
        .returning();
      return bound;
    });
  }

  async bindAuthoritativePharmacyIdentity(
    clerkUserId: string,
    pharmacyPatientId: string,
    concordiaId: string,
  ): Promise<User> {
    return db.transaction(async (tx) => {
      const [subject] = await tx.select().from(users).where(eq(users.clerkUserId, clerkUserId)).for("update");
      const [pharmacyMatch] = await tx.select().from(users).where(eq(users.pharmacyPatientId, pharmacyPatientId)).for("update");
      const [patient] = await tx.select().from(users).where(eq(users.concordiaId, concordiaId)).for("update");
      if (!patient) {
        const error = new Error("Canonical pharmacy patient was not found");
        (error as any).code = "PHARMACY_PATIENT_NOT_FOUND";
        throw error;
      }
      if (subject && subject.id !== patient.id) {
        const error = new Error("This sign-in identity is already linked to another patient");
        (error as any).code = "CLERK_ID_ALREADY_BOUND";
        throw error;
      }
      if (pharmacyMatch && pharmacyMatch.id !== patient.id) {
        const error = new Error("Pharmacy identity is already linked to another patient");
        (error as any).code = "PHARMACY_ID_ALREADY_BOUND";
        throw error;
      }
      if (patient.pharmacyPatientId && patient.pharmacyPatientId !== pharmacyPatientId) {
        const error = new Error("This patient has a different pharmacy identity");
        (error as any).code = "PATIENT_PHARMACY_ID_CONFLICT";
        throw error;
      }
      if (patient.clerkUserId && patient.clerkUserId !== clerkUserId) {
        const error = new Error("This pharmacy patient is already linked to another sign-in identity");
        (error as any).code = "PATIENT_ALREADY_BOUND";
        throw error;
      }
      const [bound] = await tx.update(users).set({
        clerkUserId,
        pharmacyPatientId,
        updatedAt: new Date(),
      }).where(eq(users.id, patient.id)).returning();
      return bound;
    });
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const values: UpsertUser = { ...userData };
    if (values.email !== undefined) values.emailNormalized = values.email === null || values.email === "" ? null : normalizeEmail(values.email);
    if (values.phone !== undefined) values.phoneNormalized = values.phone === null || values.phone === "" ? null : normalizePhone(values.phone);
    const [user] = await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.id,
        // Spread all supplied fields so callers can update firstName, phone,
        // dateOfBirth, onboardingComplete, etc. — not just profileImageUrl.
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
