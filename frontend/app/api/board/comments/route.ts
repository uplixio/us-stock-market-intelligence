import { NextRequest, NextResponse } from "next/server";
import { createComment } from "@/lib/board-db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { post_id, parent_id, body: text, author_name } = body;

  if (!post_id || !text?.trim()) {
    return NextResponse.json({ error: "댓글 내용을 입력해주세요." }, { status: 400 });
  }

  const comment = createComment({
    post_id,
    parent_id: parent_id ?? null,
    body: text.trim(),
    author_name: author_name?.trim() || "익명",
  });

  return NextResponse.json({ comment }, { status: 201 });
}
