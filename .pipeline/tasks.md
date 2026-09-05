# Pipeline Task Decomposition

## Summary
CNC Quick Quote is a self-serve quoting and ordering app for laser-cut sheet metal parts. A customer signs up, uploads a CAD drawing (DXF), annotates bend lines on a canvas editor, picks a material and quantity, and receives an instant itemised price built from parsed cut length, sheet nesting, bend count, and admin-configured pricing rules. The quote can then be taken through shipping selection and a hosted Stripe Checkout; a payment webhook is the sole creator of orders, which generate a PDF receipt and a confirmation email. An admin console manages materials, pricing, machine/bed settings, upload limits, shipping methods, branding/contact details, payment credentials, and all orders. **Stack note:** the plan was authored for FastAPI + React, but the platform stack is fixed at Angular 19 + NestJS + tRPC + Prisma + PostgreSQL (see `ARCHITECTURE.md`). All tasks below implement the spec's *features* on the scaffolded Angular/NestJS/tRPC/Prisma codebase — no FastAPI, no React, no Python services.

## Surface contract

### Frontend routes (Angular `app.routes.ts`, all lazy standalone components)
| Route | Guard | Purpose |
|---|---|---|
| `/login` | public | Email + password sign in (admins use the same form, redirected to `/admin` by role) |
| `/signup` | public | Registration; first ever user becomes `ADMIN` |
| `/` | auth | Dashboard / redirect to `/quotes` |
| `/quote/new` | auth | Quote wizard shell (child routes below) |
| `/quote/new/upload` | auth | Step 1 — DXF upload + parse result |
| `/quote/new/bends` | auth | Step 2 — bend editor canvas (`?bend=<id>` selects a bend) |
| `/quote/new/configure` | auth | Step 3 — material + quantity |
| `/quote/new/result` | auth | Step 4 — breakdown + work-bed canvas (`?anim=running\|stopped`) |
| `/quotes` | auth | Quote list (`?page=`, `?status=`, `?sort=`) |
| `/quotes/:quoteId` | auth | Quote detail + re-price/checkout entry |
| `/checkout/:quoteId/review` | auth | Material, quantity, total review |
| `/checkout/:quoteId/shipping` | auth | Active shipping methods with computed cost + ETA |
| `/checkout/:quoteId/payment` | auth | Creates Stripe session and redirects to hosted Checkout |
| `/orders/confirmation` | auth | Polls session id → order; shows order number + receipt link |
| `/orders` | auth | Customer order list (`?page=`, `?status=`) |
| `/account` | auth | Profile + logout |
| `/admin` | admin | Admin shell + nav |
| `/admin/materials` | admin | Material CRUD (`?edit=<id>`, `?modal=new`) |
| `/admin/pricing` | admin | Pricing settings form |
| `/admin/machine` | admin | Bed size, part spacing, margins, animation speed |
| `/admin/uploads` | admin | Allowed extensions, max bytes, quantity min/max |
| `/admin/business` | admin | Tab shell → `branding`, `contact`, `payment`, `shipping` child routes |
| `/admin/orders` | admin | All orders (`?page=`, `?status=`) |
| `/admin/orders/:orderId` | admin | Order detail + receipt |
| `/admin/settings` | admin | Backing-service + integration credential configuration |

Every navigable route is URL-addressable and carries a `data-flow` attribute on its page root (wizard steps, admin tabs, modals via `?modal=`, edit panes via `?edit=`, list state via query params).

### Backend surface (NestJS)
tRPC routers (mounted under `/trpc`, typed via `AppRouter`):
`auth` (register, login, refresh, logout, me) · `drawings` (list, byId, delete) · `bends` (list, create, update, delete) · `materials` (listActive, admin CRUD) · `quotes` (create, list, byId) · `shipping` (listActive, admin CRUD) · `checkout` (createSession, orderBySessionId) · `orders` (list, byId, adminList, adminById) · `admin` (getSettings, updatePricing, updateMachine, updateUploads, updateBranding, updateContact, updatePayment) · `branding` (public get) · `adminSettings` (list, upsert).

REST controllers (things tRPC cannot carry):
- `POST /api/drawings` — multipart DXF upload (auth, rate-limited)
- `GET /api/drawings/:id/file` — presigned/streamed object URL
- `GET /api/orders/:id/receipt` — PDF receipt download
- `POST /api/webhooks/stripe` — raw-body signature verification, registered before any body-parsing middleware
- `GET /api/health`, `GET /api/health/deep` — liveness and DB/Redis/S3/payment-key readiness
- `GET /api/admin/settings`, `PATCH /api/admin/settings` — service/integration credentials

