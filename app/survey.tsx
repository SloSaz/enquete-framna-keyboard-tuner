"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveProgressAction, submitResponse } from "./actions";
import type { AnswerValue } from "@/lib/answers";
import type { Question } from "@/lib/questions";

type Answers = Record<string, AnswerValue>;
type Others = Record<string, string>;
type Phase = "intro" | "asking" | "saving" | "done" | "failed";

const CHOICE_KEYS = "123456789";

function Progress({ current, total }: { current: number; total: number }) {
  const pct = total ? (current / total) * 100 : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted">
        {current} / {total}
      </span>
    </div>
  );
}

function Option({
  children,
  selected,
  hint,
  image,
  shape,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  hint?: string;
  image?: string | null;
  shape: "radio" | "check";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={shape === "check" ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-[15px] leading-snug transition-all duration-150 active:scale-[0.99] ${
        selected
          ? "border-accent bg-accent-soft/60 text-ink shadow-[0_0_0_1px_var(--color-accent)]"
          : "border-line bg-card/70 text-ink/90 hover:border-accent/50 hover:bg-card"
      }`}
    >
      {image && (
        <Image
          src={`/options/${image}`}
          alt=""
          width={160}
          height={160}
          className="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-line"
        />
      )}
      {hint && (
        <kbd
          className={`hidden h-5 w-5 shrink-0 place-items-center rounded border font-mono text-[10px] sm:grid ${
            selected ? "border-accent/60 text-ink" : "border-line text-muted"
          }`}
        >
          {hint}
        </kbd>
      )}
      <span className="flex-1">{children}</span>
      <span
        aria-hidden="true"
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center border transition-all duration-150 ${
          shape === "check" ? "rounded-[6px]" : "rounded-full"
        } ${selected ? "border-accent bg-accent" : "border-line group-hover:border-accent/50"}`}
      >
        {shape === "check" ? (
          <svg viewBox="0 0 16 16" className={`h-3 w-3 ${selected ? "opacity-100" : "opacity-0"}`}>
            <path
              d="M3.5 8.5l3 3 6-6.5"
              fill="none"
              stroke="#0b0c16"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span
            className={`h-1.5 w-1.5 rounded-full bg-[#0b0c16] transition-opacity ${
              selected ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
      </span>
    </button>
  );
}

function ScaleRow({
  max,
  value,
  onPick,
}: {
  max: number;
  value: number | undefined;
  onPick: (n: number) => void;
}) {
  return (
    <div className="flex gap-2" role="radiogroup">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          role="radio"
          aria-checked={value === n}
          aria-label={String(n)}
          className={`h-12 flex-1 rounded-xl border font-mono text-sm transition-all duration-150 active:scale-95 ${
            value === n
              ? "border-accent bg-accent text-[#0b0c16]"
              : "border-line bg-card/70 text-muted hover:border-accent/50 hover:text-ink"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Continue({
  disabled,
  label = "Continue",
  onClick,
}: {
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-2 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-[#0b0c16] transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
    >
      {label}
    </button>
  );
}

export function Survey({
  questions,
  title,
  intro,
}: {
  questions: Question[];
  title: string;
  intro: string;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0);
  const [back, setBack] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [others, setOthers] = useState<Others>({});
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hp, setHp] = useState("");

  const question = questions[index];
  const key = question ? String(question.order) : "";
  const value = answers[key];

  const setValue = useCallback((k: string, v: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [k]: v }));
  }, []);

  const answered = useMemo(() => {
    if (!question) return false;
    if (question.type === "grid") {
      const rows = (value ?? {}) as Record<string, number>;
      return Object.keys(rows).length === question.choices.length;
    }
    if (Array.isArray(value)) return value.length > 0 || Boolean(others[key]);
    if (typeof value === "string") return value.trim().length > 0;
    return value !== undefined && value !== null;
  }, [question, value, others, key]);

  // Progress saves are chained so two patches of the same row can never land out of
  // order, and so the final submit runs after every pending save has settled.
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const persist = useCallback(
    (snapshot: Answers, snapshotOthers: Others) => {
      saveQueue.current = saveQueue.current
        .then(() => saveProgressAction({ answers: snapshot, other: snapshotOthers, hp }))
        .catch((error) => console.error("progress save failed", error));
    },
    [hp],
  );

  const finish = useCallback(
    async (final: Answers, finalOthers: Others) => {
      setPhase("saving");
      await saveQueue.current.catch(() => {});
      const result = await submitResponse({
        answers: final,
        other: finalOthers,
        durationSec: (Date.now() - startedAt) / 1000,
        hp,
      });
      if (result.ok) {
        setPhase("done");
      } else {
        setError([result.error, ...(result.issues ?? [])].join(" "));
        setPhase("failed");
      }
    },
    [startedAt, hp],
  );

  const advance = useCallback(
    (override?: Answers) => {
      const next = override ?? answers;
      setBack(false);
      if (index + 1 < questions.length) {
        persist(next, others);
        setIndex(index + 1);
      } else {
        void finish(next, others);
      }
    },
    [answers, index, questions.length, others, finish, persist],
  );

  const goBack = useCallback(() => {
    if (index === 0) return;
    setBack(true);
    setIndex(index - 1);
  }, [index]);

  const pickSingle = useCallback(
    (label: string) => {
      const next = { ...answers, [key]: label };
      setAnswers(next);
      // Let the selected state paint before the card slides away.
      setTimeout(() => advance(next), 180);
    },
    [answers, key, advance],
  );

  const toggleMulti = useCallback(
    (label: string) => {
      const current = Array.isArray(value) ? (value as string[]) : [];
      setValue(
        key,
        current.includes(label) ? current.filter((x) => x !== label) : [...current, label],
      );
    },
    [value, key, setValue],
  );

  useEffect(() => {
    if (phase !== "asking" || !question) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (event.key === "Enter" && (answered || !question.required)) {
        event.preventDefault();
        advance();
        return;
      }
      const slot = CHOICE_KEYS.indexOf(event.key);
      if (slot === -1) return;

      if (question.type === "single_choice" && question.choices[slot]) {
        event.preventDefault();
        pickSingle(question.choices[slot].label);
      } else if (question.type === "multi_choice" && question.choices[slot]) {
        event.preventDefault();
        toggleMulti(question.choices[slot].label);
      } else if (question.type === "scale" && slot + 1 <= question.scaleMax) {
        event.preventDefault();
        const next = { ...answers, [key]: slot + 1 };
        setAnswers(next);
        setTimeout(() => advance(next), 180);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, question, answered, advance, pickSingle, toggleMulti, answers, key]);

  if (phase === "intro") {
    return (
      <section className="rise mx-auto flex w-full max-w-xl flex-col gap-7 px-6 py-20">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          {questions.length} questions · ~3 min · anonymous
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted">{intro}</p>
        <div>
          <Continue
            label="Start"
            onClick={() => {
              setStartedAt(Date.now());
              setPhase("asking");
            }}
          />
        </div>
      </section>
    );
  }

  if (phase === "done") {
    return (
      <section className="rise mx-auto flex w-full max-w-xl flex-col gap-5 px-6 py-24">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-accent text-2xl text-[#0b0c16]">
          ✓
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Thank you</h1>
        <p className="text-[15px] leading-relaxed text-muted">
          Your answers were recorded anonymously and will be used only for this academic research
          project. You can close this tab.
        </p>
      </section>
    );
  }

  if (phase === "failed") {
    return (
      <section className="rise mx-auto flex w-full max-w-xl flex-col gap-5 px-6 py-24">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-[15px] leading-relaxed text-muted">{error}</p>
        <div>
          <Continue label="Try again" onClick={() => void finish(answers, others)} />
        </div>
      </section>
    );
  }

  if (!question) return null;

  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-10 sm:py-16">
      <Progress current={index + (answered ? 1 : 0)} total={questions.length} />

      <div key={index} className={`flex flex-1 flex-col gap-6 ${back ? "enter-back" : "enter-forward"}`}>
        <header className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
            {question.title}
          </h2>
          {question.description && (
            <p className="text-sm leading-relaxed text-muted">{question.description}</p>
          )}
          {!question.required && <p className="font-mono text-xs text-muted">Optional</p>}
        </header>

        <div
          className="flex flex-col gap-2.5"
          role={
            question.type === "single_choice"
              ? "radiogroup"
              : question.type === "multi_choice"
                ? "group"
                : undefined
          }
          aria-label={question.title}
        >
          {question.type === "single_choice" &&
            question.choices.map((choice, i) => (
              <Option
                key={choice.label}
                hint={CHOICE_KEYS[i]}
                image={choice.image}
                shape="radio"
                selected={value === choice.label}
                onClick={() => pickSingle(choice.label)}
              >
                {choice.value}
              </Option>
            ))}

          {question.type === "multi_choice" && (
            <>
              {question.choices.map((choice, i) => (
                <Option
                  key={choice.label}
                  hint={CHOICE_KEYS[i]}
                  image={choice.image}
                  shape="check"
                  selected={Array.isArray(value) && (value as string[]).includes(choice.label)}
                  onClick={() => toggleMulti(choice.label)}
                >
                  {choice.value}
                </Option>
              ))}
              {question.allowOther && (
                <>
                  <Option
                    shape="check"
                    selected={Boolean(otherOpen[key])}
                    onClick={() => setOtherOpen((p) => ({ ...p, [key]: !p[key] }))}
                  >
                    Other…
                  </Option>
                  {otherOpen[key] && (
                    <input
                      autoFocus
                      value={others[key] ?? ""}
                      onChange={(e) => setOthers((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder="Tell us what else"
                      className="rounded-xl border border-line bg-card/70 px-4 py-3 text-[15px] outline-none placeholder:text-muted focus:border-accent"
                    />
                  )}
                </>
              )}
              <Continue disabled={question.required && !answered} onClick={() => advance()} />
            </>
          )}

          {question.type === "scale" && (
            <>
              <ScaleRow
                max={question.scaleMax}
                value={typeof value === "number" ? value : undefined}
                onPick={(n) => {
                  const next = { ...answers, [key]: n };
                  setAnswers(next);
                  setTimeout(() => advance(next), 180);
                }}
              />
              <div className="flex justify-between font-mono text-xs text-muted">
                <span>{question.scaleMinLabel}</span>
                <span>{question.scaleMaxLabel}</span>
              </div>
            </>
          )}

          {question.type === "grid" && (
            <>
              {question.choices.map((row) => {
                const rows = (value ?? {}) as Record<string, number>;
                return (
                  <div key={row.label} className="flex flex-col gap-2 rounded-xl border border-line bg-card/40 p-3">
                    <span className="text-sm leading-snug text-ink/90">{row.value}</span>
                    <ScaleRow
                      max={question.scaleMax}
                      value={rows[row.label]}
                      onPick={(n) => setValue(key, { ...rows, [row.label]: n })}
                    />
                  </div>
                );
              })}
              <Continue disabled={question.required && !answered} onClick={() => advance()} />
            </>
          )}

          {question.type === "paragraph" && (
            <>
              <textarea
                rows={5}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => setValue(key, e.target.value)}
                placeholder="Optional — anything you'd like to add"
                className="resize-none rounded-xl border border-line bg-card/70 px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-muted focus:border-accent"
              />
              <Continue label={answered ? "Continue" : "Skip"} onClick={() => advance()} />
            </>
          )}

          {question.type === "short_text" && (
            <>
              <input
                value={typeof value === "string" ? value : ""}
                onChange={(e) => setValue(key, e.target.value)}
                placeholder="Discord handle or email"
                className="rounded-xl border border-line bg-card/70 px-4 py-3 text-[15px] outline-none placeholder:text-muted focus:border-accent"
              />
              <Continue
                label={
                  index + 1 === questions.length ? (answered ? "Submit" : "Skip & submit") : "Continue"
                }
                onClick={() => advance()}
              />
            </>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={goBack}
          disabled={index === 0}
          className="text-sm text-muted transition-colors hover:text-ink disabled:invisible"
        >
          ← Back
        </button>
        {phase === "saving" && <span className="font-mono text-xs text-muted">Saving…</span>}
      </footer>

      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
      />
    </section>
  );
}
