# Test Specification

> **WARNING — `surface.json` is stale.** `.pipeline/surface.json` is the untouched scaffold
> manifest (`_generated: true`, 3 routes: `GET /health`, `GET /trpc/users.findAll`,
> `GET /trpc/users.findById`; components `app-root`/`app-home`; `user-item-{id}` testids).
> None of those describe the CNC Quick Quote product. The authoritative surface used below is
> derived from `.pipeline/tasks.md` ("Surface contract") and the approved spec. The three
> scaffold routes are still covered — as **retirement** assertions (they must be gone or
> replaced). Backend agents must regenerate `surface.json`; when they do, re-derive the
> endpoint counts in this file.
>
> **Stack note.** The spec names FastAPI + React; the platform stack is fixed at
> Angular 19 + NestJS + tRPC + Prisma (`ARCHITECTURE.md`). Every case below is written against
> the Angular/NestJS surface. tRPC procedures are addressed as `GET|POST /trpc/<router>.<proc>`
> (queries are GET, mutations are POST).

## Coverage summary
- Total cases: 432 (263 API + 145 journey + 24 data-integrity)
- API endpoints covered: 52 / 52 (49 product endpoints from `tasks.md` + 3 legacy scaffold routes; `surface.json` itself only lists 3)
- User journeys covered: 19

Money is asserted in **integer cents** everywhere. Distances are **millimetres**. All error
bodies must match the uniform envelope `{ code, message, field }`.

Shared fixtures referenced throughout:
- `clean-part.dxf` — 100×50 mm rectangle of LINEs, perimeter 300 mm, 0 skipped entities.
- `bulge-arc.dxf` — LWPOLYLINE with bulge-encoded arcs, known perimeter **314.159 mm ± 0.5 mm**.
- `spline.dxf` — one LINE plus one SPLINE; SPLINE is not whitelisted → `skippedEntities: 1`.
- `empty.dxf` — valid DXF header, zero entities.
- `truncated.dxf` — file cut mid-`ENTITIES` section.
- `oversize.dxf` — 5000×5000 mm part, larger than any seeded sheet.
- `big.bin` — 25 MB file, exceeds default `maxUploadBytes`.
- Users: `admin@test.local` (ADMIN), `cust@test.local` (USER), `other@test.local` (USER, owns nothing).

## API tests

### `POST /trpc/auth.register`
- **Happy path**: (API-001) `{email:"New@Test.local", password:"Pa55word!23"}` on an empty `User` table → 200, body `{user:{id, email:"new@test.local", role:"ADMIN"}, accessToken, refreshToken}`; email persisted lower-cased. (API-002) Same call when ≥1 user exists → role `USER`. (API-003) Access token decodes with 15-min expiry; refresh token decodes with 30-day expiry and a `RefreshToken` row exists with a matching `jti` and `revokedAt: null`.
- **Validation failures**: (API-004) missing `email` → 422 `{code:"VALIDATION", field:"email"}`. (API-005) `email:"notanemail"` → 422 field `email`. (API-006) `password:"short"` (<8 chars) → 422 field `password`. (API-007) `password:null` → 422, not a 500.
- **Auth failures**: n/a (public).
- **Idempotency / edge cases**: (API-008) registering `CUST@test.local` when `cust@test.local` exists → **409** `{code:"EMAIL_TAKEN", field:"email"}` and no second row (case-insensitive uniqueness). (API-009) Two concurrent registrations of the same email → exactly one 200 and one 409; `User.count()` for that email is 1. (API-010) With Colossus-seeded accounts present, first-signup-becomes-admin does **not** fire — a new signup is `USER` (documents the resolution of the open question in `tasks.md`).

### `POST /trpc/auth.login`
- **Happy path**: (API-011) correct credentials → 200 with `accessToken`/`refreshToken` and `user.role`. (API-012) `email:"CUST@TEST.LOCAL"` (mixed case) logs in the same user.
- **Validation failures**: (API-013) empty body → 422 with `field` set.
- **Auth failures**: (API-014) known email + wrong password → **401**. (API-015) unknown email + any password → **401** with a byte-identical `message` and `code` to API-014 (no user enumeration). (API-016) response latency for API-014 and API-015 differs by <50 ms median over 20 paired runs (hashing runs on the unknown-email path too).
- **Idempotency / edge cases**: (API-017) logging in twice issues two distinct `jti` rows; both are valid until revoked.

### `POST /trpc/auth.refresh`
- **Happy path**: (API-018) valid refresh token → 200 with a **new** access token and a **new** refresh token; the old `jti` row has `revokedAt` set and the new `jti` row is active (rotation).
- **Validation failures**: (API-019) malformed/garbage token string → 401, not 500.
- **Auth failures**: (API-020) refresh token whose `jti` row has `revokedAt` set → 401 `{code:"TOKEN_REVOKED"}`. (API-021) token with an expired `exp` → 401. (API-022) token signed with a different `JWT_SECRET` → 401. (API-023) reusing an already-rotated refresh token → 401 and no new tokens minted.
- **Idempotency / edge cases**: (API-024) an *access* token presented to `refresh` → 401 (token type is checked).

### `POST /trpc/auth.logout`
- **Happy path**: (API-025) authenticated logout → 200; the presented refresh `jti` row has `revokedAt` non-null.
- **Validation failures**: n/a.
- **Auth failures**: (API-026) anonymous → 401.
- **Idempotency / edge cases**: (API-027) logout twice → second call is 200 (or 401) but never 500, and `revokedAt` is not overwritten with a later timestamp. (API-028) after logout, `auth.refresh` with that token → 401.

### `GET /trpc/auth.me`
- **Happy path**: (API-029) valid access token → 200 `{id, email, role}`; no password hash field present anywhere in the body.
- **Auth failures**: (API-030) anonymous → 401. (API-031) expired access token → 401 `{code:"TOKEN_EXPIRED"}` so the client can trigger silent refresh.

### `GET /trpc/drawings.list`
- **Happy path**: (API-032) `cust@test.local` with 2 drawings → 200, array of 2 with `id, filename, cutLengthMm, bboxWidthMm, bboxHeightMm, skippedEntities`.
- **Auth failures**: (API-033) anonymous → 401.
- **Idempotency / edge cases**: (API-034) `other@test.local` sees `[]` — never another user's drawings.

### `GET /trpc/drawings.byId`
- **Happy path**: (API-035) owner requests own drawing → 200 with `polylines` array non-empty.
- **Validation failures**: (API-036) unknown id → 404 `{code:"NOT_FOUND"}`.
- **Auth failures**: (API-037) anonymous → 401. (API-038) `other@test.local` requests `cust`'s drawing → **403** (not 404 leakage difference — assert the chosen convention is consistent across bends/quotes/orders).

### `POST /trpc/drawings.delete`
- **Happy path**: (API-039) owner deletes → 200; row gone; associated `BendLine` rows cascade-deleted.
- **Auth failures**: (API-040) anonymous → 401. (API-041) non-owner → 403 and the drawing still exists.
- **Idempotency / edge cases**: (API-042) deleting a drawing referenced by an existing `Quote` → either 409 `{code:"IN_USE"}` or soft-delete, but the quote's stored `pricingSnapshot`/`breakdown` remains readable afterwards.

