# Staff inventory integration

## Current checkout connection

New Care shop orders now use Staff's stock-checked public-order endpoint, not the import webhook. See [the checkout contract and verification boundary](staff-checkout-integration.md). Earlier import-only descriptions below remain historical documentation for legacy orders. A verified new checkout may say “stock reserved”; legacy acknowledgements must not.

## Current catalog verification

Staff's updated catalog and revision endpoints now work. Preview was verified against the live Staff feed: both returned **173 visible products**, including **166 zero-stock products** and **7 stocked products**. All canonical IDs, names, prices, descriptions and quantities matched; revisions matched. Zero-stock products were discoverable through the Care search and detail endpoints.

Shop visibility is separate from purchase availability. Complete Staff snapshots persist `isShopVisible` independently of `isAvailable` and `stockCount`. Shop/search/details retain visible zero-stock products. Existing Out of stock rendering and purchase guards remain enforced; hidden, deleted or missing products become nonvisible, even if their stock was already zero. Migration `0021_staff_catalog_visibility.sql` adds one boolean column, defaults legacy rows to nonvisible until the authoritative refresh, and was applied to development.

All 333 tests across 34 files passed, as did TypeScript checking and the production build. Tests cover visible zero-stock imports, canonical identity preservation, replenishment, price/description edits via revision recovery without a browser reload, hidden/deleted products, and rendering the actual product card with no purchase action at zero stock. No Staff stock edits or real orders were used. The screenshot browser still showed the public sign-in landing page; these API/component checks do not verify the complete signed-in shop/order UI. Changes remain in Preview until published.

Older observations below document earlier deployment states; the earlier empty catalog/revision-404 blocker is no longer current. Reservation/payment and cancellation/refund/return/restock contracts remain unverified/unresolved as described.

## Ownership and safety

Staff at `https://concordia-staff.replit.app` owns the catalog, visibility, prices and stock. The Care database stores snapshots, not reservations. Local product IDs, local order-line IDs, and canonical Staff catalog IDs are separate. Only trusted backend code sends the shared Staff credential.

The Care shop/cart checks revision every 1,000 ms while visible, independently of SSE. It loads a full snapshot on entry, events, reconnection, focus and network restoration. Unchanged revisions do not reload the full catalog. Missing revision support triggers a visible warning and slower recovery from the same Staff catalog. OS-suspended/background apps do not provide one-second synchronization.

Empty Staff snapshots mean no products. Malformed/partial snapshots or failed requests are rejected; they never authorize another catalog. Backend inventory endpoints use no-store and update the snapshot before returning it. Cart and product-detail availability use local IDs from the current snapshot, not SSE catalog IDs.

## Order intake and callbacks

App OTC order requests and their `staff_order` outbox intents commit together. Imported/website orders do not automatically loop back to Staff. The same leased worker handles immediate attempts and retry. Payloads use source `concordia_care`, stable ID/order number, actual status, timestamps, validated quantities/prices and canonical `concordiaProductId`. Retry preserves the external ID and idempotency key. Failed Staff jobs remain available for operator reconciliation.

Care rechecks the current Staff snapshot and quantities on the server before saving a request. This is **not an atomic stock reservation or a payment**. Until Staff's central reservation/payment contract is documented and verified, Care presents these as order requests, not confirmed purchases. A Staff intake receipt proves intake only. Missing receipts remain unconfirmed even when there is no pending job. No client-supplied paid status is accepted; existing unverified staff payment displays must not claim “paid.”

`PATCH /api/external/orders/:externalOrderId/app-status` requires the Staff credential. The external ID is the immutable Care order ID sent in the webhook. Staff's `concordiaOrderNumber` is stored separately. Row/advisory locking and monotonic status updates make repeated callbacks safe. Callbacks do not change inventory or trigger order creation. Existing patient order queries refresh every ten seconds and SSE events invalidate them.

Existing protected Staff lookup/pickup and Concordia polling response fields remain available. Their original credential scopes remain separate.

## Earlier Staff-side observations and remaining journey verification

Earlier read-only probes during implementation, before Staff's updated feed:

- `GET /api/public/products` returned HTTP 200 with `[]`.
- `GET /api/public/inventory/revision` returned HTTP 404.

Publish/enable the Staff revision endpoint before claiming one-second missed-event recovery in the live integration. Confirm its revision changes for stock, price, visibility and deletion changes, with suitable browser SSE CORS support.

