import { unstable_cache } from "next/cache";

import { databaseIds, lines, notion, richText } from "./notion";

export type QuestionType =
  | "single_choice"
  | "multi_choice"
  | "scale"
  | "grid"
  | "paragraph"
  | "short_text";

export type Choice = { value: string; label: string; image: string | null };

export type Question = {
  id: string;
  order: number;
  type: QuestionType;
  title: string;
  description: string | null;
  required: boolean;
  allowOther: boolean;
  choices: Choice[];
  scaleMax: number;
  scaleMinLabel: string | null;
  scaleMaxLabel: string | null;
};

type NotionPage = {
  id: string;
  properties: Record<string, { type: string; [key: string]: unknown }>;
};

const number = (prop: unknown): number | null =>
  (prop as { number?: number | null })?.number ?? null;

const checkbox = (prop: unknown): boolean => Boolean((prop as { checkbox?: boolean })?.checkbox);

const select = (prop: unknown): string | null =>
  (prop as { select?: { name: string } | null })?.select?.name ?? null;

const title = (prop: unknown): string =>
  richText((prop as { title?: unknown })?.title);

const text = (prop: unknown): string => richText((prop as { rich_text?: unknown })?.rich_text);

// The Answers DB stores the short label (Notion select values cannot contain commas
// and cap at 100 chars), so each choice carries both forms.
function toChoices(page: NotionPage): Choice[] {
  const values = lines(text(page.properties["Options"]));
  const labels = lines(text(page.properties["Option labels"]));
  const images = lines(text(page.properties["Option images"]));
  return values.map((value, index) => ({
    value,
    label: labels[index] ?? value,
    image: images[index] ?? null,
  }));
}

function toQuestion(page: NotionPage): Question | null {
  const order = number(page.properties["Order"]);
  const type = select(page.properties["Type"]) as QuestionType | null;
  if (order === null || !type) return null;

  const description = text(page.properties["Description"]);
  const minLabel = text(page.properties["Scale min label"]);
  const maxLabel = text(page.properties["Scale max label"]);

  return {
    id: page.id,
    order,
    type,
    title: title(page.properties["Question"]),
    description: description || null,
    required: checkbox(page.properties["Required"]),
    allowOther: checkbox(page.properties["Allow other"]),
    choices: toChoices(page),
    scaleMax: number(page.properties["Scale max"]) ?? 5,
    scaleMinLabel: minLabel || null,
    scaleMaxLabel: maxLabel || null,
  };
}

export const QUESTIONS_TAG = "survey-questions";

import { SEED_QUESTIONS } from "./seed-questions";
export { SEED_QUESTIONS };

async function loadQuestions(): Promise<Question[]> {
  try {
    const { questions } = databaseIds();
    const res = await notion<{ results: NotionPage[] }>(`databases/${questions}/query`, {
      method: "POST",
      body: {
        filter: { property: "Active", checkbox: { equals: true } },
        sorts: [{ property: "Order", direction: "ascending" }],
        page_size: 100,
      },
    });

    const parsed = res.results
      .map(toQuestion)
      .filter((question): question is Question => question !== null && question.title !== "");

    if (parsed.length > 0) return parsed;
  } catch (error) {
    console.warn("Could not load questions from Notion, falling back to seed questions:", error);
  }
  return SEED_QUESTIONS;
}

// The Notion query is a POST, which Next's fetch cache never stores, so the parsed
// result is cached here instead. Edits in Notion reach the site within the TTL.
export const getQuestions = unstable_cache(loadQuestions, [QUESTIONS_TAG], {
  revalidate: 300,
  tags: [QUESTIONS_TAG],
});