### `POST /api/drawings` (multipart upload)
- **Happy path**: (API-043) `clean-part.dxf` → 201 `{id, filename, cutLengthMm: 300 ± 0.01, bboxWidthMm: 100, bboxHeightMm: 50, skippedEntities: 0}`; an object exists in MinIO at the persisted `objectKey`. (API-044) `bulge-arc.dxf` → `cutLengthMm` within **±0.5 mm of 314.159** — the bulge→arc-length regression guard; a chord-only (straight-segment) implementation must fail this. (API-045) `spline.dxf` → 201 with `skippedEntities: 1` and cut length counting only the LINE.
- **Validation failures**: (API-046) `empty.dxf` (zero entities) → **422** `{code:"DXF_PARSE"}` with a human-readable detail, **and no object written to storage** (assert bucket object count unchanged). (API-047) `truncated.dxf` → 422, no object stored. (API-048) `notes.txt` renamed to `.txt` → 422 `{code:"EXTENSION_NOT_ALLOWED", field:"file"}`, rejected **before** any storage call (assert the storage client was never invoked). (API-049) `big.bin` at 25 MB with `maxUploadBytes` 10 MB → 422 `{code:"FILE_TOO_LARGE"}` stating the limit, rejected before streaming. (API-050) empty multipart body / missing `file` part → 422. (API-051) after an admin sets `upload.allowedExtensions` to `["dxf","dwg"]`, a `.dwg` upload is accepted on the next request (settings-cache invalidation).
- **Auth failures**: (API-052) anonymous → 401 and nothing stored.
- **Idempotency / edge cases**: (API-053) uploading the same file twice creates two independent `Drawing` rows with distinct `objectKey`s. (API-054) when the S3 credential is `null`/`PLACEHOLDER_CONFIGURE_IN_SETTINGS` → **503** `{code:"SERVICE_UNCONFIGURED"}` naming the service, not a 500. (API-055) storage `putObject` throws mid-upload → 5xx envelope and **no** orphan `Drawing` row (transactional cleanup).

### `GET /api/drawings/:id/file`
- **Happy path**: (API-056) owner → 200 or 302 to a presigned URL that fetches the exact bytes uploaded (byte-for-byte compare with the fixture).
- **Auth failures**: (API-057) anonymous → 401. (API-058) non-owner → 403. (API-059) the presigned URL expires — refetching it after `expiresIn` returns 403 from MinIO (link is not permanent).

### `GET /trpc/bends.list`
- **Happy path**: (API-060) owner, drawing with 2 bends → 200 array of 2 with `x1,y1,x2,y2,angleDeg,direction`.
- **Auth failures**: (API-061) anonymous → 401. (API-062) non-owner's drawing → 403.

### `POST /trpc/bends.create`
- **Happy path**: (API-063) `{drawingId, x1:0,y1:0,x2:100,y2:0, angleDeg:90, direction:"up"}` → 200 with an id; row persisted. (API-064) boundary values `angleDeg:0` and `angleDeg:180` are both **accepted**. (API-065) `direction:"down"` accepted.
- **Validation failures**: (API-066) `angleDeg:-1` → 422 `{field:"angleDeg"}` stating the 0–180 range. (API-067) `angleDeg:181` → 422 field `angleDeg`. (API-068) `angleDeg:null` → 422, not 500. (API-069) `direction:"sideways"` → 422 `{field:"direction"}`. (API-070) `direction:"UP"` → 422 or normalised to `up` — assert the chosen behaviour is deterministic. (API-071) zero-length bend (`x1==x2 && y1==y2`) → 422.
- **Auth failures**: (API-072) anonymous → 401. (API-073) creating a bend on another user's drawing → 403 and no row created.
- **Idempotency / edge cases**: (API-074) after creating a bend, the stored DXF object's bytes are **unchanged** (bends are metadata only — re-download via API-056 and byte-compare).

### `POST /trpc/bends.update`
- **Happy path**: (API-075) move endpoints and change `angleDeg` to 45 → 200 with updated values persisted.
- **Validation failures**: (API-076) update to `angleDeg: 200` → 422 and the stored row is **unchanged**.
- **Auth failures**: (API-077) anonymous → 401. (API-078) non-owner → 403.

### `POST /trpc/bends.delete`
- **Happy path**: (API-079) owner deletes → 200; `bends.list` no longer returns it.
- **Auth failures**: (API-080) anonymous → 401. (API-081) non-owner → 403 and the bend still exists.
- **Idempotency / edge cases**: (API-082) deleting an already-deleted bend → 404, never 500.

### `GET /trpc/materials.listActive`
- **Happy path**: (API-083) authenticated → 200 with only `active: true` materials, each carrying `name, thicknessMm, costPerFtCents, sheetWidthMm, sheetHeightMm`.
- **Auth failures**: (API-084) anonymous → 401 (or 200 if declared public — assert the declared contract; default expectation is 401).
- **Idempotency / edge cases**: (API-085) after an admin sets a material `active:false`, the very next `listActive` call omits it (no stale cache). (API-086) `costPerFtCents` is an integer in the JSON body, never a float or string.

### `GET /trpc/materials.adminList`
- **Happy path**: (API-087) admin → 200 including inactive materials with an `active` flag.
- **Auth failures**: (API-088) anonymous → 401. (API-089) `cust@test.local` → **403**.

### `POST /trpc/materials.create`
- **Happy path**: (API-090) admin creates `{name:"6061 Al 3mm", thicknessMm:3, costPerFtCents:450, costMultiplier:1.2, sheetWidthMm:1250, sheetHeightMm:2500, perSheetCostCents:8900}` → 200; appears in `listActive`.
- **Validation failures**: (API-091) `costPerFtCents: 4.5` (non-integer) → 422. (API-092) negative `sheetWidthMm` → 422. (API-093) duplicate `name` → 409 or 422 per the declared contract.
- **Auth failures**: (API-094) anonymous → 401. (API-095) customer → 403 and nothing created.

### `POST /trpc/materials.update`
- **Happy path**: (API-096) admin flips `active:false` → 200; material disappears from `materials.listActive` immediately (API-085) but existing quotes referencing it still render.
- **Auth failures**: (API-097) customer → 403.
- **Idempotency / edge cases**: (API-098) changing `costPerFtCents` does **not** alter the `totalCents` of any pre-existing quote (snapshot immutability).

### `POST /trpc/materials.delete`
- **Happy path**: (API-099) admin deletes an unreferenced material → 200.
- **Auth failures**: (API-100) customer → 403.
- **Idempotency / edge cases**: (API-101) deleting a material referenced by a quote → 409 `{code:"IN_USE"}` (or soft-delete) — the quote must remain readable either way.

