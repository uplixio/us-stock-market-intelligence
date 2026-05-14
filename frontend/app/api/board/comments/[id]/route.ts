import { NextRequest, NextResponse } from "next/server";
import { softDeleteComment } from "@/lib/board-db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  softDeleteComment(id);
  return NextResponse.json({ ok: true });
}
