# ConcordiaCare Care Navigator — Mobile App API Specification

**Version:** 1.0  
**Base URL:** `https://your-concordiacare-app.replit.app`  
**Auth:** All endpoints require the `X-API-KEY` header matching `CONCORDIA_API_KEY`.  
**User identity:** Pass `userId` as a field in the request body (POST/PATCH) or as `?userId=` query param (GET/DELETE).

---

## AI Content Disclaimer

All responses from the `/explain` endpoint carry:
```json
{
  "aiGenerated": true,
  "disclaimer": "This information is AI-generated for educational purposes and is not a substitute for professional medical advice. Always consult your doctor or pharmacist before making health decisions."
}
```
**The mobile app MUST display this disclaimer text whenever AI-generated content is shown.**

---

## Patient Conditions

### List conditions for a patient

```
GET /api/external/care-navigator/conditions?userId={userId}
```

**Headers:** `X-API-KEY: <key>`

**Response 200:**
```json
[
  {
    "id": 1,
    "userId": "abc123",
    "conditionName": "Type 2 Diabetes",
    "icd10Code": "E11",
    "diagnosedAt": "2024-01-15T00:00:00.000Z",
    "notes": "Managed with diet and medication",
    "status": "active",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
]
```

---

### Create a condition

```
POST /api/external/care-navigator/conditions
```

**Body:**
```json
{
  "userId": "abc123",
  "conditionName": "Type 2 Diabetes",
  "icd10Code": "E11",
  "diagnosedAt": "2024-01-15T00:00:00.000Z",
  "notes": "Optional notes"
}
```

`conditionName` is required. All others optional.

**Response 201:** Created condition object.

**Error 400:** `{ "error": "conditionName is required" }`

---

### Update a condition

```
PATCH /api/external/care-navigator/conditions/:id
```

**Body:** Any subset of `{ conditionName, icd10Code, diagnosedAt, notes, status }`.  
`status` must be `"active"` or `"resolved"`.

**Response 200:** Updated condition object.

**Error 404:** `{ "error": "Condition not found" }`

---

### Delete (resolve) a condition

```
DELETE /api/external/care-navigator/conditions/:id
```

Sets `status = "resolved"` (soft delete).

**Response 200:** `{ "success": true }`

---

## AI Explainer

### Get plain-language explanation for a condition

```
GET /api/external/care-navigator/conditions/:id/explain?userId={userId}
```

Returns a cached explanation if available (TTL: 30 days). Generates a new one via AI if not cached or expired. Every call is logged with `userId`, `conditionId`, and cache status for HIPAA audit.

**Response 200:**
```json
{
  "conditionName": "Type 2 Diabetes",
  "icd10Code": "E11",
  "plainSummary": "Type 2 diabetes is a condition where your body has trouble using sugar for energy...",
  "commonTreatments": [
    "Oral medications such as Metformin",
    "Blood sugar monitoring",
    "Insulin therapy if needed",
    "Dietary changes",
    "Regular exercise"
  ],
  "lifestyleTips": [
    "Limit sugary foods and refined carbohydrates",
    "Walk for 30 minutes most days",
    "Check your blood sugar as directed by your doctor",
    "Keep a log of your readings",
    "Stay hydrated"
  ],
  "doctorQuestions": [
    "What blood sugar range should I be aiming for?",
    "Do I need to check my feet regularly?",
    "Are there signs of complications I should watch for?",
    "Should I see a diabetes educator?",
    "How often do I need an A1C test?"
  ],
  "aiGenerated": true,
  "disclaimer": "This information is AI-generated for educational purposes and is not a substitute for professional medical advice. Always consult your doctor or pharmacist before making health decisions."
}
```

**Caching note:** Cache key is derived from `conditionName + icd10Code`. The same condition name will always return the same cached response until the 30-day TTL expires. Do not call this endpoint on every page load — cache the response client-side for the session.

**Error 404:** `{ "error": "Condition not found" }`

---

## Linked Prescriptions

### Get prescriptions linked to a condition

```
GET /api/external/care-navigator/conditions/:id/prescriptions?userId={userId}
```

Returns medications the patient has that are explicitly linked to this condition via `POST /api/external/care-navigator/medication-condition-link`.

**Response 200:**
```json
[
  {
    "id": 1,
    "userId": "abc123",
    "medicationId": "metformin_500mg",
    "conditionId": 1,
    "createdAt": "2024-01-15T10:00:00.000Z"
  }
]
```

---

## Medication-Condition Links

### Link a medication to a condition

```
POST /api/external/care-navigator/medication-condition-link
```

**Body:**
```json
{
  "userId": "abc123",
  "medicationId": "metformin_500mg",
  "conditionId": 1
}
```

