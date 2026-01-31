-- AddColumn
ALTER TABLE "Fact" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'unknown';

-- AddColumn
ALTER TABLE "Fact" ADD COLUMN "clearingStatus" TEXT NOT NULL DEFAULT 'unknown';

-- AddColumn
ALTER TABLE "Fact" ADD COLUMN "rawAmountText" TEXT;
