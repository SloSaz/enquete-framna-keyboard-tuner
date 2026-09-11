import { NextRequest, NextResponse } from "next/server";
import { checkDashboardAuth } from "@/lib/dashboard-auth";
import {
  exportResponsesToCSV,
  fetchNotionResponses,
  generateDemoResponses,
  type SurveyResponseRecord,
} from "@/lib/dashboard-data";
import { getQuestions } from "@/lib/questions";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const key = searchParams.get("key") || searchParams.get("password");

  const isAuthenticated = await checkDashboardAuth(key);
  if (!isAuthenticated) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized access to dashboard export" },
      { status: 401 },
    );
  }

  const format = searchParams.get("format") || "csv";
  const source = searchParams.get("source") || "live";

  let questions;
  try {
    questions = await getQuestions();
  } catch {
    const { SEED_QUESTIONS } = await import("@/lib/seed-questions");
    questions = SEED_QUESTIONS;
  }

  let responses: SurveyResponseRecord[] = [];
  if (source === "demo") {
    responses = generateDemoResponses();
  } else {
    try {
      responses = await fetchNotionResponses();
      if (responses.length === 0 && source !== "live_only") {
        responses = generateDemoResponses();
      }
    } catch {
      responses = generateDemoResponses();
    }
  }

  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new NextResponse(JSON.stringify(responses, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="framna_keyboard_survey_${dateStr}.json"`,
      },
    });
  }

  const csv = exportResponsesToCSV(questions, responses);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="framna_keyboard_survey_${dateStr}.csv"`,
    },
  });
}
