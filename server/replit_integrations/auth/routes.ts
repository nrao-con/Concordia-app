import type { Express } from "express";
import { authStorage } from "./storage";
import { isClerkAuthenticated } from "./replitAuth";
import { getAuth } from "@clerk/express";
import { storage } from "../../storage";
import { pool } from "../../db";
import {
  mapPharmacyIdentityHttpStatus,
  parsePharmacyIdentityError,
  parsePharmacyIdentityResponse,
  type PharmacyIdentity,
} from "./pharmacy-identity";
import { isStandaloneAccount } from "./standalone";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isClerkAuthenticated, async (req: any, res) => {
    try {
      const { userId } = getAuth(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const rawSubject = req.auth?.userId ?? userId;
      let user = await authStorage.getUserByClerkUserId(rawSubject);
      if (user?.identityReviewRequired) {
        res.locals.authHoldReason = "identity_review_required";
        return res.status(423).json({
          error: "identity_review_required",
          message: "Your identity requires review before it can be used.",
        });
      }
      if (user?.identityTrustStatus === "pending_review") {
        const pending = await pool.query(
          `SELECT c.case_number FROM fraud_cases c
           JOIN fraud_events e ON e.id = c.event_id
           WHERE e.actor_id = $1 AND e.action = 'identity.link'
             AND c.status IN ('open', 'in_review')
           ORDER BY c.opened_at DESC LIMIT 1`,
          [userId],
        );
        res.locals.authHoldReason = "verification_required";
        return res.status(423).json({
          error: "verification_required",
          message: "Your pharmacy identity must be reviewed before medication access can continue.",
          caseNumber: pending.rows[0]?.case_number ?? null,
        });
      }

      if (!user) {
        const staffReviewAvailable = (process.env.ADMIN_USER_IDS ?? "")
          .split(",").some((id) => id.trim() === rawSubject);
        if (staffReviewAvailable) {
          res.locals.authHoldReason = "identity_link_required";
          res.locals.authStaffReviewAvailable = true;
          return res.status(423).json({
            error: "identity_link_required",
            message: "Staff access is separate from a patient account.",
            staffReviewAvailable: true,
          });
        }
        user = await authStorage.createStandaloneUser(rawSubject);
      }

      if (!user) {
        const token = await getAuth(req).getToken();
        if (!token) {
          return res.status(503).json({
            error: "pharmacy_identity_unavailable",
            message: "Unable to verify your pharmacy identity right now. Please try again.",
          });
        }
        const pharmacyUrl = process.env.CONCORDIA_API_URL;
        if (!pharmacyUrl) {
          return res.status(503).json({
            error: "pharmacy_identity_unavailable",
            message: "Pharmacy identity service is not configured.",
          });
        }

        let pharmacyResponse: Response;
        try {
          pharmacyResponse = await fetch(`${pharmacyUrl}/api/auth/user`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(5000),
          });
        } catch (error) {
          console.error("[Auth] Pharmacy identity request failed:", error);
          return res.status(503).json({
            error: "pharmacy_identity_unavailable",
            message: "Unable to verify your pharmacy identity right now. Please try again.",
          });
        }

        let pharmacyPayload: unknown = null;
        try {
          pharmacyPayload = await pharmacyResponse.json();
        } catch {
          pharmacyPayload = null;
        }
        const httpError = mapPharmacyIdentityHttpStatus(
          pharmacyResponse.status,
          parsePharmacyIdentityError(pharmacyPayload),
        );
        if (httpError?.error === "identity_link_required") {
          return res.status(423).json({
            error: "identity_link_required",
            message: "Your account is not linked to a pharmacy identity. Please contact the pharmacy.",
          });
        }
        if (httpError?.error === "identity_conflict") {
          return res.status(409).json({
            error: "identity_conflict",
            message: "Your pharmacy identity conflicts with an existing account. Please contact the pharmacy.",
          });
        }
        if (pharmacyResponse.status === 401) {
          return res.status(401).json({
            error: "pharmacy_session_rejected",
            message: "The pharmacy did not accept this sign-in session.",
          });
        }
        if (httpError) {
          return res.status(503).json({
            error: "pharmacy_identity_unavailable",
            message: "Unable to verify your pharmacy identity right now. Please try again.",
          });
        }

        const pharmacyIdentity: PharmacyIdentity | null = parsePharmacyIdentityResponse(pharmacyPayload);
        if (!pharmacyIdentity) {
          return res.status(503).json({
            error: "pharmacy_identity_invalid",
            message: "The pharmacy identity response was invalid. Please try again later.",
          });
        }

        const canonical = await storage.getUserByConcordiaId(pharmacyIdentity.concordiaId);
        if (!canonical) {
          return res.status(423).json({
            error: "pharmacy_sync_required",
            message: "Your pharmacy identity is valid, but the local patient record is not synchronized yet.",
          });
        }
        if (
          pharmacyIdentity.concordiaCareUserId &&
          pharmacyIdentity.concordiaCareUserId !== canonical.id
        ) {
          return res.status(409).json({
            error: "identity_conflict",
            message: "The pharmacy identity is linked to a different ConcordiaCare account.",
          });
        }

        try {
          user = await authStorage.bindAuthoritativePharmacyIdentity(
            rawSubject,
            pharmacyIdentity.pharmacyUserId,
            pharmacyIdentity.concordiaId,
          );
        } catch (error) {
          const code = (error as any)?.code;
          if (
            code === "CLERK_ID_ALREADY_BOUND" ||
            code === "PATIENT_ALREADY_BOUND" ||
            code === "PHARMACY_ID_ALREADY_BOUND" ||
            code === "PATIENT_PHARMACY_ID_CONFLICT"
          ) {
            return res.status(409).json({
              error: "identity_conflict",
              message: "This sign-in cannot be linked to that pharmacy patient record. Please contact the pharmacy.",
            });
          }
          throw error;
        }
      }

      // Binding never clears a pharmacy hold. Re-check after binding so a
      // linked-but-pending patient receives no profile or medication data.
      const standalone = isStandaloneAccount(user);
      if (user.identityReviewRequired || (user.identityTrustStatus !== "verified" && !standalone)) {
        res.locals.authHoldReason = user.identityReviewRequired ? "identity_review_required" : "verification_required";
        return res.status(423).json({
          error: user.identityReviewRequired ? "identity_review_required" : "verification_required",
          message: "Your pharmacy identity requires review before it can be used.",
        });
      }

      const adminIds = (process.env.ADMIN_USER_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      // Keep this bootstrap response to fields consumed by the app shell.
      // Linkage, normalized contact, and review internals are never exposed.
      const {
        clerkUserId: _clerkUserId,
        pharmacyPatientId: _pharmacyPatientId,
        emailNormalized: _emailNormalized,
        phoneNormalized: _phoneNormalized,
        identityTrustStatus: _identityTrustStatus,
        identityReviewRequired: _identityReviewRequired,
        ...publicUser
      } = user;
      res.json({ ...publicUser, pharmacyAccess: !standalone, isAdmin: adminIds.includes(rawSubject) });
    } catch (error) {
      if ((error as any)?.code === "23505") {
        const constraint = String((error as any).constraint || "");
        const field = constraint.includes("phone") ? "phone" : constraint.includes("clerk") ? "clerkUserId" : "email";
        return res.status(409).json({ error: "identity_conflict", field, message: `${field === "phone" ? "Phone number" : field === "clerkUserId" ? "Sign-in identity" : "Email"} is already registered.` });
      }
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Local-only profile details for an isolated account. This deliberately
  // avoids the pharmacy profile route, which sends changes to partner systems.
  app.patch("/api/auth/standalone-profile", isClerkAuthenticated, async (req: any, res) => {
    const subject = req.auth?.userId ?? getAuth(req).userId;
    if (!subject) return res.status(401).json({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) => key !== "firstName" && key !== "lastName") ||
        typeof body.firstName !== "string" || typeof body.lastName !== "string" ||
        body.firstName.trim().length > 100 || body.lastName.trim().length > 100) {
      return res.status(400).json({ error: "invalid_profile", message: "Enter a first and last name of at most 100 characters each." });
    }
    try {
      const user = await authStorage.updateStandaloneName(
        subject,
        body.firstName.trim() || null,
        body.lastName.trim() || null,
      );
      if (!user) return res.status(403).json({ error: "standalone_account_required" });
      return res.json({ firstName: user.firstName, lastName: user.lastName });
    } catch (error) {
      console.error("[Auth] Standalone profile update failed:", error);
      return res.status(503).json({ error: "profile_unavailable", message: "Could not save your profile right now." });
    }
  });

  app.post("/api/logout", (_req, res) => res.json({ ok: true }));
  app.get("/api/logout", (_req, res) => res.redirect("/"));

  // Managed-domain linking deliberately accepts only the canonical CP ID.
  // In particular, do not add contact, name, DOB, or email selectors here.
  app.post("/api/pharmacy-link-requests", isClerkAuthenticated, async (req: any, res) => {
    const subject = req.auth?.userId ?? getAuth(req).userId;
    const body = req.body ?? {};
    const keys = Object.keys(body);
    if (keys.some((key) => key !== "concordiaId" || typeof body[key] !== "string")) {
      return res.status(400).json({ error: "invalid_request", message: "Only concordiaId is accepted." });
    }
    const concordiaId = typeof body.concordiaId === "string" ? body.concordiaId.trim() : "";
    if (!/^CP-\d{6}$/.test(concordiaId)) {
      return res.status(400).json({ error: "invalid_request", message: "Enter a valid Concordia patient ID." });
    }
    try {
      // One verified sign-in may belong to only one canonical patient. Even a
      // trusted existing patient must not open a request for another CP ID.
      const linked = await storage.getUserByClerkUserId(subject);
      if (linked && !isStandaloneAccount(linked)) {
        return res.status(409).json({
          error: "already_linked",
          message: "This sign-in is already connected to a pharmacy patient record.",
        });
      }
      const pending = await pool.query(
        `SELECT id, status, rejection_reason, created_at, updated_at
           FROM pharmacy_link_requests
          WHERE clerk_subject = $1 AND status = 'pending'
          ORDER BY requested_at DESC LIMIT 1`, [subject],
      );
      if (pending.rows[0]) {
        return res.status(202).json({ message: "If eligible, your request has been submitted for pharmacy review." });
      }
      // Durable limits are keyed by the Clerk subject, not an IP or process.
      const attempts = await pool.query(
        `SELECT count(*)::int AS count FROM pharmacy_link_requests
          WHERE clerk_subject = $1 AND requested_at >= now() - interval '24 hours'`, [subject],
      );
      const latest = await pool.query(
        `SELECT status, updated_at FROM pharmacy_link_requests
          WHERE clerk_subject = $1 ORDER BY requested_at DESC LIMIT 1`, [subject],
      );
      if (Number(attempts.rows[0]?.count ?? 0) >= 3 ||
          (latest.rows[0]?.status === "rejected" &&
           new Date(latest.rows[0].updated_at).getTime() > Date.now() - 24 * 60 * 60 * 1000)) {
        return res.status(429).json({ error: "request_temporarily_unavailable", message: "Please try again later." });
      }
      // Do not look up CP IDs here. Every syntactically valid ID gets the same
      // subject-specific pending marker, even if someone else requested it.
      // Only staff resolves and verifies the pharmacy tuple at decision time.
      const pendingMarker = `unverified:${subject}:${concordiaId}`;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO pharmacy_link_requests
             (clerk_subject, concordia_id, pharmacy_patient_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (clerk_subject) WHERE status = 'pending' DO UPDATE
             SET updated_at = now()
           RETURNING id, status, rejection_reason, created_at, updated_at`,
          [subject, concordiaId, pendingMarker],
        );
        await client.query(
          `INSERT INTO pharmacy_link_audit (request_id, action, actor_subject, reason_code)
           VALUES ($1, 'requested', $2, 'submitted')`, [inserted.rows[0].id, subject],
        );
        await client.query("COMMIT");
        return res.status(202).json({ message: "If eligible, your request has been submitted for pharmacy review." });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if ((error as any)?.code === "23505") {
        return res.status(202).json({ message: "If eligible, your request has been submitted for pharmacy review." });
      }
      console.error("[Auth] link request failed:", error);
      return res.status(503).json({ error: "identity_unavailable", message: "Linking is temporarily unavailable." });
    }
  });

  app.get("/api/pharmacy-link-requests/me", isClerkAuthenticated, async (req: any, res) => {
    const subject = req.auth?.userId ?? getAuth(req).userId;
    const result = await pool.query(
      `SELECT status, rejection_reason, created_at, updated_at
         FROM pharmacy_link_requests WHERE clerk_subject = $1
         ORDER BY created_at DESC LIMIT 1`, [subject],
    );
    const row = result.rows[0];
    res.json({ request: row ? {
      status: row.status,
      rejectionReason: row.status === "rejected" ? "Please contact the pharmacy to verify your patient ID." : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : null });
  });

  app.get("/api/admin/pharmacy-link-requests", isClerkAuthenticated, adminOnly, async (_req, res) => {
    const result = await pool.query(
      `SELECT r.id, r.concordia_id AS "concordiaId", r.clerk_subject AS "requesterSubject",
              r.status, r.requested_at AS "requestedAt",
              (u.clerk_user_id IS NOT NULL AND u.clerk_user_id <> r.clerk_subject) AS "hasExistingSignIn"
         FROM pharmacy_link_requests r
         LEFT JOIN users u ON u.concordia_id = r.concordia_id
        WHERE r.status = 'pending' ORDER BY r.created_at ASC`,
    );
    res.json({ requests: result.rows });
  });

  app.get("/api/admin/patient-sync-conflicts", isClerkAuthenticated, adminOnly, async (req, res) => {
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
      return res.status(400).json({ error: "invalid_offset" });
    }
    try {
      const result = await pool.query(
        `SELECT id, conflict_type AS "conflictType", pharmacy_patient_id AS "pharmacyPatientId",
                concordia_id AS "concordiaId", prescription_id AS "prescriptionId",
                occurrence_count AS "occurrenceCount", first_seen_at AS "firstSeenAt",
                last_seen_at AS "lastSeenAt"
           FROM pharmacy_sync_conflicts
          WHERE status = 'open'
          ORDER BY last_seen_at DESC, id DESC LIMIT 20 OFFSET $1`,
        [offset],
      );
      const total = await pool.query(
        `SELECT count(*)::integer AS total FROM pharmacy_sync_conflicts WHERE status = 'open'`,
      );
      return res.json({ conflicts: result.rows, total: total.rows[0]?.total ?? 0 });
    } catch {
      return res.status(503).json({ error: "patient_sync_conflicts_unavailable" });
    }
  });

  app.post("/api/admin/pharmacy-link-requests/:id/decision", isClerkAuthenticated, adminOnly, async (req: any, res) => {
    const id = Number(req.params.id);
    const decision = req.body?.decision;
    const decisionStatus = decision === "approve" ? "approved"
      : decision === "reject" ? "rejected"
      : null;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : null;
    const replaceExistingSignIn = req.body?.replaceExistingSignIn === true;
    const confirmedSubject = typeof req.body?.confirmedSubject === "string" ? req.body.confirmedSubject.trim() : "";
    const verificationMethod = req.body?.verificationMethod;
    if (!Number.isInteger(id) || !decisionStatus ||
        (decisionStatus === "rejected" && (!reason || reason.length > 280))) {
      return res.status(400).json({ error: "invalid_request", message: "Invalid decision." });
    }
    const reviewer = req.auth?.userId ?? getAuth(req).userId;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const request = await client.query(
        `SELECT * FROM pharmacy_link_requests WHERE id = $1 FOR UPDATE`, [id],
      );
      const row = request.rows[0];
      if (!row) { await client.query("ROLLBACK"); return res.status(404).json({ error: "not_found" }); }
      if (row.status !== "pending") { await client.query("ROLLBACK"); return res.status(409).json({ error: "already_decided" }); }
      if (decisionStatus === "rejected") {
        await client.query(
          `UPDATE pharmacy_link_requests SET status='rejected', rejection_reason=$2,
             reviewer_subject=$3, reviewed_at=now(), updated_at=now() WHERE id=$1`,
          [id, reason, reviewer],
        );
        await client.query(
          `INSERT INTO pharmacy_link_audit (request_id, action, actor_subject, reason_code)
           VALUES ($1, 'rejected', $2, 'staff_rejected')`, [id, reviewer],
        );
      } else {
        const patient = await client.query(
          `SELECT id, clerk_user_id, concordia_id, pharmacy_patient_id,
                  identity_trust_status, identity_review_required
             FROM users WHERE concordia_id=$1 FOR UPDATE`, [row.concordia_id],
        );
        const p = patient.rows[0];
        const owner = p && await client.query(
          `SELECT id, identity_trust_status, identity_review_required,
                  concordia_id, pharmacy_patient_id
             FROM users WHERE clerk_user_id=$1 FOR UPDATE`, [row.clerk_subject],
        );
        const signedInRow = owner?.rows[0];
        const transferringExistingSignIn = !!p?.clerk_user_id && p.clerk_user_id !== row.clerk_subject;
        // A separate sign-in starts with its own empty local profile. Staff may
        // replace that profile with the reviewed pharmacy patient, but must
        // never transfer a held or already-linked account's identity.
        const replaceableStandalone = signedInRow && signedInRow.id !== p.id &&
          isStandaloneAccount({
            identityTrustStatus: signedInRow.identity_trust_status,
            identityReviewRequired: signedInRow.identity_review_required,
            concordiaId: signedInRow.concordia_id,
            pharmacyPatientId: signedInRow.pharmacy_patient_id,
          });
        const pendingMarker = `unverified:${row.clerk_subject}:${row.concordia_id}`;
        if (!p || !p.pharmacy_patient_id ||
            (row.pharmacy_patient_id !== pendingMarker && p.pharmacy_patient_id !== row.pharmacy_patient_id) ||
            p.identity_trust_status !== "verified" || p.identity_review_required ||
            (signedInRow && signedInRow.id !== p.id && !replaceableStandalone)) {
          await client.query(
            `INSERT INTO pharmacy_link_audit (request_id, action, actor_subject, reason_code)
             VALUES ($1, 'approval_failed', $2, 'tuple_or_ownership_conflict')`, [id, reviewer],
          );
          await client.query("COMMIT");
          return res.status(409).json({ error: "identity_conflict", message: "The patient record can no longer be linked." });
        }
        if (transferringExistingSignIn &&
            (!replaceExistingSignIn || confirmedSubject !== row.clerk_subject ||
             !["in_person_id", "callback_registered_phone"].includes(verificationMethod))) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "transfer_confirmation_required",
            message: "Staff must independently verify this patient and confirm the exact sign-in receiving access.",
          });
        }
        if (replaceableStandalone) {
          // Retain the local row and its data, but release the Clerk subject
          // under the same transaction before binding it to the patient.
          const released = await client.query(
            `UPDATE users SET clerk_user_id=NULL, updated_at=now()
               WHERE id=$1 AND clerk_user_id=$2
                 AND identity_trust_status='unverified'
                 AND identity_review_required=false
                 AND concordia_id IS NULL AND pharmacy_patient_id IS NULL
             RETURNING id`,
            [signedInRow.id, row.clerk_subject],
          );
          if (released.rowCount !== 1) throw new Error("Standalone identity changed during approval");
        }
        await client.query(
          `UPDATE users SET clerk_user_id=$2, updated_at=now() WHERE id=$1`,
          [p.id, row.clerk_subject],
        );
        await client.query(
          `UPDATE pharmacy_link_requests SET status='approved', reviewer_subject=$2,
             reviewed_at=now(), updated_at=now() WHERE id=$1`, [id, reviewer],
        );
        await client.query(
          `INSERT INTO pharmacy_link_audit (request_id, action, actor_subject, reason_code)
            VALUES ($1, 'approved', $2, $3)`,
          [id, reviewer, transferringExistingSignIn ? `transfer_verified_${verificationMethod}` : "staff_approved"],
        );
      }
      await client.query("COMMIT");
      return res.json({ ok: true, status: decisionStatus });
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as any)?.code === "23505") return res.status(409).json({ error: "identity_conflict" });
      console.error("[Auth] link decision failed:", error);
      return res.status(503).json({ error: "unavailable" });
    } finally { client.release(); }
  });
}

function adminOnly(req: any, res: any, next: any): void {
  const subject = req.auth?.userId;
  const admins = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!subject || !admins.includes(subject)) { res.status(403).json({ error: "Forbidden" }); return; }
  const now = Date.now();
  const recent = adminRequestTimes.get(subject)?.filter((at) => at > now - 60_000) ?? [];
  if (recent.length >= 60) { res.status(429).json({ error: "request_temporarily_unavailable" }); return; }
  recent.push(now);
  adminRequestTimes.set(subject, recent);
  next();
}

const adminRequestTimes = new Map<string, number[]>();
