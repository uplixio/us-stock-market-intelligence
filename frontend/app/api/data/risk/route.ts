import { dbUnavailable, getDataDb, parseJson } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const db = getDataDb();
  if (!db) return dbUnavailable();

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? 'latest';

  let row: unknown;
  if (date === 'latest') {
    row = db.prepare('SELECT data_json FROM data_risk_snapshot WHERE id = 1').get();
    if (!row) {
      // fallback: most recent dated row
      row = db.prepare(
        'SELECT data_json FROM data_risk_alerts ORDER BY date DESC LIMIT 1'
      ).get();
    }
  } else {
    row = db.prepare(
      'SELECT data_json FROM data_risk_alerts WHERE date = ?'
    ).get(date);
  }

  const data = parseJson(row);
  if (!data) return Response.json(null, { status: 404 });
  return Response.json(data);
}