### `POST /trpc/quotes.create`
- **Happy path**: (API-102) `{drawingId(clean-part), materialId, quantity:10}` → 200 with `totalCents` (integer), `breakdown`, `nestingResult`, `sheetCount`, `utilisation`, `bendCount`, and a non-null `pricingSnapshot`. (API-103) Hand-computed table check: with `pricing = {setupFeeCents:2500, handlingCents:1000, costPerBendCents:150, minimumOrderCents:5000}`, material `costPerFtCents:400, costMultiplier:1.0, perSheetCostCents:8900`, part perimeter 300 mm, quantity 10, 1 bend/part, 1 sheet → `cutFt = 300*10/304.8 = 9.8425`, cut = `round(9.8425*400) = 3937`, sheets = `1*8900*1.0 = 8900`, bends = `10*150 = 1500`, subtotal = `2500+3937+8900+1000+1500 = 17837` → `totalCents == 17837`, and `breakdown` line items sum exactly to it. (API-104) **Minimum-order floor**: quantity 1, no bends, cheap material producing a raw subtotal of 3200 with `minimumOrderCents:5000` → `totalCents == 5000` and `breakdown` shows the floor was applied. (API-105) **Quantity scaling**: doubling quantity from 10→20 doubles cut and bend line items exactly, while `setupFee` and `handling` stay identical (charged once per order). (API-106) **Rounding at the boundary only**: quantity 3 of a part whose per-unit cost has repeating decimals → `totalCents` equals the Decimal-computed total rounded once, not the sum of three separately-rounded units.
- **Validation failures**: (API-107) `materialId` of an **inactive** material → 422 `{code:"MATERIAL_INACTIVE", field:"materialId"}`. (API-108) `quantity: 0` → 422 whose `message` **states the min/max limit**. (API-109) `quantity: -5` → 422 stating the limit. (API-110) `quantity: null` → 422, not 500. (API-111) `quantity: 100000` above `upload.quantityMax` → 422 stating the limit. (API-112) `quantity: 1.5` (non-integer) → 422. (API-113) `oversize.dxf` drawing (part exceeds sheet minus margins) → 422 `{code:"PART_TOO_LARGE"}` naming the sheet dimension. (API-114) part that fits raw sheet but **not** sheet-minus-margins → also 422 (margins are honoured). (API-115) unknown `drawingId` → 404. (API-116) another user's `drawingId` → 403.
- **Auth failures**: (API-117) anonymous → 401 and no quote row.
- **Idempotency / edge cases**: **Nesting engine** — (API-118) exact fit: part 100×50, sheet 200×100, spacing 0, margins 0 → `sheetCount:1`, 4 parts placed, `utilisation == 1.0`. (API-119) one-over-fit: quantity 5 into a 4-per-sheet layout → `sheetCount:2` and `utilisation` reflects the partial second sheet. (API-120) rotation-wins: a part that yields 3/sheet at 0° and 4/sheet at 90° → the 90° result is used and `nestingResult` records the chosen orientation. (API-121) spacing and margins are subtracted from usable area — increasing `machine.partSpacingMm` reduces parts per sheet. (API-122) **snapshot immutability**: create a quote, then change `pricing.costPerFtCents`; `quotes.byId` for the old quote returns the original `totalCents` and the original `pricingSnapshot`. (API-123) **settings-cache invalidation**: admin changes `machine.bedWidthMm`; the *next* `quotes.create` uses the new bed size. (API-124) performance: p95 of 50 sequential `quotes.create` calls < 3 s (geometry is pre-parsed; the quote path is arithmetic only).

### `GET /trpc/quotes.list`
- **Happy path**: (API-125) owner with 25 quotes, `?page=1` → 200 with the page slice plus `{total:25, page, pageSize}`. (API-126) `?page=2` returns a disjoint slice. (API-127) `?status=draft` filters. (API-128) `?sort=createdAt:desc` and `:asc` produce exactly reversed orders.
- **Validation failures**: (API-129) `?page=0` or `?page=-1` → 422 or clamped to 1 (assert the declared behaviour). (API-130) `?sort=totalCents;DROP TABLE` → 422 `{field:"sort"}`, never executed.
- **Auth failures**: (API-131) anonymous → 401.
- **Idempotency / edge cases**: (API-132) `other@test.local` sees only their own quotes (0 rows) — cross-tenant isolation.

### `GET /trpc/quotes.byId`
- **Happy path**: (API-133) owner → 200 with `breakdown`, `nestingResult`, `pricingSnapshot`, material name, drawing filename.
- **Auth failures**: (API-134) anonymous → 401. (API-135) non-owner → 403. (API-136) admin reading a customer quote → 200 (admins may read) or 403 — assert the declared contract.
- **Validation failures**: (API-137) unknown id → 404.

### `GET /trpc/shipping.listActive`
- **Happy path**: (API-138) with a `flat` method (costCents 1500, etaDays 5) and a `per_sheet` method (costCents 900, etaDays 2) and a quote with `sheetCount: 3` → 200 returning computed costs `1500` and `2700` respectively, each with `etaDays`.
- **Validation failures**: (API-139) missing/unknown `quoteId` → 422/404 rather than an unpriced list.
- **Auth failures**: (API-140) anonymous → 401.
- **Idempotency / edge cases**: (API-141) with **zero** active shipping methods → 200 with `[]` (the block is enforced at `checkout.createSession`, API-152) or a declared `{code:"NO_SHIPPING_CONFIGURED"}` — assert one, consistently. (API-142) deactivating a method removes it from the next `listActive` immediately.

### `GET /trpc/shipping.adminList`
- **Happy path**: (API-143) admin → 200 including inactive methods.
- **Auth failures**: (API-144) anonymous → 401. (API-145) customer → 403.

### `POST /trpc/shipping.create`
- **Happy path**: (API-146) admin creates `{name:"Ground", kind:"flat", costCents:1500, etaDays:5}` → 200 and appears in `listActive`.
- **Validation failures**: (API-147) `kind:"teleport"` → 422 `{field:"kind"}`. (API-148) negative `costCents` or `etaDays` → 422.
- **Auth failures**: (API-149) customer → 403.

### `POST /trpc/shipping.update`
- **Happy path**: (API-150) admin toggles `active:false` → 200; removed from `listActive` (API-142).
- **Auth failures**: (API-151) customer → 403.

### `POST /trpc/shipping.delete`
- **Happy path**: (API-152a) admin deletes an unused method → 200.
- **Auth failures**: (API-152b) customer → 403.
- **Idempotency / edge cases**: (API-152c) deleting a method referenced by an existing order → 409 or soft-delete; the order still renders its shipping name and cost.

### `POST /trpc/checkout.createSession`
- **Happy path**: (API-153) valid quote + active shipping method, Stripe stubbed to succeed → 200 `{sessionId, url}`; the Stripe call received `line_items` totalling `quote.totalCents + shippingCents`; **no `Order` row is created yet**.
- **Validation failures**: (API-154) unknown `quoteId` → 404. (API-155) missing/unknown `shippingMethodId` → 422. (API-156) inactive `shippingMethodId` → 422.
- **Auth failures**: (API-157) anonymous → 401. (API-158) another user's quote → 403 and no Stripe call made.
- **Idempotency / edge cases**: (API-159) **no active shipping methods configured** → 4xx `{code:"NO_SHIPPING_CONFIGURED"}` with a contact-the-company message, **no Stripe call**, nothing persisted (never an unpriced order). (API-160) Stripe client raises a timeout/connection error → **502** with a retry message and **zero** rows written to `Order`/`WebhookEvent`. (API-161) Stripe API key is `null`/placeholder → **503** `{code:"SERVICE_UNCONFIGURED"}` naming Stripe. (API-162) calling twice for the same quote creates two Stripe sessions but still zero orders; only the completed one can ever produce an order.

