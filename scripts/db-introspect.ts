import { PrismaClient } from "@prisma/client";

function redactDatabaseUrl(url: string | undefined): string {
  if (!url) return "NOT SET";
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//*****:*****@${parsed.host}${parsed.pathname}`;
  } catch {
    return "INVALID URL FORMAT";
  }
}

async function main() {
  console.log("=== Database Introspection ===\n");
  console.log("DATABASE_URL (redacted):", redactDatabaseUrl(process.env.DATABASE_URL));
  console.log("");

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    // Get current database and schema
    const dbInfo = await prisma.$queryRaw<{ current_database: string; current_schema: string }[]>`
      SELECT current_database(), current_schema()
    `;
    console.log("Current Database:", dbInfo[0]?.current_database);
    console.log("Current Schema:", dbInfo[0]?.current_schema);
    console.log("");

    // List all tables
    const tables = await prisma.$queryRaw<{ table_schema: string; table_name: string }[]>`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `;
    console.log("=== Tables ===");
    if (tables.length === 0) {
      console.log("  (no tables found)");
    } else {
      tables.forEach(t => console.log(`  ${t.table_schema}.${t.table_name}`));
    }
    console.log("");

    // Check specific table existence
    const tableChecks = await prisma.$queryRaw<{
      scan_quoted: string | null;
      scan_lowercase: string | null;
      upload_quoted: string | null;
      upload_lowercase: string | null;
      fact_quoted: string | null;
      fact_lowercase: string | null;
      prisma_migrations: string | null;
    }[]>`
      SELECT
        to_regclass('public."Scan"')::text as scan_quoted,
        to_regclass('public.scan')::text as scan_lowercase,
        to_regclass('public."Upload"')::text as upload_quoted,
        to_regclass('public.upload')::text as upload_lowercase,
        to_regclass('public."Fact"')::text as fact_quoted,
        to_regclass('public.fact')::text as fact_lowercase,
        to_regclass('public."_prisma_migrations"')::text as prisma_migrations
    `;
    const checks = tableChecks[0];
    console.log("=== Table Existence Checks ===");
    console.log(`  public."Scan" (PascalCase): ${checks?.scan_quoted || "NOT FOUND"}`);
    console.log(`  public.scan (lowercase):    ${checks?.scan_lowercase || "NOT FOUND"}`);
    console.log(`  public."Upload":            ${checks?.upload_quoted || "NOT FOUND"}`);
    console.log(`  public.upload:              ${checks?.upload_lowercase || "NOT FOUND"}`);
    console.log(`  public."Fact":              ${checks?.fact_quoted || "NOT FOUND"}`);
    console.log(`  public.fact:                ${checks?.fact_lowercase || "NOT FOUND"}`);
    console.log(`  _prisma_migrations:         ${checks?.prisma_migrations || "NOT FOUND"}`);
    console.log("");

    // Diagnosis
    console.log("=== Diagnosis ===");
    const hasMigrations = checks?.prisma_migrations !== null;
    console.log(`  Migrations applied: ${hasMigrations ? "YES" : "NO"}`);

    if (!checks?.scan_quoted && !checks?.scan_lowercase) {
      console.log("  PROBLEM: No Scan table exists. Run: npx prisma migrate deploy");
    } else if (checks?.scan_lowercase && !checks?.scan_quoted) {
      console.log("  PROBLEM: Table is 'scan' (lowercase) but Prisma expects 'Scan' (PascalCase)");
      console.log("  FIX: Add @@map(\"scan\") to the Scan model in schema.prisma");
    } else if (checks?.scan_quoted) {
      console.log("  OK: Scan table exists with correct casing");
    }

    // Show columns if tables exist
    const columns = await prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (LOWER(table_name) = 'scan' OR LOWER(table_name) = 'upload' OR LOWER(table_name) = 'fact')
      ORDER BY table_name, ordinal_position
      LIMIT 30
    `;
    if (columns.length > 0) {
      console.log("");
      console.log("=== Column Sample ===");
      columns.forEach(c => console.log(`  ${c.table_name}.${c.column_name} (${c.data_type})`));
    }

  } catch (error) {
    console.error("ERROR:", error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
