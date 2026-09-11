import { Survey } from "./survey";
import { getQuestions, type Question } from "@/lib/questions";

export const revalidate = 300;

const TITLE = "Keyboard Sound Profiling App Survey";

const INTRO = `Hi all! I am a Software Engineering graduation student at Hogeschool Windesheim (Netherlands), conducting an open research project on acoustic telemetry and sound profiling for mechanical keyboards.

This survey takes approximately 2 to 3 minutes. Your answers are completely anonymous, not used for commercial purposes, and strictly analyzed for academic software architecture research. Thank you for helping out!`;

export default async function Home() {
  let questions: Question[];
  try {
    questions = await getQuestions();
  } catch (error) {
    console.error("could not load questions", error);
    questions = [];
  }

  if (questions.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-6 py-24">
        <h1 className="text-2xl font-semibold tracking-tight">Survey unavailable</h1>
        <p className="text-[15px] leading-relaxed text-muted">
          The questionnaire could not be loaded right now. Please try again shortly.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <Survey questions={questions} title={TITLE} intro={INTRO} />
    </main>
  );
}