### Entities
`User` · `RefreshToken` · `Material` · `Drawing` · `BendLine` · `Quote` · `ShippingMethod` · `Order` · `AppSettings` (singleton) · `WebhookEvent` · `SystemSetting` · `ColossusAccount` (already scaffolded).

## db_agent tasks
- [ ] Extend `backend/prisma/schema.prisma` `User`: keep `enum Role { USER MANAGER ADMIN }` and `role Role @default(USER)`; add `email` lower-cased unique index, and relations to `Drawing`, `Quote`, `Order`, `RefreshToken`.
- [ ] Add `RefreshToken` model — `id`, `jti @unique`, `userId` (FK → User, cascade), `expiresAt`, `revokedAt DateTime?`, `createdAt`; index on `userId`.
- [ ] Add `Material` model — `id`, `name`, `thicknessMm Float`, `costPerFtCents Int`, `costMultiplier Float @default(1)`, `sheetWidthMm`, `sheetHeightMm`, `perSheetCostCents Int`, `active Boolean @default(true)`, timestamps.
- [ ] Add `Drawing` model — `id`, `userId`, `filename`, `objectKey`, `sizeBytes Int`, `cutLengthMm Float`, `bboxWidthMm`, `bboxHeightMm`, `polylines Json`, `skippedEntities Int @default(0)`, `createdAt`; and `BendLine` model — `id`, `drawingId` (cascade), `x1 y1 x2 y2 Float`, `angleDeg Float`, `direction String` (`up`/`down`), timestamps.
- [ ] Add `Quote` model — `id`, `userId`, `drawingId`, `materialId`, `quantity Int`, `bendCount Int`, `sheetCount Int`, `utilisation Float`, `nestingResult Json`, `breakdown Json`, `pricingSnapshot Json`, `totalCents Int`, `status String @default("draft")`, `createdAt`; index on `(userId, createdAt)`.
- [ ] Add `ShippingMethod` model — `id`, `name`, `kind String` (`flat` | `per_sheet`), `costCents Int`, `etaDays Int`, `active Boolean @default(true)`; and `Order` model — `id`, `orderNumber @unique`, `userId`, `quoteId`, `shippingMethodId`, `stripeSessionId @unique`, `subtotalCents`, `shippingCents`, `totalCents`, `status`, `receiptObjectKey String?`, `emailError String?`, `createdAt`.
- [ ] Add `AppSettings` singleton model — `id Int @id @default(1)` with `Json` columns `pricing`, `machine`, `upload`, `branding`, `contact`, `payment`, `shippingConfig`, plus `updatedAt`; and `WebhookEvent` — `stripeEventId String @id`, `type`, `processedAt`.
- [ ] Add `SystemSetting` model — `key String @id`, `value String`, `updatedAt DateTime @updatedAt` (backs runtime credential configuration for postgresql, minio, llm and the five declared integrations).
- [ ] Generate the initial Prisma migration covering every model above (`npx prisma migrate dev --name init_cnc_quote`) and verify `npx prisma generate` succeeds.
- [ ] Extend `backend/prisma/seed/seed.js`: keep the existing `COLOSSUS_ACCOUNTS_JSON` → `ColossusAccount` + `User` materialisation (ADMIN/MANAGER/USER), then seed the `AppSettings` row (`id=1`) with working default pricing/machine/upload/branding/contact/shipping JSON, 3–4 sample active materials, and two shipping methods (one `flat`, one `per_sheet`). Seed must be idempotent (upserts only).

