import { createHmac, timingSafeEqual } from "node:crypto";

async function getCookies() {
  const { cookies } = await import("next/headers");
  return cookies();
}

export const DASHBOARD_COOKIE = "framna_dashboard_session";
const MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

function getSecret(): string {
  return process.env.SESSION_SECRET || process.env.NOTION_PAT || "fallback-dashboard-secret";
}

const DEFAULT_PIN = "8521";

function getExpectedPassword(): string {
  const pass = process.env.DASHBOARD_PASSWORD;
  return pass && pass.trim().length > 0 ? pass.trim() : DEFAULT_PIN;
}

export function isDashboardProtected(): boolean {
  return true;
}

function signToken(timestamp: number): string {
  const secret = getSecret();
  const data = `auth:${timestamp}`;
  const hmac = createHmac("sha256", secret).update(data).digest("base64url");
  return `${timestamp}.${hmac}`;
}

function verifyToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [timestampStr, receivedHmac] = parts;
  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp)) return false;

  // Check expiration
  const now = Date.now();
  if (now - timestamp > MAX_AGE_SEC * 1000) return false;

  const secret = getSecret();
  const data = `auth:${timestamp}`;
  const expectedHmac = createHmac("sha256", secret).update(data).digest("base64url");

  const expectedBuf = Buffer.from(expectedHmac);
  const receivedBuf = Buffer.from(receivedHmac);

  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export function verifyPassword(inputPassword: string): boolean {
  const expected = getExpectedPassword();
  if (!expected) return true;

  const trimmedInput = inputPassword.trim();
  const inputBuf = Buffer.from(trimmedInput);
  const expectedBuf = Buffer.from(expected);

  if (inputBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(inputBuf, expectedBuf);
}

export async function checkDashboardAuth(urlParamKey?: string | null): Promise<boolean> {
  if (!isDashboardProtected()) return true;

  const expected = getExpectedPassword();
  if (urlParamKey && expected && urlParamKey.trim() === expected) {
    return true;
  }

  try {
    const cookieStore = await getCookies();
    const token = cookieStore.get(DASHBOARD_COOKIE)?.value;
    if (!token) return false;

    return verifyToken(token);
  } catch {
    return false;
  }
}

export async function setDashboardAuthCookie(): Promise<void> {
  const token = signToken(Date.now());
  const cookieStore = await getCookies();
  cookieStore.set(DASHBOARD_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearDashboardAuthCookie(): Promise<void> {
  const cookieStore = await getCookies();
  cookieStore.delete(DASHBOARD_COOKIE);
}