### `GET /trpc/checkout.orderBySessionId`
- **Happy path**: (API-163) after the webhook has run, polling with the session id → 200 with `{orderNumber, totalCents, receiptAvailable}`.
- **Validation failures**: (API-164) unknown session id → 404 or `{order: null}` (assert the declared polling contract — it must be distinguishable from "not yet processed").
- **Auth failures**: (API-165) anonymous → 401. (API-166) a different user polling someone else's session id → 403/404, never the order body.
- **Idempotency / edge cases**: (API-167) **race, browser-first**: poll *before* the webhook lands → a pending response (not 500); after the webhook fires, the same poll returns the order. (API-168) **race, webhook-first**: fire the webhook, then poll → order returned on the first poll. Both orderings converge on **exactly one** order row.

### `POST /api/webhooks/stripe`
- **Happy path**: (API-169) a `checkout.session.completed` event signed with the correct secret → 200; **exactly one** `Order` row created with `orderNumber` unique, `stripeSessionId` set, `subtotalCents`/`shippingCents`/`totalCents` matching the quote's `pricingSnapshot`, `status:"paid"`; one `WebhookEvent` row with the `stripeEventId`. (API-170) a PDF receipt object exists at `order.receiptObjectKey`.
- **Validation failures**: (API-171) event referencing an unknown quote → 200 (acknowledged so Stripe stops retrying) with no order created and the anomaly logged; assert no 500.
- **Auth failures**: (API-172) **tampered signature** (valid payload, mutated `Stripe-Signature`) → 400, **no order, no `WebhookEvent`**, rejection logged. (API-173) missing `Stripe-Signature` header → 400, no state change. (API-174) correctly-signed payload whose **body was mutated after signing** → 400 (proves verification runs on the raw body, not a re-serialised object).
- **Idempotency / edge cases**: (API-175) **replay**: post the identical signed event twice → 200 both times, exactly **one** `Order` row, one `WebhookEvent` row (unique `stripeEventId` constraint holds). (API-176) two concurrent deliveries of the same event → still exactly one order (DB-level unique constraint, not a check-then-insert race). (API-177) **raw-body ordering**: with global JSON body-parsing middleware installed, this route still verifies successfully — regression guard for the webhook router being registered first. (API-178) **Resend stubbed to throw** → 200, order created, receipt stored, and `order.emailError` is a non-null string; the confirmation flow is unaffected. (API-179) a `payment_intent.payment_failed` / declined-card event → 200, **no order**, and the source quote is untouched and still checkout-able. (API-180) PDF generation throws → the order still exists (payment is not lost); `receiptObjectKey` is null and the failure is recorded.

### `GET /trpc/orders.list`
- **Happy path**: (API-181) owner with 3 orders → 200 with `orderNumber, totalCents, status, createdAt`; `?page=`/`?status=` honoured.
- **Auth failures**: (API-182) anonymous → 401.
- **Idempotency / edge cases**: (API-183) `other@test.local` sees `[]`.

### `GET /trpc/orders.byId`
- **Happy path**: (API-184) owner → 200 with the quote breakdown, shipping method name/cost, and a receipt link.
- **Auth failures**: (API-185) anonymous → 401. (API-186) non-owner → 403.
- **Validation failures**: (API-187) unknown id → 404.

### `GET /trpc/orders.adminList`
- **Happy path**: (API-188) admin → 200 with orders from **all** users; `?page=`/`?status=` honoured.
- **Auth failures**: (API-189) anonymous → 401. (API-190) customer → 403.

### `GET /trpc/orders.adminById`
- **Happy path**: (API-191) admin reads any user's order → 200 including the customer email.
- **Auth failures**: (API-192) customer → 403.

### `GET /api/orders/:id/receipt`
- **Happy path**: (API-193) owner → 200 with `Content-Type: application/pdf`, body starting with the `%PDF-` magic bytes and non-zero length; the PDF text contains the order number and total.
- **Auth failures**: (API-194) anonymous → 401. (API-195) non-owner → 403. (API-196) admin → 200.
- **Validation failures**: (API-197) order whose `receiptObjectKey` is null → 404 `{code:"RECEIPT_UNAVAILABLE"}`, not 500.

### `GET /trpc/admin.getSettings`
- **Happy path**: (API-198) admin → 200 with `pricing`, `machine`, `upload`, `branding`, `contact`, `payment`, `shippingConfig` objects populated from the seed defaults.
- **Auth failures**: (API-199) anonymous → 401. (API-200) customer → 403.
- **Idempotency / edge cases**: (API-201) `payment` secrets come back **masked** (`sk_live_••••4242` shape) — assert no full secret substring appears anywhere in the body.

### `POST /trpc/admin.updatePricing`
- **Happy path**: (API-202) admin sets `{setupFeeCents:3000, costPerBendCents:200, handlingCents:1200, minimumOrderCents:6000}` → 200; `getSettings` reflects it; the next `quotes.create` uses the new values.
- **Validation failures**: (API-203) negative `setupFeeCents` → 422. (API-204) non-integer cents → 422.
- **Auth failures**: (API-205) customer → 403 and settings unchanged.

### `POST /trpc/admin.updateMachine`
- **Happy path**: (API-206) admin sets bed size, part spacing, margins, animation speed → 200 and applies to the next quote's nesting (API-123).
- **Validation failures**: (API-207) margins ≥ half the bed dimension → 422. (API-208) `animationSpeed <= 0` → 422.
- **Auth failures**: (API-209) customer → 403.

### `POST /trpc/admin.updateUploads`
- **Happy path**: (API-210) admin sets `{allowedExtensions:["dxf","dwg"], maxUploadBytes:5242880, quantityMin:1, quantityMax:500}` → 200 and applies to the next upload (API-051) and quote (API-111).
- **Validation failures**: (API-211) `quantityMin > quantityMax` → 422. (API-212) empty `allowedExtensions` → 422.
- **Auth failures**: (API-213) customer → 403.

### `POST /trpc/admin.updateBranding`
- **Happy path**: (API-214) admin sets company name, logo URL, primary/accent colours → 200; the public `branding.get` reflects it immediately.
- **Validation failures**: (API-215) `primaryColor:"notacolour"` → 422 `{field:"primaryColor"}`.
- **Auth failures**: (API-216) customer → 403.

### `POST /trpc/admin.updateContact`
- **Happy path**: (API-217) admin sets contact email/phone/address → 200 and `getSettings` reflects it.
- **Validation failures**: (API-218) invalid email → 422.
- **Auth failures**: (API-219) customer → 403.

