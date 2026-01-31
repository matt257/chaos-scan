-- AlterTable
ALTER TABLE "Scan" ADD COLUMN "executiveSummary" TEXT;

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "impactMin" DOUBLE PRECISION,
    "impactMax" DOUBLE PRECISION,
    "currency" TEXT,
    "rationaleJson" JSONB NOT NULL,
    "entityName" TEXT,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueEvidence" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,

    CONSTRAINT "IssueEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Issue_scanId_idx" ON "Issue"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueEvidence_issueId_factId_key" ON "IssueEvidence"("issueId", "factId");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvidence" ADD CONSTRAINT "IssueEvidence_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvidence" ADD CONSTRAINT "IssueEvidence_factId_fkey" FOREIGN KEY ("factId") REFERENCES "Fact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