## backend_agent tasks
- [ ] Create `src/config/config.module.ts` + typed env schema (zod) for `DATABASE_URL`, `REDIS_URL`, `S3_*`, `JWT_SECRET`, `APP_ENCRYPTION_KEY`, `PUBLIC_BASE_URL`, `FROM_EMAIL`, and the five integration keys; add `src/common/errors` with a uniform `{ code, message, field }` envelope filter and matching tRPC error mapping.
- [ ] Create `src/config/config.service.ts` exporting `resolveConfig(key: string): Promise<string | null>` — reads `process.env[key]`; if the value is absent or equals `PLACEHOLDER_CONFIGURE_IN_SETTINGS`, falls back to the `SystemSetting` row for that key; returns `null` if neither is set. Cache with explicit invalidation on settings write.
- [ ] Implement `src/auth/` — bcryptjs hashing, access JWT (15 min) + refresh JWT (30 d) persisted as a `RefreshToken` `jti` row, `AuthGuard`/`current user` context for tRPC and REST, and a `RolesGuard`/`requireAdmin` producing 401 anonymous vs 403 wrong-role.
- [ ] Implement `auth` tRPC router — `register` (409 duplicate email, first user when `User.count() === 0` gets `ADMIN`, all later signups `USER`), `login` (401 with identical message/timing for unknown email and bad password), `refresh` (rotates jti, 401 on expired/revoked), `logout` (sets `revokedAt`), `me`.
- [ ] Implement `src/common/ratelimit/` — Redis fixed-window `RateLimit(bucket, limit, window)` guard/interceptor keyed by user id when authenticated else client IP, returning 429 with `Retry-After`; apply to upload, quote creation, checkout session creation, and auth routes.
- [ ] Implement `src/storage/storage.service.ts` — S3/MinIO client via `resolveConfig('MINIO_S3_API_BOTO3_API_KEY')` (+ endpoint/bucket settings), `putObject` and presigned `getObject`; throw `ServiceUnconfiguredError` → 503 when the key is null or still the placeholder.
- [ ] Implement `src/dxf/dxf.service.ts` — DXF parser with an entity whitelist (LINE, ARC, CIRCLE, LWPOLYLINE incl. bulge arcs, POLYLINE), flattening each entity to polylines, summing true arc length, computing bbox, and returning `ParsedGeometry` plus a `skippedEntities` count; empty/corrupt/zero-entity input raises a 422 parse error.
- [ ] Implement `POST /api/drawings` REST controller — auth + rate limit, validate extension against `settings.upload.allowedExtensions` and size against `maxUploadBytes` **before** streaming to storage, parse, and on success store the object and persist bbox/cut length/polylines; on parse failure return 422 and store nothing.
- [ ] Implement `bends` tRPC router — CRUD scoped to the owning customer's drawing; validate `0 <= angleDeg <= 180` and `direction in {up, down}` (422 otherwise); 401 anonymous, 403 on another user's drawing; never rewrite the stored DXF object.
- [ ] Implement `src/nesting/nesting.service.ts` — axis-aligned bbox row/column packer computing both 0° and 90° orientations and using the higher-density result; returns sheet count, per-part placements, and utilisation; rejects parts exceeding sheet dimensions minus margins.
- [ ] Implement `src/pricing/pricing.service.ts` — pure function over `(geometry, material, quantity, bendCount, sheetCount, pricingSnapshot)` returning a breakdown and integer-cent total: `total = max(minimumOrder, setupFee + cutFt × costPerFt + sheetCost + handling + bends × costPerBend)`, where `totalCutLength = partCutLength × quantity`, `totalBends = bendsPerPart × quantity`, `sheetCost = sheetCount × perSheetCost × material.costMultiplier`, mm → linear feet conversion, `Decimal` internally, rounded once at the boundary.
- [ ] Implement `materials` + `quotes` tRPC routers — `materials.listActive` returns active only; `quotes.create` validates the material is active and quantity is within admin min/max (422 stating the limit for null/zero/negative/out-of-range), runs nesting then pricing, and persists breakdown, nesting result, and `pricingSnapshot`; `quotes.list` (paged/filtered/sorted) and `quotes.byId` scoped to the owner.
- [ ] Implement `src/integrations/stripe.ts` — client module calling `resolveConfig('STRIPE_SDK_PYTHON_API_KEY')` (+ webhook secret), throwing `ServiceUnconfiguredError` → 503 when null/placeholder; exports `createCheckoutSession(quote, shippingMethod, urls)` and `constructEvent(rawBody, signature)` with Stripe unreachable/timeout mapped to 502.
- [ ] Implement `src/integrations/resend.ts` — client module calling `resolveConfig('RESEND_API_PYTHON_SDK_API_KEY')`, exporting `sendOrderConfirmation(order, pdfBase64)`; never throws to the caller — failures are returned/logged for `orders.emailError`.
- [ ] Implement `shipping` tRPC router (`listActive` with cost computed as flat or `perSheetCost × sheetCount`, plus ETA) and `checkout.createSession` — blocks with a contact-the-company error when no active shipping method exists, returns 502 and persists nothing when Stripe is unreachable.
- [ ] Implement `POST /api/webhooks/stripe` REST controller registered **before** any body-parsing middleware — verifies the signature against the raw body, rejects+logs bad signatures with no state change, dedupes on `WebhookEvent.stripeEventId`, and is the **only** creator of `Order` rows; generates the PDF receipt, stores it, and dispatches the confirmation email in a background task wrapped in try/catch that records `orders.emailError`.
- [ ] Implement `src/receipt/receipt.service.ts` (PDF receipt generation → storage object) and `orders` tRPC router + `GET /api/orders/:id/receipt` + `checkout.orderBySessionId` polling endpoint that converges on exactly one order regardless of webhook/browser ordering.
- [ ] Implement `admin` tRPC router behind `requireAdmin` — material and shipping-method CRUD (deactivation immediately removes items from customer lists) and settings PUTs for pricing, machine, uploads, branding, contact, and payment; Stripe/Resend secrets written encrypted (AES via `APP_ENCRYPTION_KEY`) and read back masked (`sk_live_••••4242`); settings-cache invalidation so machine/upload changes apply to the next quote.
- [ ] Implement `GET /api/admin/settings` (lists every backing-service key for `postgresql`, `minio`, `llm` **and** the integration keys `MINIO_S3_API_BOTO3_API_KEY`, `POSTGRESQL_API_KEY`, `REDIS_API_KEY`, `RESEND_API_PYTHON_SDK_API_KEY`, `STRIPE_SDK_PYTHON_API_KEY` with masked values + configured status) and `PATCH /api/admin/settings` (admin-only upsert of key/value pairs into `SystemSetting`, invalidating the config cache).
- [ ] Implement public `branding` tRPC query and `GET /api/health` + `GET /api/health/deep` (DB, Redis, S3, and payment-key decryptability), and update `.pipeline/surface.json` with every new route added by these tasks.