`medicationId` is a free-text identifier (medication name, RxNumber, or any stable string that matches your pharmacy system's medication identifier).

**Response 201:** Created link object.

**Error 400:** `{ "error": "userId, medicationId, and conditionId are required" }`

---

### Remove a medication-condition link

```
DELETE /api/external/care-navigator/medication-condition-link/:id
```

**Response 200:** `{ "success": true }`

---

## Health Journal

### List journal entries (paginated)

```
GET /api/external/care-navigator/journal?userId={userId}&page=1&limit=20&conditionId={conditionId}
```

`conditionId` is optional — omit to get all entries for the user.

**Response 200:**
```json
{
  "entries": [
    {
      "id": 1,
      "userId": "abc123",
      "conditionId": 1,
      "entryDate": "2024-05-01T08:00:00.000Z",
      "symptomsJson": ["fatigue", "thirst"],
      "mood": 3,
      "energyLevel": 2,
      "sideEffectsText": "Some nausea after Metformin",
      "notes": "Felt better after lunch",
      "createdAt": "2024-05-01T08:30:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

**Scales (mood / energyLevel):** 1 = Very low, 2 = Low, 3 = Moderate, 4 = Good, 5 = Excellent.

---

### Create a journal entry

```
POST /api/external/care-navigator/journal
```

**Body:**
```json
{
  "userId": "abc123",
  "conditionId": 1,
  "entryDate": "2024-05-01T08:00:00.000Z",
  "symptomsJson": ["fatigue", "thirst"],
  "mood": 3,
  "energyLevel": 2,
  "sideEffectsText": "Some nausea after Metformin",
  "notes": "Felt better after lunch"
}
```

Only `userId` is required. All other fields are optional.

**Response 201:** Created entry object.

---

## Next Steps CTAs

### Get suggested platform actions for a condition

```
GET /api/external/care-navigator/conditions/:id/next-steps
```

Returns a rule-based list of in-app actions relevant to the condition. No AI involved — deterministic mapping.

**Response 200:**
```json
{
  "conditionName": "Type 2 Diabetes",
  "nextSteps": [
    {
      "action": "medication_reminders",
      "label": "Set up medication reminders",
      "url": "/reminders",
      "description": "Never miss a dose with scheduled medication reminders."
    },
    {
      "action": "shop_monitoring",
      "label": "Browse monitoring supplies",
      "url": "/shop",
      "description": "Blood pressure monitors, glucose meters, and diabetic care supplies."
    },
    {
      "action": "prescription_transfer",
      "label": "Transfer prescriptions to ConcordiaCare",
      "url": "/pharmacy-chat",
      "description": "Get all your medications managed in one convenient place."
    }
  ]
}
```

---

## Recommended OTC Products

### Get OTC products recommended for a condition

```
GET /api/external/care-navigator/conditions/:id/recommended-products
```

Returns up to 6 OTC products from the ConcordiaCare catalog whose category matches the condition. Rule-based (no AI). Returns empty array if no match.

**Response 200:**
```json
{
  "conditionName": "Type 2 Diabetes",
  "products": [
    {
      "id": 12,
      "name": "LifeScan OneTouch Blood Glucose Monitor",
      "brand": "LifeScan",
      "category": "Diabetic Care",
      "price": "29.99",
      "imageUrl": "https://...",
      "isAvailable": true
    }
  ]
}
```

---

## Error Codes

| Status | Meaning |
|--------|---------|
| 400 | Bad request — missing or invalid fields |
| 401 | Missing or invalid `X-API-KEY` header |
| 404 | Resource not found |
| 500 | Internal server error |

---

## Push Notification Integration

The ConcordiaCare backend enriches medication reminder push notifications with condition context when a medication-condition link exists. Example notification body:

> "Time to take Metformin for your Type 2 Diabetes"

To enable this, call `POST /api/external/care-navigator/medication-condition-link` after the patient links a medication to a condition.

For journal reminder push notifications, the mobile app is responsible for scheduling local notifications (using device notification APIs). The backend does not push journal reminders automatically — the mobile app should use the `conditionId` and patient preference to schedule a daily/weekly device-local notification.

---

## Integration Notes

1. **Condition data ownership:** Conditions can be created by the mobile app (patient self-reports) or by the admin website. Both use the same `patient_conditions` table.

2. **ICD-10 codes:** Optional but recommended for better AI explainer accuracy. The mobile app can let patients enter their condition name in plain English; ICD-10 lookup is not required.

3. **Journal entry frequency:** No server-side limit on journal entry frequency, but the mobile app should prevent duplicate entries for the same calendar day (client-side guard).

4. **Explainer caching:** The server caches AI responses for 30 days. The mobile app should additionally cache the response in local storage for the session to avoid redundant API calls.

5. **Admin web panel:** Staff can view a patient's conditions at `/admin/patients/:userId` in the ConcordiaCare web app (read-only, no AI content shown).
