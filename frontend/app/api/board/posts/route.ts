import { NextRequest, NextResponse } from "next/server";
import { getPosts, createPost, getCategories } from "@/lib/board-db";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const categoryId = searchParams.get("category") ?? undefined;
  const sort = (searchParams.get("sort") ?? "hot") as "hot" | "new" | "top";
  const search = searchParams.get("q") ?? undefined;

  const posts = getPosts({ categoryId, sort, search });
  const categories = getCategories();

  return NextResponse.json({ posts, categories });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { category_id, title, body: postBody, author_name } = body;

  if (!category_id || !title?.trim() || !postBody?.trim()) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요." }, { status: 400 });
  }

  const post = createPost({
    category_id,
    title: title.trim(),
    body: postBody.trim(),
    author_name: author_name?.trim() || "익명",
  });

  return NextResponse.json({ post }, { status: 201 });
}
