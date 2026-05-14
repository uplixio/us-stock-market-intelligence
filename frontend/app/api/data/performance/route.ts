import { dbUnavailable, getDataDb, parseJson } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDataDb();
  if (!db) return dbUnavailable();

  const row = db.prepare('SELECT data_json FROM data_performance WHERE id = 1').get();
  const data = parseJson(row);
  if (!data) return Response.json(null, { status: 404 });
  return Response.json(data);
}
