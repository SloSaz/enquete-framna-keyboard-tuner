import test, { describe } from "node:test";
import assert from "node:assert/strict";

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
});