## ui_agent tasks
- [ ] Rewrite `frontend/src/app/app.routes.ts` as the central route manifest for every route in the Surface contract, using lazy standalone components, child routes for wizard steps and admin business tabs, and a `data.flow` id rendered as `data-flow` on each page root.
- [ ] Build `auth/` — `AuthService` state (access token in memory, refresh handling delegated to the API client), `authGuard` (redirects anonymous users to `/login`) and `adminGuard` (403 view / redirect for non-admins on `/admin/*`).
- [ ] Build `LoginPage` and `SignupPage` standalone components — reactive forms with validation, inline server-error display (duplicate email, bad credentials), and post-login role routing (ADMIN → `/admin`, otherwise `/quotes`).
- [ ] Build `BrandingProvider` (APP_INITIALIZER + service) that reads public branding and sets CSS custom properties for company name, logo, and primary/accent colours; wire the app shell layout + nav with an admin section visible only to admins.
- [ ] Build shared components — `Modal` (driven by `?modal=<name>`), `Toast`, `MaterialSelect`, `QuantityInput`, `CostBreakdown`, plus reusable empty/loading/error state components used by every list and detail page.
- [ ] Build `canvas/renderer.ts` — pure draw functions over one shared world→screen transform for bed, sheet, nested parts, cut paths (solid blue), bend lines (dashed orange), labels, and laser head.
- [ ] Build `canvas/canvas-viewport` — `devicePixelRatio` scaling plus `ResizeObserver` fit-to-viewport so resizing rescales without clipping or distortion.
- [ ] Build `canvas/laser-animation` — a single `requestAnimationFrame` loop with delta-time stepping (not frame count) at the admin-configured speed, with start/stop/reset, pre-rendering static geometry to an offscreen canvas and redrawing only the laser head and active segment per frame.
- [ ] Build `WorkBedCanvas` component — renders the nesting result and drives the laser animation; auto-starts on `/quote/new/result`, and the **Print Bed** button toggles run → stop + reset, reflected in `?anim=running|stopped`.
- [ ] Build `BendEditorCanvas` component — click-drag add, select, move, rotate, and delete bend lines with squared-distance hit-testing; selected bend reflected in `?bend=<id>`; angle and direction editing controls.
- [ ] Build the `QuoteWizard` shell with `UploadStep` (file picker, progress, parse errors, skipped-entity warning), `BendStep`, `ConfigureStep` (material + quantity with min/max messaging), and `ResultStep` (breakdown + work bed + checkout CTA).
- [ ] Build `QuotesListPage` (paging/status/sort from query params) and `QuoteDetailPage` (breakdown, nesting summary, checkout entry).
- [ ] Build `CheckoutReviewPage`, `CheckoutShippingPage` (methods with computed cost + ETA, blocked state when none are configured), and `CheckoutPaymentPage` (redirect to hosted Checkout, 502 retry message).
- [ ] Build `OrderConfirmationPage` (polls by session id, shows order number and receipt download, tolerant of either webhook/browser ordering) and `OrdersListPage` + `AccountPage`.
- [ ] Build admin pages — `MaterialsPage` (CRUD with `?edit=<id>` / `?modal=new`), `PricingPage`, `MachinePage`, `UploadsPage`.
- [ ] Build `BusinessLayout` with `BrandingTab`, `ContactTab`, `PaymentTab` (masked secret display + replace flow), `ShippingTab` (shipping-method CRUD), and `AdminOrdersPage` + `AdminOrderDetailPage`.
- [ ] Build `/admin/settings` page — one row per backing service (`postgresql`, `minio`, `llm`) and per integration (MinIO / S3 API (boto3), PostgreSQL, Redis, Resend API (Python SDK), Stripe SDK (Python)) with a configured/unconfigured badge and a credential form per entry; show a prominent banner listing everything still on placeholder credentials: "The following need credentials to activate: Stripe SDK (Python), Resend API (Python SDK), MinIO / S3 API (boto3), PostgreSQL, Redis."
- [ ] Add `data-testid` attributes to every interactive element and list/row across the pages above, keep `app-ready` on the shell, remove the scaffold's Users/home placeholder content, and update `.pipeline/surface.json` + `.colossus-acceptance.json` `expect_text` accordingly.

