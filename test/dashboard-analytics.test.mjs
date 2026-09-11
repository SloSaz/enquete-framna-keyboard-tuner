import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMean,
  calculatePercentile,
  calculateStdDev,
  computeAnalytics,
  escapeCSVCell,
  exportResponsesToCSV,
  extractCommonKeywords,
  generateDemoResponses,
  round,
} from "../lib/dashboard-data.ts";
import { SEED_QUESTIONS } from "../lib/seed-questions.ts";
import { verifyPassword } from "../lib/dashboard-auth.ts";

describe("Dashboard Analytics Engine", () => {
  describe("Statistical calculations", () => {
    test("round() rounds to requested decimals", () => {
      assert.equal(round(3.14159, 2), 3.14);
      assert.equal(round(3.14159, 0), 3);
      assert.equal(round(12.555, 1), 12.6);
    });

    test("calculateMean() computes arithmetic mean", () => {
      assert.equal(calculateMean([1, 2, 3, 4, 5]), 3);
      assert.equal(calculateMean([10, 20]), 15);
      assert.equal(calculateMean([]), 0);
      assert.equal(calculateMean([42]), 42);
    });

    test("calculateStdDev() computes population standard deviation", () => {
      assert.equal(calculateStdDev([], 0), 0);
      assert.equal(calculateStdDev([5], 5), 0);
      // [2, 4, 4, 4, 5, 5, 7, 9]: mean = 5, variance = 4, stdDev = 2
      const vals = [2, 4, 4, 4, 5, 5, 7, 9];
      assert.equal(round(calculateStdDev(vals, 5), 2), 2);
    });

    test("calculatePercentile() computes quartiles and median", () => {
      assert.equal(calculatePercentile([], 0.5), 0);
      assert.equal(calculatePercentile([10], 0.5), 10);

      const sorted = [10, 20, 30, 40, 50];
      assert.equal(calculatePercentile(sorted, 0.5), 30); // Median
      assert.equal(calculatePercentile(sorted, 0.25), 20); // Q1
      assert.equal(calculatePercentile(sorted, 0.75), 40); // Q3
    });
  });

  describe("Keyword extraction", () => {
    test("extracts common meaningful words and ignores stop words", () => {
      const texts = [
        "Acoustic frequency spectrum and resonance telemetry",
        "Better microphone calibration for frequency spectrum",
        "Acoustic telemetry for plate resonance",
      ];
      const keywords = extractCommonKeywords(texts, 5);
      const words = keywords.map((k) => k.word);

      assert.ok(words.includes("frequency"));
      assert.ok(words.includes("spectrum"));
      assert.ok(words.includes("telemetry"));
      assert.ok(words.includes("resonance"));
      assert.ok(!words.includes("and"));
      assert.ok(!words.includes("for"));
    });
  });

  describe("CSV Exporter RFC 4180", () => {
    test("escapes cells containing commas, quotes, and newlines", () => {
      assert.equal(escapeCSVCell("Normal text"), "Normal text");
      assert.equal(escapeCSVCell('Text with "quotes"'), '"Text with ""quotes"""');
      assert.equal(escapeCSVCell("Item 1, Item 2"), '"Item 1, Item 2"');
      assert.equal(escapeCSVCell("Line 1\nLine 2"), '"Line 1\nLine 2"');
      assert.equal(escapeCSVCell(null), "");
      assert.equal(escapeCSVCell(undefined), "");
      assert.equal(escapeCSVCell(42), "42");
    });

    test("exportResponsesToCSV produces valid header and escaped rows with BOM", () => {
      const demoData = generateDemoResponses().slice(0, 3);
      const csv = exportResponsesToCSV(SEED_QUESTIONS, demoData);

      // Verify UTF-8 BOM prefix
      assert.ok(csv.startsWith("\uFEFF"));

      const lines = csv.slice(1).split("\r\n");
      assert.ok(lines.length >= 4); // Header + 3 data rows

      // Check header
      const header = lines[0];
      assert.ok(header.includes("Response ID"));
      assert.ok(header.includes("Status"));
      assert.ok(header.includes("Duration (seconds)"));
      assert.ok(header.includes("Q1 Experience Level"));
      assert.ok(header.includes("Q3 YouTube Accuracy Rating (1-5)"));

      // Check row 1
      assert.ok(lines[1].startsWith("r_demo_01"));

      // Empty responses export should still produce valid header with BOM
      const emptyCsv = exportResponsesToCSV(SEED_QUESTIONS, []);
      assert.ok(emptyCsv.startsWith("\uFEFF"));
      const emptyLines = emptyCsv.slice(1).split("\r\n");
      assert.equal(emptyLines.length, 1);
      assert.ok(emptyLines[0].includes("Response ID"));
    });
  });

  describe("Funnel & Drop-off Analysis", () => {
    test("handles empty responses array gracefully without throwing or NaN", () => {
      const emptyAnalytics = computeAnalytics(SEED_QUESTIONS, []);
      assert.equal(emptyAnalytics.metrics.totalResponses, 0);
      assert.equal(emptyAnalytics.metrics.completedCount, 0);
      assert.equal(emptyAnalytics.metrics.inProgressCount, 0);
      assert.equal(emptyAnalytics.metrics.completionRate, 0);
      assert.equal(emptyAnalytics.metrics.avgDurationSec, null);
      assert.equal(emptyAnalytics.metrics.medianDurationSec, null);
      assert.equal(emptyAnalytics.metrics.minDurationSec, null);
      assert.equal(emptyAnalytics.metrics.maxDurationSec, null);
      assert.equal(emptyAnalytics.metrics.iqrDurationSec, null);
      assert.equal(emptyAnalytics.metrics.avgAnsweredCount, 0);
      assert.equal(emptyAnalytics.topDropOffQuestion, null);
      assert.equal(emptyAnalytics.allOtherWriteIns.length, 0);
      assert.equal(emptyAnalytics.keyInsights.length, 0);

      for (const step of emptyAnalytics.funnel) {
        assert.equal(step.reached, 0);
        assert.equal(step.answered, 0);
        assert.equal(step.dropOffCount, 0);
        assert.equal(step.dropOffRate, 0);
        assert.equal(step.retentionRate, 0);
      }
    });

    test("correctly calculates drop-off counts and rates", () => {
      const mockResponses = [
        // Completed all 10
        {
          id: "1",
          responseId: "r_1",
          status: "Complete",
          startedAt: "2026-09-11T12:00:00Z",
          submittedAt: "2026-09-11T12:03:00Z",
          durationSec: 180,
          answeredCount: 10,
          answers: {
            "1": "Enthusiast",
            "2": ["YouTube sound tests / build streams"],
            "3": 3,
            "4": "Deep & Low-pitched",
            "5": ["Objective classification of sound characteristics"],
            "6": ["Switch types"],
            "7": { "Live visual feedback while recording": 5 },
            "8": ["Concrete modding steps"],
            "9": "Great app",
            "10": "contact@test.com",
          },
          other: {},
        },
        // In progress - abandoned at Q2
        {
          id: "2",
          responseId: "r_2",
          status: "In progress",
          startedAt: "2026-09-11T12:00:00Z",
          submittedAt: null,
          durationSec: null,
          answeredCount: 2,
          answers: {
            "1": "Newcomer / Beginner",
            "2": ["YouTube sound tests / build streams"],
          },
          other: {},
        },
        // In progress - abandoned at Q1
        {
          id: "3",
          responseId: "r_3",
          status: "In progress",
          startedAt: "2026-09-11T12:00:00Z",
          submittedAt: null,
          durationSec: null,
          answeredCount: 1,
          answers: {
            "1": "Newcomer / Beginner",
          },
          other: {},
        },
      ];

      const analytics = computeAnalytics(SEED_QUESTIONS, mockResponses);

      assert.equal(analytics.metrics.totalResponses, 3);
      assert.equal(analytics.metrics.completedCount, 1);
      assert.equal(analytics.metrics.inProgressCount, 2);
      assert.equal(round(analytics.metrics.completionRate, 1), 33.3);

      // Funnel step checks
      const q1Step = analytics.funnel.find((s) => s.order === 1);
      assert.ok(q1Step);
      assert.equal(q1Step.reached, 3);
      assert.equal(q1Step.answered, 3);
      assert.equal(q1Step.dropOffCount, 1); // r_3 dropped here
      assert.equal(q1Step.dropOffRate, 33.3);

      const q2Step = analytics.funnel.find((s) => s.order === 2);
      assert.ok(q2Step);
      assert.equal(q2Step.reached, 2); // r_1 and r_2
      assert.equal(q2Step.answered, 2);
      assert.equal(q2Step.dropOffCount, 1); // r_2 dropped here
      assert.equal(q2Step.dropOffRate, 50);

      const q3Step = analytics.funnel.find((s) => s.order === 3);
      assert.ok(q3Step);
      assert.equal(q3Step.reached, 1); // only r_1
      assert.equal(q3Step.dropOffCount, 0);
      assert.equal(q3Step.dropOffRate, 0);

      // Top drop off should be either Q1 or Q2
      assert.ok(analytics.topDropOffQuestion !== null);
      assert.ok([1, 2].includes(analytics.topDropOffQuestion.order));
      assert.ok(analytics.topDropOffQuestion.dropOffRate > 0);
    });
  });

  describe("Question Rankings & Qualitative Extraction", () => {
    test("computes mostAnswered and leastAnswered rankings and extracts all Other write-ins", () => {
      const demoData = generateDemoResponses();
      const analytics = computeAnalytics(SEED_QUESTIONS, demoData);

      assert.equal(analytics.mostAnsweredQuestions.length, SEED_QUESTIONS.length);
      assert.equal(analytics.leastAnsweredQuestions.length, SEED_QUESTIONS.length);

      // Most answered first item should have higher or equal count than last
      assert.ok(
        analytics.mostAnsweredQuestions[0].answeredCount >=
          analytics.mostAnsweredQuestions[analytics.mostAnsweredQuestions.length - 1].answeredCount,
      );

      // Least answered first item should have lower or equal count than last
      assert.ok(
        analytics.leastAnsweredQuestions[0].answeredCount <=
          analytics.leastAnsweredQuestions[analytics.leastAnsweredQuestions.length - 1].answeredCount,
      );

      // Check allOtherWriteIns
      assert.ok(Array.isArray(analytics.allOtherWriteIns));
      assert.ok(analytics.allOtherWriteIns.length > 0);
      for (const entry of analytics.allOtherWriteIns) {
        assert.ok(entry.questionOrder > 0);
        assert.ok(typeof entry.text === "string" && entry.text.length > 0);
        assert.ok(entry.responseId.startsWith("r_demo_"));
      }
    });
  });

  describe("Cross-Tabulation & Questions Distributions", () => {
    test("computes demographic groupings and statistics", () => {
      const demoData = generateDemoResponses();
      const analytics = computeAnalytics(SEED_QUESTIONS, demoData);

      // Verify cross-tab presence
      assert.equal(analytics.crossTabs.length, 3);
      const groups = analytics.crossTabs.map((c) => c.experience);
      assert.ok(groups.includes("Newcomer / Beginner"));
      assert.ok(groups.includes("Enthusiast"));
      assert.ok(groups.includes("Expert / Custom Builder"));

      // Q3 Scale stats check
      const q3 = analytics.questionStats[3];
      assert.equal(q3.kind, "scale");
      assert.ok(q3.mean > 0 && q3.mean <= 5);
      assert.ok(q3.stdDev >= 0);
      assert.ok(q3.median >= 1 && q3.median <= 5);
      assert.ok(q3.min >= 1 && q3.min <= 5);
      assert.ok(q3.max >= q3.min && q3.max <= 5);

      // Q7 Grid stats check
      const q7 = analytics.questionStats[7];
      assert.equal(q7.kind, "grid");
      assert.equal(q7.rows.length, 4);
      for (const row of q7.rows) {
        assert.ok(row.mean >= 1 && row.mean <= 5);
        assert.ok(row.stdDev >= 0);
        assert.ok(row.min >= 1 && row.min <= 5);
        assert.ok(row.max >= row.min && row.max <= 5);
      }
    });

    test("abCompareWantedPercent correctly excludes respondents who selected 'Not interested in A/B testing'", () => {
      const mockResponses = [
        {
          id: "r1",
          responseId: "r1",
          status: "Complete",
          startedAt: "2026-09-11T12:00:00Z",
          submittedAt: "2026-09-11T12:03:00Z",
          durationSec: 180,
          answeredCount: 10,
          answers: {
            "1": "Newcomer / Beginner",
            "5": ["Before-and-after comparison of modifications"],
            "6": ["Not interested in A/B testing"], // explicitly NOT interested
          },
          other: {},
        },
        {
          id: "r2",
          responseId: "r2",
          status: "Complete",
          startedAt: "2026-09-11T12:00:00Z",
          submittedAt: "2026-09-11T12:03:00Z",
          durationSec: 180,
          answeredCount: 10,
          answers: {
            "1": "Newcomer / Beginner",
            "5": ["Before-and-after comparison of modifications"],
            "6": ["Switch types"], // interested in switch A/B comparison
          },
          other: {},
        },
        {
          id: "r3",
          responseId: "r3",
          status: "Complete",
          startedAt: "2026-09-11T12:00:00Z",
          submittedAt: "2026-09-11T12:03:00Z",
          durationSec: 180,
          answeredCount: 9,
          answers: {
            "1": "Newcomer / Beginner",
            "5": ["Objective classification of sound characteristics"], // Q6 skipped entirely
          },
          other: {},
        },
      ];

      const analytics = computeAnalytics(SEED_QUESTIONS, mockResponses);
      const beginnerGroup = analytics.crossTabs.find((c) => c.experience === "Newcomer / Beginner");
      assert.ok(beginnerGroup);
      assert.equal(beginnerGroup.count, 3);
      // Only 1 out of 3 wanted A/B comparisons (r2)
      assert.equal(beginnerGroup.abCompareWantedPercent, 33.3);
    });
  });

  describe("Simulated dataset consistency", () => {
    test("generateDemoResponses() creates valid unique cohort records", () => {
      const cohort = generateDemoResponses();
      assert.ok(cohort.length >= 25);

      const ids = new Set();
      for (const r of cohort) {
        assert.ok(r.responseId.startsWith("r_demo_"));
        assert.ok(!ids.has(r.responseId), `Duplicate ID ${r.responseId}`);
        ids.add(r.responseId);

        if (r.status === "Complete") {
          assert.ok(typeof r.durationSec === "number" && r.durationSec > 0);
          assert.ok(r.submittedAt !== null);
        } else {
          assert.equal(r.status, "In progress");
          assert.equal(r.durationSec, null);
        }
      }
    });
  });

  describe("Dashboard Authentication", () => {
    test("verifyPassword handles PIN 8521 and configured passwords safely", () => {
      // Default is PIN 8521
      delete process.env.DASHBOARD_PASSWORD;
      assert.equal(verifyPassword("8521"), true);
      assert.equal(verifyPassword(" 8521 "), true);
      assert.equal(verifyPassword("wrong"), false);

      // With custom password configured
      process.env.DASHBOARD_PASSWORD = "secret_research_password";
      assert.equal(verifyPassword("secret_research_password"), true);
      assert.equal(verifyPassword("  secret_research_password  "), true);
      assert.equal(verifyPassword("wrong_password"), false);
      assert.equal(verifyPassword(""), false);
      delete process.env.DASHBOARD_PASSWORD;
    });

    test("checkDashboardAuth authorizes with matching url query key without setting cookies", async () => {
      const { checkDashboardAuth } = await import("../lib/dashboard-auth.ts");
      process.env.DASHBOARD_PASSWORD = "url_test_password";

      // Valid key in URL parameter authorizes immediately
      const ok = await checkDashboardAuth("url_test_password");
      assert.equal(ok, true);

      // Invalid key fails
      const fail = await checkDashboardAuth("invalid_key");
      assert.equal(fail, false);

      delete process.env.DASHBOARD_PASSWORD;
    });
  });
});
