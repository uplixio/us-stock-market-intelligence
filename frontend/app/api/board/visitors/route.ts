import { recordVisit, getVisitorStats } from "@/lib/board-db";

export const dynamic = "force-dynamic";

export async function POST() {
  recordVisit();
  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json(getVisitorStats());
}
