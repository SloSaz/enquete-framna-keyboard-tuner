import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  countAnswered,
  enrichQuestionChoices,
  getActiveIndex,
  getActiveQuestions,
  getNextQuestionIndex,
  getPrevQuestionIndex,
  isAbTestingSelected,
  isQuestionSkipped,
  validate,
} from "../lib/question-logic.ts";
import { SEED_QUESTIONS } from "../lib/seed-questions.ts";


describe("survey logic & validation", () => {
  const mockQuestions = [
    {
      id: "q1",
      order: 1,
      type: "single_choice",
      title: "Experience level",
      description: null,
      required: true,
      allowOther: false,
      choices: [
        { value: "Beginner", label: "Beginner", image: null },
        { value: "Enthusiast", label: "Enthusiast", image: null },
      ],
      scaleMax: 5,
      scaleMinLabel: null,
      scaleMaxLabel: null,
    },
    {
      id: "q2",
      order: 2,
      type: "multi_choice",
      title: "Mod decision sources",
      description: null,
      required: true,
      allowOther: true,
      choices: [
        { value: "YouTube", label: "YouTube sound tests / build streams", image: null },
        { value: "Reddit", label: "Reddit / Discord communities", image: null },
      ],
      scaleMax: 5,
      scaleMinLabel: null,
      scaleMaxLabel: null,
    },
    {
      id: "q3",
      order: 3,
      type: "scale",
      title: "Accuracy",
      description: null,
      required: true,
      allowOther: false,
      choices: [],
      scaleMax: 5,
      scaleMinLabel: "Low",
      scaleMaxLabel: "High",
    },
    {
      id: "q7",
      order: 7,
      type: "grid",
      title: "Feature importance",
      description: null,
      required: true,
      allowOther: false,
      choices: [
        { value: "Live visual feedback", label: "Live visual feedback while recording", image: null },
        { value: "Telemetry", label: "Detailed acoustic telemetry reports", image: null },
        { value: "Offline", label: "Offline capability", image: null },
        { value: "Modding advice", label: "Actionable modding advice", image: null },
      ],
      scaleMax: 5,
      scaleMinLabel: "1",
      scaleMaxLabel: "5",
    },
  ];


  describe("answered computation logic", () => {
    function computeAnswered(question, value, others, otherOpen = {}) {
      const key = String(question.order);
      if (question.type === "grid") {
        const rows = (value ?? {});
        return Object.keys(rows).length === question.choices.length;
      }
      if (question.type === "multi_choice") {
        const list = Array.isArray(value) ? value : [];
        return list.length > 0 || Boolean(otherOpen[key]) || Boolean(others[key]?.trim());
      }
      if (typeof value === "string") return value.trim().length > 0;
      return value !== undefined && value !== null;
    }

    test("multi_choice is answered when otherOpen is selected even before text is typed", () => {
      const q2 = mockQuestions[1];
      assert.equal(computeAnswered(q2, undefined, {}, { "2": true }), true);
    });

    test("multi_choice is answered when only 'Other...' has text and value is undefined", () => {
      const q2 = mockQuestions[1];
      const others = { "2": "Custom input" };
      assert.equal(computeAnswered(q2, undefined, others), true);
    });

    test("multi_choice is answered when checkbox option is selected", () => {
      const q2 = mockQuestions[1];
      assert.equal(computeAnswered(q2, ["Reddit / Discord communities"], {}), true);
    });

    test("grid is answered only when all choice rows have scores", () => {
      const q7 = mockQuestions[3];
      assert.equal(computeAnswered(q7, { "Live visual feedback while recording": 5 }, {}), false);
      assert.equal(
        computeAnswered(
          q7,
          {
            "Live visual feedback while recording": 5,
            "Detailed acoustic telemetry reports": 4,
            "Offline capability": 3,
            "Actionable modding advice": 4,
          },
          {},
        ),
        true,
      );
    });

    test("scale is answered when a number is selected", () => {
      const q3 = mockQuestions[2];
      assert.equal(computeAnswered(q3, undefined, {}), false);
      assert.equal(computeAnswered(q3, 4, {}), true);
    });
  });

  describe("resume notification logic", () => {
    function determineResumeBanner(draft, questionsLength) {
      const targetIndex = Math.min(draft.index, Math.max(0, questionsLength - 1));
      const hasAnswers =
        Object.keys(draft.answers).length > 0 ||
        Object.values(draft.others).some((v) => Boolean(v?.trim()));

      if (hasAnswers || targetIndex > 0) {
        return targetIndex;
      }
      return null;
    }

    test("does NOT show resume banner if user only started survey without answering anything", () => {
      const draft = {
        index: 0,
        answers: {},
        others: {},
        startedAt: Date.now(),
      };
      assert.equal(determineResumeBanner(draft, 10), null);
    });

    test("shows resume banner if user made progress on later questions", () => {
      const draft = {
        index: 2,
        answers: { "1": "Enthusiast" },
        others: {},
        startedAt: Date.now(),
      };
      assert.equal(determineResumeBanner(draft, 10), 2);
    });

    test("shows resume banner at question 0 if user answered question 0", () => {
      const draft = {
        index: 0,
        answers: { "1": "Enthusiast" },
        others: {},
        startedAt: Date.now(),
      };
      assert.equal(determineResumeBanner(draft, 10), 0);
    });
  });

  describe("durationSec calculation", () => {
    test("calculates durationSec when startedAt is a valid positive timestamp", () => {
      const startedAt = Date.now() - 60000; // 60 seconds ago
      const durationSec = startedAt > 0 ? (Date.now() - startedAt) / 1000 : undefined;
      assert.ok(typeof durationSec === "number");
      assert.ok(Math.round(durationSec) >= 59 && Math.round(durationSec) <= 61);
    });

    test("returns undefined durationSec when startedAt is 0", () => {
      const startedAt = 0;
      const durationSec = startedAt > 0 ? (Date.now() - startedAt) / 1000 : undefined;
      assert.equal(durationSec, undefined);
    });
  });

  describe("isAbTestingSelected & isQuestionSkipped", () => {
    test("isAbTestingSelected returns true when label is selected in Q5", () => {
      assert.equal(
        isAbTestingSelected({
          "5": ["Before-and-after comparison of modifications"],
        }),
        true,
      );
    });

    test("isAbTestingSelected returns true when full value is selected in Q5", () => {
      assert.equal(
        isAbTestingSelected({
          "5": ["Before-and-after (A/B) comparison of modifications"],
        }),
        true,
      );
    });

    test("isAbTestingSelected returns true when A/B testing is written in Q5 other", () => {
      assert.equal(
        isAbTestingSelected(
          { "5": ["Objective classification of sound characteristics"] },
          { "5": "I want A/B testing side by side" },
        ),
        true,
      );
    });

    test("isAbTestingSelected returns false when Q5 has other choices but not A/B testing", () => {
      assert.equal(
        isAbTestingSelected({
          "5": [
            "Objective classification of sound characteristics",
            "Tailored hardware modification suggestions to reach a target sound",
          ],
        }),
        false,
      );
    });

    test("isAbTestingSelected returns true when Q5 is a string rather than array", () => {
      assert.equal(
        isAbTestingSelected({
          "5": "Before-and-after comparison of modifications",
        }),
        true,
      );
      assert.equal(
        isAbTestingSelected({
          "5": "Before-and-after (A/B) comparison of modifications",
        }),
        true,
      );
    });

    test("isAbTestingSelected returns false when Q5 is empty, undefined, null, or unrelated string", () => {
      assert.equal(isAbTestingSelected({}), false);
      assert.equal(isAbTestingSelected(null), false);
      assert.equal(isAbTestingSelected(undefined), false);
      assert.equal(isAbTestingSelected({ "5": [] }), false);
      assert.equal(isAbTestingSelected({ "5": null }), false);
      assert.equal(isAbTestingSelected({ "5": "invalid unrelated string" }), false);
    });

    test("isQuestionSkipped only skips Q6 when A/B testing is not selected", () => {
      // Without A/B testing: Q6 is skipped
      assert.equal(isQuestionSkipped(6, { "5": ["Objective classification of sound characteristics"] }), true);
      assert.equal(isQuestionSkipped(6, {}), true);

      // With A/B testing: Q6 is NOT skipped
      assert.equal(
        isQuestionSkipped(6, { "5": ["Before-and-after comparison of modifications"] }),
        false,
      );

      // Other questions are never skipped
      for (const order of [1, 2, 3, 4, 5, 7, 8, 9, 10]) {
        assert.equal(isQuestionSkipped(order, {}), false);
        assert.equal(
          isQuestionSkipped(order, { "5": ["Before-and-after comparison of modifications"] }),
          false,
        );
      }
    });
  });

  describe("question navigation & skip branching", () => {
    const questions = SEED_QUESTIONS;

    test("advancing from Q5 (index 4) skips Q6 (index 5) directly to Q7 (index 6) when A/B testing is not selected", () => {
      const answersWithoutAb = {
        "1": "Newcomer / Beginner",
        "2": ["Haven't modded yet / None"],
        "3": 3,
        "4": "Deep & Low-pitched",
        "5": ["Objective classification of sound characteristics"],
      };

      const nextIndex = getNextQuestionIndex(4, questions, answersWithoutAb);
      assert.equal(nextIndex, 6);
      assert.equal(questions[nextIndex].order, 7);
    });

    test("advancing from Q5 (index 4) lands on Q6 (index 5) when A/B testing IS selected", () => {
      const answersWithAb = {
        "1": "Newcomer / Beginner",
        "2": ["Haven't modded yet / None"],
        "3": 3,
        "4": "Deep & Low-pitched",
        "5": [
          "Objective classification of sound characteristics",
          "Before-and-after comparison of modifications",
        ],
      };

      const nextIndex = getNextQuestionIndex(4, questions, answersWithAb);
      assert.equal(nextIndex, 5);
      assert.equal(questions[nextIndex].order, 6);
    });

    test("going back from Q7 (index 6) returns directly to Q5 (index 4) when A/B testing is not selected", () => {
      const answersWithoutAb = {
        "5": ["Objective classification of sound characteristics"],
      };

      const prevIndex = getPrevQuestionIndex(6, questions, answersWithoutAb);
      assert.equal(prevIndex, 4);
      assert.equal(questions[prevIndex].order, 5);
    });

    test("going back from Q7 (index 6) returns to Q6 (index 5) when A/B testing IS selected", () => {
      const answersWithAb = {
        "5": ["Before-and-after comparison of modifications"],
      };

      const prevIndex = getPrevQuestionIndex(6, questions, answersWithAb);
      assert.equal(prevIndex, 5);
      assert.equal(questions[prevIndex].order, 6);
    });

    test("going back from Q6 (index 5) returns to Q5 (index 4)", () => {
      const answersWithAb = {
        "5": ["Before-and-after comparison of modifications"],
      };

      const prevIndex = getPrevQuestionIndex(5, questions, answersWithAb);
      assert.equal(prevIndex, 4);
      assert.equal(questions[prevIndex].order, 5);
    });

    test("going back from Q1 (index 0) returns -1", () => {
      assert.equal(getPrevQuestionIndex(0, questions, {}), -1);
    });

    test("advancing past last question returns index >= length", () => {
      const lastIndex = questions.length - 1;
      const nextIndex = getNextQuestionIndex(lastIndex, questions, {});
      assert.ok(nextIndex >= questions.length);
    });
  });

  describe("active questions & progress calculation", () => {
    const questions = SEED_QUESTIONS;

    test("active question count is 9 when Q6 is skipped, and 10 when Q6 is active", () => {
      const activeWhenSkipped = getActiveQuestions(questions, {
        "5": ["Objective classification of sound characteristics"],
      });
      assert.equal(activeWhenSkipped.length, 9);
      assert.equal(activeWhenSkipped.some((q) => q.order === 6), false);

      const activeWhenIncluded = getActiveQuestions(questions, {
        "5": ["Before-and-after comparison of modifications"],
      });
      assert.equal(activeWhenIncluded.length, 10);
      assert.equal(activeWhenIncluded.some((q) => q.order === 6), true);
    });

    test("getActiveIndex tracks position within active questions", () => {
      const answersSkipped = {
        "5": ["Objective classification of sound characteristics"],
      };

      // Q1 (index 0) -> activeIndex 0
      assert.equal(getActiveIndex(questions, 0, answersSkipped), 0);
      // Q5 (index 4) -> activeIndex 4
      assert.equal(getActiveIndex(questions, 4, answersSkipped), 4);
      // Q7 (index 6, immediately after Q5) -> activeIndex 5
      assert.equal(getActiveIndex(questions, 6, answersSkipped), 5);
      // Q10 (index 9) -> activeIndex 8
      assert.equal(getActiveIndex(questions, 9, answersSkipped), 8);

      const answersActive = {
        "5": ["Before-and-after comparison of modifications"],
      };
      // When Q6 is active: Q7 (index 6) -> activeIndex 6
      assert.equal(getActiveIndex(questions, 6, answersActive), 6);
      // Q10 (index 9) -> activeIndex 9
      assert.equal(getActiveIndex(questions, 9, answersActive), 9);
    });
  });

  describe("enrichQuestionChoices", () => {
    test("enriches Notion questions missing Q2 'Haven't modded yet / None'", () => {
      // Simulate Notion returning Q2 with only the 4 original options
      const notionQuestions = [
        {
          id: "q2-notion",
          order: 2,
          type: "multi_choice",
          title: "How do you decide...",
          description: null,
          required: true,
          allowOther: true,
          choices: [
            { value: "YouTube sound tests", label: "YouTube sound tests", image: null },
            { value: "Pure trial-and-error", label: "Pure trial-and-error", image: null },
            { value: "Sound test recordings", label: "Sound test recordings", image: null },
            { value: "Recommendations on Reddit", label: "Recommendations on Reddit", image: null },
          ],
          scaleMax: 5,
          scaleMinLabel: null,
          scaleMaxLabel: null,
        },
      ];

      const enriched = enrichQuestionChoices(notionQuestions, SEED_QUESTIONS);
      const q2Enriched = enriched[0];
      const labels = q2Enriched.choices.map((c) => c.label);
      assert.ok(labels.includes("Haven't modded yet / None"));
      assert.ok(q2Enriched.choices.some((c) => c.value === "I haven't modified my keyboard yet / None"));
    });

    test("enriches Notion questions missing Q6 'Not interested in A/B testing'", () => {
      // Simulate Notion returning Q6 with only the 5 hardware options
      const notionQuestions = [
        {
          id: "q6-notion",
          order: 6,
          type: "multi_choice",
          title: "A/B testing...",
          description: null,
          required: true,
          allowOther: true,
          choices: [
            { value: "Switch types", label: "Switch types", image: null },
            { value: "Lubed vs. unlubed", label: "Lubed vs. unlubed", image: null },
            { value: "Plate materials", label: "Plate materials", image: null },
            { value: "Foam", label: "Foam", image: null },
            { value: "Keycap", label: "Keycap", image: null },
          ],
          scaleMax: 5,
          scaleMinLabel: null,
          scaleMaxLabel: null,
        },
      ];

      const enriched = enrichQuestionChoices(notionQuestions, SEED_QUESTIONS);
      const q6Enriched = enriched[0];
      const labels = q6Enriched.choices.map((c) => c.label);
      assert.ok(labels.includes("Not interested in A/B testing"));
      assert.ok(q6Enriched.choices.some((c) => c.value === "None / Not interested in A/B testing"));
    });

    test("restores missing choice images from seed", () => {
      const notionQ5 = [
        {
          id: "q5-notion",
          order: 5,
          type: "multi_choice",
          title: "Valuable features",
          description: null,
          required: true,
          allowOther: true,
          choices: [
            {
              value: "Before-and-after (A/B) comparison of modifications",
              label: "Before-and-after comparison of modifications",
              image: null, // missing in Notion
            },
          ],
          scaleMax: 5,
          scaleMinLabel: null,
          scaleMaxLabel: null,
        },
      ];

      const enriched = enrichQuestionChoices(notionQ5, SEED_QUESTIONS);
      const abChoice = enriched[0].choices.find((c) =>
        c.label.includes("Before-and-after"),
      );
      assert.equal(abChoice.image, "q5-ab-comparison.jpg");
    });

    test("normalizes choice label to seed short label if Notion had label defaulted to value", () => {
      const notionQ2WithoutSeparateLabels = [
        {
          id: "q2-notion",
          order: 2,
          type: "multi_choice",
          title: "How do you decide...",
          description: null,
          required: true,
          allowOther: true,
          choices: [
            {
              value: "I haven't modified my keyboard yet / None",
              label: "I haven't modified my keyboard yet / None", // unnormalized
              image: null,
            },
          ],
          scaleMax: 5,
          scaleMinLabel: null,
          scaleMaxLabel: null,
        },
      ];

      const enriched = enrichQuestionChoices(notionQ2WithoutSeparateLabels, SEED_QUESTIONS);
      const choice = enriched[0].choices.find((c) =>
        c.value.includes("haven't modified"),
      );
      assert.ok(choice);
      assert.equal(choice.label, "Haven't modded yet / None");
    });
  });

  describe("submission validation & answered count with conditional skipping", () => {
    const questions = SEED_QUESTIONS;

    const baseSubmission = {
      answers: {
        "1": "Newcomer / Beginner",
        "2": ["Haven't modded yet / None"],
        "3": 4,
        "4": "Deep & Low-pitched",
        "5": ["Objective classification of sound characteristics"], // A/B testing NOT selected
        "7": {
          "Live visual feedback while recording": 5,
          "Detailed acoustic telemetry reports": 4,
          "Offline capability": 3,
          "Actionable modding advice": 4,
        },
        "8": ["Concrete modding steps"],
        "9": "Great project!",
        "10": "@discord_handle",
      },
      other: {},
    };

    test("validate passes for complete submission when Q6 is conditionally skipped", () => {
      const issues = validate(questions, baseSubmission, { requireAll: true });
      assert.deepEqual(issues, []);
    });

    test("countAnswered returns 9 when Q6 is skipped", () => {
      assert.equal(countAnswered(questions, baseSubmission), 9);
    });

    test("validate fails if Q6 is required when A/B testing IS selected in Q5 and Q6 is not answered", () => {
      const submissionWithAb = {
        answers: {
          ...baseSubmission.answers,
          "5": ["Before-and-after comparison of modifications"],
          // Q6 is omitted!
        },
        other: {},
      };

      const issues = validate(questions, submissionWithAb, { requireAll: true });
      assert.ok(issues.includes("Q6 is required"));
    });

    test("validate passes and countAnswered is 10 when A/B testing is selected and Q6 is answered", () => {
      const completeSubmission = {
        answers: {
          ...baseSubmission.answers,
          "5": ["Before-and-after comparison of modifications"],
          "6": ["Not interested in A/B testing"],
        },
        other: {},
      };

      const issues = validate(questions, completeSubmission, { requireAll: true });
      assert.deepEqual(issues, []);
      assert.equal(countAnswered(questions, completeSubmission), 10);
    });
  });
});

