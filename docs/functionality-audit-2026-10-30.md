# ConcordiaCare functionality audit — October 30, 2026

## Verdict and scope

The application builds, Preview runs, and the automated suite passes. This is
not a certification that every patient journey works end to end. Staff catalog
reads were checked in Preview and production. Signed-in patient screens,
real partner fulfillment, device push delivery and payments were not exercised.

No real orders, messages, inventory changes, patient edits, payment attempts,
database writes or publishing were performed as part of this audit.

## Executed checks

- `npm run check -- --pretty false`: passed.
- `npm test -- --reporter=dot`: 376 tests passed across 37 files.
- `npm run build`: passed with PostCSS and large-chunk warnings.
- Preview mobile screenshot: landing renders at 402 × 874.
- Browser navigation from Get Started to `/sign-in`: Clerk email/password and
  Google sign-in controls render; no page errors observed. No login performed.
- Preview manifest and service worker: HTTP 200.
- Preview private read endpoints for account, orders, medications, conditions,
  blister packs, reminders, pharmacy messages, alerts, caregiver patients,
  loyalty, notifications, conversations and Care Navigator: HTTP 401 signed out.
- Staff inventory and external health endpoints: HTTP 401 without a partner key.
- Preview inventory revision and snapshot: HTTP 200.
- Preview and published catalog compared with Staff's public catalog: each had
  288 products, 111 with positive stock and 177 with zero stock. All canonical
  Staff IDs, prices and stock counts matched. No zero-stock Care product was
  marked available. Counts describe the audit snapshot, not a permanent total.
- Read-only development and production database checks: partner outbox empty
  in both; no persisted order had a non-null central checkout state. Thus this
  database sample does not establish a successful real central checkout.

## Functionality evidence

| Area | Evidence | Limit |
| --- | --- | --- |
| Account and caregiver isolation | Authentication/identity/standalone-account regression tests pass; signed-out endpoints deny access | No real login, onboarding or caregiver-switch browser journey |
| Shop inventory | Live canonical identity, stock and price parity; zero-stock items retained | No live stock mutation performed |
| Inventory refresh/recovery | Inventory synchronization and missed-event recovery tests pass | Actual new-product/edit browser refresh not exercised signed in |
| Shop checkout | Mocked central checkout, duplicate/lost reply, insufficient-stock, price-error and persistence tests pass | No real order submitted or Staff-side phone display confirmed |
| Order status/cancellation | Callback, delivery and cancellation regression tests pass | Central cancellation/refund/restock contract remains unresolved |
| Prescriptions/refills | Submission, storage and partner reliability tests pass | Real pharmacy receipt/processing not exercised |
| Blister packs | Enrollment, patient and sync tests pass | No new remote enrollment created or signed-in calendar inspected |
| Pharmacy messages | Sent/received/read evidence, UI and callback tests pass | No real outgoing message, remote receipt or read event exercised |
| Care Navigator | Automated tests pass | Signed-in rendered recommendations not inspected |
| Health Chat | Both Home inquiry and saved-conversation routes exist; private endpoints protected | No authenticated live model response checked in this audit |
| Reminders and notifications | Protected read endpoints; code reviewed | Device delivery and exact-time triggering unverified; update gap below |
| PWA | Service worker and manifest served | Offline behavior, installation and background notifications unverified |

The 376-test count refers to Vitest. It is not evidence that all browser
end-to-end tests or every route interaction ran.

## Findings requiring attention

### 1. Reminder updates accept server-owned fields — high priority

The reminder PATCH route checks that the current reminder belongs to the
effective patient, but then passes the entire request body to storage. Storage
passes that object directly to the ORM update. There is no field allowlist
protecting `userId`, `id` or other server-owned fields at that boundary.

This is a code-confirmed input-validation gap, not a claim that another
patient's existing reminder was accessed. An isolated regression should
prove ownership cannot be reassigned and medication associations remain in
the authorized patient's scope. Do not test this using real patient records.

### 2. Preview Concordia integration errors

The running workflow repeatedly logged HTTP 502 on Concordia product sync and
pharmacy alerts. Staff shop catalog reads succeeded independently. Do not
describe the whole pharmacy integration as healthy just because shop reads
work. Preview alert freshness is not established; a zero-row patient sync
alone is not evidence of a failure or a successful meaningful import.

### 3. Published background delivery reliability needs monitoring

Production logs included a partner-outbox singleton failure reporting
`Authentication timed out`, and earlier generic worker failures. The current
outbox is empty, so this audit found no currently queued delivery backlog.
The log message does not establish which credential or connection caused the
failure; changing API credentials without diagnosis would be premature.

### 4. Pickup preference is local only

Care collects and saves a pickup preference, but the central checkout payload
does not forward it. A requested time is not Staff confirmation or a ready-time
promise. Forwarding requires an agreed Staff field and confirmation semantics.

### 5. Staff tracking token is stored but not used by the tracking proxy

Central checkout stores private tracking receipts. The existing
`/api/orders/:id/staff-tracking` proxy instead fetches Staff's public
order-number route without reading or using that receipt token. This is an
integration inconsistency; it is not proof that status callbacks fail or that
every remote tracking request fails. Verify the current Staff tracking
contract with isolated fixtures.

### 6. Central cancellation/refund/return/restock not integrated

These operations remain pharmacy-managed. Do not use the import webhook to
cancel and do not adjust stock locally. Online payment is deliberately absent;
pickup and delivery use collection/payment arrangements with the pharmacy.

### 7. Real signed-in and partner journey remains unverified

The rendered sign-in form is verified, not the success of sign-in. A dedicated
test patient and mocked outbound/payment transports are needed to verify
onboarding, profile edits, caregiver switching, checkout, callback phone in
Staff, messages, blister calendar, AI responses and notifications in the browser.
Do not bypass authentication on the running app to obtain screenshots.

### 8. Additional operational limitations

- Startup warns that signed fraud-event ingestion is disabled because its
  dedicated ingestion secret is not configured. This does not establish that
  all fraud controls are disabled.
- Client build main chunk is approximately 1.24 MB uncompressed, 341 KB gzip.
  This can affect initial load on slower phones; no network performance
  benchmark was performed.
- PostCSS emits an existing `from`-option warning; build still succeeds.

## Recommended order

1. Lock down reminder update fields with isolated ownership regression tests.
2. Diagnose the Concordia 502s and the background worker's timeout separately.
3. Agree and integrate pickup preference and token-based Staff tracking.
4. Run an isolated signed-in browser journey and confirm remote callback
   phone/receipt behavior.
5. Agree central cancellation/refund/restock semantics before exposing controls.

This audit made no application behavior changes and did not publish.
