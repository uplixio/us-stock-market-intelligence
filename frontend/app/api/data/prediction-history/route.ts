import { dbUnavailable, getDataDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface PredictionRow {
  date: string;
  spy_direction: string | null;
  spy_probability: number | null;
  spy_predicted_return: number | null;
  qqq_direction: string | null;
  qqq_probability: number | null;
  qqq_predicted_return: number | null;
  model_accuracy: number | null;
}

export async function GET() {
  const db = getDataDb();
  if (!db) return dbUnavailable();

  const rows = db.prepare(
    'SELECT * FROM data_prediction_history ORDER BY date DESC LIMIT 100'
  ).all() as PredictionRow[];

  // Rebuild the legacy array format expected by /forecast/page.tsx
  const history = rows.reverse().map((r) => ({
    date: r.date,
    spy: {
      direction: r.spy_direction,
      probability: r.spy_probability,
      predicted_return: r.spy_predicted_return,
    },
    qqq: {
      direction: r.qqq_direction,
      probability: r.qqq_probability,
      predicted_return: r.qqq_predicted_return,
    },
    model_accuracy: r.model_accuracy,
  }));

  return Response.json(history);
}