### `POST /trpc/admin.updatePayment`
- **Happy path**: (API-220) admin writes `sk_test_...4242` → 200; the stored `AppSettings.payment` value in the DB is **not** the plaintext (assert the raw column bytes differ from the input and decrypt back to it via `APP_ENCRYPTION_KEY`). (API-221) read-back via `getSettings` is masked (API-201).
- **Validation failures**: (API-222) empty secret → 422.
- **Auth failures**: (API-223) customer → 403 and nothing written.
- **Idempotency / edge cases**: (API-224) with a rotated/wrong `APP_ENCRYPTION_KEY`, decryption fails cleanly → `health/deep` reports payment-key unhealthy and checkout returns 503, never a 500 stack trace. (API-225) submitting the masked value back unchanged does **not** overwrite the real secret with literal bullets.

### `GET /trpc/branding.get` (public)
- **Happy path**: (API-226) **anonymous** → 200 with `{companyName, logoUrl, primaryColor, accentColor}`.
- **Auth failures**: n/a — must **not** require auth.
- **Idempotency / edge cases**: (API-227) response contains no secrets, no contact PII beyond what branding declares, and no `payment` key.

### `GET /trpc/adminSettings.list` / `GET /api/admin/settings`
- **Happy path**: (API-228) admin → 200 listing every backing-service key (`postgresql`, `minio`, `llm`) **and** the five integration keys `MINIO_S3_API_BOTO3_API_KEY`, `POSTGRESQL_API_KEY`, `REDIS_API_KEY`, `RESEND_API_PYTHON_SDK_API_KEY`, `STRIPE_SDK_PYTHON_API_KEY`, each with a masked value and a `configured` boolean.
- **Auth failures**: (API-229) anonymous → 401. (API-230) customer → 403.
- **Idempotency / edge cases**: (API-231) a key set to `PLACEHOLDER_CONFIGURE_IN_SETTINGS` reports `configured: false`. (API-232) no full secret value appears in the response body.

### `POST /trpc/adminSettings.upsert` / `PATCH /api/admin/settings`
- **Happy path**: (API-233) admin upserts `{STRIPE_SDK_PYTHON_API_KEY:"sk_test_x"}` → 200; a `SystemSetting` row exists; `configured` flips to true; the config cache is invalidated so the **next** Stripe call uses it without a restart.
- **Validation failures**: (API-234) unknown key → 422 `{field:"key"}` (allow-list enforced). (API-235) empty value → 422.
- **Auth failures**: (API-236) anonymous → 401. (API-237) customer → 403 and no row written.
- **Idempotency / edge cases**: **`resolveConfig` precedence** — (API-238) env var set to a real value → env wins over the `SystemSetting` row. (API-239) env var absent → falls back to `SystemSetting`. (API-240) env var equals `PLACEHOLDER_CONFIGURE_IN_SETTINGS` → falls back to `SystemSetting`. (API-241) neither set → returns `null` and the consuming route raises `ServiceUnconfiguredError` → **503**, never 500. (API-242) upserting the same key twice updates in place (one row, `updatedAt` advanced).

### `GET /api/health`
- **Happy path**: (API-243) anonymous → 200 `{status:"ok"}` with no auth header required and no DB dependency (pure liveness — still 200 when Postgres is stopped).

### `GET /api/health/deep`
- **Happy path**: (API-244) anonymous → 200 reporting per-dependency status for **DB, Redis, S3, and payment-key decryptability**, all healthy on a fully-configured stack.
- **Validation failures**: n/a.
- **Auth failures**: (API-245) must remain unauthenticated (it is a deploy gate) — anonymous is 200, not 401.
- **Idempotency / edge cases**: (API-246) with Redis stopped → non-200 (503) and `redis: "unhealthy"` while the other three still report accurately. (API-247) with a bad `APP_ENCRYPTION_KEY` → `payment: "unhealthy"` (API-224). (API-248) responds within 5 s even when a dependency is hanging (per-check timeout), so the deploy gate cannot hang.

### Rate limiting (cross-cutting, applied to `POST /api/drawings`, `quotes.create`, `checkout.createSession`, `auth.login`, `auth.register`)
- **Happy path**: (API-249) requests below the configured threshold all succeed.
- **Validation failures**: n/a.
- **Auth failures**: n/a.
- **Idempotency / edge cases**: (API-250) exceeding the threshold on `auth.login` → **429** with a `Retry-After` header holding a positive integer seconds value and a `{code:"RATE_LIMITED"}` envelope. (API-251) same for `POST /api/drawings`, (API-252) `quotes.create`, (API-253) `checkout.createSession`. (API-254) after the window elapses (advance the clock / expire the Redis key) the next request succeeds again. (API-255) **authenticated** requests are keyed by user id — user A exhausting their bucket does not 429 user B on the same IP. (API-256) **anonymous** requests are keyed by client IP — two different IPs have independent buckets. (API-257) a rate-limited `checkout.createSession` persists nothing and makes no Stripe call. (API-258) with Redis unavailable, the limiter fails **closed** (503) or **open** (allows) per the declared policy — assert the declared one, and assert it never 500s.

### Legacy scaffold routes (from `surface.json` — must be retired)
- **Happy path**: (API-259) `GET /health` either 404s or 301/308-redirects to `/api/health`; it must not be a second, divergent health implementation.
- **Idempotency / edge cases**: (API-260) `GET /trpc/users.findAll` → 404 (the scaffold `users` router is removed; user listing, if needed, lives behind `admin`). (API-261) `GET /trpc/users.findById` → 404. If either is retained, it must be admin-guarded (403 for customers) and must not expose password hashes.

## UI / journey tests

Every page root must carry `data-flow="<id>"` and every interactive element a `data-testid`.
Each journey below asserts the `data-flow` value on landing.

### Journey: Signup and first-user admin
- **Steps**: (UI-001) Visit `/signup` → assert `data-flow="signup"` → type email + password → submit.
- **Expected outcomes**: (UI-002) redirected to `/quotes` for a `USER`; (UI-003) an ADMIN signup lands on `/admin`; (UI-004) the nav shows the user's email and an Admin link **only** for admins; (UI-005) reloading the page keeps the session (token persistence policy honoured).
- **Negative path**: (UI-006) duplicate email → inline error on the email field reading the server `message`, form stays on `/signup`, no navigation. (UI-007) password below the minimum → client-side inline error, submit button does not fire a network call. (UI-008) server 500 → a `Toast` error appears and the form is re-submittable.

### Journey: Login and role routing
- **Steps**: (UI-009) Visit `/login` (`data-flow="login"`) → enter customer credentials → submit.
- **Expected outcomes**: (UI-010) URL becomes `/quotes`; (UI-011) admin credentials on the **same** `/login` form land on `/admin` (no separate admin login exists — assert `/admin/login` 404s or redirects); (UI-012) a `?returnTo=` deep link is honoured after login.
- **Negative path**: (UI-013) wrong password → inline "invalid credentials" error, still on `/login`, no token stored; (UI-014) unknown email shows the **identical** message (no enumeration); (UI-015) six rapid failed logins surface the 429 message with the retry hint.

