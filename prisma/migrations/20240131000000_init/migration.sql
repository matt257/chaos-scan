-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "extractionConfidence" TEXT,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "sourceType" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fact" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "factType" TEXT NOT NULL,
    "entityName" TEXT,
    "amountValue" DOUBLE PRECISION,
    "amountCurrency" TEXT,
    "dateValue" TEXT,
    "dateType" TEXT,
    "status" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Fact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fact_scanId_idx" ON "Fact"("scanId");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fact" ADD CONSTRAINT "Fact_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