Staff clarified that transactional stock handling and duplicate-order protection already exist. However, `POST /api/public/webhooks/new-order` imports accepted upstream orders and may preserve shortages. Its acknowledgement is intake only, not an availability guarantee, proof of reservation or permission to charge. Do not require this import endpoint to behave like checkout. Verify the separate reservation/payment journey against an agreed contract; local fixture tests cannot establish that live contract.

An approved atomic checkout/reservation/payment contract is still needed before enabling confirmed purchases. An order-number acknowledgment is not proof of stock reservation or payment. No central cancellation, refund, return or restock transition contract was supplied. App cancellation does not imply Staff cancellation/refund/restock; contact the pharmacy. The app must not simulate these transitions by resending a new-order webhook or writing stock counts.

No real customer order or uncontrolled live-stock edit was used for verification. Signed-in shop/cart UI and real Staff stock reservation still require end-to-end verification after the Staff deployment.

## Verification evidence

- All 302 automated tests passed across 32 test files; TypeScript check and production build passed.
- Isolated transport/lifecycle fixtures cover all four inventory events, unchanged revision suppression, missed-event recovery on the 1,000-ms check, unavailable SSE, reconnect, foreground/focus/network recovery, teardown and stale-state reporting.
- Isolated order fixtures cover atomic order/intent rollback, separate canonical IDs, retry identity after a lost response, deduplication in a simulated central reservation service, terminal-order suppression, and status callback idempotency without stock writes. These are not live central-reservation tests.
- Running Preview returned HTTP 200 with `Cache-Control: no-store` for snapshot, revision proxy and catalog routes. Snapshot/catalog contained zero products, matching Staff's current empty response. Revision proxy reported `revisionAvailable: false`.
- Running Preview rejected an unauthenticated Staff callback with HTTP 401.
- A mobile screenshot of `/shop` displayed the expected public sign-in landing page. It did not verify the signed-in shop/cart UI.

Changes are in the development Preview, not published. This does not establish that Care, Staff and PharmFlow are fully synchronized.

## Current wire contract and timing (reviewed with Staff)

The Care backend currently sends:

```http
POST https://concordia-staff.replit.app/api/public/webhooks/new-order
Content-Type: application/json
X-API-KEY: <server-only configured Staff credential>
Idempotency-Key: order:42:staff
```

Illustrative fixture payload (not a submitted order):

```json
{
  "id": "42",
  "source": "concordia_care",
  "orderNumber": "CARE-EXAMPLE-42",
  "status": "pending",
  "createdAt": "2026-10-23T14:00:00.000Z",
  "updatedAt": "2026-10-23T14:00:00.000Z",
  "customerName": "Fixture Patient",
  "guestEmail": "fixture@example.invalid",
  "guestPhone": "fixture-only",
  "deliveryMethod": "pickup",
  "orderItems": [
    {
      "id": "101",
      "name": "Fixture product",
      "quantity": 2,
      "price": "5.00",
      "concordiaProductId": 7001
    }
  ]
}
```

`id` is the immutable Care order ID, item `id` is a Care line ID, and `concordiaProductId` is the canonical Staff product ID (number or string). Email is omitted if unavailable. New Care shop requests require a validated callback phone number, persisted as the order's `contactPhone` and sent to Staff as `guestPhone`; legacy/imported orders may lack it. Delivery requests also send `deliveryAddress`, and pickup requests send `scheduledPickupTime`. Price is the server-stored unit-price string. No payment or reservation authorization is included.

1. The server refreshes Staff inventory and validates quantities/prices. This read can race a later stock change.
2. The local pending order, items and original Staff outbox payload commit in one database transaction, before any Staff order POST.
3. The leased worker immediately attempts that persisted intent. A successful HTTP response with `orderNumber`, `staffOrderNumber` or `id` is recorded separately as the Staff intake reference. Missing/invalid acknowledgement leaves the request unconfirmed; the initial API response is HTTP 202 when no reference is saved.
4. **No payment is taken by this Care OTC order-request flow**, before or after acknowledgement. There is no central checkout/reservation call in this flow.
5. Retry reuses the persisted payload `id`, `orderNumber`, source and `Idempotency-Key: order:<Care ID>:staff`. It does not create a new local order or external identity. Client POST retries also reuse the client request key, scoped to the patient. A lost response can cause the same import to be delivered again; Staff duplicate protection must reconcile that same identity.

Do not add a central checkout plus a second independently identified import order. Any future checkout/import relationship must share an agreed authoritative order identity and responsibility for reservation. Care does not deduct stock locally.

## Cancellation / refund / return: unresolved contract proposal

