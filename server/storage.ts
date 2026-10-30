import {
  users, medications, otcProducts, orders, orderItems,
  blisterPacks, blisterDoseSlots, reminders, notifications, caregiverLinks, userDocuments, pharmacyMessages,
  patientDoctors, loyaltyPoints, pointsTransactions, rewards, earningRules, pushSubscriptions, pushConfig, cartItems, failedSyncs,
  patientConditions, healthJournalEntries, medicationConditionLinks, recommendedProducts, nutritionChatMessages,
  partnerWebhookReceipts, partnerOutbox, syncOperationAudit,
  type User, type UpsertUser, type Medication, type InsertMedication,
  type OtcProduct, type InsertOtcProduct, type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem, type BlisterPack, type InsertBlisterPack,
  type BlisterDoseSlot, type InsertBlisterDoseSlot,
  type Reminder, type InsertReminder, type Notification, type InsertNotification,
  type CaregiverLink, type InsertCaregiverLink,
  type UserDocument, type InsertUserDocument,
  type PharmacyMessage, type InsertPharmacyMessage,
  type PatientDoctor, type InsertPatientDoctor,
  type LoyaltyPoints, type InsertLoyaltyPoints,
  type PointsTransaction, type InsertPointsTransaction,
  type Reward, type InsertReward,
  type EarningRule, type InsertEarningRule,
  type PushSubscription, type InsertPushSubscription,
  type FailedSync,
  type PatientCondition, type InsertPatientCondition,
  type HealthJournalEntry, type InsertHealthJournalEntry,
  type MedicationConditionLink, type InsertMedicationConditionLink,
  type RecommendedProduct,
  type NutritionChatMessage, type InsertNutritionChatMessage,
  type PartnerWebhookReceipt, type PartnerOutbox, type SyncOperationAudit,
} from "@shared/schema";

import { db } from "./db";
import { buildStaffCheckoutPayload } from "./staff-checkout";
import { staffCheckoutReceipts } from "@shared/schema";
import { eq, ne, desc, and, like, ilike, lt, gt, gte, lte, sql, inArray, notInArray, isNotNull, isNull, or } from "drizzle-orm";
import { acceptOrderStatus, WebhookPayloadConflictError, OrderCancellationError, orderDeliveryLockKey, type PartnerDispatchResult } from "./sync-reliability";

export interface LockedOrderDelivery {
  getOrder(id: number): Promise<Order | undefined>;
  ownsPartnerOutboxLease(id: number, leaseToken: string): Promise<boolean>;
  completePartnerOutboxWithEffects(id: number, leaseToken: string, result: PartnerDispatchResult): Promise<boolean>;
}
type StorageTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
import { randomUUID } from "node:crypto";
import { normalizeEmail, normalizePhone } from "@shared/identity";

export type CartItemWithProduct = {
  id: number;
  otcProductId: number;
  quantity: number;
  addedAt: Date | null;
  productName: string;
  price: string | null;
  isAvailable: boolean | null;
  stockCount: number | null;
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByClerkUserId(clerkUserId: string): Promise<User | undefined>;
  bindClerkUserToPatient(clerkUserId: string, patientId: string): Promise<User>;
  bindAuthoritativePharmacyIdentity(clerkUserId: string, pharmacyPatientId: string, concordiaId: string): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  migrateUserIdToClerkId(oldId: string, newId: string, identityTrustStatus?: string): Promise<User>;

  getMedications(userId: string): Promise<Medication[]>;
  getMedication(id: number): Promise<Medication | undefined>;
  createMedication(med: InsertMedication): Promise<Medication>;
  updateMedication(id: number, med: Partial<InsertMedication>): Promise<Medication>;
  deleteMedication(id: number): Promise<void>;
  deleteAllMedications(userId: string): Promise<number>;
  processRefillsDue(): Promise<number>;
  confirmRefill(id: number, idempotencyKey?: string): Promise<Medication>;

  findUserByNamePhoneDob(firstName: string, lastName: string | undefined, phone: string, dateOfBirth: string): Promise<User | undefined>;
  findUserByPhone(phone: string): Promise<User | undefined>;
  getUserByConcordiaId(concordiaId: string): Promise<User | undefined>;

  getOtcProducts(): Promise<OtcProduct[]>;
  getFeaturedOtcProducts(fallbackCount?: number): Promise<OtcProduct[]>;
  setOtcProductFeatured(id: number, isFeatured: boolean): Promise<OtcProduct>;
  searchOtcProducts(query: string): Promise<OtcProduct[]>;
  getOtcProduct(id: number): Promise<OtcProduct | undefined>;
  createOtcProduct(product: InsertOtcProduct): Promise<OtcProduct>;
  updateOtcProduct(id: number, product: Partial<InsertOtcProduct>): Promise<OtcProduct>;
  deleteOtcProduct(id: number): Promise<void>;
  upsertOtcProductByExternalId(externalId: string, product: InsertOtcProduct): Promise<OtcProduct>;
  bulkSyncOtcProducts(products: InsertOtcProduct[], source: string): Promise<{ upserted: number; markedUnavailable: number }>;

  getOrders(userId: string): Promise<Order[]>;
  getActiveOtcOrdersWithStaffRef(): Promise<Order[]>;
  countTodayPickupOrders(): Promise<number>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrderByNumber(orderNumber: string): Promise<Order | undefined>;
  getPickupQueue(statusList: string[], dayStart: Date, dayEnd: Date): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  createOrderWithItems(order: InsertOrder, items: Array<Omit<InsertOrderItem, "orderId">>, refillPayload?: Record<string, unknown>, staffDelivery?: boolean): Promise<{ order: Order; items: OrderItem[] }>;
  getRefillSubmissionStatus(orderId: number): Promise<string | null>;
  updateOrder(id: number, order: Partial<InsertOrder>): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order>;
  applyStaffOrderStatus(id: number, status: string, staffOrderNumber: string): Promise<Order>;
  cancelOrderWithDelivery(id: number, userId: string): Promise<{ order: Order; changed: boolean }>;
  withOrderDeliveryLock<T>(orderId: number, task: (locked: LockedOrderDelivery) => Promise<T>): Promise<T>;
  deleteCompletedOrders(userId: string): Promise<number>;
  getOrderItems(orderId: number): Promise<OrderItem[]>;
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;

  getBlisterPacks(userId: string): Promise<BlisterPack[]>;
  getBlisterPack(id: number): Promise<BlisterPack | undefined>;
  createBlisterPack(pack: InsertBlisterPack): Promise<BlisterPack>;
  updateBlisterPack(id: number, pack: Partial<InsertBlisterPack>): Promise<BlisterPack>;
  deleteBlisterPack(id: number): Promise<void>;

  getDoseSlots(blisterPackId: number): Promise<BlisterDoseSlot[]>;
  createDoseSlotsForPack(slots: InsertBlisterDoseSlot[]): Promise<BlisterDoseSlot[]>;
  updateDoseSlotStatus(slotId: number, status: string, takenAt?: Date, actorId?: string): Promise<BlisterDoseSlot>;
  deletePendingDoseSlots(blisterPackId: number): Promise<number>;
  processMissedDoses(): Promise<number>;

  getReminders(userId: string): Promise<Reminder[]>;
  createReminder(reminder: InsertReminder): Promise<Reminder>;
  updateReminder(id: number, reminder: Partial<InsertReminder>): Promise<Reminder>;
  deleteReminder(id: number): Promise<void>;

  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(id: number, userId: string): Promise<void>;
  clearAllNotifications(userId: string): Promise<void>;
  deleteOldNotifications(hoursOld: number, type?: string, excludeType?: string): Promise<number>;

  getPatientDoctors(userId: string): Promise<PatientDoctor[]>;
  getPatientDoctor(id: number, userId: string): Promise<PatientDoctor | undefined>;
  createPatientDoctor(data: InsertPatientDoctor): Promise<PatientDoctor>;
  updatePatientDoctor(id: number, userId: string, data: Partial<InsertPatientDoctor>): Promise<PatientDoctor | undefined>;
  deletePatientDoctor(id: number, userId: string): Promise<boolean>;
  bulkImportDoctors(userId: string, doctors: Array<{ name: string; specialty: string; phone: string; address: string; npi: string }>): Promise<PatientDoctor[]>;

  getCaregiverLinks(userId: string): Promise<CaregiverLink[]>;
  getCaregiverLinksForPatient(patientId: string): Promise<CaregiverLink[]>;
  createCaregiverLink(link: InsertCaregiverLink): Promise<CaregiverLink>;
  updateCaregiverLinkStatus(id: number, status: string): Promise<CaregiverLink | undefined>;
  deleteCaregiverLink(id: number): Promise<void>;
  searchUsersByNameAndDob(name: string, dob: string): Promise<User[]>;

  getUserDocuments(userId: string): Promise<UserDocument[]>;
  createUserDocument(doc: InsertUserDocument): Promise<UserDocument>;
  deleteUserDocument(id: number): Promise<void>;

  getPharmacyMessages(userId: string): Promise<PharmacyMessage[]>;
  createPharmacyMessage(msg: InsertPharmacyMessage): Promise<PharmacyMessage>;
  createOutgoingPharmacyMessage(msg: InsertPharmacyMessage, payload: Record<string, unknown>): Promise<PharmacyMessage>;
  applyPharmacyReceipt(id: number, userId: string, status: "received" | "read"): Promise<PharmacyMessage | undefined>;
  markPharmacyMessageRead(id: number): Promise<void>;
  getUnreadPharmacyMessageCount(userId: string): Promise<number>;
  deleteAllPharmacyMessages(userId: string): Promise<number>;

  getMedicationByExternalRxId(externalRxId: string, userId: string): Promise<Medication | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUsersUpdatedSince(since: Date): Promise<User[]>;

  getOrCreateLoyaltyPoints(userId: string): Promise<LoyaltyPoints>;
  updateLoyaltyStreak(userId: string, streakDays: number): Promise<void>;
  addPointsTransaction(tx: InsertPointsTransaction): Promise<PointsTransaction>;
  getPointsHistory(userId: string, limit?: number, offset?: number): Promise<PointsTransaction[]>;
  countTodayPointsBySource(userId: string, source: string): Promise<number>;
  getRewards(): Promise<Reward[]>;
  getReward(id: number): Promise<Reward | undefined>;
  redeemReward(userId: string, rewardId: number): Promise<{ transaction: PointsTransaction; updatedBalance: number }>;
  createReward(reward: InsertReward): Promise<Reward>;
  getEarningRules(): Promise<EarningRule[]>;
  createEarningRule(rule: InsertEarningRule): Promise<EarningRule>;
  getAllBlisterPacks(): Promise<BlisterPack[]>;

  upsertPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  getPushSubscriptionsForUser(userId: string): Promise<PushSubscription[]>;
  deletePushSubscription(endpoint: string): Promise<void>;

  getPushConfig(): Promise<import("@shared/schema").AllSeverityAlertConfig | null>;
  setPushConfig(config: import("@shared/schema").AllSeverityAlertConfig): Promise<void>;

  getCartItems(userId: string): Promise<CartItemWithProduct[]>;
  upsertCartItem(userId: string, otcProductId: number, quantity: number): Promise<CartItemWithProduct>;
  updateCartItemQuantity(userId: string, id: number, quantity: number): Promise<CartItemWithProduct | null>;
  removeCartItem(userId: string, id: number): Promise<void>;
  clearCart(userId: string): Promise<void>;

  getNotificationPreferences(userId: string): Promise<{ pharmacyAlertsEnabled: boolean; emailNotificationsEnabled: boolean; pharmacyAlertMinSeverity: string; snoozeUntilAt: Date | null; inactivityThresholdHours: number }>;
  updateNotificationPreferences(userId: string, prefs: { pharmacyAlertsEnabled: boolean; emailNotificationsEnabled?: boolean; pharmacyAlertMinSeverity: string; snoozeUntilAt?: Date | null; inactivityThresholdHours?: number }): Promise<{ pharmacyAlertsEnabled: boolean; emailNotificationsEnabled: boolean; pharmacyAlertMinSeverity: string; snoozeUntilAt: Date | null; inactivityThresholdHours: number }>;
  getUsersWithPharmacyAlertsEnabled(): Promise<User[]>;

  createFailedSync(orderId: number, lastError: string): Promise<void>;
  getPendingFailedSyncs(): Promise<FailedSync[]>;
  resolveFailedSync(id: number): Promise<void>;
  updateFailedSync(id: number, data: { attempts: number; lastError?: string; syncStatus?: string }): Promise<void>;
  countPendingFailedSyncs(): Promise<number>;
  reserveWebhookReceipt(source: string, sourceEventId: string, payloadHash: string): Promise<PartnerWebhookReceipt | null>;
  completeWebhookReceipt(id: number, leaseToken: string): Promise<void>;
  failWebhookReceipt(id: number, leaseToken: string): Promise<void>;
  enqueuePartnerOutbox(data: { partner: string; operation: string; idempotencyKey: string; payload: Record<string, unknown> }): Promise<PartnerOutbox>;
  claimDuePartnerOutbox(limit?: number, idempotencyKey?: string): Promise<PartnerOutbox[]>;
  completePartnerOutbox(id: number, leaseToken: string): Promise<void>;
  completePartnerOutboxWithEffects(id: number, leaseToken: string, result: PartnerDispatchResult): Promise<boolean>;
  retryPartnerOutbox(id: number, leaseToken: string, error: string, maxAttempts?: number): Promise<PartnerOutbox | undefined>;
  failPartnerOutbox(id: number, leaseToken: string, error: string): Promise<void>;
  cleanupPartnerOutbox(): Promise<void>;
  getAdminSyncOperations(filters: { partner?: string; status?: string; limit: number; offset: number }): Promise<{ operations: Array<{ id: number; partner: string; operation: string; status: string; attempts: number; nextAttemptAt: Date; createdAt: Date; updatedAt: Date; errorCategory: string | null; operatorMessage: string | null }>; total: number; summary: Record<string, number> }>;
  retryFailedPartnerOutbox(id: number, actorUserId: string): Promise<{ changed: boolean; status: string }>;
  getSyncOperationAudit(limit: number, offset: number): Promise<SyncOperationAudit[]>;
  removeOutOfStockCartItems(): Promise<number>;

  getPatientConditions(userId: string): Promise<PatientCondition[]>;
  getPatientCondition(id: number): Promise<PatientCondition | undefined>;
  createPatientCondition(data: InsertPatientCondition): Promise<PatientCondition>;
  updatePatientCondition(id: number, data: Partial<InsertPatientCondition>): Promise<PatientCondition | undefined>;
  softDeletePatientCondition(id: number): Promise<void>;
  getHealthJournalEntries(userId: string, conditionId?: number | null, page?: number, limit?: number): Promise<{ entries: HealthJournalEntry[]; total: number }>;
  createHealthJournalEntry(data: InsertHealthJournalEntry): Promise<HealthJournalEntry>;
  getMedicationConditionLinks(userId: string, medicationId?: string): Promise<MedicationConditionLink[]>;
  getMedicationConditionLinksByConditionAndUser(conditionId: number, userId: string): Promise<MedicationConditionLink[]>;
  getMedicationConditionLinkById(id: number): Promise<MedicationConditionLink | undefined>;
  createMedicationConditionLink(data: InsertMedicationConditionLink): Promise<MedicationConditionLink>;
  deleteMedicationConditionLink(id: number): Promise<void>;
  getMedicationsWithLinkedConditions(userId: string): Promise<(Medication & { linkedCondition: { id: number; conditionName: string; linkId: number } | null })[]>;

  saveRecommendedProduct(userId: string, otcProductId: number, source: string, reason?: string): Promise<void>;
  getRecommendedProducts(userId: string): Promise<(RecommendedProduct & { product: OtcProduct })[]>;
  dismissRecommendedProduct(id: number, userId: string): Promise<void>;

  getNutritionChatHistory(userId: string): Promise<NutritionChatMessage[]>;
  saveNutritionChatMessage(msg: InsertNutritionChatMessage): Promise<NutritionChatMessage>;
  clearNutritionChatHistory(userId: string): Promise<void>;
  pruneNutritionChatHistory(userId: string, maxMessages: number): Promise<void>;
}

