import type { AnswerValue } from "./answers";

export const STORAGE_KEY = "framna_survey_progress";

export interface SurveyDraft {
  version: 1;
  index: number;
  answers: Record<string, AnswerValue>;
  others: Record<string, string>;
  otherOpen: Record<string, boolean>;
  startedAt: number;
  updatedAt: number;
  source?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeRecord<T>(obj: unknown): Record<string, T> {
  if (!isPlainObject(obj)) return {};
  const clean: Record<string, T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== "__proto__" && k !== "constructor" && k !== "prototype") {
      clean[k] = v as T;
    }
  }
  return clean;
}

export function loadDraft(): SurveyDraft | null {
  if (typeof window === "undefined" || !window.localStorage) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    if (parsed.version !== 1) return null;

    const index =
      typeof parsed.index === "number" && Number.isFinite(parsed.index) && parsed.index >= 0
        ? Math.floor(parsed.index)
        : 0;

    const answers = sanitizeRecord<AnswerValue>(parsed.answers);
    const others = sanitizeRecord<string>(parsed.others);
    const otherOpen = sanitizeRecord<boolean>(parsed.otherOpen);

    const startedAt =
      typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt) && parsed.startedAt > 0
        ? parsed.startedAt
        : 0;

    const updatedAt =
      typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : Date.now();

    const source =
      typeof parsed.source === "string" && parsed.source.trim()
        ? parsed.source.trim().replace(/,/g, "-").slice(0, 100)
        : undefined;

    return {
      version: 1,
      index,
      answers,
      others,
      otherOpen,
      startedAt,
      updatedAt,
      ...(source ? { source } : {}),
    };
  } catch (error) {
    console.warn("Failed to read survey draft from localStorage", error);
    return null;
  }
}

export function saveDraft(data: {
  index: number;
  answers: Record<string, AnswerValue>;
  others: Record<string, string>;
  otherOpen?: Record<string, boolean>;
  startedAt: number;
  source?: string;
}): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    const source =
      typeof data.source === "string" && data.source.trim()
        ? data.source.trim().replace(/,/g, "-").slice(0, 100)
        : undefined;

    const draft: SurveyDraft = {
      version: 1,
      index:
        typeof data.index === "number" && Number.isFinite(data.index) && data.index >= 0
          ? Math.floor(data.index)
          : 0,
      answers: sanitizeRecord<AnswerValue>(data.answers),
      others: sanitizeRecord<string>(data.others),
      otherOpen: sanitizeRecord<boolean>(data.otherOpen),
      startedAt:
        typeof data.startedAt === "number" && Number.isFinite(data.startedAt) && data.startedAt > 0
          ? data.startedAt
          : 0,
      updatedAt: Date.now(),
      ...(source ? { source } : {}),
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn("Failed to save survey draft to localStorage", error);
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear survey draft from localStorage", error);
  }
}
