import { headers } from "next/headers";
import { getQuestions } from "./questions";
import { rateLimit } from "./rate-limit";
import { saveSubmission, ValidationError, type Submission } from "./answers";

export type SubmitResult =
  | { ok: true; responseId: string }
  | { ok: false; error: string; issues?: string[] };

export type IncomingSubmission = Submission & { hp?: string };

async function clientKey(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
}

export async function submit(payload: IncomingSubmission): Promise<SubmitResult> {
  // Bots fill every field they find; a human never sees this one.
  if (payload.hp) return { ok: true, responseId: "r_ignored" };

  const limit = rateLimit(await clientKey());
  if (!limit.ok) {
    return { ok: false, error: `Too many submissions. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` };
  }

  try {
    const questions = await getQuestions();
    const { responseId } = await saveSubmission(questions, {
      answers: payload.answers ?? {},
      other: payload.other ?? {},
      durationSec: payload.durationSec,
    });
    return { ok: true, responseId };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, error: "Some answers were rejected.", issues: error.issues };
    }
    console.error("submission failed", error);
    return { ok: false, error: "Could not save your response. Please try again." };
  }
}
