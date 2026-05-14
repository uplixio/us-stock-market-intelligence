export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "us-stock",
    timestamp: new Date().toISOString(),
  });
}
