import type { Choice, Question } from "./questions";

export type AnswerValue = string | string[] | number | Record<string, number> | null;

export type Submission = {
  answers: Record<string, AnswerValue>;
  other: Record<string, string>;
  durationSec?: number;
  source?: string;
};

export function sanitizeSource(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Notion select values cannot contain commas; replace commas with hyphens and limit length
  return trimmed.replace(/,/g, "-").slice(0, 100);
}

export class ValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join("; "));
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export type Mapping =
  | { kind: "select" | "multi_select" | "number" | "rich_text"; property: string; other?: string }
  | { kind: "grid"; rows: Record<string, string> };

export const MAPPING: Record<number, Mapping> = {
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

export const isBlank = (value: AnswerValue): boolean =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);

export function isAbTestingSelected(
  answers?: Record<string, unknown> | null,
  others?: Record<string, string> | null,
): boolean {
  const q5 = answers?.["5"] ?? answers?.[5];
  if (Array.isArray(q5)) {
    const matched = q5.some((val) => {
      if (typeof val !== "string") return false;
      const lower = val.toLowerCase();
      return lower.includes("before-and-after") || lower.includes("a/b");
    });
    if (matched) return true;
  }
  if (typeof q5 === "string" && q5.trim()) {
    const lower = q5.toLowerCase();
    if (lower.includes("before-and-after") || lower.includes("a/b")) {
      return true;
    }
  }
  const otherVal = others?.["5"] ?? (answers?.["other_5"] as string | undefined);
  if (typeof otherVal === "string" && otherVal.trim()) {
    const lower = otherVal.toLowerCase();
    if (lower.includes("before-and-after") || lower.includes("a/b")) {
      return true;
    }
  }
  return false;
}

export function isQuestionSkipped(
  questionOrder: number,
  answers?: Record<string, unknown> | null,
  others?: Record<string, string> | null,
): boolean {
  if (questionOrder === 6) {
    return !isAbTestingSelected(answers, others);
  }
  return false;
}

export function getActiveQuestions(
  questions: Question[],
  answers?: Record<string, unknown> | null,
  others?: Record<string, string> | null,
): Question[] {
  return questions.filter((q) => !isQuestionSkipped(q.order, answers, others));
}

export function getActiveIndex(
  questions: Question[],
  currentIndex: number,
  answers?: Record<string, unknown> | null,
  others?: Record<string, string> | null,
): number {
  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return 0;
  const active = getActiveQuestions(questions, answers, others);
  const activeIdx = active.findIndex((q) => q.order === currentQuestion.order);
  return activeIdx >= 0 ? activeIdx : 0;
}

export function getNextQuestionIndex(
  currentIndex: number,
  questions: Question[],
  answers?: Record<string, unknown> | null,
  others?: Record<string, string> | null,
): number {
  let nextIndex = currentIndex + 1;
  while (
    nextIndex < questions.length &&
    isQuestionSkipped(questions[nextIndex].order, answers, others)
  ) {
    nextIndex++;
  }
  return nextIndex;
}

export function getPrevQuestionIndex(
  currentIndex: number,
  questions: Question[],
  answers?: Record<string, unknown> | null,
  others?: Record<string, string> | null,
): number {
  let prevIndex = currentIndex - 1;
  while (
    prevIndex >= 0 &&
    isQuestionSkipped(questions[prevIndex].order, answers, others)
  ) {
    prevIndex--;
  }
  return prevIndex;
}

export function enrichQuestionChoices(
  questions: Question[],
  seedQuestions: Question[],
): Question[] {
  return questions.map((q) => {
    const seed = seedQuestions.find((s) => s.order === q.order);
    if (!seed || !seed.choices.length) return q;

    const existingValues = new Set(q.choices.map((c) => c.value.toLowerCase()));
    const existingLabels = new Set(q.choices.map((c) => c.label.toLowerCase()));

    // Keep all existing choices, and restore any missing images or labels from seed if available
    const enrichedChoices: Choice[] = q.choices.map((c) => {
      const matchingSeed = seed.choices.find(
        (sc) =>
          sc.value.toLowerCase() === c.value.toLowerCase() ||
          sc.label.toLowerCase() === c.label.toLowerCase(),
      );
      let choice = c;
      if (!choice.image && matchingSeed?.image) {
        choice = { ...choice, image: matchingSeed.image };
      }
      if (
        choice.label === choice.value &&
        matchingSeed &&
        matchingSeed.label !== matchingSeed.value
      ) {
        choice = { ...choice, label: matchingSeed.label };
      }
      return choice;
    });

    // Merge any missing choices from seed
    const missingChoices = seed.choices.filter(
      (sc) =>
        !existingValues.has(sc.value.toLowerCase()) &&
        !existingLabels.has(sc.label.toLowerCase()),
    );

    if (missingChoices.length === 0) {
      return {
        ...q,
        choices: enrichedChoices,
      };
    }

    return {
      ...q,
      choices: [...enrichedChoices, ...missingChoices],
    };
  });
}

// requireAll is off for progress saves: later questions are legitimately unanswered.
export function validate(
  questions: Question[],
  submission: Submission,
  { requireAll }: { requireAll: boolean },
): string[] {
  const issues: string[] = [];

  for (const question of questions) {
    if (isQuestionSkipped(question.order, submission.answers, submission.other)) {
      continue;
    }

    const value = submission.answers[String(question.order)] ?? null;
    const mapping = MAPPING[question.order];

    if (!mapping) {
      issues.push(`Q${question.order} has no column in the Answers database`);
      continue;
    }
    // An "Other" write-in satisfies a required choice question on its own.
    const other = submission.other?.[String(question.order)]?.trim();
    if (requireAll && question.required && isBlank(value) && !other) {
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
        if (
          typeof value !== "number" ||
          !Number.isInteger(value) ||
          value < 1 ||
          value > question.scaleMax
        ) {
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

export function countAnswered(questions: Question[], submission: Submission): number {
  return questions.filter((question) => {
    if (isQuestionSkipped(question.order, submission.answers, submission.other)) return false;
    const key = String(question.order);
    return !isBlank(submission.answers[key] ?? null) || Boolean(submission.other?.[key]?.trim());
  }).length;
}
