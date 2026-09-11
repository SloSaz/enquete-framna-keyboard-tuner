"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  clearDashboardAuthCookie,
  setDashboardAuthCookie,
  verifyPassword,
} from "@/lib/dashboard-auth";
import { rateLimit } from "@/lib/rate-limit";

async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
}

export async function loginDashboardAction(
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!password || !password.trim()) {
    return { ok: false, error: "Access key is required" };
  }

  const ip = await clientIp();
  const limit = rateLimit(`dashboard_auth:${ip}`);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`,
    };
  }

  const isValid = verifyPassword(password.trim());
  if (!isValid) {
    return { ok: false, error: "Incorrect access key" };
  }

  await setDashboardAuthCookie();
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function logoutDashboardAction(): Promise<void> {
  await clearDashboardAuthCookie();
  revalidatePath("/dashboard");
}

export async function refreshDashboardAction(): Promise<void> {
  revalidatePath("/dashboard");
}
