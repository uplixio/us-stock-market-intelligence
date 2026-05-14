import { dbUnavailable, getDataDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDataDb();
  if (!db) return dbUnavailable();

  // Return ISO dates; frontend expects compact YYYYMMDD for legacy compat
  const rows = db.prepare(
    'SELECT date FROM data_risk_alerts ORDER BY date ASC'
  ).all() as { date: string }[];

  // Compact format for backward compat with risk/page.tsx CalendarPicker
  const dates = rows.map((r) => r.date.replace(/-/g, ''));
  return Response.json({ dates });
}