There is **no agreed or implemented Staff outbound cancellation, refund or return endpoint in Care**. Do not invent a live URL or use `new-order` to cancel. Existing `POST /api/orders/:id/cancel` is an authenticated, ownership-checked Care cancellation request; for OTC it is not confirmation of Staff cancellation, refund or restock. The separate existing PharmFlow Rx cancellation contract is not a Staff OTC contract.

Proposed requirements for Staff agreement, not enabled endpoints:

- Separate explicit cancellation, refund and return operations against the existing immutable order identity, with stable per-operation idempotency keys. Staff must supply exact paths, request/response schemas and allowed state transitions.
- HTTPS and server-to-server authentication, scoped to the operation. Staff must approve whether the current backend-only shared credential is sufficient or dedicated scoped credentials/signatures are required. Never expose a Staff credential to the browser.
- Authenticate the requesting patient and check ownership in Care; Staff must enforce service/source ownership and valid order state. Refunds require explicit authorized staff/payment-service permission, payment reference, amount/currency limits and audit records; a patient status update must not authorize a refund.
- Staff/payment service alone decides reservation release, refund settlement and whether a returned item can be restocked. Status callbacks and local cancellation cannot release or replenish stock.
- Define rejection/partial-success semantics, response-loss reconciliation and authoritative confirmation. Leave the UI unconfirmed until the relevant operation is confirmed.

The implemented reverse status callback is `PATCH /api/external/orders/:externalOrderId/app-status` with Staff-only API-key authentication and body `{"appStatus":"ready","concordiaOrderNumber":"STAFF-EXAMPLE-42"}`. It updates order status/reference only; it authorizes no payment, refund or inventory mutation.

## Post-publication verification gate

A read-only recheck during this review still returned HTTP 404 for Staff's public revision endpoint. Publication/readiness is therefore not established. After Staff publishes the update, verify the actual signed-in shop/cart/order screens with isolated fixtures and mocked payment/outbound transports, without bypassing production authentication or creating real customer orders.

Required coverage: missed-event revision recovery, duplicate delivery after a lost response using the same order identity, insufficient stock including an intake acknowledgement that preserves a shortage, and repeated/out-of-order/authenticated versus unauthorized status callbacks. Verify that shortage/intake acknowledgement never enables a charge or a paid/reserved claim. The earlier automated fixtures are not a substitute for that signed-in journey. Cancellation/refund/return/restock remain unresolved until the contract is agreed.

## Order-driven refresh follow-through

Care now refreshes the authoritative Staff snapshot immediately after a local OTC submission attempt (including rejection) and on Staff order-status events. It does not calculate a local stock deduction. Both condition-based and advisor recommendations refresh Staff before reading products; advisor recommendations exclude non-Staff, unavailable and zero-stock products and are invalidated alongside the catalog.

Verification after these changes: 304 tests across 32 files passed; TypeScript check and production build passed. Preview restarted and returned no-store catalog/revision responses matching Staff (`[]` and revision unavailable). The public mobile landing page rendered without a runtime error; signed-in shop/order UI remains unverified. Staff's public catalog still returned `[]` and its revision endpoint HTTP 404. These changes are in Preview, not published.

The subsequent consumer audit also connected medication companion products, Health Chat product suggestions, the protected Staff inventory mirror and the website product mirror to the authoritative Staff refresh. Health Chat now excludes competing catalog sources explicitly. These changes passed TypeScript checking and all 310 tests across 32 files. Public Staff probes still returned an empty catalog and revision HTTP 404; publishing/populating the Staff source remains an external blocker, not something Care can replace with invented inventory.

## Pickup/delivery requests while payment is unavailable

The owner requires pickup/delivery requests only until payment is connected, with a mandatory callback phone so the pharmacy can contact the requester. Checkout now shows Review request, not a payment step. Phone validation is shared between browser and backend; new OTC requests require a formatted US/Canada number (10 digits or +1), a pickup time for pickup or an address for delivery. Validation establishes syntax, not ownership or whether a call will be answered. The order-specific phone never changes patient identity/profile phone. Staff intake and protected counter lookup responses use it; the Care confirmation and order detail show it.

The nullable `orders.contact_phone` addition preserves legacy/imported orders. Migration `0020_shop_order_contact_phone.sql` was applied to development only. No payment or local stock mutation was added. All 325 tests across 33 files, TypeScript checking and the production build passed for this change set. The signed-in UI and Staff display of the newly supplied fulfillment fields still need end-to-end verification; an import acknowledgement does not prove Staff renders those fields.