### Journey: Session refresh, logout, and guards
- **Steps**: (UI-016) Log in, expire the access token, then trigger any authenticated query.
- **Expected outcomes**: (UI-017) the client silently refreshes and retries; the user sees no interruption and no flash of `/login`; (UI-018) exactly one refresh call fires even when three queries 401 concurrently (single-flight).
- **Negative path**: (UI-019) refresh also fails (revoked) → redirected to `/login` and the in-memory token is cleared; (UI-020) `/account` → Logout → redirected to `/login`, and pressing Back does not restore an authenticated page; (UI-021) anonymous deep-link to `/quotes` redirects to `/login`.

### Journey: Quote wizard step 1 — DXF upload
- **Steps**: (UI-022) `/quote/new/upload` (`data-flow="quote-upload"`) → choose `clean-part.dxf` → upload.
- **Expected outcomes**: (UI-023) a progress indicator appears during upload; (UI-024) on success the parsed cut length (300 mm), bbox (100×50), and filename render; (UI-025) the Next control becomes enabled and navigates to `/quote/new/bends`.
- **Negative path**: (UI-026) `empty.dxf` → the 422 parse detail renders inline, Next stays disabled, the step does not advance; (UI-027) `notes.txt` → extension error naming the allowed extensions; (UI-028) `big.bin` → size error stating the limit; (UI-029) `spline.dxf` → a visible **skipped-entities warning** ("1 entity was skipped") so the user is not silently quoted a partial part; (UI-030) S3 unconfigured → a 503 service-unconfigured message, not a blank page.

### Journey: Quote wizard step 2 — bend editor canvas
- **Steps**: (UI-031) `/quote/new/bends` (`data-flow="quote-bends"`) → click-drag on the canvas to add a bend → select it → drag to move → rotate → set angle 90 and direction `up` → delete a second bend.
- **Expected outcomes**: (UI-032) each bend persists (reload the page and it is still drawn); (UI-033) selecting a bend sets `?bend=<id>` in the URL, and **deep-linking to `?bend=<id>` re-selects it**; (UI-034) bend lines render dashed orange and cut paths solid blue; (UI-035) hit-testing selects the nearest bend on click (squared-distance), and a click far from any bend deselects and clears `?bend=`; (UI-036) resizing the window rescales the drawing without clipping or aspect distortion (`ResizeObserver` + DPR), verified by comparing rendered part extents before/after resize; (UI-037) the canvas is crisp on a `devicePixelRatio: 2` viewport (backing store is 2× the CSS size).
- **Negative path**: (UI-038) setting angle 181 shows the 0–180 validation message and the stored bend is unchanged; (UI-039) a failed save shows a Toast and rolls back the optimistic canvas update.

### Journey: Quote wizard step 3 — configure material and quantity
- **Steps**: (UI-040) `/quote/new/configure` (`data-flow="quote-configure"`) → open the material select → pick a material → enter quantity 10 → Generate quote.
- **Expected outcomes**: (UI-041) only **active** materials are listed; (UI-042) advancing lands on `/quote/new/result`.
- **Negative path**: (UI-043) quantity 0 → inline message stating the min/max limit; (UI-044) quantity above max → same, stating the limit; (UI-045) empty quantity → Generate is disabled or shows a required-field error, never a 500; (UI-046) an oversize part → the `PART_TOO_LARGE` message names the sheet dimension and no quote is created.

### Journey: Quote wizard step 4 — result, work bed, laser animation
- **Steps**: (UI-047) Land on `/quote/new/result` (`data-flow="quote-result"`).
- **Expected outcomes**: (UI-048) the cost breakdown renders every line item (setup, cut, sheets, handling, bends) and the line items **sum to the displayed total**, formatted from integer cents; (UI-049) the work bed canvas draws the bed, sheet(s), and nested parts matching `nestingResult` (part count on screen equals `quantity`); (UI-050) sheet count and utilisation are displayed; (UI-051) the laser animation **auto-starts** — sample the canvas at t=0 and t=500 ms and assert the pixels differ; (UI-052) the URL reflects `?anim=running`; (UI-053) the **Print Bed** button toggles: click once → animation stops and **resets** to the start, `?anim=stopped`; click again → runs from the start, `?anim=running`; (UI-054) deep-linking to `?anim=stopped` loads without the animation running; (UI-055) animation pacing is delta-time based — under an artificially throttled frame rate the laser head reaches the same world position after the same wall-clock elapsed time (±10%), not the same frame count; (UI-056) with a 200-part nest, the measured frame interval stays under ~16.7 ms (60 FPS target) thanks to offscreen pre-rendering of static geometry.
- **Negative path**: (UI-057) navigating to `/quote/new/result` without a quote in progress redirects back to `/quote/new/upload` rather than rendering an empty canvas.

### Journey: Quotes list and detail
- **Steps**: (UI-058) `/quotes` (`data-flow="quotes-list"`) → change page, status filter, and sort → open a quote.
- **Expected outcomes**: (UI-059) each control writes `?page=`/`?status=`/`?sort=` into the URL; (UI-060) reloading the URL restores the exact same list state; (UI-061) `/quotes/:quoteId` (`data-flow="quote-detail"`) shows the breakdown, nesting summary, and a Checkout CTA.
- **Negative path**: (UI-062) zero quotes → an empty-state component (not a blank page or spinner); (UI-063) a network failure → an error state with a retry control; (UI-064) opening another user's quote id → a 403/not-found view, never their data.

### Journey: Checkout review → shipping → payment
- **Steps**: (UI-065) `/checkout/:quoteId/review` (`data-flow="checkout-review"`) → Continue → `/checkout/:quoteId/shipping` (`data-flow="checkout-shipping"`) → pick a method → Continue → `/checkout/:quoteId/payment` (`data-flow="checkout-payment"`).
- **Expected outcomes**: (UI-066) review shows material, quantity, and total matching `quotes.byId`; (UI-067) shipping lists each active method with its **computed** cost (flat, and `per_sheet × sheetCount`) and ETA days; (UI-068) the running total updates when a method is selected; (UI-069) payment redirects the browser to the Stripe hosted Checkout URL.
- **Negative path**: (UI-070) **no active shipping methods** → a blocking contact-the-company message and a disabled Continue; the user cannot reach `/payment` (assert no unpriced order is ever possible); (UI-071) Stripe returns 502 → a retry message with a working retry button, still on `/payment`, no order created; (UI-072) Stripe unconfigured → a 503 service-unconfigured message; (UI-073) deep-linking `/checkout/:someoneElsesQuote/review` → 403 view.

