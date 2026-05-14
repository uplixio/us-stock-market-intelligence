import { NextResponse } from "next/server";
import { issueCookie, verifyPassword } from "@/lib/download-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = (body as { password?: unknown }).password;
  if (!verifyPassword(password)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { name, value, options } = issueCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(name, value, options);
  return res;
}
