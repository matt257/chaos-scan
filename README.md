# Revenue & Billing Chaos Scan

A simple tool that extracts atomic financial facts from CSV uploads or pasted text. Uses OpenAI for extraction and stores results in a Neon Postgres database.

## What This Tool Does

- Extracts individual financial facts from CSV or text data
- Identifies invoices, payments, subscriptions, discounts, and notes
- Outputs structured data with confidence scores
- Stores extraction results in a database for later viewing

## What This Tool Does NOT Do

- **No totals or aggregations** - Each fact is atomic
- **No recommendations or analysis** - Extraction only
- **No dashboards or visualizations** - Just a facts table
- **No inference of missing data** - If data is unclear, it outputs null or "unknown"

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Database**: Prisma + Neon Postgres
- **LLM**: OpenAI SDK (gpt-4o)
- **Deployment**: Vercel

## Local Development

### Prerequisites

- Node.js 18+
- A Neon Postgres database (free tier works)
- OpenAI API key (optional - mock extraction works without it)

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd chaos-scan
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your credentials:
   - `DATABASE_URL`: Your Neon Postgres connection string
   - `OPENAI_API_KEY`: Your OpenAI API key (optional)

4. Generate Prisma client and run migrations:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

### Testing with Sample Data

Use the example files in the `examples/` directory:
- `examples/sample.csv` - Sample CSV data
- `examples/sample.txt` - Sample text data

## Neon Setup

1. Create a free account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string from the dashboard
4. Add it to your `.env` file as `DATABASE_URL`

## Vercel Deployment

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add environment variables:
   - `DATABASE_URL`: Your Neon connection string
   - `OPENAI_API_KEY`: Your OpenAI API key
4. Deploy

Vercel will automatically run the build and deploy your app.

## Deploy DB Schema

**Important**: Vercel does not run database migrations automatically. After deploying to Vercel with a new Neon database, you must apply the schema manually.

Run from your local machine with `DATABASE_URL` pointing to your production Neon database:

```bash
# Preferred: apply migrations (tracks history)
npx prisma migrate deploy

# Fallback: push schema directly (if no migrations exist)
npx prisma db push
```

**Production workflow**:
1. Develop locally with `prisma migrate dev` (creates migration files)
2. Commit migration files in `prisma/migrations/`
3. Deploy to Vercel
4. Run `prisma migrate deploy` locally against production DATABASE_URL

**Why not automatic?** Prisma migrations require a direct database connection. Vercel build runs in an isolated environment without persistent DB access. Running migrations from your local machine (or CI) with the production DATABASE_URL is the standard pattern.

## Project Structure

```
chaos-scan/
├── app/
│   ├── api/scan/route.ts    # POST endpoint for scanning
│   ├── scan/[id]/page.tsx   # Scan results page
│   ├── page.tsx             # Home page with upload form
│   ├── layout.tsx           # Root layout
│   └── globals.css          # Global styles
├── lib/
│   ├── db/prisma.ts         # Prisma client singleton
│   ├── extraction/
│   │   ├── openai.ts        # OpenAI SDK integration
│   │   └── prompt.ts        # Extraction prompt
│   ├── normalize/
│   │   └── normalizeFacts.ts # Fact normalization & filtering
│   └── types.ts             # TypeScript types
├── prisma/
│   └── schema.prisma        # Database schema
├── examples/
│   ├── sample.csv           # Sample CSV data
│   └── sample.txt           # Sample text data
└── README.md
```

## Extraction Schema

Each extracted fact follows this structure:

```typescript
type Fact = {
  fact_id: string;
  fact_type: "invoice"|"payment"|"subscription"|"discount"|"note"|"unknown";
  entity_name: string|null;
  amount: { value: number|null; currency: string|null };
  date: { value: string|null; date_type: "issued"|"due"|"paid"|"failed"|"started"|"ended"|"unknown" };
  status: "paid"|"unpaid"|"failed"|"active"|"canceled"|"paused"|"unknown";
  recurrence: "one_time"|"monthly"|"quarterly"|"annual"|"unknown";
  source_type: "csv"|"pdf"|"image"|"text";
  source_reference: string;
  confidence: number; // 0.0–1.0
  notes: string|null;
};
```

## Hard Guardrails

1. **LLM is for extraction only** - Never infers missing data
2. **Uncertainty handling** - Outputs null or "unknown" when unsure
3. **Confidence threshold** - Facts with confidence < 0.6 are discarded
4. **No analysis** - No totals, recommendations, or dashboards

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run prisma:migrate` - Run database migrations (local dev)
- `npm run prisma:generate` - Generate Prisma client
- `npm run db:introspect` - Diagnose database schema issues

## Troubleshooting Production

If you see `The table public.Scan does not exist`:

### Step 1: Verify you're targeting the correct database

```bash
# Copy DATABASE_URL from Vercel dashboard (Settings > Environment Variables)
export DATABASE_URL="postgresql://..."

# Introspect the database
npm run db:introspect
```

### Step 2: Check the output

- **No tables found**: Migrations never ran. Run `npx prisma migrate deploy`
- **Tables exist but lowercase** (`scan` instead of `Scan`): Schema already handles this with `@@map`
- **_prisma_migrations missing**: Run `npx prisma migrate deploy`

### Step 3: Apply migrations to production

```bash
# With production DATABASE_URL set:
npx prisma migrate deploy

# Verify again:
npm run db:introspect
```

### Step 4: Debug endpoint (production)

Add `DEBUG_TOKEN` to Vercel env vars, then visit:
```
https://your-app.vercel.app/api/_debug/db?DEBUG_TOKEN=your-token
```

This returns JSON with current database, tables, and casing info.

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| No tables | Migrations not applied | `npx prisma migrate deploy` |
| Wrong database | Wrong DATABASE_URL in Vercel | Copy correct URL from Neon |
| Tables in wrong schema | Non-public schema | Ensure `?schema=public` in URL or use default |

## License

MIT
