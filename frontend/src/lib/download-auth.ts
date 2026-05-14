import crypto from "node:crypto";

export const DOWNLOAD_COOKIE_NAME = "dl_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getPassword(): string | null {
  const raw = process.env.DOWNLOAD_PASSWORD;
  return raw && raw.trim() ? raw.trim() : null;
}

function getSecret(): string {
  return process.env.DOWNLOAD_SESSION_SECRET || getPassword() || "fallback-not-secure";
}

function expectedToken(): string {
  return crypto.createHmac("sha256", getSecret()).update("authorized").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyPassword(submitted: unknown): boolean {
  if (typeof submitted !== "string") return false;
  const pw = getPassword();
  if (!pw) return false;
  return safeEqual(submitted, pw);
}

export function issueCookie() {
  return {
    name: DOWNLOAD_COOKIE_NAME,
    value: expectedToken(),
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    },
  };
}

export function isAuthorized(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  return safeEqual(cookieValue, expectedToken());
}
