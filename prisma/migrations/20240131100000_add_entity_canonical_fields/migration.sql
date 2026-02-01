-- AddColumn
ALTER TABLE "Fact" ADD COLUMN "entityRaw" TEXT;

-- AddColumn
ALTER TABLE "Fact" ADD COLUMN "entityCanonical" TEXT;

-- Backfill: copy entityName to entityRaw for existing records
UPDATE "Fact" SET "entityRaw" = "entityName" WHERE "entityName" IS NOT NULL;

-- Backfill: copy entityName to entityCanonical for existing records (will be re-canonicalized by app)
UPDATE "Fact" SET "entityCanonical" = "entityName" WHERE "entityName" IS NOT NULL;
