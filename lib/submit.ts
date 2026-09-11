import { headers } from "next/headers";
import { createResponse, updateResponse, ValidationError, type Submission } from "./answers";
import { getQuestions } from "./questions";
import { rateLimit } from "./rate-limit";
import { clearSession, readSession, writeSession } from "./session";

export type SubmitResult =
  | { ok: true; responseId: string }
  | { ok: false; error: string; issues?: string[] };

export type IncomingSubmission = Submission & { hp?: string };

async function clientKey(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
}

async function upsert(
  payload: IncomingSubmission,
  { complete }: { complete: boolean },
): Promise<SubmitResult> {
  // Bots fill every field they find; a human never sees this one.
  if (payload.hp) return { ok: true, responseId: "r_ignored" };

  const submission: Submission = {
    answers: payload.answers ?? {},
    other: payload.other ?? {},
    durationSec: payload.durationSec,
  };

  try {
    const questions = await getQuestions();
    const session = await readSession();

    if (session) {
      await updateResponse(session.pageId, questions, submission, { complete });
      if (complete) await clearSession();
      return { ok: true, responseId: session.responseId };
    }

    // Only starting a new response costs against the limit, so a respondent's own
    // progress saves can never lock them out mid-questionnaire.
    const limit = rateLimit(await clientKey());
    if (!limit.ok) {
      return {
        ok: false,
        error: `Too many submissions. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`,
      };
    }

    const created = await createResponse(questions, submission);
    if (complete) {
      await updateResponse(created.pageId, questions, submission, { complete: true });
    } else {
      await writeSession(created);
    }
    return { ok: true, responseId: created.responseId };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, error: "Some answers were rejected.", issues: error.issues };
    }
    console.error(complete ? "submission failed" : "progress save failed", error);
    return { ok: false, error: "Could not save your response. Please try again." };
  }
}

export const saveProgress = (payload: IncomingSubmission) => upsert(payload, { complete: false });
export const submit = (payload: IncomingSubmission) => upsert(payload, { complete: true });