### Journey: Successful payment → order confirmation → receipt
- **Steps**: (UI-074) Complete Stripe test checkout with card `4242 4242 4242 4242` → land on `/orders/confirmation?session_id=...` (`data-flow="order-confirmation"`).
- **Expected outcomes**: (UI-075) the page polls by session id and, once the webhook lands, shows the **order number** and total; (UI-076) a receipt link downloads a PDF (`%PDF-` bytes) containing the order number; (UI-077) polling stops after success (assert no further requests after the order resolves); (UI-078) polling backs off and stops after the declared max attempts rather than hammering forever; (UI-079) reloading the confirmation URL shows the same single order (no duplicate created).
- **Negative path**: (UI-080) **declined card `4000 0000 0000 0002`** → no order is created, the source quote is still intact and re-checkout-able from `/quotes/:id`, and the user sees a payment-failed message; (UI-081) if the email send failed, the confirmation page still renders fully (the `emailError` is invisible to the customer but recorded server-side).

### Journey: Orders list and account
- **Steps**: (UI-082) `/orders` (`data-flow="orders-list"`) with `?page=`/`?status=` → open an order; (UI-083) `/account` (`data-flow="account"`).
- **Expected outcomes**: (UI-084) only the signed-in user's orders appear, newest first, with order number, total, and status; (UI-085) list state round-trips through the URL; (UI-086) `/account` shows the profile email and a Logout control.
- **Negative path**: (UI-087) zero orders → empty state; (UI-088) receipt link for an order with no receipt shows an unavailable message, not a broken download.

### Journey: Branding theming
- **Steps**: (UI-089) Load any page as an anonymous user.
- **Expected outcomes**: (UI-090) the company name and logo from `branding.get` render in the shell; (UI-091) CSS custom properties for primary/accent colour are set on the document root and a themed element's computed colour matches the configured value; (UI-092) after an admin changes the primary colour, a fresh load reflects it.
- **Negative path**: (UI-093) if `branding.get` fails, the app still boots with defaults (the `APP_INITIALIZER` must not block the app on a branding failure).

### Journey: Admin materials CRUD and deactivation propagation
- **Steps**: (UI-094) Admin at `/admin/materials` (`data-flow="admin-materials"`) → `?modal=new` opens the create modal → create a material → `?edit=<id>` opens the edit pane → toggle `active:false`.
- **Expected outcomes**: (UI-095) `?modal=new` and `?edit=<id>` are **deep-linkable** — loading those URLs directly opens the modal/pane; (UI-096) closing the modal clears the query param; (UI-097) the new material appears in the customer `/quote/new/configure` dropdown; (UI-098) after deactivation it **disappears** from that dropdown on the next load.
- **Negative path**: (UI-099) invalid field values show inline server validation with `field` mapped to the right input; (UI-100) `?edit=<unknownId>` shows a not-found state rather than a blank pane.

### Journey: Admin pricing, machine, and upload settings apply to the next quote
- **Steps**: (UI-101) `/admin/pricing` (`data-flow="admin-pricing"`) → change setup fee and minimum order → save; (UI-102) `/admin/machine` (`data-flow="admin-machine"`) → change bed size, spacing, margins, animation speed → save; (UI-103) `/admin/uploads` (`data-flow="admin-uploads"`) → change allowed extensions, max bytes, quantity min/max → save.
- **Expected outcomes**: (UI-104) each save shows a success Toast and the values persist across reload; (UI-105) the **next** customer quote uses the new pricing (total changes as computed); (UI-106) the next quote's nesting reflects the new bed/spacing (sheet count changes); (UI-107) the next upload enforces the new extension/size limits and the configure step states the new quantity min/max; (UI-108) the new animation speed changes the laser head's traversal rate.
- **Negative path**: (UI-109) `quantityMin > quantityMax` → inline validation, nothing saved; (UI-110) negative fee → inline validation.

### Journey: Admin business tabs (branding / contact / payment / shipping)
- **Steps**: (UI-111) `/admin/business` (`data-flow="admin-business"`) → click each tab.
- **Expected outcomes**: (UI-112) each tab is a **child route** with its own URL (`/admin/business/branding|contact|payment|shipping`) and is directly deep-linkable with the correct tab active; (UI-113) `branding` saves and the shell re-themes; (UI-114) `contact` saves and validates the email; (UI-115) `payment` shows the Stripe secret **masked** (`sk_live_••••4242`) with an explicit Replace flow — the full secret is never rendered in the DOM (assert via page content); (UI-116) `shipping` supports method CRUD and deactivating a method removes it from the customer shipping step.
- **Negative path**: (UI-117) saving the payment tab **without** touching the masked field does not overwrite the stored secret (re-read still decrypts to the original); (UI-118) an unknown tab segment → redirect to the default tab.

### Journey: Admin orders
- **Steps**: (UI-119) `/admin/orders` (`data-flow="admin-orders"`) with `?page=`/`?status=` → open `/admin/orders/:orderId` (`data-flow="admin-order-detail"`).
- **Expected outcomes**: (UI-120) orders from **all** customers are listed with the customer email; (UI-121) list state round-trips through the URL; (UI-122) the detail page shows the quote breakdown, shipping, and a working receipt download.
- **Negative path**: (UI-123) a customer deep-linking `/admin/orders` is redirected/403'd and never sees another customer's data.

### Journey: Admin settings — credentials and placeholder banner
- **Steps**: (UI-124) `/admin/settings` (`data-flow="admin-settings"`) on a stack where all integrations are unconfigured.
- **Expected outcomes**: (UI-125) one row per backing service (`postgresql`, `minio`, `llm`) and per integration (MinIO / S3 API (boto3), PostgreSQL, Redis, Resend API (Python SDK), Stripe SDK (Python)), each with a configured/unconfigured badge; (UI-126) a prominent banner reads exactly: "The following need credentials to activate: Stripe SDK (Python), Resend API (Python SDK), MinIO / S3 API (boto3), PostgreSQL, Redis."; (UI-127) entering a credential and saving flips that row's badge to configured and **removes it from the banner**; (UI-128) once all are configured the banner disappears entirely; (UI-129) saved values render masked, never in full.
- **Negative path**: (UI-130) a customer deep-linking `/admin/settings` → redirected to `/login` or a 403 view.

### Journey: Route manifest deep-linkability and guards
- **Steps**: (UI-131) For **every** route in the manifest (`/login`, `/signup`, `/`, `/quote/new`, `/quote/new/upload|bends|configure|result`, `/quotes`, `/quotes/:id`, `/checkout/:id/review|shipping|payment`, `/orders/confirmation`, `/orders`, `/account`, `/admin`, `/admin/materials`, `/admin/pricing`, `/admin/machine`, `/admin/uploads`, `/admin/business/branding|contact|payment|shipping`, `/admin/orders`, `/admin/orders/:id`, `/admin/settings`) navigate **directly** by URL as (a) anonymous, (b) customer, (c) admin.
- **Expected outcomes**: (UI-132) every authorised load renders its page root with the expected `data-flow` and no console errors; (UI-133) no route renders a blank body or a router "no match" view; (UI-134) query-param states (`?modal=`, `?edit=`, `?page=`, `?status=`, `?sort=`, `?bend=`, `?anim=`) all restore on direct load.
- **Negative path**: (UI-135) anonymous on any guarded route → redirected to `/login` (never a partial render of protected data); (UI-136) customer on any `/admin/*` route → redirected/403 view; (UI-137) an unknown path (`/nope`) → the SPA fallback serves the app shell (HTTP 200 with the app, not a server 404), and the app shows a not-found view; (UI-138) a request to `/api/nope` returns a JSON 404 and is **not** swallowed by the SPA fallback.

