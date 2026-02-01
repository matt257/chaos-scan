import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Debug endpoint to check database schema.
 * Protected by DEBUG_TOKEN environment variable.
 *
 * GET /api/_debug/schema?DEBUG_TOKEN=<token>
 *
 * Returns column information for the Fact table from information_schema.
 */
export async function GET(request: NextRequest) {
  const debugToken = process.env.DEBUG_TOKEN;
  const providedToken = request.nextUrl.searchParams.get("DEBUG_TOKEN");

  // Require DEBUG_TOKEN to be set and matched
  if (!debugToken) {
    return NextResponse.json(
      { error: "DEBUG_TOKEN not configured on server" },
      { status: 403 }
    );
  }

  if (!providedToken || providedToken !== debugToken) {
    return NextResponse.json(
      { error: "Invalid or missing DEBUG_TOKEN" },
      { status: 403 }
    );
  }

  try {
    // Query information_schema for Fact table columns
    const factColumns = await prisma.$queryRaw<
      Array<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>
    >`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Fact'
      ORDER BY ordinal_position
    `;

    // Get list of all tables
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    // Check for specific columns we need
    const columnNames = factColumns.map((c) => c.column_name);
    const expectedColumns = [
      "entityRaw",
      "entityCanonical",
      "direction",
      "clearingStatus",
      "rawAmountText",
    ];

    const missingColumns = expectedColumns.filter(
      (col) => !columnNames.includes(col)
    );

    // Check migration status
    let migrationStatus: Array<{ migration_name: string; finished_at: string }> = [];
    try {
      migrationStatus = await prisma.$queryRaw<
        Array<{ migration_name: string; finished_at: string }>
      >`
        SELECT migration_name, finished_at::text
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 10
      `;
    } catch {
      // _prisma_migrations table may not exist
    }

    return NextResponse.json({
      status: missingColumns.length === 0 ? "ok" : "schema_outdated",
      tables: tables.map((t) => t.table_name),
      factColumns: factColumns.map((c) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === "YES",
      })),
      expectedColumns,
      missingColumns,
      recentMigrations: migrationStatus.map((m) => ({
        name: m.migration_name,
        appliedAt: m.finished_at,
      })),
      recommendation:
        missingColumns.length > 0
          ? "Run: DATABASE_URL=\"<prod-url>\" npx prisma migrate deploy"
          : null,
    });
  } catch (error) {
    console.error("Schema debug error:", error);
    return NextResponse.json(
      {
        error: "Failed to query schema",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
