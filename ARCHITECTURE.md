# Architecture

## Requested stack
`enterprise` — Angular 19 + NestJS + tRPC + Prisma + PostgreSQL.

This platform's stack is fixed at the account/app level. Note: the technical
plan for this project (CNC Quick Quote) was authored against a different
stack (FastAPI + PostgreSQL backend, React + TypeScript SPA). Per the stack
contract, the platform's chosen stack (enterprise: Angular + NestJS + tRPC +
Prisma) takes precedence over the plan's named technologies — build the
plan's **features** (DXF parsing, nesting/pricing engine, bend editor,
Stripe checkout, admin console, etc.) on top of this Angular/NestJS/tRPC/
Prisma scaffold rather than introducing FastAPI/React.

## Status
Newly scaffolded — the project directory was empty (only `README.md`,
`.git/`, `.github/`) prior to this run.

## Where things live
- `frontend/` — Angular 19 app (standalone components, `app.component.ts`,
  `home/home.component.ts`), tRPC client wired via `TRPC_CLIENT` injection
  token in `app.config.ts`.
- `backend/` — NestJS app with `nestjs-trpc` for the tRPC layer
  (`src/users/users.router.ts`, `src/trpc/trpc.router.ts`) and a REST
  health controller (`src/health/health.controller.ts`). Prisma is the ORM
  (see `backend/prisma/`).
- `.pipeline/surface.json` — generated manifest of routes, components, and
  `data-testid` values. Downstream coder/test-spec/Playwright agents treat
  this as the authoritative surface contract; keep it in sync as routes and
  components are added.
- `.colossus-acceptance.json` — post-deploy render-gate contract
  (`ready_testid: app-ready`); `expect_text` must be filled in by the coder
  once the real front page content is known.
- `colossus.yaml` — build manifest for deploy agents (framework: angular,
  project `frontend`, output `dist/frontend/browser`; backend on port 3001).

## Next steps
1. Copy `.env.template` → `.env` (root) and `backend/.env.template` →
   `backend/.env` and fill in real values (DB connection string, JWT
   secret, etc.) — no template env files shipped with this scaffold, so
   create them from `backend/prisma/schema.prisma` datasource requirements
   and any NestJS config module in `backend/src/`.
2. Run `docker compose up` (see `docker-compose.yml`) to bring up Postgres
   and the app locally.
3. Run `npx prisma migrate dev` inside `backend/` once the datasource URL
   is configured, to create the initial schema.
4. Implement the CNC Quick Quote feature set (auth, DXF upload/parsing,
   bend editor, nesting + pricing engine, Stripe checkout, admin console)
   as NestJS routers/services and Angular routes/components, extending
   `.pipeline/surface.json` with every new route, component, and
   `data-testid` as it's added.

## Template source
`template-enterprise` from the scaffold-templates library (Angular 19 +
NestJS + tRPC + Prisma + PostgreSQL), copied directly into the project
root.
