   import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp, jsonb, index, unique, uniqueIndex, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },   
  (table) => [index("IDX_session_expire").on(table.expire)]
);
  
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  concordiaId: varchar("concordia_id").unique(),
  pharmacyPatientId: varchar("pharmacy_patient_id"),
  email: varchar("email").unique(),
  clerkUserId: varchar("clerk_user_id"),
  emailNormalized: varchar("email_normalized"),
  phoneNormalized: varchar("phone_normalized"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phone: varchar("phone"),
  dateOfBirth: varchar("date_of_birth"),
  deliveryAddress: text("delivery_address"),
  preferredDeliveryMethod: text("preferred_delivery_method").default("pickup"),
  language: text("language").default("en"),
  userRole: text("user_role").default("patient"),
  onboardingComplete: boolean("onboarding_complete").default(false),
  identityTrustStatus: text("identity_trust_status").default("unverified"),
  identityReviewRequired: boolean("identity_review_required").default(false),
  lastPharmacySyncAt: timestamp("last_pharmacy_sync_at"),
  pharmacyAlertsEnabled: boolean("pharmacy_alerts_enabled").default(true),
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(false),
  pharmacyAlertMinSeverity: text("pharmacy_alert_min_severity").default("high_and_urgent"),
  snoozeUntilAt: timestamp("snooze_until_at"),
  inactivityThresholdHours: integer("inactivity_threshold_hours").default(24),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("UQ_users_clerk_user_id").on(table.clerkUserId).where(sql`${table.clerkUserId} IS NOT NULL`),
  uniqueIndex("UQ_users_pharmacy_patient_id").on(table.pharmacyPatientId).where(sql`${table.pharmacyPatientId} IS NOT NULL`),
  uniqueIndex("UQ_users_email_normalized").on(table.emailNormalized).where(sql`${table.emailNormalized} IS NOT NULL`),
  uniqueIndex("UQ_users_phone_normalized").on(table.phoneNormalized).where(sql`${table.phoneNormalized} IS NOT NULL`),
]);

