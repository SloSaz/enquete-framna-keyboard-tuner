import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "survey_response";
const MAX_AGE_SEC = 2 * 60 * 60;

export type Session = { responseId: string; pageId: string };

// Signed so a client cannot point its session at somebody else's response row.
// SESSION_SECRET is optional; the integration token is a fine HMAC key and keeps
// deployment to a single secret. Rotating it just invalidates in-flight sessions.
function secret(): string {
  const value = process.env.SESSION_SECRET || process.env.NOTION_PAT;
  if (!value) throw new Error("SESSION_SECRET or NOTION_PAT required to sign sessions");
  return value;
}

const sign = (value: string) =>
  createHmac("sha256", secret()).update(value).digest("base64url");

function verify(signed: string): Session | null {
  const at = signed.lastIndexOf(".");
  if (at < 1) return null;

  const value = signed.slice(0, at);
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signed.slice(at + 1));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const [responseId, pageId] = value.split(":");
  return responseId && pageId ? { responseId, pageId } : null;
}

export async function readSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  return raw ? verify(raw) : null;
}

export async function writeSession(session: Session): Promise<void> {
  const value = `${session.responseId}:${session.pageId}`;
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
