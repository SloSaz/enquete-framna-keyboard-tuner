import { databaseIds, notion, NotionError } from "./notion";
import {
  type AnswerValue,
  countAnswered,
  isBlank,
  isQuestionSkipped,
  MAPPING,
  sanitizeSource,
  type Submission,
  validate,
  ValidationError,
} from "./question-logic";
import type { Question } from "./questions";

export {
  type AnswerValue,
  countAnswered,
  isQuestionSkipped,
  MAPPING,
  sanitizeSource,
  type Submission,
  validate,
  ValidationError,
};

const TEXT_LIMIT = 2000;

const STATUS_IN_PROGRESS = "In progress";
const STATUS_COMPLETE = "Complete";

const asText = (value: string) => ({
  rich_text: value ? [{ text: { content: value.slice(0, TEXT_LIMIT) } }] : [],
});



// Only answered questions produce properties, so a progress save never blanks a
// column the respondent has not reached yet.
function answerProperties(questions: Question[], submission: Submission) {
  const properties: Record<string, unknown> = {};

  for (const question of questions) {
    const key = String(question.order);
    const value = submission.answers[key] ?? null;
    const mapping = MAPPING[question.order];
    if (!mapping) continue;

    if (isQuestionSkipped(question.order, submission.answers, submission.other)) {
      if (mapping.kind === "multi_select") {
        properties[mapping.property] = { multi_select: [] };
        if (mapping.other) properties[mapping.other] = asText("");
      }
      continue;
    }


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
    if (mapping.other && other) properties[mapping.other] = asText(other);
  }

  return properties;
}

function assertValid(questions: Question[], submission: Submission, requireAll: boolean) {
  const issues = validate(questions, submission, { requireAll });
  if (issues.length) throw new ValidationError(issues);
}

export async function createResponse(
  questions: Question[],
  submission: Submission,
): Promise<{ responseId: string; pageId: string }> {
  assertValid(questions, submission, false);

  const responseId = `r_${crypto.randomUUID().slice(0, 8)}`;
  const { answers } = databaseIds();

  const properties: Record<string, unknown> = {
    "Response ID": { title: [{ text: { content: responseId } }] },
    "Started at": { date: { start: new Date().toISOString() } },
    Status: { select: { name: STATUS_IN_PROGRESS } },
    Answered: { number: countAnswered(questions, submission) },
    Questions: { relation: questions.map((question) => ({ id: question.id })) },
    ...answerProperties(questions, submission),
  };

  const safeSource = sanitizeSource(submission.source);
  if (safeSource) {
    properties["Source"] = { select: { name: safeSource } };
  }

  let page: { id: string };
  try {
    page = await notion<{ id: string }>("pages", {
      method: "POST",
      body: {
        parent: { database_id: answers },
        properties,
      },
    });
  } catch (error) {
    if (safeSource && error instanceof NotionError && error.message?.toLowerCase().includes("source")) {
      console.warn("Notion database is missing 'Source' property. Retrying without it.", error.message);
      delete properties["Source"];
      page = await notion<{ id: string }>("pages", {
        method: "POST",
        body: {
          parent: { database_id: answers },
          properties,
        },
      });
    } else {
      throw error;
    }
  }

  return { responseId, pageId: page.id };
}

export async function updateResponse(
  pageId: string,
  questions: Question[],
  submission: Submission,
  { complete }: { complete: boolean },
): Promise<void> {
  assertValid(questions, submission, complete);

  const properties: Record<string, unknown> = {
    Answered: { number: countAnswered(questions, submission) },
    ...answerProperties(questions, submission),
  };

  const safeSource = sanitizeSource(submission.source);
  if (safeSource) {
    properties["Source"] = { select: { name: safeSource } };
  }

  if (complete) {
    properties["Status"] = { select: { name: STATUS_COMPLETE } };
    properties["Submitted at"] = { date: { start: new Date().toISOString() } };
    if (typeof submission.durationSec === "number" && Number.isFinite(submission.durationSec)) {
      properties["Duration (s)"] = { number: Math.round(submission.durationSec) };
    }
  }

  try {
    await notion(`pages/${pageId}`, { method: "PATCH", body: { properties } });
  } catch (error) {
    if (safeSource && error instanceof NotionError && error.message?.toLowerCase().includes("source")) {
      console.warn("Notion database is missing 'Source' property. Retrying without it.", error.message);
      delete properties["Source"];
      await notion(`pages/${pageId}`, { method: "PATCH", body: { properties } });
    } else {
      throw error;
    }
  }
}
