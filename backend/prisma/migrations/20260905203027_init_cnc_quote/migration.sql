-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MANAGER', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "company" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colossus_accounts" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "login_path" TEXT NOT NULL,
    "created_by" TEXT NOT NULL DEFAULT 'colossus',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colossus_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thicknessMm" DOUBLE PRECISION NOT NULL,
    "costPerFtCents" INTEGER NOT NULL,
    "costMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sheetWidthMm" DOUBLE PRECISION NOT NULL,
    "sheetHeightMm" DOUBLE PRECISION NOT NULL,
    "perSheetCostCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "cutLengthMm" DOUBLE PRECISION NOT NULL,
    "bboxWidthMm" DOUBLE PRECISION NOT NULL,
    "bboxHeightMm" DOUBLE PRECISION NOT NULL,
    "entityCount" INTEGER NOT NULL DEFAULT 0,
    "skippedEntities" INTEGER NOT NULL DEFAULT 0,
    "polylines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bend_lines" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "x1" DOUBLE PRECISION NOT NULL,
    "y1" DOUBLE PRECISION NOT NULL,
    "x2" DOUBLE PRECISION NOT NULL,
    "y2" DOUBLE PRECISION NOT NULL,
    "angleDeg" DOUBLE PRECISION NOT NULL,
    "direction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bend_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "bendCount" INTEGER NOT NULL,
    "sheetCount" INTEGER NOT NULL,
    "utilisation" DOUBLE PRECISION NOT NULL,
    "cutLengthMm" DOUBLE PRECISION NOT NULL,
    "nestingResult" JSONB NOT NULL,
    "breakdown" JSONB NOT NULL,
    "pricingSnapshot" JSONB NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'quoted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_methods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'flat',
    "costCents" INTEGER NOT NULL,
    "etaDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "shippingMethodId" TEXT,
    "shippingLabel" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "receiptObjectKey" TEXT,
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "pricing" JSONB NOT NULL,
    "machine" JSONB NOT NULL,
    "upload" JSONB NOT NULL,
    "branding" JSONB NOT NULL,
    "contact" JSONB NOT NULL,
    "payment" JSONB NOT NULL,
    "shippingConfig" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("stripeEventId")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "colossus_accounts_email_key" ON "colossus_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens"("jti");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "materials_active_idx" ON "materials"("active");

-- CreateIndex
CREATE INDEX "drawings_userId_createdAt_idx" ON "drawings"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "bend_lines_drawingId_idx" ON "bend_lines"("drawingId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_reference_key" ON "quotes"("reference");

-- CreateIndex
CREATE INDEX "quotes_userId_createdAt_idx" ON "quotes"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "orders_stripeSessionId_key" ON "orders"("stripeSessionId");

-- CreateIndex
CREATE INDEX "orders_userId_createdAt_idx" ON "orders"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bend_lines" ADD CONSTRAINT "bend_lines_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "drawings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "drawings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "shipping_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
