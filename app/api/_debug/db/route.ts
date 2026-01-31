import { NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("DEBUG_TOKEN");
  const expectedToken = process.env.DEBUG_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = new PrismaClient();

  try {
    // Get current database and schema
    const dbInfo = await prisma.$queryRaw<{ current_database: string; current_schema: string }[]>`
      SELECT current_database(), current_schema()
    `;

    // List all tables in the database
    const tables = await prisma.$queryRaw<{ table_schema: string; table_name: string }[]>`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `;

    // Check for specific table existence with different casings
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

    // Get column info for any scan-related table
    const columns = await prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (LOWER(table_name) = 'scan' OR LOWER(table_name) = 'upload' OR LOWER(table_name) = 'fact')
      ORDER BY table_name, ordinal_position
    `;

    return NextResponse.json({
      database_url_redacted: redactDatabaseUrl(process.env.DATABASE_URL),
      current_database: dbInfo[0]?.current_database,
      current_schema: dbInfo[0]?.current_schema,
      tables: tables,
      table_existence_checks: tableChecks[0],
      columns: columns,
      diagnosis: {
        has_migrations_table: tableChecks[0]?.prisma_migrations !== null,
        scan_table_casing: tableChecks[0]?.scan_quoted ? "PascalCase (Scan)" :
                          tableChecks[0]?.scan_lowercase ? "lowercase (scan)" : "NOT FOUND",
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error",
      database_url_redacted: redactDatabaseUrl(process.env.DATABASE_URL),
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