### Journey: Deployed-artefact smoke
- **Steps**: (UI-139) `docker compose up` from a clean volume, run migrations and seed, then load `/`.
- **Expected outcomes**: (UI-140) `/` is served by the built Angular bundle from the image (hashed asset filenames, no Vite/Angular dev-server HMR client in the page); (UI-141) the `app-ready` testid is present on the shell; (UI-142) `/api/health/deep` reports DB, Redis, S3, and payment-key all healthy; (UI-143) the seed is idempotent — running it twice leaves one `AppSettings` row (`id=1`), the same material count, and the same shipping-method count.
- **Negative path**: (UI-144) the scaffold's placeholder content is **gone** — the page contains none of `.colossus-acceptance.json`'s `reject_signatures` (`home-title">Users<`, `Loading...`, `Failed to load users.`); (UI-145) `.colossus-acceptance.json` `expect_text` has been filled in with real front-page copy and that text is actually present.

## Data integrity tests
- (DATA-001) `users.email` is stored lower-cased and has a unique index — inserting `A@B.com` after `a@b.com` fails at the DB level, not just in application code.
- (DATA-002) Password hashes are never stored in plaintext and never appear in any API response body or log line.
- (DATA-003) `RefreshToken.jti` is unique; rotation sets `revokedAt` on the old row and inserts a new active row — a user's active-token count does not grow unboundedly across refreshes.
- (DATA-004) Deleting a `User` cascades to `RefreshToken` (and leaves no orphan drawings/quotes/orders in a broken state per the declared FK policy).
- (DATA-005) Deleting a `Drawing` cascades to its `BendLine` rows; no orphan bends exist after any delete path.
- (DATA-006) `Quote.pricingSnapshot`, `Quote.breakdown`, and `Quote.nestingResult` are non-null on every persisted quote — a quote can never exist without the snapshot that prices it.
- (DATA-007) `Quote.totalCents`, `Order.subtotalCents`, `Order.shippingCents`, `Order.totalCents`, and every material/pricing cents column are **integers** in the database schema (no float/decimal columns for money).
- (DATA-008) `Order.totalCents == Order.subtotalCents + Order.shippingCents` for every order.
- (DATA-009) `Order.subtotalCents` equals the referenced quote's `totalCents` at creation time and stays equal after any later admin pricing change.
- (DATA-010) `Order.orderNumber` and `Order.stripeSessionId` are both unique at the DB level — a duplicate insert raises a constraint error rather than creating a second order.
- (DATA-011) `WebhookEvent.stripeEventId` is the primary key / unique — replayed events cannot double-insert, and this is enforced by the constraint, not by an application-level pre-check.
- (DATA-012) Every `Order` row has a corresponding `WebhookEvent` row — no order exists that was not created by a verified webhook (assert zero orders after a full checkout run where the webhook never fired).
- (DATA-013) A declined payment leaves the source `Quote` row byte-identical (same `status`, `totalCents`, `pricingSnapshot`) and creates no `Order`.
- (DATA-014) `AppSettings` has exactly **one** row with `id = 1` after seed, after re-seed, and after every settings update path.
- (DATA-015) `AppSettings.payment` is stored encrypted — the raw column value does not contain the plaintext secret substring, and it decrypts to the original with the correct `APP_ENCRYPTION_KEY`.
- (DATA-016) `SystemSetting.key` is the primary key — repeated upserts update in place, and `updatedAt` advances.
- (DATA-017) A failed DXF upload leaves **no** `Drawing` row and **no** storage object (checked by comparing row count and bucket object count before/after).
- (DATA-018) A failed `quotes.create` (any 422 path) leaves no `Quote` row.
- (DATA-019) A failed `checkout.createSession` (502/503 paths) leaves no `Order` and no `WebhookEvent` row.
- (DATA-020) `Order.emailError` is null on a successful send and a non-null string when Resend fails — and its presence never changes `Order.status`.
- (DATA-021) `BendLine.angleDeg` is always within `[0, 180]` and `direction` is always `up` or `down` for every persisted row (scan the whole table after the full E2E suite).
- (DATA-022) `Material.active = false` never mutates or deletes historical quotes that reference it.
- (DATA-023) Cross-tenant isolation invariant: for every `Drawing`, `Quote`, and `Order`, the `userId` matches the authenticated principal on every read path — verified by running the full customer API surface as `other@test.local` and asserting zero rows from `cust@test.local` leak.
- (DATA-024) Prisma migrations apply cleanly from an empty database and the seed is idempotent (running `migrate deploy` + seed twice yields identical row counts).

## Out of scope
- **Order status lifecycle beyond `paid`.** The spec lists an order `status` and shipping `etaDays` but never enumerates states or who transitions them. Assumed `paid` on webhook creation with no further transitions; fulfilment/shipped/cancelled transitions are untested because unspecified. *(Open question in `tasks.md`.)*
- **Quote expiry and re-pricing.** The spec guarantees snapshot immutability but is silent on whether quotes expire or can be re-priced after an admin pricing change. No expiry behaviour is asserted.
- **`MANAGER` role permissions.** The stack contract mints `ADMIN`/`MANAGER`/`USER`; the spec only describes admin and customer. `MANAGER` is treated as equivalent to `USER` and its distinct permissions are untested pending confirmation.
- **The provisioned `llm` service.** It has no consuming feature in the spec — only a configurable row on `/admin/settings` (covered by UI-125). No LLM behaviour is tested.
- **`POSTGRESQL_API_KEY` / `REDIS_API_KEY` semantics.** These are normally connection strings, not API keys. Only their presence/masking/`configured` badge is tested, not their content format.
- **SPLINE geometry accuracy.** SPLINE is outside the whitelist; it is asserted only to increment `skippedEntities` (API-045), not to be approximated or measured.
- **DWG and non-DXF CAD formats.** Only the extension allow-list mechanism is tested (API-051); no DWG parsing correctness is asserted.
- **Real Stripe/Resend/MinIO network calls.** All third-party calls are stubbed or run in Stripe test mode; live-account behaviour, real card networks, and real email deliverability are out of scope.
- **Multi-currency, tax, and discounts.** The spec defines a single integer-cent total with no tax or currency dimension.
- **Concurrent editing of the same drawing by two sessions.** The spec is silent on collaborative editing; last-write-wins is assumed and untested.
- **Accessibility, i18n, and browser matrix.** The spec states no a11y, localisation, or supported-browser requirements; E2E runs on the Playwright default browser only.
- **Load and soak testing.** Only the two stated performance targets are asserted — quote p95 < 3 s (API-124) and the 60 FPS animation target (UI-056). No sustained-load or concurrency-scaling testing.
- **`APP_ENCRYPTION_KEY` rotation procedure.** The failure mode is asserted (API-224, API-247) but no key-rotation/re-encryption workflow is specified, so none is tested.
