# CNC Quick Quote

Self-serve quoting and ordering for laser-cut sheet metal parts.

A customer uploads a CAD drawing, marks bend lines on a canvas editor, picks a
material and quantity, and gets an itemised price computed from the drawing's
real cut length, how the parts nest on a sheet, the bend count, and the
workshop's pricing rules. They can then choose a delivery method, pay by card
through Stripe's hosted checkout, and download a PDF receipt. Staff run the
business from an admin console: materials, pricing, machine bed, upload limits,
delivery methods, payment credentials, and branding.

## Stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | Angular 19 (standalone components, signals), Canvas 2D |
| Backend   | NestJS 11 REST API under `/api` |
| ORM       | Prisma 6 |
| Database  | PostgreSQL |
| Storage   | MinIO / S3 (drawings + receipts) |
| Cache     | Redis (rate-limit counters; optional) |
| Payments  | Stripe hosted Checkout |
| Email     | Resend |

> The technical plan for this project was written against FastAPI + React. The
> platform stack is fixed at Angular + NestJS + Prisma (see `ARCHITECTURE.md`),
> so the plan's **features** were built on this stack instead. The DXF parser is
> a first-party TypeScript implementation — including bulge-arc → true arc
> length maths — because no Node equivalent of `ezdxf` exists.

## Layout

```
backend/          NestJS API
  prisma/         schema, migrations, essential seed
  src/
    auth/         JWT sessions, guards, RBAC
    dxf/          DXF parser (entity whitelist, bulge arcs, flattening)
    nesting/      row/column packer, both orientations
    pricing/      breakdown + total, integer cents
    drawings/     multipart upload, validate → parse → store
    bends/        bend-line CRUD, scoped to the drawing's owner
    quotes/       nest + price + pricing snapshot
    checkout/     Stripe session, webhook, order creation
    orders/       order reads, PDF receipt
    admin/        admin console API + runtime credentials
    integrations/ Stripe, Resend clients
frontend/         Angular SPA (nginx serves the build, proxies /api)
```

## Environment

Everything is read from the environment — no hostname, port or credential is
hardcoded. All services live in one namespace.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Signs access and refresh tokens |
| `APP_ENCRYPTION_KEY` | yes | Encrypts Stripe secrets at rest. **Rotating or losing this makes stored payment credentials undecryptable** — `/api/health/deep` reports it. Falls back to `JWT_SECRET` if unset. |
| `MINIO_ENDPOINT` / `S3_ENDPOINT` | yes | Object storage endpoint |
| `MINIO_ROOT_USER` / `S3_ACCESS_KEY` | yes | Object storage access key |
| `MINIO_ROOT_PASSWORD` / `S3_SECRET_KEY` | yes | Object storage secret key |
| `S3_BUCKET` | no | Bucket name (default `cnc-quick-quote`, created on first use) |
| `REDIS_URL` | no | Shared rate-limit counters. Without it, limits apply per instance. |
| `PUBLIC_BASE_URL` | no | Base for Stripe return URLs |
| `FROM_EMAIL` | no | Sender for the confirmation email |
| `PORT` | no | API port (default `3001`) |
| `COLOSSUS_ACCOUNTS_JSON` | yes | Platform-minted logins consumed by the seed |

Integration credentials (`STRIPE_SDK_PYTHON_API_KEY`, `STRIPE_WEBHOOK_SECRET`,
`RESEND_API_PYTHON_SDK_API_KEY`, `MINIO_S3_API_BOTO3_API_KEY`) resolve in this
order: environment variable → `SystemSetting` row written from **Admin →
Settings** → unconfigured. An unconfigured integration returns `503` from the
feature that needs it; nothing crashes and nothing is faked. Until Stripe is
configured, customers can quote but not buy.

## Running locally

```bash
docker compose up -d postgres              # Postgres on :5432

cd backend
npm install
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_development
npx prisma migrate deploy
COLOSSUS_ACCOUNTS_JSON='[{"role":"ADMIN","email":"admin@example.com","password":"<pick one>","login_path":"/login"}]' \
  node prisma/seed/seed.js
npm run start:dev                          # API on :3001, docs at /api/docs

cd ../frontend
npm install
npx ng serve                               # SPA on :4200, proxies /api to :3001
```

Sign in at `/login`. The first account to register on an empty database becomes
`ADMIN`; after that every signup is a customer. Start in **Admin → Materials**
and **Admin → Business → Shipping** — quoting needs at least one active material
and checkout needs at least one active delivery method. No sample materials,
orders or customers are seeded; every screen shows its empty state until real
data is entered.

## Health

- `GET /api/health` — liveness.
- `GET /api/health/deep` — database, object storage, cache, and whether the
  stored Stripe credential still decrypts.

## Tests

```bash
cd backend && npm test
```

Covers the DXF parser (including a bulge-arc fixture whose perimeter is exactly
100π, guarding against arcs being measured as chords), the nesting packer
(exact fit, overflow to a second sheet, rotation, oversize rejection), the
pricing engine (hand-computed tables, quantity scaling, minimum-order floor,
integer cents), the PDF receipt, and the email client's never-throw contract.
