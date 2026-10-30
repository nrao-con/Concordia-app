# Concordia Patient ID — Specification

## Format

Every patient has a permanent **Concordia Patient ID** stored in the `concordia_id` column of the `users` table:

```
CP-000001  through  CP-999999
```

- Prefix: `CP-` (always uppercase)
- Suffix: 6-digit zero-padded integer
- Generated once at account creation; never changes

## Identity Block

The canonical patient data shape returned by the identity-block endpoint:

```json
{
  "concordiaId":  "CP-000001",
  "internalId":   "ce76a714-...",
  "name":         "John Smith",
  "firstName":    "John",
  "lastName":     "Smith",
  "dateOfBirth":  "1985-03-15",
  "phone":        "(718) 555-0123",
  "email":        "john@example.com",
  "address":      "123 Main St, Bronx NY 10456",
  "language":     "en",
  "loyalty": {
    "points":      250,
    "tier":        "bronze",
    "memberSince": "2024-01-15"
  },
  "usingApp":     true,
  "status":       "active"
}
```

## Resolution Endpoint

**GET** `/api/patient/identity-block?q=<query>`

Accepts any of the following as `q`:
- Concordia Patient ID — `CP-000042`
- Email address — `john@example.com`
- Phone number — `7185550123` or `(718) 555-0123`
- ConcordiaCare app UUID — `ce76a714-...`

**GET** `/api/patient/identity-block/:concordiaId`

Direct alias — equivalent to `?q=CP-XXXXXX`.

Both endpoints are protected by `X-API-KEY` (admin and staff tools only).

## Instructions for Agents

When communicating with any Concordia system:

1. **Always use `concordiaId` as the primary patient reference** — e.g. `CP-000042`
2. If you only have an email, phone, or UUID, resolve it first:
   ```
   GET /api/patient/identity-block?q=<email_or_phone_or_uuid>
   ```
   Then use the returned `concordiaId` for all subsequent calls.
3. Never invent or generate your own patient IDs. Only IDs issued by the app are valid.
4. The `internalId` (UUID) is the database primary key — use it for internal joins. Use `concordiaId` for display, search, and cross-system references.