class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const normalizedData: UpsertUser = { ...userData };
    if (userData.email !== undefined) {
      normalizedData.emailNormalized = userData.email === null || userData.email === "" ? null : normalizeEmail(userData.email);
    }
    if (userData.phone !== undefined) {
      normalizedData.phoneNormalized = userData.phone === null || userData.phone === "" ? null : normalizePhone(userData.phone);
    }
    const [user] = await db
      .insert(users)
      .values(normalizedData)
      .onConflictDoUpdate({
        target: users.id,
        set: { ...normalizedData, updatedAt: new Date() },
      })
      .returning();

    return user;
  }

  async getUserByClerkUserId(clerkUserId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    return user;
  }

  async bindClerkUserToPatient(clerkUserId: string, patientId: string): Promise<User> {
    return db.transaction(async (tx) => {
      const [subject] = await tx.select({ id: users.id }).from(users)
        .where(eq(users.clerkUserId, clerkUserId)).for("update");
      if (subject && subject.id !== patientId) {
        const error = new Error("This sign-in identity is already linked to another patient");
        (error as any).code = "CLERK_ID_ALREADY_BOUND";
        throw error;
      }
      const [patient] = await tx.select().from(users).where(eq(users.id, patientId)).for("update");
      if (!patient) throw new Error("Canonical pharmacy patient was not found");
      if (patient.clerkUserId && patient.clerkUserId !== clerkUserId) {
        const error = new Error("This pharmacy patient is already linked to another sign-in identity");
        (error as any).code = "PATIENT_ALREADY_BOUND";
        throw error;
      }
      const [bound] = await tx.update(users).set({
        clerkUserId,
        updatedAt: new Date(),
      }).where(eq(users.id, patientId)).returning();
      return bound;
    });
  }

  async bindAuthoritativePharmacyIdentity(clerkUserId: string, pharmacyPatientId: string, concordiaId: string): Promise<User> {
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

  async migrateUserIdToClerkId(oldId: string, newId: string, identityTrustStatus?: string): Promise<User> {
    // Kept as a compatibility shim for old callers. Never re-key users or
    // repoint child records; the local patient key remains canonical.
    return this.bindClerkUserToPatient(newId, oldId);
  }

  async getMedications(userId: string): Promise<Medication[]> {
    return db.select().from(medications).where(eq(medications.userId, userId)).orderBy(desc(medications.createdAt));
  }

  async getMedication(id: number): Promise<Medication | undefined> {
    const [med] = await db.select().from(medications).where(eq(medications.id, id));
    return med;
  }

  async createMedication(med: InsertMedication): Promise<Medication> {
    const [result] = await db.insert(medications).values(med).returning();
    return result;
  }

  async updateMedication(id: number, med: Partial<InsertMedication>): Promise<Medication> {
    const [result] = await db.update(medications).set(med).where(eq(medications.id, id)).returning();
    return result;
  }

  async deleteMedication(id: number): Promise<void> {
    await db.delete(medications).where(eq(medications.id, id));
  }

  async deleteAllMedications(userId: string): Promise<number> {
    const result = await db.delete(medications).where(and(
      eq(medications.userId, userId),
      isNull(medications.externalRxId),
      isNull(medications.rxNumber),
    )).returning();
    return result.length;
  }

  async processRefillsDue(): Promise<number> {
    const now = new Date();
    const dueMeds = await db.select().from(medications).where(
      and(
        eq(medications.isActive, true),
        lt(medications.nextRefillDate, now)
      )
    );
    let processed = 0;
    for (const med of dueMeds) {
      const newRefills = Math.max(0, (med.refillsRemaining ?? 0) - 1);
      await db.update(medications).set({
        refillsRemaining: newRefills,
        lastFilledDate: med.nextRefillDate,
        nextRefillDate: null,
      }).where(eq(medications.id, med.id));
      processed++;
    }
    return processed;
  }

  async confirmRefill(id: number, idempotencyKey?: string): Promise<Medication> {
    const med = await this.getMedication(id);
    if (!med) throw new Error("Medication not found");
    if (idempotencyKey && med.lastRefillConfirmationKey === idempotencyKey) return med;
    const newRefills = Math.max(0, (med.refillsRemaining ?? 0) - 1);
    const [result] = await db.update(medications).set({
      refillsRemaining: newRefills,
      lastFilledDate: new Date(),
      nextRefillDate: null,
      lastRefillConfirmationKey: idempotencyKey,
    }).where(idempotencyKey
      ? and(
          eq(medications.id, id),
          or(isNull(medications.lastRefillConfirmationKey), ne(medications.lastRefillConfirmationKey, idempotencyKey)),
        )
      : eq(medications.id, id)
    ).returning();
    return result ?? (await this.getMedication(id))!;
  }

  // Staff owns visibility, including a complete empty/hidden catalog.
  private _deduplicateByStaffPanel(rows: OtcProduct[]): OtcProduct[] {
    return rows.filter(p => p.syncSource === "staff_panel" && p.isShopVisible);
  }

  async getOtcProducts(): Promise<OtcProduct[]> {
    const all = await db.select().from(otcProducts).where(isNotNull(otcProducts.syncSource));
    return this._deduplicateByStaffPanel(all);
  }

  async getFeaturedOtcProducts(count = 5): Promise<OtcProduct[]> {
    const all = await db.select().from(otcProducts).where(
      and(isNotNull(otcProducts.syncSource), gt(otcProducts.stockCount, 0))
    );
    const available = await this._deduplicateByStaffPanel(all);
    if (available.length === 0) return [];
    const today = new Date();
    const dateSeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    let s = dateSeed;
    const rng = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    const shuffled = [...available].sort(() => rng() - 0.5);
    return shuffled.slice(0, count);
  }

  async setOtcProductFeatured(id: number, isFeatured: boolean): Promise<OtcProduct> {
    const [result] = await db.update(otcProducts).set({ isFeatured }).where(eq(otcProducts.id, id)).returning();
    return result;
  }

  async searchOtcProducts(query: string): Promise<OtcProduct[]> {
    const all = await db.select().from(otcProducts).where(
      and(isNotNull(otcProducts.syncSource), ilike(otcProducts.name, `%${query}%`))
    );
    return this._deduplicateByStaffPanel(all);
  }

  async getOtcProduct(id: number): Promise<OtcProduct | undefined> {
    const [product] = await db.select().from(otcProducts).where(eq(otcProducts.id, id));
    return product;
  }

  async createOtcProduct(product: InsertOtcProduct): Promise<OtcProduct> {
    const [result] = await db.insert(otcProducts).values(product).returning();
    return result;
  }

  async updateOtcProduct(id: number, product: Partial<InsertOtcProduct>): Promise<OtcProduct> {
    const [result] = await db.update(otcProducts).set(product).where(eq(otcProducts.id, id)).returning();
    return result;
  }

  async deleteOtcProduct(id: number): Promise<void> {
    await db.delete(otcProducts).where(eq(otcProducts.id, id));
  }

  async upsertOtcProductByExternalId(externalId: string, product: InsertOtcProduct): Promise<OtcProduct> {
    const [existing] = await db.select().from(otcProducts).where(eq(otcProducts.externalId, externalId));
    if (existing) {
      const [result] = await db.update(otcProducts).set({ ...product, lastSyncedAt: new Date() }).where(eq(otcProducts.id, existing.id)).returning();
      return result;
    }
    const [result] = await db.insert(otcProducts).values({ ...product, externalId, lastSyncedAt: new Date() }).returning();
    return result;
  }

  async bulkSyncOtcProducts(products: InsertOtcProduct[], source: string): Promise<{ upserted: number; markedUnavailable: number }> {
    return await db.transaction(async (tx) => {
      let upsertedCount = 0;

      if (products.length > 0) {
        const now = new Date();
        const rows = products.map(p => ({ ...p, syncSource: source, lastSyncedAt: now }));

        const upsertedRows = await tx
          .insert(otcProducts)
          .values(rows)
          .onConflictDoUpdate({
            target: otcProducts.externalId,
            set: {
              name: sql`EXCLUDED.name`,
              brand: sql`EXCLUDED.brand`,
              category: sql`EXCLUDED.category`,
              description: sql`EXCLUDED.description`,
              price: sql`EXCLUDED.price`,
              dosageInfo: sql`EXCLUDED.dosage_info`,
              warnings: sql`EXCLUDED.warnings`,
              stockCount: sql`EXCLUDED.stock_count`,
              imageUrl: sql`EXCLUDED.image_url`,
              videoUrl: sql`EXCLUDED.video_url`,
              pharmacistTip: sql`EXCLUDED.pharmacist_tip`,
              whyUseIt: sql`EXCLUDED.why_use_it`,
              isAvailable: sql`EXCLUDED.is_available`,
              isShopVisible: sql`EXCLUDED.is_shop_visible`,
              isFeatured: sql`EXCLUDED.is_featured`,
              fsaEligible: sql`EXCLUDED.fsa_eligible`,
              syncSource: sql`EXCLUDED.sync_source`,
              staffPanelProductId: sql`EXCLUDED.staff_panel_product_id`,
              lastSyncedAt: sql`EXCLUDED.last_synced_at`,
            },
          })
          .returning({ id: otcProducts.id });

        upsertedCount = upsertedRows.length;
      }

      const incomingExternalIds = products.map(p => p.externalId).filter(Boolean) as string[];
      let markedUnavailable = 0;

      if (incomingExternalIds.length > 0) {
        const stale = await tx
          .update(otcProducts)
          .set({ isAvailable: false, isShopVisible: false })
          .where(
            and(
              eq(otcProducts.syncSource, source),
              notInArray(otcProducts.externalId, incomingExternalIds),
              or(eq(otcProducts.isAvailable, true), eq(otcProducts.isShopVisible, true))
            )
          )
          .returning({ id: otcProducts.id });
        markedUnavailable = stale.length;
      } else {
        const stale = await tx
          .update(otcProducts)
          .set({ isAvailable: false, isShopVisible: false })
          .where(
            and(
              eq(otcProducts.syncSource, source),
              or(eq(otcProducts.isAvailable, true), eq(otcProducts.isShopVisible, true))
            )
          )
          .returning({ id: otcProducts.id });
        markedUnavailable = stale.length;
      }

      return { upserted: upsertedCount, markedUnavailable };
    });
  }

  async getOrders(userId: string): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async getActiveOtcOrdersWithStaffRef(): Promise<Order[]> {
    const activeStatuses = ["pending", "received", "preparing", "verified", "ready"];
    return db.select().from(orders).where(
      and(
        eq(orders.orderType, "otc"),
        inArray(orders.status, activeStatuses),
        isNotNull(orders.staffPanelOrderNumber)
      )
    );
  }

  async countTodayPickupOrders(): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(orders)
      .where(
        and(
          eq(orders.deliveryMethod, "pickup"),
          gte(orders.createdAt, todayStart),
          lte(orders.createdAt, todayEnd)
        )
      );
    return result[0]?.count ?? 0;
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrderByNumber(orderNumber: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber.toUpperCase()));
    return order;
  }

  async getPickupQueue(statusList: string[], dayStart: Date, dayEnd: Date): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(
        and(
          inArray(orders.status, statusList),
          eq(orders.deliveryMethod, "pickup"),
          gte(orders.createdAt, dayStart),
          lte(orders.createdAt, dayEnd)
        )
      )
      .orderBy(orders.pickupSlot, orders.createdAt);
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [result] = await db.insert(orders).values(order).returning();
    return result;
  }

  async updateOrder(id: number, order: Partial<InsertOrder>): Promise<Order> {
    const [result] = await db.update(orders).set({ ...order, updatedAt: new Date() }).where(eq(orders.id, id)).returning();
    return result;
  }

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    const existing = await this.getOrder(id);
    if (!existing) throw new Error("Order not found");
    const accepted = acceptOrderStatus(existing.status, status);
    // A duplicate or stale partner delivery is a no-op. Returning the
    // current row keeps callers from emitting a second notification.
    if (!accepted || accepted === existing.status) return existing;
    const history = (existing?.statusHistory ?? []) as { status: string; timestamp: string }[];
    const updatedHistory = [...history, { status: accepted, timestamp: new Date().toISOString() }];
    const [result] = await db.update(orders)
      .set({ status: accepted, updatedAt: new Date(), statusHistory: updatedHistory })
      .where(and(eq(orders.id, id), eq(orders.status, existing.status ?? "pending")))
      .returning();
    return result ?? (await this.getOrder(id))!;
  }

  async applyStaffOrderStatus(id: number, status: string, staffOrderNumber: string): Promise<Order> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderDeliveryLockKey(id)}))`);
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
      if (!order || order.orderType !== "otc") throw new OrderCancellationError(404, "Order not found");
      if (order.staffPanelOrderNumber && order.staffPanelOrderNumber !== staffOrderNumber) {
        throw new OrderCancellationError(409, "Staff order number conflict");
      }
      const accepted = acceptOrderStatus(order.status, status);
      const changed = accepted && accepted !== order.status;
      if (!changed && order.staffPanelOrderNumber === staffOrderNumber) return order;
      const now = new Date();
      const [updated] = await tx.update(orders).set({
        staffPanelOrderNumber: staffOrderNumber,
        ...(changed ? { status: accepted, updatedAt: now,
          statusHistory: [...(order.statusHistory ?? []), { status: accepted, timestamp: now.toISOString() }] } : {}),
      }).where(eq(orders.id, id)).returning();
      return updated;
    });
  }

  async withOrderDeliveryLock<T>(orderId: number, task: (locked: LockedOrderDelivery) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderDeliveryLockKey(orderId)}))`);
      return task({
        ownsPartnerOutboxLease: async (id, lease) => {
          const [row] = await tx.select({ id: partnerOutbox.id }).from(partnerOutbox).where(and(
            eq(partnerOutbox.id, id), eq(partnerOutbox.leaseToken, lease), eq(partnerOutbox.status, "processing"),
          )).for("update");
          return !!row;
        },
        getOrder: async (id) => {
          const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
          return order;
        },
        completePartnerOutboxWithEffects: (id, lease, result) =>
          this.completePartnerOutboxEffects(tx, id, lease, result),
      });
    });
  }

  async cancelOrderWithDelivery(id: number, userId: string): Promise<{ order: Order; changed: boolean }> {
    return db.transaction(async (tx) => {
      // The same transaction-scoped lock guards delivery through its HTTP
      // result and confirmation commit. All work uses this one DB connection.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderDeliveryLockKey(id)}))`);
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
      if (!order) throw new OrderCancellationError(404, "Order not found");
      if (order.userId !== userId) throw new OrderCancellationError(403, "Not authorized");
      if (order.orderType === "otc" && order.staffCheckoutStatus) {
        throw new OrderCancellationError(409, "Staff checkout cancellation is not connected. Contact the pharmacy; no cancellation, refund or stock release has been confirmed.");
      }
      if (order.status === "cancelled") return { order, changed: false };
      if (!["pending", "received", "preparing"].includes(order.status ?? "")) {
        throw new OrderCancellationError(400, "This order can no longer be cancelled. Please call the pharmacy at (718) 328-2833 for assistance.");
      }
      const pharmacyOrder = ["rx_refill", "blister_pack", "refill", "rx", "prescription", "blister"].includes(order.orderType);
      const now = new Date();
      const [cancelled] = await tx.update(orders).set({
        status: "cancelled", updatedAt: now,
        statusHistory: [...(order.statusHistory ?? []), { status: "cancelled", timestamp: now.toISOString() }],
        pharmFlowCancellationStatus: pharmacyOrder ? "pending" : null,
        pharmFlowCancellationConfirmedAt: null,
      }).where(eq(orders.id, id)).returning();
      if (pharmacyOrder) {
        await tx.insert(partnerOutbox).values({
          partner: "pharmflow", operation: "pharmflow_cancel_order",
          idempotencyKey: `order:${id}:pharmflow:cancel`,
          payload: { concordiaCareOrderId: id, patientId: userId, status: "cancelled" },
        });
      }
      await tx.insert(notifications).values({
        userId, type: "order_update", title: "Cancellation Saved",
        message: pharmacyOrder
          ? "Your cancellation is saved in the app. Pharmacy confirmation is pending."
          : "Your order is cancelled in the app. Contact the pharmacy to confirm they have stopped work.",
        relatedOrderId: id,
      });
      return { order: cancelled, changed: true };
    });
  }

  async deleteCompletedOrders(userId: string): Promise<number> {
    const terminalOrders = await db.select({ id: orders.id })
      .from(orders)
      .where(and(
        eq(orders.userId, userId),
        inArray(orders.status, ["cancelled", "picked_up", "delivered"]),
        // Keep unresolved cancellations and their order identity available to
        // the retry worker even when a patient clears their history.
        or(isNull(orders.pharmFlowCancellationStatus), eq(orders.pharmFlowCancellationStatus, "confirmed"))
      ));
    if (terminalOrders.length === 0) return 0;
    const ids = terminalOrders.map(o => o.id);
    return await db.transaction(async (tx) => {
      await tx.delete(orderItems).where(inArray(orderItems.orderId, ids));
      await tx.delete(orders).where(inArray(orders.id, ids));
      return ids.length;
    });
  }

  async getOrderItems(orderId: number): Promise<OrderItem[]> {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [result] = await db.insert(orderItems).values(item).returning();
    return result;
  }

  async createOrderWithItems(
    orderData: InsertOrder,
    itemData: Array<Omit<InsertOrderItem, "orderId">>,
    refillPayload?: Record<string, unknown>,
    staffDelivery = false,
  ): Promise<{ order: Order; items: OrderItem[] }> {
    return db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({
        ...orderData,
        // Server-owned; callers cannot forge checkout confirmation.
        staffCheckoutStatus: staffDelivery && orderData.orderType === "otc" ? "pending" : null,
        staffCheckoutError: null,
      }).returning();
      const createdItems = itemData.length > 0
        ? await tx.insert(orderItems)
            .values(itemData.map((item) => ({ ...item, orderId: order.id })))
            .returning()
        : [];
      if (refillPayload) {
        await tx.insert(partnerOutbox).values({
          partner: "pharmflow",
          operation: "pharmflow_rx_order",
          idempotencyKey: `order:${order.id}:pharmflow`,
          payload: { ...refillPayload, concordiaCareOrderId: order.id },
        });
      }
      if (staffDelivery && order.orderType === "otc") {
        const productIds = createdItems.map((item) => item.otcProductId).filter((id): id is number => id != null);
        const products = productIds.length
          ? await tx.select().from(otcProducts).where(inArray(otcProducts.id, productIds))
          : [];
        const [user] = await tx.select().from(users).where(eq(users.id, order.userId));
        const payload = buildStaffCheckoutPayload(order, createdItems, products, user);
        await tx.insert(partnerOutbox).values({
          partner: "staff", operation: "staff_checkout",
          idempotencyKey: `order:${order.id}:staff`, payload,
        });
      }
      return { order, items: createdItems };
    });
  }

  async getRefillSubmissionStatus(orderId: number): Promise<string | null> {
    const [row] = await db.select({ status: partnerOutbox.status }).from(partnerOutbox).where(and(
      eq(partnerOutbox.partner, "pharmflow"),
      eq(partnerOutbox.operation, "pharmflow_rx_order"),
      eq(partnerOutbox.idempotencyKey, `order:${orderId}:pharmflow`),
    ));
    return row?.status ?? null;
  }

  async getBlisterPacks(userId: string): Promise<BlisterPack[]> {
    return db.select().from(blisterPacks).where(eq(blisterPacks.userId, userId)).orderBy(desc(blisterPacks.createdAt));
  }

  async getBlisterPack(id: number): Promise<BlisterPack | undefined> {
    const [pack] = await db.select().from(blisterPacks).where(eq(blisterPacks.id, id));
    return pack;
  }

  async createBlisterPack(pack: InsertBlisterPack): Promise<BlisterPack> {
    const [result] = await db.insert(blisterPacks).values(pack).returning();
    return result;
  }

  async updateBlisterPack(id: number, pack: Partial<InsertBlisterPack>): Promise<BlisterPack> {
    const [result] = await db.update(blisterPacks).set(pack).where(eq(blisterPacks.id, id)).returning();
    return result;
  }

  async deleteBlisterPack(id: number): Promise<void> {
    await db.delete(blisterPacks).where(eq(blisterPacks.id, id));
  }

  async getDoseSlots(blisterPackId: number): Promise<BlisterDoseSlot[]> {
    return db.select().from(blisterDoseSlots)
      .where(eq(blisterDoseSlots.blisterPackId, blisterPackId))
      .orderBy(blisterDoseSlots.plannedDate, blisterDoseSlots.slotIndex);
  }

  async createDoseSlotsForPack(slots: InsertBlisterDoseSlot[]): Promise<BlisterDoseSlot[]> {
    if (slots.length === 0) return [];
    const results = await db.insert(blisterDoseSlots).values(slots).returning();
    return results;
  }

  async updateDoseSlotStatus(slotId: number, status: string, takenAt?: Date, actorId?: string): Promise<BlisterDoseSlot> {
    const updates: Partial<BlisterDoseSlot> = { status };
    if (takenAt) updates.takenAt = takenAt;
    if (status !== "taken") updates.takenAt = null;
    if (actorId) updates.actorId = actorId;
    const [result] = await db.update(blisterDoseSlots).set(updates).where(eq(blisterDoseSlots.id, slotId)).returning();
    return result;
  }

  async deletePendingDoseSlots(blisterPackId: number): Promise<number> {
    const deleted = await db.delete(blisterDoseSlots)
      .where(and(
        eq(blisterDoseSlots.blisterPackId, blisterPackId),
        eq(blisterDoseSlots.status, "pending")
      ))
      .returning();
    return deleted.length;
  }

  async processMissedDoses(): Promise<number> {
    const graceMs = 2 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - graceMs);
    const pending = await db.select().from(blisterDoseSlots).where(
      and(
        eq(blisterDoseSlots.status, "pending"),
        lt(blisterDoseSlots.plannedDate, cutoff)
      )
    );
    let count = 0;
    for (const slot of pending) {
      await db.update(blisterDoseSlots).set({ status: "missed" }).where(eq(blisterDoseSlots.id, slot.id));
      count++;
    }
    return count;
  }

  async getReminders(userId: string): Promise<Reminder[]> {
    return db.select().from(reminders).where(eq(reminders.userId, userId)).orderBy(reminders.scheduledTime);
  }

  async createReminder(reminder: InsertReminder): Promise<Reminder> {
    const [result] = await db.insert(reminders).values(reminder).returning();
    return result;
  }

  async updateReminder(id: number, reminder: Partial<InsertReminder>): Promise<Reminder> {
    const [result] = await db.update(reminders).set(reminder).where(eq(reminders.id, id)).returning();
    return result;
  }

  async deleteReminder(id: number): Promise<void> {
    await db.delete(reminders).where(eq(reminders.id, id));
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [result] = await db.insert(notifications).values(notification).returning();
    return result;
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: number, userId: string): Promise<void> {
    await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async clearAllNotifications(userId: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, userId));
  }

  async deleteOldNotifications(hoursOld: number, type?: string, excludeType?: string): Promise<number> {
    const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    let condition = lt(notifications.createdAt, cutoff);
    if (type) {
      condition = and(condition, eq(notifications.type, type))!;
    } else if (excludeType) {
      condition = and(condition, ne(notifications.type, excludeType))!;
    }
    const result = await db.delete(notifications).where(condition).returning({ id: notifications.id });
    return result.length;
  }

  async getPatientDoctors(userId: string): Promise<PatientDoctor[]> {
    return db.select().from(patientDoctors).where(eq(patientDoctors.userId, userId)).orderBy(desc(patientDoctors.createdAt));
  }

  async getPatientDoctor(id: number, userId: string): Promise<PatientDoctor | undefined> {
    const [result] = await db.select().from(patientDoctors).where(and(eq(patientDoctors.id, id), eq(patientDoctors.userId, userId)));
    return result;
  }

  async createPatientDoctor(data: InsertPatientDoctor): Promise<PatientDoctor> {
    const [result] = await db.insert(patientDoctors).values(data).returning();
    return result;
  }

  async updatePatientDoctor(id: number, userId: string, data: Partial<InsertPatientDoctor>): Promise<PatientDoctor | undefined> {
    const [result] = await db.update(patientDoctors).set(data).where(and(eq(patientDoctors.id, id), eq(patientDoctors.userId, userId))).returning();
    return result;
  }

  async deletePatientDoctor(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(patientDoctors).where(and(eq(patientDoctors.id, id), eq(patientDoctors.userId, userId))).returning({ id: patientDoctors.id });
    return result.length > 0;
  }

  async bulkImportDoctors(userId: string, doctors: Array<{ name: string; specialty: string; phone: string; address: string; npi: string }>): Promise<PatientDoctor[]> {
    if (doctors.length === 0) return [];
    const values = doctors.map((d) => ({
      userId,
      name: d.name,
      specialty: d.specialty,
      phone: d.phone,
      address: d.address,
      npi: d.npi,
      isManualEntry: false,
    }));
    return db.insert(patientDoctors).values(values).returning();
  }

  async getCaregiverLinks(userId: string): Promise<CaregiverLink[]> {
    return db.select().from(caregiverLinks).where(eq(caregiverLinks.caregiverId, userId));
  }

  async getCaregiverLinksForPatient(patientId: string): Promise<CaregiverLink[]> {
    return db.select().from(caregiverLinks).where(eq(caregiverLinks.patientId, patientId));
  }

  async createCaregiverLink(link: InsertCaregiverLink): Promise<CaregiverLink> {
    const [result] = await db.insert(caregiverLinks).values(link).returning();
    return result;
  }

  async updateCaregiverLinkStatus(id: number, status: string): Promise<CaregiverLink | undefined> {
    const [result] = await db.update(caregiverLinks).set({ status, isApproved: status === "approved" }).where(eq(caregiverLinks.id, id)).returning();
    return result;
  }

  async deleteCaregiverLink(id: number): Promise<void> {
    await db.delete(caregiverLinks).where(eq(caregiverLinks.id, id));
  }

  async searchUsersByNameAndDob(name: string, dob: string): Promise<User[]> {
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    if (!firstName || !dob) return [];
    return db.select().from(users).where(
      and(
        ilike(users.firstName, `${firstName}`),
        lastName ? ilike(users.lastName, `${lastName}`) : undefined,
        eq(users.dateOfBirth, dob),
      )
    );
  }

  async getUserDocuments(userId: string): Promise<UserDocument[]> {
    return db.select().from(userDocuments).where(eq(userDocuments.userId, userId)).orderBy(desc(userDocuments.createdAt));
  }

  async createUserDocument(doc: InsertUserDocument): Promise<UserDocument> {
    const [result] = await db.insert(userDocuments).values(doc).returning();
    return result;
  }

  async deleteUserDocument(id: number): Promise<void> {
    await db.delete(userDocuments).where(eq(userDocuments.id, id));
  }

  async getPharmacyMessages(userId: string): Promise<PharmacyMessage[]> {
    return db.select().from(pharmacyMessages).where(eq(pharmacyMessages.userId, userId)).orderBy(desc(pharmacyMessages.createdAt));
  }

  async createPharmacyMessage(msg: InsertPharmacyMessage): Promise<PharmacyMessage> {
    const [result] = await db.insert(pharmacyMessages).values(msg).returning();
    return result;
  }

  async createOutgoingPharmacyMessage(msg: InsertPharmacyMessage, payload: Record<string, unknown>): Promise<PharmacyMessage> {
    return db.transaction(async (tx) => {
      const [message] = await tx.insert(pharmacyMessages).values({
        ...msg, direction: "outbound", deliveryStatus: "sent",
      }).returning();
      await tx.insert(partnerOutbox).values({
        partner: "pharmflow", operation: "pharmflow_message",
        idempotencyKey: `message:${message.id}:pharmflow`,
        payload: { ...payload, concordiaCareMessageId: message.id },
      });
      return message;
    });
  }

  async applyPharmacyReceipt(id: number, userId: string, status: "received" | "read"): Promise<PharmacyMessage | undefined> {
    const [message] = await db.update(pharmacyMessages).set({
      deliveryStatus: sql`CASE WHEN ${pharmacyMessages.deliveryStatus} = 'read' THEN 'read' ELSE ${status} END`,
    }).where(and(
      eq(pharmacyMessages.id, id), eq(pharmacyMessages.userId, userId),
      eq(pharmacyMessages.direction, "outbound"),
    )).returning();
    return message;
  }

  async markPharmacyMessageRead(id: number): Promise<void> {
    await db.update(pharmacyMessages).set({ isRead: true }).where(eq(pharmacyMessages.id, id));
  }

  async getUnreadPharmacyMessageCount(userId: string): Promise<number> {
    const unread = await db.select().from(pharmacyMessages).where(
      and(eq(pharmacyMessages.userId, userId), eq(pharmacyMessages.direction, "inbound"), eq(pharmacyMessages.isRead, false))
    );
    return unread.length;
  }

  async deleteAllPharmacyMessages(userId: string): Promise<number> {
    const result = await db.delete(pharmacyMessages).where(eq(pharmacyMessages.userId, userId)).returning();
    return result.length;
  }

  async getMedicationByExternalRxId(externalRxId: string, userId: string): Promise<Medication | undefined> {
    const [med] = await db.select().from(medications).where(
      and(eq(medications.externalRxId, externalRxId), eq(medications.userId, userId))
    );
    return med;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.emailNormalized, normalizeEmail(email)));
    return user;
  }

  async findUserByNamePhoneDob(firstName: string, lastName: string | undefined, phone: string, dateOfBirth: string): Promise<User | undefined> {
    const normalizedPhone = phone.replace(/\D/g, "");
    const conditions = [
      ilike(users.firstName, firstName.trim()),
      eq(users.dateOfBirth, dateOfBirth.trim())
    ];
    if (lastName && lastName.trim()) {
      conditions.push(ilike(users.lastName, lastName.trim()));
    }
    const results = await db.select().from(users).where(and(...conditions));
    const match = results.find(u => {
      const uPhone = (u.phone || "").replace(/\D/g, "");
      return uPhone === normalizedPhone;
    });
    return match;
  }

  async findUserByPhone(phone: string): Promise<User | undefined> {
    const normalizedPhone = normalizePhone(phone);
    const [user] = await db.select().from(users).where(eq(users.phoneNormalized, normalizedPhone));
    return user;
  }

  async getUserByConcordiaId(concordiaId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.concordiaId, concordiaId));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getUsersUpdatedSince(since: Date): Promise<User[]> {
    return db.select().from(users).where(gte(users.updatedAt, since));
  }

  async getOrCreateLoyaltyPoints(userId: string): Promise<LoyaltyPoints> {
    const [existing] = await db.select().from(loyaltyPoints).where(eq(loyaltyPoints.userId, userId));
    if (existing) return existing;
    const [created] = await db.insert(loyaltyPoints).values({ userId }).returning();
    return created;
  }

  async updateLoyaltyStreak(userId: string, streakDays: number): Promise<void> {
    await db.update(loyaltyPoints)
      .set({ streakDays, lastStreakDate: new Date(), updatedAt: new Date() })
      .where(eq(loyaltyPoints.userId, userId));
  }

  async addPointsTransaction(tx: InsertPointsTransaction): Promise<PointsTransaction> {
    const [transaction] = await db.insert(pointsTransactions).values(tx).returning();
    if (tx.type === "earn" || tx.type === "adjust") {
      await db.update(loyaltyPoints)
        .set({ balance: sql`balance + ${tx.amount}`, updatedAt: new Date() })
        .where(eq(loyaltyPoints.userId, tx.userId));
    } else if (tx.type === "redeem" || tx.type === "expire") {
      await db.update(loyaltyPoints)
        .set({ balance: sql`GREATEST(0, balance - ${Math.abs(tx.amount)})`, updatedAt: new Date() })
        .where(eq(loyaltyPoints.userId, tx.userId));
    }
    return transaction;
  }

  async getPointsHistory(userId: string, limit = 50, offset = 0): Promise<PointsTransaction[]> {
    return db.select().from(pointsTransactions)
      .where(eq(pointsTransactions.userId, userId))
      .orderBy(desc(pointsTransactions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countTodayPointsBySource(userId: string, source: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(pointsTransactions)
      .where(
        and(
          eq(pointsTransactions.userId, userId),
          eq(pointsTransactions.source, source),
          gte(pointsTransactions.createdAt, todayStart),
          lte(pointsTransactions.createdAt, todayEnd)
        )
      );
    return result[0]?.count ?? 0;
  }

  async getRewards(): Promise<Reward[]> {
    return db.select().from(rewards).where(eq(rewards.isActive, true));
  }

  async getReward(id: number): Promise<Reward | undefined> {
    const [reward] = await db.select().from(rewards).where(eq(rewards.id, id));
    return reward;
  }

  async redeemReward(userId: string, rewardId: number): Promise<{ transaction: PointsTransaction; updatedBalance: number }> {
    const reward = await this.getReward(rewardId);
    if (!reward || !reward.isActive) throw new Error("Reward not found or inactive");
    const wallet = await this.getOrCreateLoyaltyPoints(userId);
    if (wallet.balance < reward.pointsCost) throw new Error("Insufficient points");
    const transaction = await this.addPointsTransaction({
      userId,
      amount: reward.pointsCost,
      type: "redeem",
      source: "reward_redeemed",
      description: `Redeemed: ${reward.name}`,
      referenceId: String(rewardId),
    });
    const updated = await this.getOrCreateLoyaltyPoints(userId);
    return { transaction, updatedBalance: updated.balance };
  }

  async createReward(reward: InsertReward): Promise<Reward> {
    const [result] = await db.insert(rewards).values(reward).returning();
    return result;
  }

  async getEarningRules(): Promise<EarningRule[]> {
    return db.select().from(earningRules).where(eq(earningRules.isActive, true));
  }

  async createEarningRule(rule: InsertEarningRule): Promise<EarningRule> {
    const [result] = await db.insert(earningRules).values(rule).returning();
    return result;
  }

  async getAllBlisterPacks(): Promise<BlisterPack[]> {
    return db.select().from(blisterPacks);
  }

  async upsertPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    const [result] = await db
      .insert(pushSubscriptions)
      .values(sub)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: sub.userId, p256dh: sub.p256dh, auth: sub.auth },
      })
      .returning();
    return result;
  }

  async getPushSubscriptionsForUser(userId: string): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getPushConfig(): Promise<import("@shared/schema").AllSeverityAlertConfig | null> {
    const [row] = await db.select().from(pushConfig).where(eq(pushConfig.key, "global"));
    if (!row) return null;
    return {
      urgent: {
        vibratePattern: row.urgentVibratePattern ?? row.vibratePattern,
        requireInteraction: row.urgentRequireInteraction ?? row.requireInteraction,
      },
      high: {
        vibratePattern: row.highVibratePattern ?? row.vibratePattern,
        requireInteraction: row.highRequireInteraction ?? row.requireInteraction,
      },
      info: {
        vibratePattern: row.infoVibratePattern ?? row.vibratePattern,
        requireInteraction: row.infoRequireInteraction ?? row.requireInteraction,
      },
    };
  }

  async setPushConfig(config: import("@shared/schema").AllSeverityAlertConfig): Promise<void> {
    await db
      .insert(pushConfig)
      .values({
        key: "global",
        vibratePattern: config.urgent.vibratePattern,
        requireInteraction: config.urgent.requireInteraction,
        urgentVibratePattern: config.urgent.vibratePattern,
        urgentRequireInteraction: config.urgent.requireInteraction,
        highVibratePattern: config.high.vibratePattern,
        highRequireInteraction: config.high.requireInteraction,
        infoVibratePattern: config.info.vibratePattern,
        infoRequireInteraction: config.info.requireInteraction,
      })
      .onConflictDoUpdate({
        target: pushConfig.key,
        set: {
          vibratePattern: config.urgent.vibratePattern,
          requireInteraction: config.urgent.requireInteraction,
          urgentVibratePattern: config.urgent.vibratePattern,
          urgentRequireInteraction: config.urgent.requireInteraction,
          highVibratePattern: config.high.vibratePattern,
          highRequireInteraction: config.high.requireInteraction,
          infoVibratePattern: config.info.vibratePattern,
          infoRequireInteraction: config.info.requireInteraction,
          updatedAt: new Date(),
        },
      });
  }

  async getCartItems(userId: string): Promise<CartItemWithProduct[]> {
    const rows = await db
      .select({
        id: cartItems.id,
        otcProductId: cartItems.otcProductId,
        quantity: cartItems.quantity,
        addedAt: cartItems.addedAt,
        productName: otcProducts.name,
        price: otcProducts.price,
        isAvailable: otcProducts.isAvailable,
        stockCount: otcProducts.stockCount,
      })
      .from(cartItems)
      .innerJoin(otcProducts, eq(cartItems.otcProductId, otcProducts.id))
      .where(eq(cartItems.userId, userId))
      .orderBy(cartItems.addedAt);
    return rows;
  }

  async upsertCartItem(userId: string, otcProductId: number, quantity: number): Promise<CartItemWithProduct> {
    const [row] = await db
      .insert(cartItems)
      .values({ userId, otcProductId, quantity })
      .onConflictDoUpdate({
        target: [cartItems.userId, cartItems.otcProductId],
        set: { quantity: sql`LEAST(${cartItems.quantity} + EXCLUDED.quantity, 10)` },
      })
      .returning();
    const product = await db.select().from(otcProducts).where(eq(otcProducts.id, row.otcProductId)).then(r => r[0]);
    return {
      id: row.id,
      otcProductId: row.otcProductId,
      quantity: row.quantity,
      addedAt: row.addedAt,
      productName: product?.name ?? "",
      price: product?.price ?? null,
      isAvailable: product?.isAvailable ?? null,
      stockCount: product?.stockCount ?? null,
    };
  }

  async updateCartItemQuantity(userId: string, id: number, quantity: number): Promise<CartItemWithProduct | null> {
    const [updated] = await db
      .update(cartItems)
      .set({ quantity })
      .where(and(eq(cartItems.id, id), eq(cartItems.userId, userId)))
      .returning();
    if (!updated) return null;
    const product = await db.select().from(otcProducts).where(eq(otcProducts.id, updated.otcProductId)).then(r => r[0]);
    return {
      id: updated.id,
      otcProductId: updated.otcProductId,
      quantity: updated.quantity,
      addedAt: updated.addedAt,
      productName: product?.name ?? "",
      price: product?.price ?? null,
      isAvailable: product?.isAvailable ?? null,
      stockCount: product?.stockCount ?? null,
    };
  }

  async removeCartItem(userId: string, id: number): Promise<void> {
    await db.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.userId, userId)));
  }

  async clearCart(userId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  }

  async getNotificationPreferences(userId: string) {
    const [user] = await db
      .select({ pharmacyAlertsEnabled: users.pharmacyAlertsEnabled, emailNotificationsEnabled: users.emailNotificationsEnabled, pharmacyAlertMinSeverity: users.pharmacyAlertMinSeverity, snoozeUntilAt: users.snoozeUntilAt, inactivityThresholdHours: users.inactivityThresholdHours })
      .from(users)
      .where(eq(users.id, userId));
    return {
      pharmacyAlertsEnabled: user?.pharmacyAlertsEnabled ?? true,
      emailNotificationsEnabled: user?.emailNotificationsEnabled ?? false,
      pharmacyAlertMinSeverity: user?.pharmacyAlertMinSeverity ?? "high_and_urgent",
      snoozeUntilAt: user?.snoozeUntilAt ?? null,
      inactivityThresholdHours: user?.inactivityThresholdHours ?? 24,
    };
  }

  async updateNotificationPreferences(userId: string, prefs: { pharmacyAlertsEnabled: boolean; emailNotificationsEnabled?: boolean; pharmacyAlertMinSeverity: string; snoozeUntilAt?: Date | null; inactivityThresholdHours?: number }) {
    const snoozeValue = "snoozeUntilAt" in prefs ? (prefs.snoozeUntilAt ?? null) : undefined;
    const [updated] = await db
      .update(users)
      .set({
        pharmacyAlertsEnabled: prefs.pharmacyAlertsEnabled,
        ...(prefs.emailNotificationsEnabled !== undefined ? { emailNotificationsEnabled: prefs.emailNotificationsEnabled } : {}),
        pharmacyAlertMinSeverity: prefs.pharmacyAlertMinSeverity,
        updatedAt: new Date(),
        ...(snoozeValue !== undefined ? { snoozeUntilAt: snoozeValue } : {}),
        ...(prefs.inactivityThresholdHours !== undefined ? { inactivityThresholdHours: prefs.inactivityThresholdHours } : {}),
      })
      .where(eq(users.id, userId))
      .returning({ pharmacyAlertsEnabled: users.pharmacyAlertsEnabled, emailNotificationsEnabled: users.emailNotificationsEnabled, pharmacyAlertMinSeverity: users.pharmacyAlertMinSeverity, snoozeUntilAt: users.snoozeUntilAt, inactivityThresholdHours: users.inactivityThresholdHours });
    return {
      pharmacyAlertsEnabled: updated?.pharmacyAlertsEnabled ?? prefs.pharmacyAlertsEnabled,
      emailNotificationsEnabled: updated?.emailNotificationsEnabled ?? prefs.emailNotificationsEnabled ?? false,
      pharmacyAlertMinSeverity: updated?.pharmacyAlertMinSeverity ?? prefs.pharmacyAlertMinSeverity,
      snoozeUntilAt: updated?.snoozeUntilAt ?? null,
      inactivityThresholdHours: updated?.inactivityThresholdHours ?? prefs.inactivityThresholdHours ?? 24,
    };
  }

  async getUsersWithPharmacyAlertsEnabled(): Promise<User[]> {
    const now = new Date();
    return db.select().from(users).where(
      and(
        eq(users.pharmacyAlertsEnabled, true),
        or(isNull(users.snoozeUntilAt), lt(users.snoozeUntilAt, now))
      )
    );
  }

  async createFailedSync(orderId: number, lastError: string): Promise<void> {
    await db.insert(failedSyncs).values({ orderId, lastError, attempts: 0, syncStatus: "pending" });
  }

  async getPendingFailedSyncs(): Promise<FailedSync[]> {
    return db.select().from(failedSyncs).where(
      and(eq(failedSyncs.syncStatus, "pending"), lte(failedSyncs.attempts, 2))
    );
  }

  async resolveFailedSync(id: number): Promise<void> {
    await db.delete(failedSyncs).where(eq(failedSyncs.id, id));
  }

  async updateFailedSync(id: number, data: { attempts: number; lastError?: string; syncStatus?: string }): Promise<void> {
    await db.update(failedSyncs).set({
      attempts: data.attempts,
      ...(data.lastError !== undefined ? { lastError: data.lastError } : {}),
      ...(data.syncStatus !== undefined ? { syncStatus: data.syncStatus } : {}),
      updatedAt: new Date(),
    }).where(eq(failedSyncs.id, id));
  }

  async countPendingFailedSyncs(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(failedSyncs)
      .where(eq(failedSyncs.syncStatus, "pending"));
    return result?.count ?? 0;
  }

  async reserveWebhookReceipt(source: string, sourceEventId: string, payloadHash: string): Promise<PartnerWebhookReceipt | null> {
    const leaseToken = randomUUID();
    const [receipt] = await db.insert(partnerWebhookReceipts)
      .values({ source, sourceEventId, payloadHash, status: "processing", leaseToken })
      .onConflictDoNothing({ target: [partnerWebhookReceipts.source, partnerWebhookReceipts.sourceEventId] })
      .returning();
    if (receipt) return receipt;
    const [existing] = await db.select().from(partnerWebhookReceipts).where(and(
      eq(partnerWebhookReceipts.source, source),
      eq(partnerWebhookReceipts.sourceEventId, sourceEventId),
    ));
    if (existing && existing.payloadHash !== payloadHash) throw new WebhookPayloadConflictError();
    // A handler that crashed after reserving must be retryable. Only failed
    // receipts are reclaimed; an active/processed delivery remains a duplicate.
    const [reclaimed] = await db.update(partnerWebhookReceipts)
      .set({ status: "processing", leaseToken, receivedAt: new Date(), processedAt: null })
      .where(and(
        eq(partnerWebhookReceipts.source, source),
        eq(partnerWebhookReceipts.sourceEventId, sourceEventId),
        or(
          eq(partnerWebhookReceipts.status, "failed"),
          and(eq(partnerWebhookReceipts.status, "processing"),
            lt(partnerWebhookReceipts.receivedAt, new Date(Date.now() - 5 * 60 * 1000))),
        ),
      ))
      .returning();
    return reclaimed ?? null;
  }

  async completeWebhookReceipt(id: number, leaseToken: string): Promise<void> {
    await db.update(partnerWebhookReceipts)
      .set({ status: "processed", processedAt: new Date() })
      .where(and(eq(partnerWebhookReceipts.id, id), eq(partnerWebhookReceipts.leaseToken, leaseToken), eq(partnerWebhookReceipts.status, "processing")));
  }

  async failWebhookReceipt(id: number, leaseToken: string): Promise<void> {
    await db.update(partnerWebhookReceipts)
      .set({ status: "failed", processedAt: new Date() })
      .where(and(eq(partnerWebhookReceipts.id, id), eq(partnerWebhookReceipts.leaseToken, leaseToken), eq(partnerWebhookReceipts.status, "processing")));
  }

  async enqueuePartnerOutbox(data: { partner: string; operation: string; idempotencyKey: string; payload: Record<string, unknown> }): Promise<PartnerOutbox> {
    const [row] = await db.insert(partnerOutbox).values(data)
      .onConflictDoNothing({ target: [partnerOutbox.partner, partnerOutbox.operation, partnerOutbox.idempotencyKey] }).returning();
    if (row) return row;
    return (await db.select().from(partnerOutbox).where(and(
      eq(partnerOutbox.partner, data.partner), eq(partnerOutbox.operation, data.operation),
      eq(partnerOutbox.idempotencyKey, data.idempotencyKey),
    )))[0];
  }

  async claimDuePartnerOutbox(limit = 50, idempotencyKey?: string): Promise<PartnerOutbox[]> {
    return db.transaction(async (tx) => {
      const rows = await tx.execute(sql`SELECT id FROM partner_outbox
        WHERE ((status = 'pending' AND next_attempt_at <= NOW())
           OR (status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes'))
        ${idempotencyKey ? sql`AND idempotency_key = ${idempotencyKey}` : sql``}
        ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT ${limit}`);
      const ids = (rows.rows as { id: number }[]).map((r) => r.id);
      if (!ids.length) return [];
      return tx.update(partnerOutbox).set({ status: "processing", leaseToken: sql`gen_random_uuid()::text`, updatedAt: new Date() })
        .where(inArray(partnerOutbox.id, ids)).returning();
    });
  }

  async completePartnerOutbox(id: number, leaseToken: string): Promise<void> {
    await db.update(partnerOutbox).set({ status: "completed", payload: {}, lastError: null, leaseToken: null, updatedAt: new Date() })
      .where(and(eq(partnerOutbox.id, id), eq(partnerOutbox.leaseToken, leaseToken), eq(partnerOutbox.status, "processing")));
  }

  async completePartnerOutboxWithEffects(id: number, leaseToken: string, result: PartnerDispatchResult): Promise<boolean> {
    return db.transaction((tx) => this.completePartnerOutboxEffects(tx, id, leaseToken, result));
  }

  private async completePartnerOutboxEffects(tx: StorageTransaction, id: number, leaseToken: string, result: PartnerDispatchResult): Promise<boolean> {
      const [row] = await tx.select().from(partnerOutbox).where(and(
        eq(partnerOutbox.id, id), eq(partnerOutbox.leaseToken, leaseToken),
        eq(partnerOutbox.status, "processing"),
      )).for("update");
      if (!row) return false;
      const payload = row.payload as Record<string, unknown>;
      if (row.operation === "staff_checkout" && result.checkoutStatus) {
        const orderId = Number(payload.id);
        const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
        if (!order || !order.staffCheckoutStatus) return false;
        if (order.staffPanelOrderNumber && result.externalReference &&
            order.staffPanelOrderNumber !== result.externalReference) {
          throw new Error("Conflicting Staff checkout reference");
        }
        if (order.staffCheckoutStatus !== "confirmed") {
          await tx.update(orders).set({
            staffCheckoutStatus: result.checkoutStatus,
            staffCheckoutError: result.checkoutError ?? null,
            ...(result.externalReference ? { staffPanelOrderNumber: result.externalReference } : {}),
            ...(result.checkoutStatus === "rejected" ? { status: "rejected" } : {}),
            updatedAt: new Date(),
          }).where(eq(orders.id, orderId));
        }
        if (result.checkoutReceipt) {
          await tx.insert(staffCheckoutReceipts).values({
            orderId, staffOrderId: result.checkoutReceipt.staffOrderId,
            trackingToken: result.checkoutReceipt.trackingToken ?? null,
            trackingExpiresAt: result.checkoutReceipt.trackingExpiresAt ?? null,
          }).onConflictDoNothing({ target: staffCheckoutReceipts.orderId });
        }
      }
      if (row.operation === "pharmflow_message" && result.messageStatus) {
        const messageId = Number(payload.concordiaCareMessageId);
        // Receipt effects commit under the same leased outbox transaction.
        if (Number.isSafeInteger(messageId) && typeof payload.patientId === "string") {
          await tx.update(pharmacyMessages).set({
            deliveryStatus: sql`CASE WHEN ${pharmacyMessages.deliveryStatus} = 'read' THEN 'read' ELSE ${result.messageStatus} END`,
          }).where(and(eq(pharmacyMessages.id, messageId),
            eq(pharmacyMessages.userId, payload.patientId), eq(pharmacyMessages.direction, "outbound")));
        }
      }
      if (row.operation === "staff_order" && result.externalReference) {
        const orderId = Number(payload.id);
        if (Number.isInteger(orderId)) {
          await tx.update(orders).set({ staffPanelOrderNumber: result.externalReference, updatedAt: new Date() })
            .where(and(eq(orders.id, orderId), isNull(orders.staffPanelOrderNumber)));
        }
      } else if (row.operation === "pharmflow_rx_order") {
        const orderId = Number(payload.concordiaCareOrderId);
        if (Number.isInteger(orderId)) {
          const [changed] = await tx.update(orders).set({
            pharmFlowSubmitted: true, pharmFlowSubmittedAt: new Date(), updatedAt: new Date(),
          }).where(and(eq(orders.id, orderId), eq(orders.pharmFlowSubmitted, false))).returning();
          if (changed) {
            await tx.insert(notifications).values({
              userId: changed.userId, type: "order_update", title: "Order Submitted",
              message: "Your refill request was received by the pharmacy.", relatedOrderId: orderId,
            });
          }
        }
      } else if (row.operation === "pharmflow_cancel_order") {
        const [changed] = await tx.update(orders).set({
          pharmFlowCancellationStatus: "confirmed", pharmFlowCancellationConfirmedAt: new Date(), updatedAt: new Date(),
        }).where(and(
          eq(orders.id, Number(payload.concordiaCareOrderId)), eq(orders.userId, String(payload.patientId)),
          eq(orders.status, "cancelled"),
          inArray(orders.pharmFlowCancellationStatus, ["pending", "failed"]),
        )).returning();
        if (changed) await tx.insert(notifications).values({
          userId: changed.userId, type: "order_update", title: "Pharmacy Confirmed Cancellation",
          message: "The pharmacy has acknowledged your order cancellation.", relatedOrderId: changed.id,
        });
      } else if (row.operation === "pharmflow_patient" && typeof payload.concordiaCareUserId === "string") {
        await tx.update(users).set({ lastPharmacySyncAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, payload.concordiaCareUserId));
      }
      await tx.update(partnerOutbox).set({
        status: "completed", payload: {}, lastError: null, leaseToken: null, updatedAt: new Date(),
      }).where(and(eq(partnerOutbox.id, id), eq(partnerOutbox.leaseToken, leaseToken), eq(partnerOutbox.status, "processing")));
      return true;
  }

  async retryPartnerOutbox(id: number, leaseToken: string, error: string, maxAttempts = 8): Promise<PartnerOutbox | undefined> {
    return db.transaction(async (tx) => {
    const [current] = await tx.select().from(partnerOutbox).where(and(eq(partnerOutbox.id, id), eq(partnerOutbox.leaseToken, leaseToken), eq(partnerOutbox.status, "processing"))).for("update");
    if (!current) return undefined;
    const attempts = current.attempts + 1;
    const terminal = attempts >= maxAttempts;
    const delay = Math.min(24 * 60 * 60 * 1000, 1000 * (2 ** Math.min(attempts - 1, 16)));
    const [row] = await tx.update(partnerOutbox).set({
      attempts, lastError: `partner operation failed (attempt ${attempts})`, status: terminal ? "failed" : "pending",
      nextAttemptAt: new Date(Date.now() + delay), leaseToken: null, updatedAt: new Date(),
    }).where(and(eq(partnerOutbox.id, id), eq(partnerOutbox.leaseToken, leaseToken), eq(partnerOutbox.status, "processing"))).returning();
    if (row && terminal && row.operation === "pharmflow_cancel_order") {
      const payload = row.payload as Record<string, unknown>;
      await tx.update(orders).set({ pharmFlowCancellationStatus: "failed", updatedAt: new Date() })
        .where(and(eq(orders.id, Number(payload.concordiaCareOrderId)), eq(orders.pharmFlowCancellationStatus, "pending")));
    }
    return row;
    });
  }

  async failPartnerOutbox(id: number, leaseToken: string, _error: string): Promise<void> {
    await db.update(partnerOutbox).set({ status: "failed", lastError: "unsupported partner operation", leaseToken: null, updatedAt: new Date() })
      .where(and(eq(partnerOutbox.id, id), eq(partnerOutbox.leaseToken, leaseToken), eq(partnerOutbox.status, "processing")));
  }

  async cleanupPartnerOutbox(): Promise<void> {
    await db.delete(partnerOutbox).where(or(
      and(eq(partnerOutbox.status, "completed"), lt(partnerOutbox.updatedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
      and(notInArray(partnerOutbox.operation, ["staff_order", "staff_checkout"]), eq(partnerOutbox.status, "failed"), lt(partnerOutbox.updatedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))),
    ));
  }

  async getAdminSyncOperations(filters: { partner?: string; status?: string; limit: number; offset: number }) {
    const conditions = [];
    if (filters.partner) conditions.push(eq(partnerOutbox.partner, filters.partner));
    if (filters.status) conditions.push(eq(partnerOutbox.status, filters.status));
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await db.select({
      id: partnerOutbox.id, partner: partnerOutbox.partner, operation: partnerOutbox.operation,
      status: partnerOutbox.status, attempts: partnerOutbox.attempts, nextAttemptAt: partnerOutbox.nextAttemptAt,
      createdAt: partnerOutbox.createdAt, updatedAt: partnerOutbox.updatedAt, lastError: partnerOutbox.lastError,
    }).from(partnerOutbox).where(where).orderBy(desc(partnerOutbox.updatedAt))
      .limit(filters.limit).offset(filters.offset);
    const countRows = await db.select({ count: sql<number>`count(*)` }).from(partnerOutbox).where(where);
    const summaryRows = await db.select({ status: partnerOutbox.status, count: sql<number>`count(*)` })
      .from(partnerOutbox).where(conditions.length ? and(...conditions) : undefined).groupBy(partnerOutbox.status);
    const safeCategory = (error: string | null): string | null => {
      if (!error) return null;
      const value = error.toLowerCase();
      if (value.includes("timeout") || value.includes("network") || value.includes("fetch")) return "transport";
      if (value.includes("auth") || value.includes("credential") || value.includes("api key")) return "partner_auth";
      if (value.includes("unsupported")) return "configuration";
      return "partner_error";
    };
    return {
      operations: rows.map(({ lastError, ...row }) => ({
        ...row, errorCategory: safeCategory(lastError),
        operatorMessage: lastError ? "The partner sync could not be completed. Retry is available." : null,
      })),
      total: Number(countRows[0]?.count ?? 0),
      summary: Object.fromEntries(summaryRows.map((row) => [row.status, Number(row.count)])),
    };
  }

  async retryFailedPartnerOutbox(id: number, actorUserId: string): Promise<{ changed: boolean; status: string }> {
    return db.transaction(async (tx) => {
      const [row] = await tx.update(partnerOutbox).set({
        status: "pending", lastError: null, leaseToken: null, nextAttemptAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(partnerOutbox.id, id), eq(partnerOutbox.status, "failed")))
        .returning({ status: partnerOutbox.status, operation: partnerOutbox.operation, payload: partnerOutbox.payload });
      if (row?.operation === "pharmflow_cancel_order") {
        const payload = row.payload as Record<string, unknown>;
        await tx.update(orders).set({ pharmFlowCancellationStatus: "pending", updatedAt: new Date() })
          .where(and(eq(orders.id, Number(payload.concordiaCareOrderId)), eq(orders.pharmFlowCancellationStatus, "failed")));
      }
      const status = row?.status ?? (await tx.select({ status: partnerOutbox.status }).from(partnerOutbox).where(eq(partnerOutbox.id, id)))[0]?.status;
      await tx.insert(syncOperationAudit).values({
        actorUserId, operationId: id, action: "retry",
        result: row ? "requeued" : (status === undefined ? "not_found" : "already_requeued"),
      });
      return { changed: Boolean(row), status: status ?? "not_found" };
    });
  }

  async getSyncOperationAudit(limit: number, offset: number): Promise<SyncOperationAudit[]> {
    return db.select().from(syncOperationAudit).orderBy(desc(syncOperationAudit.createdAt)).limit(limit).offset(offset);
  }

  async removeOutOfStockCartItems(): Promise<number> {
    const unavailable = await db
      .select({ id: otcProducts.id })
      .from(otcProducts)
      .where(eq(otcProducts.isAvailable, false));
    if (unavailable.length === 0) return 0;
    const ids = unavailable.map(p => p.id);
    const deleted = await db
      .delete(cartItems)
      .where(inArray(cartItems.otcProductId, ids))
      .returning({ id: cartItems.id });
    return deleted.length;
  }

  async getPatientConditions(userId: string): Promise<PatientCondition[]> {
    return db
      .select()
      .from(patientConditions)
      .where(eq(patientConditions.userId, userId))
      .orderBy(desc(patientConditions.createdAt));
  }

  async getPatientCondition(id: number): Promise<PatientCondition | undefined> {
    const [row] = await db.select().from(patientConditions).where(eq(patientConditions.id, id));
    return row;
  }

  async createPatientCondition(data: InsertPatientCondition): Promise<PatientCondition> {
    const [row] = await db.insert(patientConditions).values(data).returning();
    return row;
  }

  async updatePatientCondition(id: number, data: Partial<InsertPatientCondition>): Promise<PatientCondition | undefined> {
    const [row] = await db
      .update(patientConditions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(patientConditions.id, id))
      .returning();
    return row;
  }

  async softDeletePatientCondition(id: number): Promise<void> {
    await db
      .update(patientConditions)
      .set({ status: "resolved", updatedAt: new Date() })
      .where(eq(patientConditions.id, id));
  }

  async getHealthJournalEntries(
    userId: string,
    conditionId?: number | null,
    page = 1,
    limit = 20
  ): Promise<{ entries: HealthJournalEntry[]; total: number }> {
    const offset = (page - 1) * limit;
    const conditions = conditionId != null
      ? and(eq(healthJournalEntries.userId, userId), eq(healthJournalEntries.conditionId, conditionId))
      : eq(healthJournalEntries.userId, userId);

    const [countResult] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(healthJournalEntries)
      .where(conditions);

    const entries = await db
      .select()
      .from(healthJournalEntries)
      .where(conditions)
      .orderBy(desc(healthJournalEntries.entryDate))
      .limit(limit)
      .offset(offset);

    return { entries, total: countResult?.count ?? 0 };
  }

  async createHealthJournalEntry(data: InsertHealthJournalEntry): Promise<HealthJournalEntry> {
    const [row] = await db.insert(healthJournalEntries).values(data).returning();
    return row;
  }

  async getMedicationConditionLinks(userId: string, medicationId?: string): Promise<MedicationConditionLink[]> {
    const cond = medicationId
      ? and(eq(medicationConditionLinks.userId, userId), eq(medicationConditionLinks.medicationId, medicationId))
      : eq(medicationConditionLinks.userId, userId);
    return db.select().from(medicationConditionLinks).where(cond);
  }

  async getMedicationConditionLinksByConditionAndUser(conditionId: number, userId: string): Promise<MedicationConditionLink[]> {
    return db
      .select()
      .from(medicationConditionLinks)
      .where(and(eq(medicationConditionLinks.conditionId, conditionId), eq(medicationConditionLinks.userId, userId)));
  }

  async getMedicationConditionLinkById(id: number): Promise<MedicationConditionLink | undefined> {
    const [row] = await db.select().from(medicationConditionLinks).where(eq(medicationConditionLinks.id, id));
    return row;
  }

  async createMedicationConditionLink(data: InsertMedicationConditionLink): Promise<MedicationConditionLink> {
    const [row] = await db.insert(medicationConditionLinks).values(data).returning();
    return row;
  }

  async deleteMedicationConditionLink(id: number): Promise<void> {
    await db.delete(medicationConditionLinks).where(eq(medicationConditionLinks.id, id));
  }

  async saveRecommendedProduct(userId: string, otcProductId: number, source: string, reason?: string): Promise<void> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existing = await db
      .select({ id: recommendedProducts.id })
      .from(recommendedProducts)
      .where(
        and(
          eq(recommendedProducts.userId, userId),
          eq(recommendedProducts.otcProductId, otcProductId),
          eq(recommendedProducts.source, source),
          gte(recommendedProducts.createdAt, sevenDaysAgo)
        )
      )
      .limit(1);
    if (existing.length > 0) return;
    await db.insert(recommendedProducts).values({ userId, otcProductId, source, reason: reason ?? null });
  }

  async getRecommendedProducts(userId: string): Promise<(RecommendedProduct & { product: OtcProduct })[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ rec: recommendedProducts, product: otcProducts })
      .from(recommendedProducts)
      .innerJoin(otcProducts, eq(recommendedProducts.otcProductId, otcProducts.id))
      .where(
        and(
          eq(recommendedProducts.userId, userId),
          isNull(recommendedProducts.dismissedAt),
          eq(otcProducts.syncSource, "staff_panel"),
          eq(otcProducts.isAvailable, true),
          gt(otcProducts.stockCount, 0),
          gte(recommendedProducts.createdAt, thirtyDaysAgo)
        )
      )
      .orderBy(desc(recommendedProducts.createdAt));
    return rows.map((r) => ({ ...r.rec, product: r.product }));
  }

  async dismissRecommendedProduct(id: number, userId: string): Promise<void> {
    await db
      .update(recommendedProducts)
      .set({ dismissedAt: new Date() })
      .where(and(eq(recommendedProducts.id, id), eq(recommendedProducts.userId, userId)));
  }

  async getNutritionChatHistory(userId: string): Promise<NutritionChatMessage[]> {
    return db
      .select()
      .from(nutritionChatMessages)
      .where(eq(nutritionChatMessages.userId, userId))
      .orderBy(nutritionChatMessages.createdAt);
  }

  async saveNutritionChatMessage(msg: InsertNutritionChatMessage): Promise<NutritionChatMessage> {
    const [result] = await db.insert(nutritionChatMessages).values(msg).returning();
    return result;
  }

  async clearNutritionChatHistory(userId: string): Promise<void> {
    await db.delete(nutritionChatMessages).where(eq(nutritionChatMessages.userId, userId));
  }

  async pruneNutritionChatHistory(userId: string, maxMessages: number): Promise<void> {
    const rows = await db
      .select({ id: nutritionChatMessages.id })
      .from(nutritionChatMessages)
      .where(eq(nutritionChatMessages.userId, userId))
      .orderBy(desc(nutritionChatMessages.createdAt));
    const idsToDelete = rows.slice(maxMessages).map((r) => r.id);
    if (idsToDelete.length > 0) {
      await db.delete(nutritionChatMessages).where(inArray(nutritionChatMessages.id, idsToDelete));
    }
  }

  async getMedicationsWithLinkedConditions(
    userId: string
  ): Promise<(Medication & { linkedCondition: { id: number; conditionName: string; linkId: number } | null })[]> {
    const meds = await db
      .select()
      .from(medications)
      .where(eq(medications.userId, userId))
      .orderBy(desc(medications.createdAt));

    const links = await db
      .select({
        linkId: medicationConditionLinks.id,
        medicationId: medicationConditionLinks.medicationId,
        conditionId: patientConditions.id,
        conditionName: patientConditions.conditionName,
      })
      .from(medicationConditionLinks)
      .innerJoin(patientConditions, eq(medicationConditionLinks.conditionId, patientConditions.id))
      .where(eq(medicationConditionLinks.userId, userId));

    const linkMap = new Map<string, { id: number; conditionName: string; linkId: number }>();
    for (const l of links) {
      linkMap.set(l.medicationId.toLowerCase(), { id: l.conditionId, conditionName: l.conditionName, linkId: l.linkId });
    }

    return meds.map((med) => {
      const key = med.name.toLowerCase();
      const rxKey = med.rxNumber?.toLowerCase() ?? "";
      const linked = linkMap.get(key) ?? (rxKey ? linkMap.get(rxKey) : null) ?? null;
      return { ...med, linkedCondition: linked };
    });
  }
}

export const storage = new DatabaseStorage();
