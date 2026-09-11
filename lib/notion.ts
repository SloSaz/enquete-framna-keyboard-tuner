const NOTION_VERSION = "2022-06-28";

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "NotionError";
  }
}

function token(): string {
  const value = process.env.NOTION_PAT;
  if (!value) throw new NotionError("NOTION_PAT is not configured", 500);
  return value;
}

export function databaseIds() {
  const questions = process.env.NOTION_QUESTIONS_DB_ID;
  const answers = process.env.NOTION_ANSWERS_DB_ID;
  if (!questions || !answers) {
    throw new NotionError("NOTION_QUESTIONS_DB_ID / NOTION_ANSWERS_DB_ID are not configured", 500);
  }
  return { questions, answers };
}

export async function notion<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const json = await res.json();
  if (!res.ok) {
    throw new NotionError(json.message ?? "Notion request failed", res.status, json.code);
  }
  return json as T;
}

type RichText = { plain_text: string }[];

export const richText = (value: unknown): string =>
  Array.isArray(value) ? (value as RichText).map((part) => part.plain_text).join("") : "";

export const lines = (value: string): string[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
