import { databaseIds, notion } from "./notion";
import type { Question } from "./questions";

export type AnswerValue = string | string[] | number | Record<string, number> | null;

export type Submission = {
  answers: Record<string, AnswerValue>;
  other: Record<string, string>;
  durationSec?: number;
};

export class ValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("; "));
    this.name = "ValidationError";
  }
}

const TEXT_LIMIT = 2000;

type Mapping =
  | { kind: "select" | "multi_select" | "number" | "rich_text"; property: string; other?: string }
  | { kind: "grid"; rows: Record<string, string> };

// Each question maps to fixed columns in the Answers DB. A question added in Notion
// without an entry here is collected but not written, and reported by validate().
const MAPPING: Record<number, Mapping> = {
  1: { kind: "select", property: "Q1 Experience level" },
  2: { kind: "multi_select", property: "Q2 Mod decision sources", other: "Q2 Other" },
  3: { kind: "number", property: "Q3 YT tests accurate (1-5)" },
  4: { kind: "select", property: "Q4 Sound signature" },
  5: { kind: "multi_select", property: "Q5 Valuable features", other: "Q5 Other" },
  6: { kind: "multi_select", property: "Q6 A/B comparisons wanted", other: "Q6 Other" },
  7: {
    kind: "grid",
    rows: {
      "Live visual feedback while recording": "Q7a Live visual feedback while recording",
      "Detailed acoustic telemetry reports": "Q7b Detailed acoustic telemetry reports",
      "Offline capability": "Q7c Offline capability",
      "Actionable modding advice": "Q7d Actionable modding advice",
    },
  },
  8: { kind: "multi_select", property: "Q8 Recommendation format", other: "Q8 Other" },
  9: { kind: "rich_text", property: "Q9 Feature ideas" },
  10: { kind: "rich_text", property: "Q10 Follow-up contact" },
};

const isBlank = (value: AnswerValue): boolean =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);

export function validate(questions: Question[], submission: Submission): string[] {
  const issues: string[] = [];

  for (const question of questions) {
    const value = submission.answers[String(question.order)] ?? null;
    const mapping = MAPPING[question.order];

    if (!mapping) {
      issues.push(`Q${question.order} has no column in the Answers database`);
      continue;
    }
    // An "Other" write-in satisfies a required choice question on its own.
    const other = submission.other?.[String(question.order)]?.trim();
    if (question.required && isBlank(value) && !other) {
      issues.push(`Q${question.order} is required`);
      continue;
    }
    if (isBlank(value)) continue;

    const labels = new Set(question.choices.map((choice) => choice.label));

    switch (question.type) {
      case "single_choice":
        if (typeof value !== "string" || !labels.has(value)) {
          issues.push(`Q${question.order} is not one of its options`);
        }
        break;
      case "multi_choice":
        if (!Array.isArray(value) || value.some((entry) => !labels.has(entry))) {
          issues.push(`Q${question.order} contains an unknown option`);
        }
        break;
      case "scale":
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > question.scaleMax) {
          issues.push(`Q${question.order} must be an integer between 1 and ${question.scaleMax}`);
        }
        break;
      case "grid": {
        const rows = value as Record<string, number>;
        if (typeof value !== "object" || Array.isArray(value)) {
          issues.push(`Q${question.order} must be an object of row scores`);
          break;
        }
        for (const [row, score] of Object.entries(rows)) {
          if (!labels.has(row)) issues.push(`Q${question.order} has unknown row "${row}"`);
          if (!Number.isInteger(score) || score < 1 || score > question.scaleMax) {
            issues.push(`Q${question.order} row "${row}" must be 1-${question.scaleMax}`);
          }
        }
        if (question.required && Object.keys(rows).length !== question.choices.length) {
          issues.push(`Q${question.order} needs a score for every row`);
        }
        break;
      }
      case "paragraph":
      case "short_text":
        if (typeof value !== "string") issues.push(`Q${question.order} must be text`);
        break;
    }
  }

  return issues;
}

const asText = (value: string) => ({
  rich_text: value ? [{ text: { content: value.slice(0, TEXT_LIMIT) } }] : [],
});

function toProperties(questions: Question[], submission: Submission, responseId: string) {
  const properties: Record<string, unknown> = {
    "Response ID": { title: [{ text: { content: responseId } }] },
    "Submitted at": { date: { start: new Date().toISOString() } },
    Questions: { relation: questions.map((question) => ({ id: question.id })) },
  };

  if (typeof submission.durationSec === "number" && Number.isFinite(submission.durationSec)) {
    properties["Duration (s)"] = { number: Math.round(submission.durationSec) };
  }

  for (const question of questions) {
    const key = String(question.order);
    const value = submission.answers[key] ?? null;
    const mapping = MAPPING[question.order];
    if (!mapping) continue;

    if (mapping.kind === "grid") {
      const rows = (value ?? {}) as Record<string, number>;
      for (const [row, property] of Object.entries(mapping.rows)) {
        if (typeof rows[row] === "number") properties[property] = { number: rows[row] };
      }
      continue;
    }

    if (!isBlank(value)) {
      switch (mapping.kind) {
        case "select":
          properties[mapping.property] = { select: { name: value as string } };
          break;
        case "multi_select":
          properties[mapping.property] = {
            multi_select: (value as string[]).map((name) => ({ name })),
          };
          break;
        case "number":
          properties[mapping.property] = { number: value as number };
          break;
        case "rich_text":
          properties[mapping.property] = asText(value as string);
          break;
      }
    }

    const other = submission.other?.[key];
    if (mapping.other && other) {
      properties[mapping.other] = asText(other);
    }
  }

  return properties;
}

export async function saveSubmission(
  questions: Question[],
  submission: Submission,
): Promise<{ responseId: string }> {
  const issues = validate(questions, submission);
  if (issues.length) throw new ValidationError(issues);

  const responseId = `r_${crypto.randomUUID().slice(0, 8)}`;
  const { answers } = databaseIds();

  await notion("pages", {
    method: "POST",
    body: {
      parent: { database_id: answers },
      properties: toProperties(questions, submission, responseId),
    },
  });

  return { responseId };
}