export const userDocuments = pgTable("user_documents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  label: text("label").notNull(),
  imageData: text("image_data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserDocumentSchema = createInsertSchema(userDocuments).omit({ id: true, createdAt: true });
export type InsertUserDocument = z.infer<typeof insertUserDocumentSchema>;
export type UserDocument = typeof userDocuments.$inferSelect;

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const pharmacyLinkRequests = pgTable("pharmacy_link_requests", {
  id: serial("id").primaryKey(),
  clerkSubject: varchar("clerk_subject").notNull(),
  concordiaId: varchar("concordia_id").notNull(),
  pharmacyPatientId: varchar("pharmacy_patient_id").notNull(),
  status: varchar("status").notNull().default("pending"),
  rejectionReason: varchar("rejection_reason", { length: 280 }),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewerSubject: varchar("reviewer_subject"),
}, (table) => [
  index("IDX_pharmacy_link_requests_subject").on(table.clerkSubject, table.createdAt),
  index("IDX_pharmacy_link_requests_patient").on(table.pharmacyPatientId, table.createdAt),
  uniqueIndex("UQ_pharmacy_link_requests_pending_subject").on(table.clerkSubject)
    .where(sql`${table.status} = 'pending'`),
  uniqueIndex("UQ_pharmacy_link_requests_pending_patient").on(table.pharmacyPatientId)
    .where(sql`${table.status} = 'pending'`),
  check("CK_pharmacy_link_requests_status", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
  check("CK_pharmacy_link_requests_rejection_reason", sql`${table.rejectionReason} IS NULL OR char_length(${table.rejectionReason}) BETWEEN 1 AND 280`),
  check("CK_pharmacy_link_requests_reviewed", sql`(${table.status} = 'pending' AND ${table.reviewedAt} IS NULL AND ${table.reviewerSubject} IS NULL) OR (${table.status} IN ('approved', 'rejected') AND ${table.reviewedAt} IS NOT NULL AND ${table.reviewerSubject} IS NOT NULL)`),
]);
export type PharmacyLinkRequest = typeof pharmacyLinkRequests.$inferSelect;

export const pharmacyLinkAudit = pgTable("pharmacy_link_audit", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => pharmacyLinkRequests.id),
  action: varchar("action").notNull(),
  actorSubject: varchar("actor_subject").notNull(),
  reasonCode: varchar("reason_code", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_pharmacy_link_audit_request").on(table.requestId, table.createdAt),
  check("CK_pharmacy_link_audit_action", sql`${table.action} IN ('requested', 'approved', 'rejected', 'approval_failed')`),
]);
export type PharmacyLinkAudit = typeof pharmacyLinkAudit.$inferSelect;

export const medications = pgTable("medications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  dosage: text("dosage").notNull(),
  frequency: text("frequency").notNull(),
  prescribedBy: text("prescribed_by"),
  rxNumber: text("rx_number"),
  refillsRemaining: integer("refills_remaining").default(0),
  lastFilledDate: timestamp("last_filled_date"),
  nextRefillDate: timestamp("next_refill_date"),
  expiryDate: timestamp("expiry_date"),
  instructions: text("instructions"),
  isActive: boolean("is_active").default(true),
  category: text("category").default("prescription"),
  fridgeItem: boolean("fridge_item").default(false),
  controlledMedication: boolean("controlled_medication").default(false),
  familyMember: boolean("family_member").default(false),
  externalRxId: text("external_rx_id"),
  syncSource: text("sync_source"),
  lastSyncedAt: timestamp("last_synced_at"),
  lastRefillConfirmationKey: varchar("last_refill_confirmation_key"),
  drugName: text("drug_name"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_medications_user").on(table.userId),
  uniqueIndex("UQ_medications_external_rx_id").on(table.externalRxId).where(sql`${table.externalRxId} IS NOT NULL`),
]);

export const pharmacySyncConflicts = pgTable("pharmacy_sync_conflicts", {
  id: serial("id").primaryKey(),
  fingerprint: varchar("fingerprint").notNull().unique(),
  conflictType: varchar("conflict_type").notNull(),
  pharmacyPatientId: varchar("pharmacy_patient_id").notNull(),
  concordiaId: varchar("concordia_id").notNull(),
  prescriptionId: varchar("prescription_id"),
  status: varchar("status").notNull().default("open"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

export const insertMedicationSchema = createInsertSchema(medications).omit({ id: true, createdAt: true });
export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type Medication = typeof medications.$inferSelect;

export const otcProducts = pgTable("otc_products", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").unique(),
  name: text("name").notNull(),
  brand: text("brand"),
  category: text("category").notNull(),
  description: text("description"),
  price: text("price"),
  dosageInfo: text("dosage_info"),
  warnings: text("warnings"),
  stockCount: integer("stock_count").default(0),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  pharmacistTip: text("pharmacist_tip"),
  whyUseIt: text("why_use_it"),
  isAvailable: boolean("is_available").default(true),
  isShopVisible: boolean("is_shop_visible").default(false),
  isFeatured: boolean("is_featured").default(false),
  fsaEligible: boolean("fsa_eligible").default(false),
  syncSource: text("sync_source"),
  staffPanelProductId: integer("staff_panel_product_id"),
  lastSyncedAt: timestamp("last_synced_at"),
});

export const insertOtcProductSchema = createInsertSchema(otcProducts).omit({ id: true });
export type InsertOtcProduct = z.infer<typeof insertOtcProductSchema>;
export type OtcProduct = typeof otcProducts.$inferSelect;

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  orderType: text("order_type").notNull(),
  orderNumber: text("order_number"),
  idempotencyKey: varchar("idempotency_key").unique(),
  status: text("status").default("pending"),
  verificationStatus: text("verification_status"),
  pickupSlot: text("pickup_slot"),
  pickupMethod: text("pickup_method").default("counter"),
  deliveryMethod: text("delivery_method").default("pickup"),
  deliveryAddress: text("delivery_address"),
  scheduledPickupTime: text("scheduled_pickup_time"),
  contactPhone: varchar("contact_phone"),
  bagReady: boolean("bag_ready").default(false),
  qrCode: text("qr_code"),
  staffPanelOrderNumber: text("staff_panel_order_number"),
  staffCheckoutStatus: text("staff_checkout_status"),
  staffCheckoutError: text("staff_checkout_error"),
  notes: text("notes"),
  totalItems: integer("total_items").default(1),
  estimatedReadyTime: text("estimated_ready_time"),
  statusHistory: jsonb("status_history").$type<{ status: string; timestamp: string }[]>().default([]),
  pharmFlowSubmitted: boolean("pharmflow_submitted").default(false),
  pharmFlowSubmittedAt: timestamp("pharmflow_submitted_at"),
  pharmFlowCancellationStatus: text("pharmflow_cancellation_status"),
  pharmFlowCancellationConfirmedAt: timestamp("pharmflow_cancellation_confirmed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_orders_user_created").on(table.userId, table.createdAt),
]);

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Private server-side receipt data: never include tracking tokens in order JSON.
export const staffCheckoutReceipts = pgTable("staff_checkout_receipts", {
  orderId: integer("order_id").primaryKey().references(() => orders.id, { onDelete: "cascade" }),
  staffOrderId: text("staff_order_id").notNull(),
  trackingToken: text("tracking_token"),
  trackingExpiresAt: text("tracking_expires_at"),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  productName: text("product_name").notNull(),
  productType: text("product_type").notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: text("unit_price"),
  medicationId: integer("medication_id"),
  otcProductId: integer("otc_product_id"),
  isBlisterPack: boolean("is_blister_pack").default(false),
}, (table) => [
  index("IDX_order_items_order").on(table.orderId),
]);

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

export const blisterPacks = pgTable("blister_packs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  pharmacyEnrollmentId: varchar("pharmacy_enrollment_id"),
  enrollmentPayloadHash: varchar("enrollment_payload_hash", { length: 64 }),
  name: text("name").notNull(),
  medications: jsonb("medications").notNull().$type<{ medicationId?: number; name: string; strength: string; dosage: string; quantity: string; timeSlot: string; instructions: string }[]>(),
  durationDays: integer("duration_days").default(30),
  status: text("status").default("active"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  qrCode: text("qr_code"),
  pharmFlowSynced: boolean("pharmflow_synced").default(false),
  pharmFlowStatus: text("pharmflow_status"),
  enteredByInitials: text("entered_by_initials"),
  enteredByRole: text("entered_by_role"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_blister_packs_user").on(table.userId),
  uniqueIndex("UQ_blister_packs_pharmacy_enrollment_id").on(table.pharmacyEnrollmentId)
    .where(sql`${table.pharmacyEnrollmentId} IS NOT NULL`),
]);

export const insertBlisterPackSchema = createInsertSchema(blisterPacks).omit({ id: true, createdAt: true });
export type InsertBlisterPack = z.infer<typeof insertBlisterPackSchema>;
export type BlisterPack = typeof blisterPacks.$inferSelect;

export const blisterDoseSlots = pgTable("blister_dose_slots", {
  id: serial("id").primaryKey(),
  blisterPackId: integer("blister_pack_id").notNull().references(() => blisterPacks.id, { onDelete: "cascade" }),
  slotIndex: integer("slot_index").notNull(),
  medicationName: text("medication_name").notNull(),
  dosage: text("dosage").notNull(),
  timeSlot: text("time_slot").notNull(),
  plannedDate: timestamp("planned_date").notNull(),
  status: text("status").default("pending").notNull(),
  takenAt: timestamp("taken_at"),
  actorId: varchar("actor_id"),
}, (table) => [
  index("IDX_blister_dose_slots_pack_planned").on(table.blisterPackId, table.plannedDate),
]);

export const insertBlisterDoseSlotSchema = createInsertSchema(blisterDoseSlots).omit({ id: true });
export type InsertBlisterDoseSlot = z.infer<typeof insertBlisterDoseSlotSchema>;
export type BlisterDoseSlot = typeof blisterDoseSlots.$inferSelect;

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  medicationId: integer("medication_id"),
  scheduledTime: text("scheduled_time"),
  scheduledDays: text("scheduled_days").array(),
  isActive: boolean("is_active").default(true),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_reminders_user_active").on(table.userId, table.isActive),
]);

export const insertReminderSchema = createInsertSchema(reminders).omit({ id: true, createdAt: true, lastTriggered: true });
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof reminders.$inferSelect;

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  actionUrl: text("action_url"),
  relatedOrderId: integer("related_order_id"),
  relatedMedicationId: integer("related_medication_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_notifications_user_created").on(table.userId, table.createdAt),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const patientDoctors = pgTable("patient_doctors", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  specialty: text("specialty"),
  phone: varchar("phone"),
  address: text("address"),
  npi: varchar("npi"),
  isManualEntry: boolean("is_manual_entry").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPatientDoctorSchema = createInsertSchema(patientDoctors).omit({ id: true, createdAt: true });
export type InsertPatientDoctor = z.infer<typeof insertPatientDoctorSchema>;
export type PatientDoctor = typeof patientDoctors.$inferSelect;

export const caregiverLinks = pgTable("caregiver_links", {
  id: serial("id").primaryKey(),
  caregiverId: varchar("caregiver_id").notNull().references(() => users.id),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  relationship: text("relationship"),
  isApproved: boolean("is_approved").default(false),
  status: text("status").default("pending"),
  permissions: jsonb("permissions").default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_caregiver_links_caregiver_status").on(table.caregiverId, table.status),
  index("IDX_caregiver_links_patient_status").on(table.patientId, table.status),
]);

export const insertCaregiverLinkSchema = createInsertSchema(caregiverLinks).omit({ id: true, createdAt: true });
export type InsertCaregiverLink = z.infer<typeof insertCaregiverLinkSchema>;
export type CaregiverLink = typeof caregiverLinks.$inferSelect;

export const pharmacyMessages = pgTable("pharmacy_messages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  direction: text("direction").notNull(),
  message: text("message").notNull(),
  category: text("category").default("general"),
  relatedOrderId: integer("related_order_id"),
  isRead: boolean("is_read").default(false),
  sentBy: varchar("sent_by"),
  // Separate from isRead, which records the patient's local read state.
  deliveryStatus: text("delivery_status"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_pharmacy_messages_user_created").on(table.userId, table.createdAt),
]);

export const insertPharmacyMessageSchema = createInsertSchema(pharmacyMessages).omit({ id: true, createdAt: true });
export type InsertPharmacyMessage = z.infer<typeof insertPharmacyMessageSchema>;
export type PharmacyMessage = typeof pharmacyMessages.$inferSelect;

export const loyaltyPoints = pgTable("loyalty_points", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  balance: integer("balance").default(0).notNull(),
  streakDays: integer("streak_days").default(0).notNull(),
  lastStreakDate: timestamp("last_streak_date"),
  tier: text("tier").default("bronze").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLoyaltyPointsSchema = createInsertSchema(loyaltyPoints).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLoyaltyPoints = z.infer<typeof insertLoyaltyPointsSchema>;
export type LoyaltyPoints = typeof loyaltyPoints.$inferSelect;

export const pointsTransactions = pgTable("points_transactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  type: text("type").notNull(),
  source: text("source").notNull(),
  description: text("description"),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPointsTransactionSchema = createInsertSchema(pointsTransactions).omit({ id: true, createdAt: true });
export type InsertPointsTransaction = z.infer<typeof insertPointsTransactionSchema>;
export type PointsTransaction = typeof pointsTransactions.$inferSelect;

export const rewards = pgTable("rewards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  pointsCost: integer("points_cost").notNull(),
  category: text("category"),
  isActive: boolean("is_active").default(true).notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRewardSchema = createInsertSchema(rewards).omit({ id: true, createdAt: true });
export type InsertReward = z.infer<typeof insertRewardSchema>;
export type Reward = typeof rewards.$inferSelect;

export const earningRules = pgTable("earning_rules", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  pointsAwarded: integer("points_awarded").notNull(),
  description: text("description"),
  maxPerDay: integer("max_per_day"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});  

export const insertEarningRuleSchema = createInsertSchema(earningRules).omit({ id: true, createdAt: true });
export type InsertEarningRule = z.infer<typeof insertEarningRuleSchema>;
export type EarningRule = typeof earningRules.$inferSelect;

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pushConfig = pgTable("push_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  vibratePattern: integer("vibrate_pattern").array().notNull(),
  requireInteraction: boolean("require_interaction").notNull().default(true),
  urgentVibratePattern: integer("urgent_vibrate_pattern").array(),
  urgentRequireInteraction: boolean("urgent_require_interaction"),
  highVibratePattern: integer("high_vibrate_pattern").array(),
  highRequireInteraction: boolean("high_require_interaction"),
  infoVibratePattern: integer("info_vibrate_pattern").array(),
  infoRequireInteraction: boolean("info_require_interaction"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PushConfigRow = typeof pushConfig.$inferSelect;
export type SeverityAlertConfig = { vibratePattern: number[]; requireInteraction: boolean };
export type AllSeverityAlertConfig = { urgent: SeverityAlertConfig; high: SeverityAlertConfig; info: SeverityAlertConfig };

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  otcProductId: integer("otc_product_id").notNull().references(() => otcProducts.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  addedAt: timestamp("added_at").defaultNow(),
}, (t) => [unique("cart_user_product").on(t.userId, t.otcProductId)]);

export const insertCartItemSchema = createInsertSchema(cartItems).omit({ id: true, addedAt: true });
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItemRecord = typeof cartItems.$inferSelect;

export const failedSyncs = pgTable("failed_syncs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  lastError: text("last_error"),
  syncStatus: text("sync_status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type FailedSync = typeof failedSyncs.$inferSelect;

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const patientConditions = pgTable("patient_conditions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conditionName: text("condition_name").notNull(),
  icd10Code: text("icd10_code"),
  diagnosedAt: timestamp("diagnosed_at"),
  notes: text("notes"),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPatientConditionSchema = createInsertSchema(patientConditions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPatientCondition = z.infer<typeof insertPatientConditionSchema>;
export type PatientCondition = typeof patientConditions.$inferSelect;

export const healthJournalEntries = pgTable("health_journal_entries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conditionId: integer("condition_id").references(() => patientConditions.id, { onDelete: "set null" }),
  entryDate: timestamp("entry_date").defaultNow().notNull(),
  symptomsJson: jsonb("symptoms_json").$type<string[]>(),
  mood: integer("mood"),
  energyLevel: integer("energy_level"),
  sideEffectsText: text("side_effects_text"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHealthJournalEntrySchema = createInsertSchema(healthJournalEntries).omit({ id: true, createdAt: true });
export type InsertHealthJournalEntry = z.infer<typeof insertHealthJournalEntrySchema>;
export type HealthJournalEntry = typeof healthJournalEntries.$inferSelect;

export const conditionExplainerCache = pgTable("condition_explainer_cache", {
  id: serial("id").primaryKey(),
  conditionKey: text("condition_key").unique().notNull(),
  responseJson: jsonb("response_json").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export type ConditionExplainerCacheRow = typeof conditionExplainerCache.$inferSelect;

export const medicationConditionLinks = pgTable("medication_condition_links", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  medicationId: text("medication_id").notNull(),
  conditionId: integer("condition_id").notNull().references(() => patientConditions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMedicationConditionLinkSchema = createInsertSchema(medicationConditionLinks).omit({ id: true, createdAt: true });
export type InsertMedicationConditionLink = z.infer<typeof insertMedicationConditionLinkSchema>;
export type MedicationConditionLink = typeof medicationConditionLinks.$inferSelect;

export const recommendedProducts = pgTable("recommended_products", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  otcProductId: integer("otc_product_id").notNull().references(() => otcProducts.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  reason: text("reason"),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRecommendedProductSchema = createInsertSchema(recommendedProducts).omit({ id: true, createdAt: true });
export type InsertRecommendedProduct = z.infer<typeof insertRecommendedProductSchema>;
export type RecommendedProduct = typeof recommendedProducts.$inferSelect;

/** Loyalty points-to-dollar conversion rate. 1000 pts = $1. */
export const POINTS_PER_DOLLAR = 1000;

export const nutritionChatMessages = pgTable(
  "nutrition_chat_messages",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    products: jsonb("products").$type<{ id: number; name: string; brand: string | null; category: string; price: string | null; imageUrl: string | null }[]>(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("IDX_nutrition_chat_user").on(table.userId)]
);

export const insertNutritionChatMessageSchema = createInsertSchema(nutritionChatMessages).omit({ id: true, createdAt: true });
export type InsertNutritionChatMessage = z.infer<typeof insertNutritionChatMessageSchema>;
export type NutritionChatMessage = typeof nutritionChatMessages.$inferSelect;

export const fraudEvents = pgTable("fraud_events", {
  id: serial("id").primaryKey(),
  eventId: varchar("event_id").notNull().unique(),
  requestId: varchar("request_id").notNull().unique(),
  actorId: varchar("actor_id").notNull(),
  patientUserId: varchar("patient_user_id"),
  action: text("action").notNull(),
  outcome: text("outcome").notNull(),
  score: integer("score").notNull(),
  riskBand: text("risk_band").notNull(),
  signals: jsonb("signals").$type<Array<{ code: string; weight: number }>>().notNull(),
  safeDetails: jsonb("safe_details").$type<Record<string, unknown>>().notNull().default({}),
  ipHash: varchar("ip_hash"),
  userAgentHash: varchar("user_agent_hash"),
  source: text("source").notNull().default("app"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_fraud_events_patient_created").on(table.patientUserId, table.createdAt),
  index("IDX_fraud_events_actor_action").on(table.actorId, table.action, table.createdAt),
]);

export const fraudCases = pgTable("fraud_cases", {
  id: serial("id").primaryKey(),
  caseNumber: varchar("case_number").notNull().unique(),
  eventId: integer("event_id").notNull().references(() => fraudEvents.id),
  patientUserId: varchar("patient_user_id"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull(),
  assignedTo: varchar("assigned_to"),
  claimExpiresAt: timestamp("claim_expires_at"),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export const fraudDecisions = pgTable("fraud_decisions", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => fraudCases.id),
  decision: text("decision").notNull(),
  reasonCode: text("reason_code").notNull(),
  note: text("note"),
  decidedBy: varchar("decided_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("IDX_fraud_decisions_case_created").on(table.caseId, table.createdAt)]);

export const fraudIngestionReceipts = pgTable("fraud_ingestion_receipts", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  sourceEventId: varchar("source_event_id").notNull(),
  payloadHash: varchar("payload_hash").notNull(),
  status: text("status").notNull(),
  eventId: integer("event_id").references(() => fraudEvents.id),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
}, (table) => [
  unique("UQ_fraud_ingestion_source_event").on(table.source, table.sourceEventId),
]);

export const fraudMutationReceipts = pgTable("fraud_mutation_receipts", {
  id: serial("id").primaryKey(),
  actorId: varchar("actor_id").notNull(),
  action: text("action").notNull(),
  idempotencyKey: varchar("idempotency_key").notNull(),
  resourceId: varchar("resource_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("UQ_fraud_mutation_receipt").on(table.actorId, table.action, table.idempotencyKey),
]);

export const identityAliases = pgTable("identity_aliases", {
  oldUserId: varchar("old_user_id").primaryKey(),
  currentUserId: varchar("current_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("IDX_identity_alias_current").on(table.currentUserId)]);

/** Durable deduplication receipts for partner webhook deliveries. */
export const partnerWebhookReceipts = pgTable("partner_webhook_receipts", {
  id: serial("id").primaryKey(),
  source: varchar("source").notNull(),
  sourceEventId: varchar("source_event_id").notNull(),
  payloadHash: varchar("payload_hash").notNull(),
  status: varchar("status").notNull().default("processing"),
  leaseToken: varchar("lease_token"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
}, (table) => [
  unique("UQ_partner_webhook_source_event").on(table.source, table.sourceEventId),
  index("IDX_partner_webhook_received").on(table.receivedAt),
]);

export type PartnerWebhookReceipt = typeof partnerWebhookReceipts.$inferSelect;

export const partnerOutbox = pgTable("partner_outbox", {
  id: serial("id").primaryKey(),
  partner: varchar("partner").notNull(),
  operation: varchar("operation").notNull(),
  idempotencyKey: varchar("idempotency_key").notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status").notNull().default("pending"),
  leaseToken: varchar("lease_token"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("UQ_partner_outbox_idempotency").on(table.partner, table.operation, table.idempotencyKey),
  index("IDX_partner_outbox_due").on(table.status, table.nextAttemptAt),
  check("CK_partner_outbox_operation", sql`${table.operation} IN ('concordia_order','concordia_refill','staff_order','staff_checkout','pharmflow_rx_order','pharmflow_cancel_order','concordia_patient','pharmflow_patient','concordia_medication','pharmflow_message')`),
  check("CK_partner_outbox_status", sql`${table.status} IN ('pending','processing','completed','failed')`),
  check("CK_partner_outbox_payload_size", sql`octet_length(${table.payload}::text) <= 262144`),
]);
export type PartnerOutbox = typeof partnerOutbox.$inferSelect;

/** PHI-free operator audit trail for administrative sync actions. */
export const syncOperationAudit = pgTable("sync_operation_audit", {
  id: serial("id").primaryKey(),
  actorUserId: varchar("actor_user_id").notNull(),
  operationId: integer("operation_id").notNull(),
  action: varchar("action").notNull(),
  result: varchar("result").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_sync_operation_audit_operation").on(table.operationId, table.createdAt),
  index("IDX_sync_operation_audit_created").on(table.createdAt),
]);
export type SyncOperationAudit = typeof syncOperationAudit.$inferSelect;
