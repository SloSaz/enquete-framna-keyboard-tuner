import { NextResponse } from "next/server";
import { submit } from "@/lib/submit";

// Mirrors the server action so submissions can be exercised from the terminal.
export async function POST(request: Request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  const result = await submit(payload);
  return NextResponse.json(result, { status: result.ok ? 201 : 400 });
}