## service_agent tasks
- [ ] Build `frontend/src/app/api/trpc-client.ts` on the scaffolded `TRPC_CLIENT` token — typed `AppRouter` client pointed at `/api`, attaching the access-token header, with a 401 → silent refresh → retry → redirect-to-`/login` interceptor and uniform `{code, message, field}` error normalisation.
- [ ] Build `api/http-client.ts` for the non-tRPC REST surface — multipart drawing upload with progress, receipt download, and health checks.
- [ ] Wire the auth data layer — register/login/refresh/logout/me calls, token persistence policy, and `AuthService` state updates consumed by the guards.
- [ ] Wire the drawings + bends data layer — upload mutation feeding `UploadStep`, drawing query, and bend list/create/update/delete mutations with optimistic update for the canvas editor.
- [ ] Wire the materials + quotes data layer — active-material query, quote-create mutation surfacing 422 validation messages, and quote list/detail queries bound to `?page=`/`?status=`/`?sort=`.
- [ ] Wire the checkout + orders data layer — shipping methods query, create-session mutation with 502 handling, confirmation polling by session id with backoff and stop conditions, and order list/detail queries.
- [ ] Wire the admin data layer — settings get/update calls for pricing, machine, uploads, branding, contact, payment; material and shipping-method CRUD with cache invalidation so customer-facing lists refresh after deactivation.
- [ ] Wire the `/admin/settings` credential data layer — `GET /api/admin/settings` list (masked values + configured status) and `PATCH /api/admin/settings` upsert, plus the public branding fetch used by `BrandingProvider`.

