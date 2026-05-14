import { dbUnavailable, getDataDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDataDb();
  if (!db) return dbUnavailable();

  const rows = db.prepare(
    'SELECT date FROM data_daily_reports ORDER BY date ASC'
  ).all() as { date: string }[];

  return Response.json({ dates: rows.map((r) => r.date) });
}
