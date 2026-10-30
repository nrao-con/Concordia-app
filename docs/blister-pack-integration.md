# ConcordiaCare blister-pack partner API

All routes below require `X-API-KEY`. Create and lookup accept the Concordia or PharmFlow partner key; status update accepts only the PharmFlow key. Do not send credentials in a URL.

## Create or retry

`POST /api/external/create-blister-pack`

```json
{
  "pharmacyEnrollmentId": "immutable-pharmacy-enrollment-id",
  "userId": "verified-ConcordiaCare-user-id",
  "name": "Monthly blister pack",
  "medications": [{ "name": "Medication name", "timeSlot": "Morning", "dosage": "1 tablet" }],
  "durationDays": 30,
  "startDate": "2026-09-23T12:00:00.000Z"
}
```

`pharmacyEnrollmentId` is required, globally unique for this pharmacy integration, immutable, and 1–255 characters without padding/control characters. `userId` must be the **ConcordiaCare** local user ID for a verified patient with a canonical CP ID and pharmacy patient ID. Alternatively, `concordiaId` (`CP-XXXXXX`) and/or `pharmacyPatientId` can identify the same patient. If multiple identifiers are sent, **all must agree**. Email, phone, name and DOB never select a patient. `name` and 1–100 medications with nonempty `name` and `timeSlot` are required. `durationDays` defaults to 30; allowed range is 1–365 with at most 5000 generated dose slots. `startDate` defaults to creation time.

**First success:** HTTP 201, JSON containing `blisterPackId` (integer), `pharmacyEnrollmentId`, `replayed: false`, and the existing blister-pack fields including `id` and `doseSlots`.

**Same enrollment, same patient and same create payload:** HTTP 200 with the same `blisterPackId`, `replayed: true` and current pack/dose-slot state. A retry does not create another pack, dose slots, or notification. If a create succeeds but the HTTP response is lost, retry the *same* request body and enrollment ID. Do not regenerate `startDate` on each retry; omit it consistently if using the server default.

Errors: 401 wrong/missing partner key; 422 missing/invalid enrollment or canonical identifier; 404 supplied patient ID not found; 409 conflicting identifiers, identity pending review, or an enrollment ID already bound to a different patient/payload (`enrollment_conflict`); 400 invalid pack fields. Do not retry a 4xx response without correcting the request.

### Website sender handoff

The **website server** (not browser JavaScript) should call `https://concordia-care.replit.app/api/external/create-blister-pack` with its existing Concordia partner key in `X-API-KEY`. Never put the key in the browser or a URL. Store an immutable pharmacy enrollment ID **once when the enrollment is created**; send it as `pharmacyEnrollmentId` on every attempt. `userId` is the verified **ConcordiaCare local user ID**, not a website Clerk subject or pharmacy-local patient ID. If the website only has a CP ID, use `concordiaId: "CP-XXXXXX"` instead. Contact details may accompany the request but cannot resolve a patient.

After HTTP 201 or 200, persist the returned `blisterPackId` in the website's enrollment row. If the response times out after the receiver committed, retry the **identical create payload** with the same enrollment ID; never generate a new enrollment ID or a new explicit `startDate` for the retry. An authenticated lookup by enrollment ID **and CP ID** is available below if the website needs to reconcile. Do not interpret 404 or 409 as permission to create/link a patient by email, phone, or name.

When a create returns HTTP 422, inspect the JSON `error`: `pharmacy_enrollment_id_required` means the immutable enrollment ID is missing/invalid; `canonical_patient_id_required` means no valid `userId`, `concordiaId`, or `pharmacyPatientId` was supplied. The receiver logs only these fixed error codes, never the request payload or patient identifiers. A public website URL does not provide access to its private sender code; this handoff must be applied in the website's source project.

## Reconcile an indexed enrollment

`GET /api/external/blister-pack-by-enrollment?pharmacyEnrollmentId=<url-encoded-id>&concordiaId=CP-XXXXXX`

HTTP 200: `{ "success": true, "blisterPackId": 123, "pharmacyEnrollmentId": "...", "concordiaId": "CP-XXXXXX", "userId": "..." }`. The pack must belong to that exact verified canonical patient. Missing identifiers return 422; an unknown patient or unmatched enrollment returns 404; an identity requiring review returns 409. Never retry a create with changed fields to "discover" an older pack.

**Pre-index historical packs:** Before this contract, the receiver did not persist a pharmacy enrollment ID. Those packs cannot be found safely by enrollment ID and CP ID alone, even if their remote ID was lost. Lookup returns 404 for them. Reconcile one only after staff confirm its exact ConcordiaCare pack ID and patient from independent records and perform a reviewed backfill; do not guess by name, dates, email, or phone.

## PharmFlow status callback

`POST /api/external/blister-pack-status` (PharmFlow key only)

```json
{ "concordiaCareBlisterPackId": 123, "status": "preparing", "message": "Optional patient notification text" }
```

Use a stable `X-Event-ID` header on retries. `status` and `concordiaCareBlisterPackId` are required; the callback updates `pharmFlowStatus` and sends one notification for a new event. HTTP 200 returns `{ "success": true, "blisterPackId": 123, "status": "preparing" }`; repeat event responses also include `"duplicate": true` and do not send another notification. Missing fields return 400, unknown pack 404, reused event ID with a different payload 409, wrong/missing key 401. This callback does not create or link patients.