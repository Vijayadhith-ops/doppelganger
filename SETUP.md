# DOPPELGANGER — Setup

## Requirements

- Node.js 22+
- pnpm

## Run locally

```bash
pnpm install
pnpm dev
```

The participant portal opens at `/`, projector mode at `/live`, and the admin login at `/admin/login`.

## Production configuration

Set `ADMIN_PASSWORD` as a secret environment variable. The application uses the `DB` D1 binding and applies the SQL migration in `drizzle/` during deployment.

## Seed data

- Participants: `DG-01` through `DG-20`
- Challenges: `MIRROR-01` through `MIRROR-04`
- Default grouping: five participants per challenge
- Round duration: 30 minutes

Do not commit real production passwords or generated participant session cookies.
