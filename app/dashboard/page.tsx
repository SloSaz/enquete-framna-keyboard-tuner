import { checkDashboardAuth, isDashboardProtected } from "@/lib/dashboard-auth";
import {
  fetchNotionResponses,
  generateDemoResponses,
  type SurveyResponseRecord,
} from "@/lib/dashboard-data";
import { getQuestions, type Question } from "@/lib/questions";
import { SEED_QUESTIONS } from "@/lib/seed-questions";
import { DashboardClient } from "./dashboard-client";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const key =
    typeof params.key === "string"
      ? params.key
      : typeof params.password === "string"
      ? params.password
      : null;

  const isProtected = isDashboardProtected();
  const isAuthenticated = await checkDashboardAuth(key);

  if (isProtected && !isAuthenticated) {
    return <LoginForm />;
  }

  // Load questions
  let questions: Question[];
  try {
    questions = await getQuestions();
    if (!questions || questions.length === 0) {
      questions = SEED_QUESTIONS;
    }
  } catch {
    questions = SEED_QUESTIONS;
  }

  // Load live responses
  let liveResponses: SurveyResponseRecord[] = [];
  const notionConfigured = Boolean(process.env.NOTION_PAT && process.env.NOTION_ANSWERS_DB_ID);
  let notionError: string | undefined;

  if (notionConfigured) {
    try {
      liveResponses = await fetchNotionResponses();
    } catch (err) {
      console.warn("Could not fetch responses from Notion:", err);
      notionError = err instanceof Error ? err.message : "Notion connection failed";
    }
  }

  const demoResponses = generateDemoResponses();

  return (
    <DashboardClient
      questions={questions}
      liveResponses={liveResponses}
      demoResponses={demoResponses}
      isProtected={isProtected}
      notionConfigured={notionConfigured}
      notionError={notionError}
    />
  );
}
