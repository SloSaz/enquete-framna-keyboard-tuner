"use server";

import { saveProgress, submit, type IncomingSubmission, type SubmitResult } from "@/lib/submit";

export async function saveProgressAction(payload: IncomingSubmission): Promise<SubmitResult> {
  return saveProgress(payload);
}

export async function submitResponse(payload: IncomingSubmission): Promise<SubmitResult> {
  return submit(payload);
}
