# AWS source-code handoff

This repository contains the application's current source snapshot, not a
completed AWS deployment. The existing Replit app is unchanged by this export.

## Included and excluded

Included: React client, Express server, shared schema, dependency lockfile,
tests, SQL migrations, integration specifications, audit findings and required
runtime images/audio.

Excluded: historical Git commits, actual environment secrets, patient/database
exports, uploaded conversations and screenshots, internal agent files,
node_modules, built output and browser traces. The two imported Concordia logo
assets remain under `attached_assets/` because the client imports them.

## Build and run

Use Node.js 22 LTS and a PostgreSQL database.

```sh
npm ci
npm run check
npm test
npm run build
NODE_ENV=production npm start
```

Install the full dependency set for the build. The server build keeps some
dependencies external, so the runtime needs installed production dependencies
as well as `dist/`. The Express process serves the built client and API together.
It binds to the configured `PORT`, default 5000. Place it behind HTTPS with
WebSocket and streaming support. EC2 or ECS with a load balancer are possible
targets; no AWS resources were provisioned by this source export.

Tests use synthetic fixtures and an isolated test-mode process, but some tests
need PostgreSQL. Point tests at a dedicated disposable database, never the
live patient database.

## Configure secrets outside Git

Use AWS Secrets Manager or another appropriately secured runtime secret store.
Do not commit secret values to this repository.

Review actual startup requirements in `server/index.ts`. Important settings
include:

- `DATABASE_URL`: AWS PostgreSQL connection, appropriate TLS and connectivity.
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`: matching current Clerk tenant.
- `VITE_CLERK_PUBLISHABLE_KEY`: frontend build-time configuration. Review the
  client bootstrap and any optional Clerk proxy configuration before building.
- `CONCORDIA_API_URL`, `CONCORDIA_API_KEY`.
- `PHARMFLOW_API_URL`, `PHARMFLOW_API_KEY`.
- `CONCORDIA_STAFF_WEBHOOK_KEY`: Staff backend credential for central checkout.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: retain the matching existing pair if
  preserving compatible push subscriptions; review frontend public-key usage.
- `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`: current AI
  client variable names. Replit-managed AI access is not made portable by
  copying these names. Configure an authorized provider endpoint/credential
  and verify model access from AWS before cutover.
- Optional fraud-event ingestion and other integration settings: inspect the
  source and configure only through the secure runtime/build environment.

`.env.example` is a historical reference and includes legacy Replit Auth
descriptions. It is not a complete or authoritative AWS configuration list.

The email transport currently uses `@replit/connectors-sdk` for Resend. AWS
does not automatically inherit that connector session. Adapt the transport
to an authorized standalone Resend connection or another approved mail service
and verify delivery before cutover. Do not claim email works just because
the server starts.

## Database and identity migration

No patient records are included here. Plan a separate encrypted database
backup/restore with appropriate access controls, auditability and recovery.
Retain patient IDs, Clerk subjects, order IDs, canonical Staff product IDs,
outbox identities, receipts and uniqueness constraints.

Review `shared/schema.ts`, migration SQL and Drizzle configuration before
initializing an empty AWS database. Do not assume incremental SQL files alone
are a complete base-schema installer. Do not blindly push schema changes to
a live database. Test a full restore and schema comparison first.

Do not run sample seed scripts against production.

Keep the existing Clerk tenant and account bindings unless a separate approved
identity migration is performed. Confirm AWS hostname allowlists, browser
origins, OAuth redirects, Clerk proxy/DNS configuration and patient access in
staging. Do not replace authentication to make the export run.

## Integration and cutover safety

- Staff remains authoritative for product visibility, quantities and prices.
- New Care shop checkout uses Staff's stock-checked endpoint and immutable
  external identity; do not submit a second import webhook or deduct locally.
- Pharmacy messages and prescription operations use their separate contracts.
- Payments are not connected; pickup/delivery use pharmacy collection
  arrangements. Central cancellation/refund/restock remains unresolved.
- Update agreed callback URLs to the AWS hostname and validate partner key
  scopes. Existing Replit URLs do not move automatically.
- Do not run independent Replit and AWS workers against cloned live queues:
  cloned database locks do not coordinate. Define a single worker owner and
  a controlled cutover to prevent duplicate outbound effects.
- Verify signed-in flows using isolated fixtures/mocked outbound transports,
  including missed inventory events, duplicates, insufficient stock, lost
  checkout replies and status/message callbacks.
- Verify HTTPS, service worker updates, push subscription behavior,
  health checks, logging, encrypted backups and rollback before traffic moves.

## Known gaps

Read `docs/functionality-audit-2026-10-30.md` and the checkout/message/inventory
contract documents. At audit time, all 376 automated tests, type checking and
the production build passed, but the full signed-in partner journey had not
been verified. The source handoff does not fix or close those findings.
