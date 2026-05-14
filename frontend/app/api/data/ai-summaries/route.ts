import { dbUnavailable, getDataDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface AiRow {
  ticker: string;
  data_json: string;
}

export async function GET() {
  const db = getDataDb();
  if (!db) return dbUnavailable();

  const rows = db.prepare(
    'SELECT ticker, data_json FROM data_ai_summaries ORDER BY ticker ASC'
  ).all() as AiRow[];

  // Rebuild legacy dict format: { TICKER: { thesis, catalysts, ... } }
  const summaries: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      summaries[row.ticker] = JSON.parse(row.data_json);
    } catch {
      // skip malformed rows
    }
  }

  return Response.json(summaries);
}
