"use server";

import { submit, type IncomingSubmission, type SubmitResult } from "@/lib/submit";

export async function submitResponse(payload: IncomingSubmission): Promise<SubmitResult> {
  return submit(payload);
}
