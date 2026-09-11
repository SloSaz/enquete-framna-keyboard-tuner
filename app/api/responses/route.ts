import { NextResponse } from "next/server";
import { saveProgress, submit } from "@/lib/submit";

// Mirrors the server actions so both paths can be exercised from the terminal.
// ?partial=1 saves progress and returns the session cookie; without it the
// response is marked complete.
export async function POST(request: Request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  const partial = new URL(request.url).searchParams.get("partial") === "1";
  const result = partial ? await saveProgress(payload) : await submit(payload);
  return NextResponse.json(result, { status: result.ok ? 201 : 400 });
}
