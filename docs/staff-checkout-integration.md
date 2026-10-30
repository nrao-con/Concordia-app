# Care → Staff catalog checkout

## Current scope

New Care-origin shop orders use `POST https://concordia-staff.replit.app/api/public/orders`.
This replaces the import webhook for new checkouts; Care does not call both.
Legacy orders and their original queued import payloads are not converted, replayed through checkout, or marked reserved.

Pickup/delivery and the mandatory callback phone remain. Staff's unpaid `collect_at_counter` enum is used for both fulfillment methods. No online payment is taken; delivery payment arrangements/fees require pharmacy confirmation.

The published endpoint was probed with an invalid empty-item delivery payload: JSON HTTP 400 `INVALID_ORDER`, without an order reference. No valid live order or live stock mutation was performed.

## Durable identity and delivery

Care commits order, canonical catalog lines and one `staff_checkout` outbox intent together before HTTP delivery.
The payload is persisted once. Its new external identity namespace is `care-checkout:<Care order number>`, where the Care order number is generated from a UUID.
The retry header is `Idempotency-Key: order:<Care database ID>:staff`.
Immediate submission and background retries use the same leased worker and per-order transaction lock.
Timeouts repeat the same immutable body/identity, never a new request.

Only the nested request body is sent, not Care's internal provenance metadata:

```json
{
  "customerName": "Isolated fixture",
  "customerPhone": "+12125550123",
  "fulfillmentType": "pickup",
  "paymentStatus": "collect_at_counter",
  "source": "concordia_care",
  "externalOrderId": "care-checkout:ORD-<UUID>",
  "items": [{ "productId": 7, "quantity": 2, "unitPrice": 4.25 }]
}
```

Delivery includes `deliveryAddress`. Backend credentials use the existing Staff key in `X-API-KEY`, never client code.
Product IDs are numeric canonical Staff IDs; repeated canonical IDs are grouped. Custom/name-only items are rejected.
Server snapshots verify stock/prices first; client-reviewed prices must still match, and Staff performs the final atomic stock check.
No local stock deduction occurs.

The supplied minimal Staff contract does not document phone-field rendering or scheduled pickup metadata. Care retains the callback phone and sends it as `customerPhone`; its appearance in Staff's actual order screen is not yet verified. Scheduled pickup remains in Care; it is not a promised fulfillment time or a newly invented Staff scheduling API.

## Confirmation and rejection

- HTTP 201 with a valid order reference and Staff order ID confirms central checkout; no `reservationConfirmed` property is expected.
- HTTP 200 `duplicate: true` confirms only a proven new checkout intent with its newly scoped external identity and valid existing reference.
- Historical import acknowledgements, generic success, malformed or mismatched responses never establish reservation.
- Ambiguous responses are stored as unconfirmed, without automatic replay merely to obtain a confirmation badge.
- `INSUFFICIENT_STOCK`, `PRODUCT_UNAVAILABLE`, `PRICE_CHANGED`, `PRICE_UNAVAILABLE`, `INVALID_ADDRESS`, `INVALID_SOURCE_KEY` and `SOURCE_NOT_AUTHORIZED` are definitive contract errors. Care stores rejection, does not retry/reprice automatically and preserves the cart for explicit customer review.
- Price changes require new agreement. Rejected intent keys are cleared only after definitive rejection; timeouts do not rotate keys.

The patient sees “Order received; stock reserved” only for explicit confirmed checkout. This is not payment, pharmacist approval or a delivery/pickup-time promise.
Pending/unconfirmed confirmation screens poll the authenticated patient-scoped order endpoint. Missed browser events can therefore recover persisted checkout results; status callbacks and inventory revision recovery retain their existing paths.

Tracking tokens and expiry are retained in a private receipt table, never on the public order object, in patient API JSON, or in logs. Private receipts cascade with intentional parent-order deletion.

## Unresolved contracts

Staff cancellation, stock release, refund, returns and restock remain unresolved. New checkout orders cannot be cancelled only in Care while leaving a Staff reservation active. Patients are directed to the pharmacy. No cancellation uses the new-order webhook.

## Verification boundary

Isolated/mocked tests cover pickup/delivery payloads, canonical identity, phone requirement, quantity validation, price rejection, insufficient stock, lost reply and duplicate retry without a second stock deduction, legacy migration isolation, private token persistence, callback non-promotion and cancellation safety. Existing revision/client recovery tests cover missed inventory events.

Type checking, full tests and build are verified in Preview. The screenshot browser is unauthenticated and shows the landing screen; the full signed-in customer journey and Staff's visible phone display remain unverified. Development schema changes are applied; production changes require the normal Publish flow.
