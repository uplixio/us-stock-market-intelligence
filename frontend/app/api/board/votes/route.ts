import { NextRequest, NextResponse } from "next/server";
import { castVote } from "@/lib/board-db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { target_type, target_id, value, voter_id } = body;

  if (
    !["post", "comment"].includes(target_type) ||
    !target_id ||
    !voter_id ||
    ![1, -1].includes(value)
  ) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const score = castVote({ target_type, target_id, value, voter_id });
  return NextResponse.json({ score });
}
