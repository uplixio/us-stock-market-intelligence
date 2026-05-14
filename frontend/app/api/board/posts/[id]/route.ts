import { NextRequest, NextResponse } from "next/server";
import { getPost, deletePost, getComments } from "@/lib/board-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = getPost(id);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const voterId = req.headers.get("x-voter-id") ?? undefined;
  const comments = getComments(id, voterId);

  return NextResponse.json({ post, comments });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = getPost(id);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  deletePost(id);
  return NextResponse.json({ ok: true });
}