## tester tasks
- [ ] Unit-test `pricing.service` against a hand-computed table including the minimum-order floor, quantity scaling of cut length and bends, once-per-order setup/handling fees, and integer-cent rounding at the boundary.
- [ ] Unit-test `nesting.service` for exact-fit, one-over-fit (forces a second sheet), rotation-wins (90° beats 0°), and part-larger-than-sheet rejection including margins.
- [ ] Unit-test `dxf.service` against fixture drawings — one clean part, one bulge-arc LWPOLYLINE with a known perimeter, one empty, one truncated — asserting cut length, bbox, and `skippedEntities`.
- [ ] API-test auth — 409 duplicate email, 401 bad password and unknown email (identical message), first-user-becomes-ADMIN, refresh rotation, 401 on revoked/expired refresh, logout revocation.
- [ ] API-test authorization — 401 anonymous on quote/upload/bend/checkout/admin routes and 403 for a customer hitting every admin route.
- [ ] API-test validation — 422 for inactive material, out-of-range/zero/negative/null quantity (message states the limit), bad bend angle or direction, oversize part, and unparseable DXF (with no stored object).
- [ ] API-test rate limiting — exceeding the configured threshold on upload/quote/checkout/auth returns 429 with `Retry-After`, and requests succeed again after the window resets.
- [ ] API-test the Stripe webhook — a valid signed fixture creates one order, a tampered signature is rejected with no state change, a replayed `stripeEventId` is deduped to a single order, and a Resend failure still yields a successful order with `emailError` recorded.
- [ ] API-test admin settings — masked secret read-back, encrypted write, `PATCH /api/admin/settings` upsert as admin (403 as customer), and `resolveConfig` env → `SystemSetting` → null precedence including the `PLACEHOLDER_CONFIGURE_IN_SETTINGS` fallback and the 503 `ServiceUnconfiguredError` path.
- [ ] E2E (Playwright) `quote-flow.spec` — signup → upload DXF → add bend → select material and quantity → generate quote → assert the breakdown → assert the canvas animates and the Print Bed button toggles it → checkout with Stripe test card `4242…` → confirmation shows the order number and serves the receipt; plus a declined-card run (`4000000000000002`) that creates no order and leaves the quote intact.
- [ ] E2E `auth.spec` + `routes.spec` — deep-link directly to every route in the manifest to prove URL addressability (wizard steps, admin tabs, `?modal=`, `?edit=`, `?page=`/`?status=`/`?sort=`, `?bend=`, `?anim=`) and that guards redirect anonymous users to `/login` and non-admins away from `/admin/*`.
- [ ] E2E `admin.spec` — admin logs in via `/login` and is routed to `/admin`; creates and deactivates a material and confirms it disappears from the customer dropdown; changes machine/upload settings and confirms they apply to the next quote; `/admin/settings` shows the placeholder banner and per-service configured badges.
- [ ] Deployment smoke — `docker compose up` from clean, the built Angular bundle is served (not a dev server), `/api/health/deep` reports DB, Redis, S3, and payment-key decryptability healthy, and Prisma migrations + seed run idempotently.

## Open questions
- **Stack conflict.** The spec names FastAPI + React + `ezdxf` + `reportlab`; the platform stack is fixed at Angular 19 + NestJS + tRPC + Prisma (`ARCHITECTURE.md`, `colossus.stack.json`). These tasks target the platform stack. The spec's core justification for Python — `ezdxf` resolving LWPOLYLINE bulge arcs to true arc length — has **no direct Node equivalent**, so `dxf.service` must implement bulge → arc-length maths itself (`bulge → included angle → radius → arc length`) or adopt a vetted DXF parser library. This is the highest-risk item in the build and the known-perimeter fixture is the only guard.
- **Splines.** The whitelist covers LINE/ARC/CIRCLE/LWPOLYLINE/POLYLINE; SPLINE is unlisted and would be silently skipped. Confirm splines should be counted in `skippedEntities` rather than approximated.
- **Roles.** Spec describes `admin` + `customer`; the stack contract mints `ADMIN`, `MANAGER`, `USER`. Tasks map `customer → USER` and leave `MANAGER` unused. Confirm whether `MANAGER` needs distinct permissions.
- **Seeded admin vs first-signup admin.** The spec says the first registered user becomes admin, but Colossus injects platform accounts (including ADMIN) at seed time, so `User.count()` is never 0 in a deployed environment. Confirm whether the first-user rule should key off "no ADMIN-role user exists excluding Colossus accounts" or be dropped.
- **`llm` deployment.** `postgresql` and `minio` map to declared integrations, but the provisioned `llm` service has no corresponding feature in the spec. It appears only as a configurable entry on `/admin/settings`; confirm whether any feature should consume it.
- **`POSTGRESQL_API_KEY` / `REDIS_API_KEY`.** These integrations are normally configured via `DATABASE_URL`/`REDIS_URL` connection strings, not API keys. Confirm whether the derived key names should hold full connection strings.
- **Shipping ETA and order status lifecycle.** The spec lists `etaDays` and an order status but never enumerates the statuses or who transitions them (admin? fulfilment?). Assumed `paid` on webhook creation with no further transitions.
- **Quote expiry / re-pricing.** `pricingSnapshot` guarantees immutability, but the spec does not say whether a quote ever expires or can be re-priced after admin pricing changes.
- **Animation speed units.** "Admin-configured animation speed" is unitless in the spec; assumed mm/second in world space.
