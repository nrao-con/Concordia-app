# Pharmacy messaging and receipt contract

Care sends patient messages to PharmFlow, not the Staff inventory service.

## Delivery state shown to patients

- One tick, **Sent**: Care has committed the message and its durable forwarding intent together. This does not prove pharmacy receipt.
- Two neutral ticks, **Received**: PharmFlow explicitly acknowledges the exact Care message.
- Two red ticks, **Read**: PharmFlow reports that staff read that exact message.
- **Delivery unconfirmed**: historical messages without delivery evidence. Never infer pharmacy read state from the existing `isRead` column; that column tracks the patient's local reading state.

New outbound messages use `deliveryStatus=sent`. Inbound replies continue to use the existing message webhook. Existing conversations are not backfilled with invented receipts.

## Outbound transport

`POST {PHARMFLOW_API_URL}/api/chat/message`

Server-only `x-api-key: PHARMFLOW_API_KEY`

`Idempotency-Key: message:<Care message ID>:pharmflow`

```json
{
  "pharmacyCode": "PHARMFLOWS",
  "patientName": "Isolated fixture",
  "patientPhone": "",
  "patientId": "<Care patient ID>",
  "message": "<message text>",
  "concordiaCareMessageId": 123
}
```

The same durable outbox row, payload, message ID and idempotency key are reused for transport retries. Immediate dispatch and scheduled retries use the same leased worker. A confirmed response must be JSON:

```json
{ "concordiaCareMessageId": 123, "status": "received" }
```

`status: "read"` is also accepted. A generic 2xx or an HTML response is NOT evidence of receipt. Such ambiguous successes stop automatic replay and retain reconciliation-required outbox state: the pharmacy may already have the message.

## Proposed partner callback supported by Care

`POST /api/external/pharmacy-message-receipts`

Requires the existing PharmFlow API credential in `x-api-key`. Staff and Concordia credentials do not authorize this endpoint.

```json
{
  "concordiaCareMessageId": 123,
  "patientId": "<Care patient ID>",
  "status": "read"
}
```

Only outbound messages belonging to that patient can be updated. Repeated callbacks are harmless. A late received callback cannot downgrade read. The result is persisted and pushed to connected Care clients; five-second conversation polling recovers missed browser events. PharmFlow must retry callbacks if Care is unavailable; Care does not yet have a remote receipt-history lookup contract.

## Verification and remaining dependency

Both configured PharmFlow hosts responded with JSON HTTP 400 to an authenticated empty-object POST to the exact send route. This verifies route reachability and validation response, not successful delivery or staff inbox visibility. GET on the same route returns an HTML frontend shell and is not an appropriate send-route health check.

No patient content, real messages, or live staff inbox items were created in this check. No remote app code is available in this workspace. PharmFlow must confirm its support for the exact-ID acknowledgement, idempotency and read callbacks above. These are Care-side capabilities, not a claim that the partner has implemented the proposed receipt contract.

Automated tests use isolated/mocked transports for receipt validation, stable retry identity, ambiguous acknowledgements, duplicate/late callbacks, patient mismatch and actual rendered tick states. A full signed-in live patient-to-pharmacy-to-patient exchange remains unverified.
