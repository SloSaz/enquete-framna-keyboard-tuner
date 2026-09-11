import type { Question } from "./questions";

export type SurveyResponseRecord = {
  id: string;
  responseId: string;
  status: "In progress" | "Complete" | "Unknown";
  startedAt: string | null;
  submittedAt: string | null;
  durationSec: number | null;
  answeredCount: number;
  answers: {
    "1"?: string | null;
    "2"?: string[] | null;
    "3"?: number | null;
    "4"?: string | null;
    "5"?: string[] | null;
    "6"?: string[] | null;
    "7"?: Record<string, number> | null;
    "8"?: string[] | null;
    "9"?: string | null;
    "10"?: string | null;
    [key: string]: unknown;
  };
  other: {
    "2"?: string;
    "5"?: string;
    "6"?: string;
    "8"?: string;
    [key: string]: string | undefined;
  };
};

export type SummaryMetrics = {
  totalResponses: number;
  completedCount: number;
  inProgressCount: number;
  completionRate: number; // 0-100
  avgDurationSec: number | null;
  medianDurationSec: number | null;
  minDurationSec: number | null;
  maxDurationSec: number | null;
  iqrDurationSec: number | null;
  avgAnsweredCount: number;
};

export type FunnelStep = {
  order: number;
  title: string;
  type: string;
  reached: number;
  answered: number;
  retentionRate: number; // % of total starting
  dropOffCount: number; // respondents who stopped here
  dropOffRate: number; // % drop from previous question
};

export type SingleChoiceStat = {
  kind: "single_choice";
  answeredCount: number;
  counts: Record<string, number>;
  percentages: Record<string, number>;
  mode: string | null;
};

export type MultiChoiceStat = {
  kind: "multi_choice";
  answeredCount: number;
  counts: Record<string, number>;
  percentages: Record<string, number>; // % of answered who selected
  avgOptionsPerRespondent: number;
  otherCount: number;
  otherResponses: { responseId: string; text: string }[];
};

export type ScaleStat = {
  kind: "scale";
  answeredCount: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  counts: Record<number, number>;
  percentages: Record<number, number>;
  positiveRate: number; // % 4 or 5
  neutralRate: number; // % 3
  negativeRate: number; // % 1 or 2
};

export type GridStat = {
  kind: "grid";
  answeredCount: number;
  rows: {
    row: string;
    label: string;
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    counts: Record<number, number>;
    percentages: Record<number, number>;
    highPriorityRate: number; // % 4 or 5
  }[];
  topRankedRow: string | null;
};

export type OpenTextEntry = {
  responseId: string;
  text: string;
  date: string | null;
  status: string;
};

export type OtherWriteInEntry = {
  questionOrder: number;
  questionTitle: string;
  responseId: string;
  text: string;
  date: string | null;
  status: string;
};

export type QuestionRankingItem = {
  order: number;
  title: string;
  type: string;
  answeredCount: number;
  answerRate: number; // % of total responses
};

export type OpenTextStat = {
  kind: "text";
  answeredCount: number;
  responseRate: number;
  entries: OpenTextEntry[];
  commonKeywords: { word: string; count: number }[];
};

export type QuestionStat =
  | SingleChoiceStat
  | MultiChoiceStat
  | ScaleStat
  | GridStat
  | OpenTextStat;

export type CrossTabRow = {
  experience: string;
  count: number;
  percentOfTotal: number;
  avgYtAccuracy: number | null;
  topSoundSignature: string | null;
  topValuableFeature: string | null;
  abCompareWantedPercent: number;
};

export type DashboardAnalytics = {
  metrics: SummaryMetrics;
  funnel: FunnelStep[];
  topDropOffQuestion: {
    order: number;
    title: string;
    dropOffRate: number;
    count: number;
  } | null;
  questionStats: Record<number, QuestionStat>;
  mostAnsweredQuestions: QuestionRankingItem[];
  leastAnsweredQuestions: QuestionRankingItem[];
  allOtherWriteIns: OtherWriteInEntry[];
  crossTabs: CrossTabRow[];
  openTextQ9: OpenTextEntry[];
  openTextQ10: OpenTextEntry[];
  keyInsights: string[];
};

// ==========================================
// Math and Statistical Helpers
// ==========================================

export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function calculatePercentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const index = p * (sortedAsc.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedAsc[lower] * (1 - weight) + sortedAsc[upper] * weight;
}

export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, curr) => acc + curr, 0);
  return sum / values.length;
}

export function calculateStdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const sumSquares = values.reduce((acc, curr) => acc + (curr - mean) ** 2, 0);
  return Math.sqrt(sumSquares / values.length);
}

// ==========================================
// Text & Keyword Analysis
// ==========================================

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't",
  "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during",
  "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i",
  "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's",
  "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself",
  "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought",
  "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she",
  "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
  "than", "that", "that's", "the", "their", "theirs", "them", "themselves",
  "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up",
  "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
  "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves", "also", "would", "like", "app", "keyboard", "keyboards",
  "can", "just", "see", "get", "one", "sound", "sounds"
]);

export function extractCommonKeywords(
  texts: string[],
  topN = 10,
): { word: string; count: number }[] {
  const counts: Record<string, number> = {};

  for (const text of texts) {
    if (!text) continue;
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-_]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    const seenInText = new Set<string>();
    for (const w of words) {
      if (!seenInText.has(w)) {
        seenInText.add(w);
        counts[w] = (counts[w] || 0) + 1;
      }
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

// ==========================================
// Analytics Computation Engine
// ==========================================

export function computeAnalytics(
  questions: Question[],
  responses: SurveyResponseRecord[],
): DashboardAnalytics {
  const total = responses.length;
  const completed = responses.filter((r) => r.status === "Complete");
  const inProgress = responses.filter((r) => r.status === "In progress");
  const completedCount = completed.length;
  const inProgressCount = inProgress.length;
  const completionRate = total > 0 ? round((completedCount / total) * 100, 1) : 0;

  // Duration stats from completed responses
  const durations = completed
    .map((r) => r.durationSec)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d) && d > 0)
    .sort((a, b) => a - b);

  let avgDurationSec: number | null = null;
  let medianDurationSec: number | null = null;
  let minDurationSec: number | null = null;
  let maxDurationSec: number | null = null;
  let iqrDurationSec: number | null = null;

  if (durations.length > 0) {
    avgDurationSec = round(calculateMean(durations), 0);
    medianDurationSec = round(calculatePercentile(durations, 0.5), 0);
    minDurationSec = durations[0];
    maxDurationSec = durations[durations.length - 1];
    const q1 = calculatePercentile(durations, 0.25);
    const q3 = calculatePercentile(durations, 0.75);
    iqrDurationSec = round(q3 - q1, 0);
  }

  const avgAnsweredCount =
    total > 0
      ? round(
          responses.reduce((sum, r) => sum + (r.answeredCount || 0), 0) / total,
          1,
        )
      : 0;

  const metrics: SummaryMetrics = {
    totalResponses: total,
    completedCount,
    inProgressCount,
    completionRate,
    avgDurationSec,
    medianDurationSec,
    minDurationSec,
    maxDurationSec,
    iqrDurationSec,
    avgAnsweredCount,
  };

  // Helper to check if a response answered a question
  function isQuestionAnswered(
    r: SurveyResponseRecord,
    q: Question,
  ): boolean {
    const key = String(q.order);
    const ans = r.answers[key];
    const other = r.other?.[key]?.trim();

    if (other) return true;
    if (ans === undefined || ans === null || ans === "") return false;
    if (Array.isArray(ans)) return ans.length > 0;
    if (q.type === "grid" || (typeof ans === "object" && !Array.isArray(ans))) {
      const obj = ans as Record<string, unknown>;
      const entries = Object.entries(obj);
      if (entries.length === 0) return false;
      return entries.some(([, val]) => typeof val === "number" && val > 0);
    }
    return true;
  }

  // Find the highest question order answered by a response
  function getHighestAnsweredOrder(r: SurveyResponseRecord): number {
    let max = 0;
    for (const q of questions) {
      if (isQuestionAnswered(r, q)) {
        max = Math.max(max, q.order);
      }
    }
    return max;
  }

  // ==========================================
  // Drop-off & Funnel Analysis
  // ==========================================
  const funnel: FunnelStep[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const order = q.order;

    // A respondent reached question i if:
    // It is Q1 (every respondent began the questionnaire), OR they completed the survey,
    // OR their highest answered question order is >= this question.
    const reached = responses.filter((r) => {
      if (order === 1) return true;
      if (r.status === "Complete") return true;
      const highest = getHighestAnsweredOrder(r);
      return highest >= order;
    }).length;

    const answered = responses.filter((r) => isQuestionAnswered(r, q)).length;

    // Drop-off at this question:
    // In-progress respondents whose journey ended at this question.
    // For Q1, includes respondents who stopped with highest === 1 or highest === 0.
    const dropOffCount = inProgress.filter((r) => {
      const highest = getHighestAnsweredOrder(r);
      if (order === 1) {
        return highest === 1 || highest === 0;
      }
      return highest === order;
    }).length;

    const retentionRate = total > 0 ? round((reached / total) * 100, 1) : 0;
    const dropOffRate = reached > 0 ? round((dropOffCount / reached) * 100, 1) : 0;

    funnel.push({
      order,
      title: q.title,
      type: q.type,
      reached,
      answered,
      retentionRate,
      dropOffCount,
      dropOffRate,
    });
  }

  // Top drop-off point
  let topDropOffQuestion: DashboardAnalytics["topDropOffQuestion"] = null;
  const sortedByDropOff = [...funnel].sort((a, b) => b.dropOffCount - a.dropOffCount);
  if (sortedByDropOff.length > 0 && sortedByDropOff[0].dropOffCount > 0) {
    const top = sortedByDropOff[0];
    topDropOffQuestion = {
      order: top.order,
      title: top.title,
      dropOffRate: top.dropOffRate,
      count: top.dropOffCount,
    };
  }

  // ==========================================
  // Question-by-Question Deep Dive
  // ==========================================
  const questionStats: Record<number, QuestionStat> = {};
  const openTextQ9: OpenTextEntry[] = [];
  const openTextQ10: OpenTextEntry[] = [];

  for (const q of questions) {
    const key = String(q.order);

    if (q.type === "single_choice") {
      const counts: Record<string, number> = {};
      for (const choice of q.choices) counts[choice.label] = 0;

      let answeredCount = 0;
      for (const r of responses) {
        const val = r.answers[key];
        if (typeof val === "string" && val.trim()) {
          counts[val] = (counts[val] || 0) + 1;
          answeredCount++;
        }
      }

      const percentages: Record<string, number> = {};
      let mode: string | null = null;
      let maxCount = -1;

      for (const [choice, count] of Object.entries(counts)) {
        percentages[choice] = answeredCount > 0 ? round((count / answeredCount) * 100, 1) : 0;
        if (count > maxCount && count > 0) {
          maxCount = count;
          mode = choice;
        }
      }

      questionStats[q.order] = {
        kind: "single_choice",
        answeredCount,
        counts,
        percentages,
        mode,
      };
    } else if (q.type === "multi_choice") {
      const counts: Record<string, number> = {};
      for (const choice of q.choices) counts[choice.label] = 0;

      let answeredCount = 0;
      let totalSelections = 0;
      const otherResponses: { responseId: string; text: string }[] = [];

      for (const r of responses) {
        const val = r.answers[key];
        const other = r.other?.[key]?.trim();
        let wasAnswered = false;

        if (Array.isArray(val) && val.length > 0) {
          wasAnswered = true;
          totalSelections += val.length;
          for (const item of val) {
            counts[item] = (counts[item] || 0) + 1;
          }
        }

        if (other) {
          wasAnswered = true;
          otherResponses.push({ responseId: r.responseId, text: other });
        }

        if (wasAnswered) answeredCount++;
      }

      const percentages: Record<string, number> = {};
      for (const [choice, count] of Object.entries(counts)) {
        percentages[choice] = answeredCount > 0 ? round((count / answeredCount) * 100, 1) : 0;
      }

      const avgOptionsPerRespondent =
        answeredCount > 0 ? round(totalSelections / answeredCount, 1) : 0;

      questionStats[q.order] = {
        kind: "multi_choice",
        answeredCount,
        counts,
        percentages,
        avgOptionsPerRespondent,
        otherCount: otherResponses.length,
        otherResponses,
      };
    } else if (q.type === "scale") {
      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const numericValues: number[] = [];

      for (const r of responses) {
        const val = r.answers[key];
        if (typeof val === "number" && Number.isInteger(val) && val >= 1 && val <= 5) {
          counts[val] = (counts[val] || 0) + 1;
          numericValues.push(val);
        }
      }

      const answeredCount = numericValues.length;
      numericValues.sort((a, b) => a - b);

      const mean = answeredCount > 0 ? round(calculateMean(numericValues), 2) : 0;
      const median = answeredCount > 0 ? round(calculatePercentile(numericValues, 0.5), 1) : 0;
      const stdDev = answeredCount > 0 ? round(calculateStdDev(numericValues, mean), 2) : 0;
      const min = numericValues.length > 0 ? numericValues[0] : 0;
      const max = numericValues.length > 0 ? numericValues[numericValues.length - 1] : 0;

      const percentages: Record<number, number> = {};
      for (let s = 1; s <= 5; s++) {
        percentages[s] = answeredCount > 0 ? round((counts[s] / answeredCount) * 100, 1) : 0;
      }

      const positiveCount = (counts[4] || 0) + (counts[5] || 0);
      const neutralCount = counts[3] || 0;
      const negativeCount = (counts[1] || 0) + (counts[2] || 0);

      questionStats[q.order] = {
        kind: "scale",
        answeredCount,
        mean,
        median,
        stdDev,
        min,
        max,
        counts,
        percentages,
        positiveRate: answeredCount > 0 ? round((positiveCount / answeredCount) * 100, 1) : 0,
        neutralRate: answeredCount > 0 ? round((neutralCount / answeredCount) * 100, 1) : 0,
        negativeRate: answeredCount > 0 ? round((negativeCount / answeredCount) * 100, 1) : 0,
      };
    } else if (q.type === "grid") {
      // Q7 matrix breakdown
      const rows = q.choices.map((c) => {
        const rowKey = c.label;
        const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const rowVals: number[] = [];

        for (const r of responses) {
          const gridObj = r.answers[key] as Record<string, number> | undefined;
          if (gridObj && typeof gridObj === "object") {
            const score = gridObj[rowKey];
            if (typeof score === "number" && score >= 1 && score <= 5) {
              counts[score] = (counts[score] || 0) + 1;
              rowVals.push(score);
            }
          }
        }

        rowVals.sort((a, b) => a - b);
        const count = rowVals.length;
        const min = count > 0 ? rowVals[0] : 0;
        const max = count > 0 ? rowVals[count - 1] : 0;
        const mean = count > 0 ? round(calculateMean(rowVals), 2) : 0;
        const median = count > 0 ? round(calculatePercentile(rowVals, 0.5), 1) : 0;
        const stdDev = count > 0 ? round(calculateStdDev(rowVals, mean), 2) : 0;

        const percentages: Record<number, number> = {};
        for (let s = 1; s <= 5; s++) {
          percentages[s] = count > 0 ? round((counts[s] / count) * 100, 1) : 0;
        }

        const highPriority = (counts[4] || 0) + (counts[5] || 0);
        const highPriorityRate = count > 0 ? round((highPriority / count) * 100, 1) : 0;

        return {
          row: c.value,
          label: c.label,
          mean,
          median,
          stdDev,
          min,
          max,
          counts,
          percentages,
          highPriorityRate,
        };
      });

      // Sort rows by mean descending for top ranked
      const sortedRows = [...rows].sort((a, b) => b.mean - a.mean);
      const topRankedRow = sortedRows.length > 0 && sortedRows[0].mean > 0 ? sortedRows[0].label : null;

      const answeredCount = responses.filter((r) => isQuestionAnswered(r, q)).length;

      questionStats[q.order] = {
        kind: "grid",
        answeredCount,
        rows,
        topRankedRow,
      };
    } else {
      // Paragraph or short_text (Q9, Q10)
      const entries: OpenTextEntry[] = [];
      for (const r of responses) {
        const text = r.answers[key];
        if (typeof text === "string" && text.trim()) {
          const entry: OpenTextEntry = {
            responseId: r.responseId,
            text: text.trim(),
            date: r.submittedAt || r.startedAt,
            status: r.status,
          };
          entries.push(entry);
          if (q.order === 9) openTextQ9.push(entry);
          if (q.order === 10) openTextQ10.push(entry);
        }
      }

      const commonKeywords = extractCommonKeywords(entries.map((e) => e.text), 10);
      const answeredCount = entries.length;
      const responseRate = total > 0 ? round((answeredCount / total) * 100, 1) : 0;

      questionStats[q.order] = {
        kind: "text",
        answeredCount,
        responseRate,
        entries,
        commonKeywords,
      };
    }
  }

  // ==========================================
  // Cross-Tabulation Analysis (Experience vs Sound & Trust)
  // ==========================================
  const experienceGroups = [
    "Newcomer / Beginner",
    "Enthusiast",
    "Expert / Custom Builder",
  ];

  const crossTabs: CrossTabRow[] = experienceGroups.map((exp) => {
    const group = responses.filter((r) => r.answers["1"] === exp);
    const count = group.length;
    const percentOfTotal = total > 0 ? round((count / total) * 100, 1) : 0;

    // Avg YT Accuracy (Q3)
    const ytScores = group
      .map((r) => r.answers["3"])
      .filter((s): s is number => typeof s === "number" && s >= 1 && s <= 5);
    const avgYtAccuracy = ytScores.length > 0 ? round(calculateMean(ytScores), 2) : null;

    // Top Sound Signature (Q4)
    const soundCounts: Record<string, number> = {};
    for (const r of group) {
      const snd = r.answers["4"];
      if (typeof snd === "string") soundCounts[snd] = (soundCounts[snd] || 0) + 1;
    }
    const topSound =
      Object.entries(soundCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Top Feature (Q5)
    const featCounts: Record<string, number> = {};
    for (const r of group) {
      const feats = r.answers["5"];
      if (Array.isArray(feats)) {
        for (const f of feats) featCounts[f] = (featCounts[f] || 0) + 1;
      }
    }
    const topFeature =
      Object.entries(featCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // % Wanting A/B Comparison (Q6)
    const abInterested = group.filter((r) => {
      const q6 = r.answers["6"];
      if (!Array.isArray(q6) || q6.length === 0) return false;
      return q6.some(
        (x) =>
          typeof x === "string" &&
          !x.toLowerCase().includes("not interested") &&
          !x.toLowerCase().includes("none"),
      );
    }).length;
    const abCompareWantedPercent = count > 0 ? round((abInterested / count) * 100, 1) : 0;

    return {
      experience: exp,
      count,
      percentOfTotal,
      avgYtAccuracy,
      topSoundSignature: topSound,
      topValuableFeature: topFeature,
      abCompareWantedPercent,
    };
  });

  // ==========================================
  // Executive Academic Insights Generation
  // ==========================================
  const keyInsights: string[] = [];

  if (total > 0) {
    keyInsights.push(
      `Dataset includes ${total} total submissions (${completedCount} completed, ${inProgressCount} in progress) with an overall completion rate of ${completionRate}%.`,
    );

    if (medianDurationSec !== null) {
      const mins = Math.floor(medianDurationSec / 60);
      const secs = medianDurationSec % 60;
      keyInsights.push(
        `Median completion time is ${mins > 0 ? `${mins}m ` : ""}${secs}s (IQR: ${iqrDurationSec ?? 0}s), matching the estimated 3-4 minute survey scope.`,
      );
    }

    if (topDropOffQuestion) {
      keyInsights.push(
        `Highest respondent drop-off was observed at Q${topDropOffQuestion.order} ("${topDropOffQuestion.title.slice(0, 45)}..."), accounting for ${topDropOffQuestion.count} drop-offs (${topDropOffQuestion.dropOffRate}% attrition).`,
      );
    }

    const q1Stat = questionStats[1] as SingleChoiceStat | undefined;
    if (q1Stat && q1Stat.mode) {
      keyInsights.push(
        `The respondent demographic is led by "${q1Stat.mode}" (${q1Stat.percentages[q1Stat.mode]}% of respondents).`,
      );
    }

    const q4Stat = questionStats[4] as SingleChoiceStat | undefined;
    if (q4Stat && q4Stat.mode) {
      keyInsights.push(
        `The dominant desired sound profile is "${q4Stat.mode}", selected by ${q4Stat.percentages[q4Stat.mode]}% of respondents.`,
      );
    }

    const q3Stat = questionStats[3] as ScaleStat | undefined;
    if (q3Stat) {
      keyInsights.push(
        `Trust in online/YouTube sound tests is rated at ${q3Stat.mean}/5.0 (SD: ${q3Stat.stdDev}), with ${q3Stat.negativeRate}% considering them inaccurate for their desk setup.`,
      );
    }

    const q7Stat = questionStats[7] as GridStat | undefined;
    if (q7Stat && q7Stat.topRankedRow) {
      const topRow = q7Stat.rows.find((r) => r.label === q7Stat.topRankedRow);
      keyInsights.push(
        `The highest-rated app capability is "${q7Stat.topRankedRow}" with a mean score of ${topRow?.mean ?? "N/A"}/5.0 (${topRow?.highPriorityRate ?? 0}% high priority).`,
      );
    }

    if (openTextQ9.length > 0) {
      keyInsights.push(
        `${openTextQ9.length} respondents provided qualitative feature suggestions (Q9), and ${openTextQ10.length} provided contact handles for follow-up research interviews.`,
      );
    }
  }

  // Question Answer Rankings (Most & Least Answered Questions)
  const questionRankings: QuestionRankingItem[] = questions.map((q) => {
    const answeredCount = responses.filter((r) => isQuestionAnswered(r, q)).length;
    const answerRate = total > 0 ? round((answeredCount / total) * 100, 1) : 0;
    return {
      order: q.order,
      title: q.title,
      type: q.type,
      answeredCount,
      answerRate,
    };
  });

  const mostAnsweredQuestions = [...questionRankings].sort((a, b) => b.answeredCount - a.answeredCount);
  const leastAnsweredQuestions = [...questionRankings].sort((a, b) => a.answeredCount - b.answeredCount);

  // Aggregate all 'Other' write-in responses across questions (Q2, Q5, Q6, Q8, etc.)
  const allOtherWriteIns: OtherWriteInEntry[] = [];
  for (const q of questions) {
    const k = String(q.order);
    for (const r of responses) {
      const oth = r.other?.[k]?.trim();
      if (oth) {
        allOtherWriteIns.push({
          questionOrder: q.order,
          questionTitle: q.title,
          responseId: r.responseId,
          text: oth,
          date: r.submittedAt || r.startedAt,
          status: r.status,
        });
      }
    }
  }

  return {
    metrics,
    funnel,
    topDropOffQuestion,
    questionStats,
    mostAnsweredQuestions,
    leastAnsweredQuestions,
    allOtherWriteIns,
    crossTabs,
    openTextQ9,
    openTextQ10,
    keyInsights,
  };
}

// ==========================================
// CSV Exporter (RFC 4180 Academic Format)
// ==========================================

export function escapeCSVCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportResponsesToCSV(
  questions: Question[],
  responses: SurveyResponseRecord[],
): string {
  const headers = [
    "Response ID",
    "Status",
    "Started At",
    "Submitted At",
    "Duration (seconds)",
    "Answered Count",
    "Q1 Experience Level",
    "Q2 Decision Sources",
    "Q2 Other",
    "Q3 YouTube Accuracy Rating (1-5)",
    "Q4 Sound Signature",
    "Q5 Valuable Features",
    "Q5 Other",
    "Q6 AB Comparisons Wanted",
    "Q6 Other",
    "Q7a Live Visual Feedback (1-5)",
    "Q7b Telemetry Reports (1-5)",
    "Q7c Offline Capability (1-5)",
    "Q7d Actionable Modding Advice (1-5)",
    "Q8 Recommendation Format",
    "Q8 Other",
    "Q9 Feature Ideas",
    "Q10 Follow-up Contact",
  ];

  const lines = [headers.map(escapeCSVCell).join(",")];

  for (const r of responses) {
    const q7 = (r.answers["7"] ?? {}) as Record<string, number>;
    const q2Arr = Array.isArray(r.answers["2"]) ? (r.answers["2"] as string[]).join("; ") : "";
    const q5Arr = Array.isArray(r.answers["5"]) ? (r.answers["5"] as string[]).join("; ") : "";
    const q6Arr = Array.isArray(r.answers["6"]) ? (r.answers["6"] as string[]).join("; ") : "";
    const q8Arr = Array.isArray(r.answers["8"]) ? (r.answers["8"] as string[]).join("; ") : "";

    const row = [
      r.responseId,
      r.status,
      r.startedAt ?? "",
      r.submittedAt ?? "",
      r.durationSec ?? "",
      r.answeredCount,
      r.answers["1"] ?? "",
      q2Arr,
      r.other["2"] ?? "",
      r.answers["3"] ?? "",
      r.answers["4"] ?? "",
      q5Arr,
      r.other["5"] ?? "",
      q6Arr,
      r.other["6"] ?? "",
      q7["Live visual feedback while recording"] ?? "",
      q7["Detailed acoustic telemetry reports"] ?? "",
      q7["Offline capability"] ?? "",
      q7["Actionable modding advice"] ?? "",
      q8Arr,
      r.other["8"] ?? "",
      r.answers["9"] ?? "",
      r.answers["10"] ?? "",
    ];

    lines.push(row.map(escapeCSVCell).join(","));
  }

  return "\uFEFF" + lines.join("\r\n");
}

// ==========================================
// Simulated Realistic Research Dataset
// ==========================================

export function generateDemoResponses(): SurveyResponseRecord[] {
  const baseTime = 1726050000000; // Sept 11, 2026 approx

  const rawDemoData: {
    id: string;
    status: "Complete" | "In progress";
    durationSec: number | null;
    offsetMinutes: number;
    answers: SurveyResponseRecord["answers"];
    other: SurveyResponseRecord["other"];
  }[] = [
    // 1. Beginner - Complete
    {
      id: "demo_01",
      status: "Complete",
      durationSec: 215,
      offsetMinutes: 120,
      answers: {
        "1": "Newcomer / Beginner",
        "2": ["YouTube sound tests / build streams"],
        "3": 4,
        "4": "Deep & Low-pitched",
        "5": [
          "Real-time frequency spectrum & acoustic analysis via smartphone microphone",
          "Before-and-after comparison of modifications",
        ],
        "6": ["Switch types", "Foam & dampening configurations"],
        "7": {
          "Live visual feedback while recording": 5,
          "Detailed acoustic telemetry reports": 4,
          "Offline capability": 3,
          "Actionable modding advice": 5,
        },
        "8": ["Concrete modding steps", "Profile matching"],
        "9": "Simple guides for beginners explaining what tape mod actually does.",
        "10": "alexander_keebs@gmail.com",
      },
      other: {},
    },
    // 2. Enthusiast - Complete
    {
      id: "demo_02",
      status: "Complete",
      durationSec: 184,
      offsetMinutes: 240,
      answers: {
        "1": "Enthusiast",
        "2": [
          "YouTube sound tests / build streams",
          "Pure trial-and-error",
          "Recommendations on Reddit / Discord / Forums",
        ],
        "3": 2,
        "4": "Pop / Marbly",
        "5": [
          "Objective classification of sound characteristics",
          "Before-and-after comparison of modifications",
          "Tailored hardware modification suggestions to reach a target sound",
        ],
        "6": ["Lubed vs. unlubed switches", "Plate materials", "Switch types"],
        "7": {
          "Live visual feedback while recording": 4,
          "Detailed acoustic telemetry reports": 5,
          "Offline capability": 4,
          "Actionable modding advice": 4,
        },
        "8": ["Visual acoustic charts", "Hardware component advice"],
        "9": "Let me export audio snippets or waterfall spectrograms to share in Discord.",
        "10": "thocky_boy#9912 (Discord)",
      },
      other: {},
    },
    // 3. Expert / Builder - Complete
    {
      id: "demo_03",
      status: "Complete",
      durationSec: 298,
      offsetMinutes: 360,
      answers: {
        "1": "Expert / Custom Builder",
        "2": [
          "Sound test recordings of my own board",
          "Pure trial-and-error",
        ],
        "3": 1,
        "4": "Crisp & High-pitched",
        "5": [
          "Objective classification of sound characteristics",
          "Before-and-after comparison of modifications",
          "Reference sound library of switches",
        ],
        "6": [
          "Switch types",
          "Plate materials",
          "Foam & dampening configurations",
          "Keycap profiles & materials",
        ],
        "7": {
          "Live visual feedback while recording": 3,
          "Detailed acoustic telemetry reports": 5,
          "Offline capability": 5,
          "Actionable modding advice": 3,
        },
        "8": ["Visual acoustic charts", "Concrete modding steps"],
        "9": "Case resonance frequency calculation based on dimensions and weight would be game changing.",
        "10": "sander.customs@windesheim.nl",
      },
      other: {
        "2": "Force break mod testing and gasket tuning notes",
      },
    },
    // 4. In Progress - Abandoned at Q3
    {
      id: "demo_04",
      status: "In progress",
      durationSec: null,
      offsetMinutes: 420,
      answers: {
        "1": "Newcomer / Beginner",
        "2": ["Recommendations on Reddit / Discord / Forums"],
      },
      other: {},
    },
    // 5. Enthusiast - Complete
    {
      id: "demo_05",
      status: "Complete",
      durationSec: 165,
      offsetMinutes: 500,
      answers: {
        "1": "Enthusiast",
        "2": [
          "YouTube sound tests / build streams",
          "Recommendations on Reddit / Discord / Forums",
        ],
        "3": 3,
        "4": "Deep & Low-pitched",
        "5": [
          "Before-and-after comparison of modifications",
          "Tailored hardware modification suggestions to reach a target sound",
        ],
        "6": ["Switch types", "Lubed vs. unlubed switches", "Plate materials"],
        "7": {
          "Live visual feedback while recording": 5,
          "Detailed acoustic telemetry reports": 4,
          "Offline capability": 3,
          "Actionable modding advice": 5,
        },
        "8": ["Concrete modding steps", "Hardware component advice"],
        "9": "Make sure it can compensate for phone mic proximity effect.",
        "10": "",
      },
      other: {},
    },
    // 6. In Progress - Abandoned at Q7
    {
      id: "demo_06",
      status: "In progress",
      durationSec: null,
      offsetMinutes: 620,
      answers: {
        "1": "Enthusiast",
        "2": ["YouTube sound tests / build streams", "Pure trial-and-error"],
        "3": 2,
        "4": "Pop / Marbly",
        "5": ["Objective classification of sound characteristics"],
        "6": ["Plate materials", "Foam & dampening configurations"],
      },
      other: {},
    },
    // 7. Expert - Complete
    {
      id: "demo_07",
      status: "Complete",
      durationSec: 320,
      offsetMinutes: 720,
      answers: {
        "1": "Expert / Custom Builder",
        "2": [
          "Sound test recordings of my own board",
          "Pure trial-and-error",
          "Recommendations on Reddit / Discord / Forums",
        ],
        "3": 2,
        "4": "Balanced / No specific preference",
        "5": [
          "Real-time frequency spectrum & acoustic analysis via smartphone microphone",
          "Objective classification of sound characteristics",
          "Before-and-after comparison of modifications",
        ],
        "6": [
          "Switch types",
          "Lubed vs. unlubed switches",
          "Plate materials",
          "Foam & dampening configurations",
        ],
        "7": {
          "Live visual feedback while recording": 4,
          "Detailed acoustic telemetry reports": 5,
          "Offline capability": 5,
          "Actionable modding advice": 4,
        },
        "8": ["Visual acoustic charts"],
        "9": "FFT resolution needs to be at least 2048 bins for low-frequency case thud resolution.",
        "10": "discord: mechanical_whisperer",
      },
      other: {},
    },
    // 8. Beginner - Complete
    {
      id: "demo_08",
      status: "Complete",
      durationSec: 190,
      offsetMinutes: 840,
      answers: {
        "1": "Newcomer / Beginner",
        "2": ["YouTube sound tests / build streams"],
        "3": 5,
        "4": "Deep & Low-pitched",
        "5": [
          "Tailored hardware modification suggestions to reach a target sound",
          "Reference sound library of switches",
        ],
        "6": ["Switch types", "Foam & dampening configurations"],
        "7": {
          "Live visual feedback while recording": 4,
          "Detailed acoustic telemetry reports": 3,
          "Offline capability": 2,
          "Actionable modding advice": 5,
        },
        "8": ["Concrete modding steps", "Profile matching"],
        "9": null,
        "10": null,
      },
      other: {},
    },
    // 9. In Progress - Abandoned at Q1
    {
      id: "demo_09",
      status: "In progress",
      durationSec: null,
      offsetMinutes: 910,
      answers: {
        "1": "Newcomer / Beginner",
      },
      other: {},
    },
    // 10. Enthusiast - Complete
    {
      id: "demo_10",
      status: "Complete",
      durationSec: 210,
      offsetMinutes: 1000,
      answers: {
        "1": "Enthusiast",
        "2": ["Pure trial-and-error", "Recommendations on Reddit / Discord / Forums"],
        "3": 3,
        "4": "Muted / Silent",
        "5": [
          "Before-and-after comparison of modifications",
          "Reference sound library of switches",
        ],
        "6": ["Switch types", "Foam & dampening configurations", "Plate materials"],
        "7": {
          "Live visual feedback while recording": 3,
          "Detailed acoustic telemetry reports": 4,
          "Offline capability": 4,
          "Actionable modding advice": 4,
        },
        "8": ["Hardware component advice", "Concrete modding steps"],
        "9": "Silent switch bottom-out dampening evaluation.",
        "10": "kevin_m@outlook.com",
      },
      other: {},
    },
    // 11. Enthusiast - Complete
    {
      id: "demo_11",
      status: "Complete",
      durationSec: 175,
      offsetMinutes: 1120,
      answers: {
        "1": "Enthusiast",
        "2": ["YouTube sound tests / build streams", "Pure trial-and-error"],
        "3": 2,
        "4": "Pop / Marbly",
        "5": [
          "Objective classification of sound characteristics",
          "Before-and-after comparison of modifications",
        ],
        "6": ["Lubed vs. unlubed switches", "Plate materials"],
        "7": {
          "Live visual feedback while recording": 4,
          "Detailed acoustic telemetry reports": 5,
          "Offline capability": 3,
          "Actionable modding advice": 4,
        },
        "8": ["Visual acoustic charts", "Profile matching"],
        "9": "Tape mod layer thickness calculator.",
        "10": null,
      },
      other: {},
    },
    // 12. In Progress - Abandoned at Q5
    {
      id: "demo_12",
      status: "In progress",
      durationSec: null,
      offsetMinutes: 1250,
      answers: {
        "1": "Newcomer / Beginner",
        "2": ["YouTube sound tests / build streams"],
        "3": 4,
        "4": "Deep & Low-pitched",
        "5": ["Reference sound library of switches"],
      },
      other: {},
    },
    // 13. Expert - Complete
    {
      id: "demo_13",
      status: "Complete",
      durationSec: 260,
      offsetMinutes: 1350,
      answers: {
        "1": "Expert / Custom Builder",
        "2": [
          "Sound test recordings of my own board",
          "Pure trial-and-error",
        ],
        "3": 1,
        "4": "Crisp & High-pitched",
        "5": [
          "Real-time frequency spectrum & acoustic analysis via smartphone microphone",
          "Objective classification of sound characteristics",
          "Before-and-after comparison of modifications",
        ],
        "6": ["Plate materials", "Keycap profiles & materials", "Switch types"],
        "7": {
          "Live visual feedback while recording": 5,
          "Detailed acoustic telemetry reports": 5,
          "Offline capability": 4,
          "Actionable modding advice": 3,
        },
        "8": ["Visual acoustic charts", "Hardware component advice"],
        "9": "Integration with calibrated external USB mics like Umik-1.",
        "10": "audio_geek_nl on Discord",
      },
      other: {},
    },
    // 14. Beginner - Complete
    {
      id: "demo_14",
      status: "Complete",
      durationSec: 140,
      offsetMinutes: 1440,
      answers: {
        "1": "Newcomer / Beginner",
        "2": ["YouTube sound tests / build streams"],
        "3": 4,
        "4": "Deep & Low-pitched",
        "5": [
          "Tailored hardware modification suggestions to reach a target sound",
          "Before-and-after comparison of modifications",
        ],
        "6": ["Switch types", "Lubed vs. unlubed switches"],
        "7": {
          "Live visual feedback while recording": 4,
          "Detailed acoustic telemetry reports": 3,
          "Offline capability": 2,
          "Actionable modding advice": 5,
        },
        "8": ["Concrete modding steps"],
        "9": null,
        "10": null,
      },
      other: {},
    },
    // 15. In Progress - Abandoned at Q7
    {
      id: "demo_15",
      status: "In progress",
      durationSec: null,
      offsetMinutes: 1560,
      answers: {
        "1": "Enthusiast",
        "2": ["Recommendations on Reddit / Discord / Forums"],
        "3": 3,
        "4": "Deep & Low-pitched",
        "5": ["Objective classification of sound characteristics"],
        "6": ["Switch types", "Plate materials"],
      },
      other: {},
    },
    // 16. Enthusiast - Complete
    {
      id: "demo_16",
      status: "Complete",
      durationSec: 195,
      offsetMinutes: 1680,
      answers: {
        "1": "Enthusiast",
        "2": [
          "YouTube sound tests / build streams",
          "Pure trial-and-error",
          "Sound test recordings of my own board",
        ],
        "3": 2,
        "4": "Pop / Marbly",
        "5": [
          "Before-and-after comparison of modifications",
          "Objective classification of sound characteristics",
        ],
        "6": ["Lubed vs. unlubed switches", "Foam & dampening configurations"],
        "7": {
          "Live visual feedback while recording": 4,
          "Detailed acoustic telemetry reports": 4,
          "Offline capability": 3,
          "Actionable modding advice": 5,
        },
        "8": ["Concrete modding steps", "Visual acoustic charts"],
        "9": "A switch lube consistency tester would be amazing.",
        "10": "lucas.modder@gmail.com",
      },
      other: {},
    },
    // 17. Expert - Complete
    {
      id: "demo_17",
      status: "Complete",
      durationSec: 340,
      offsetMinutes: 1800,
      answers: {
        "1": "Expert / Custom Builder",
        "2": ["Pure trial-and-error", "Sound test recordings of my own board"],
        "3": 1,
        "4": "Crisp & High-pitched",
        "5": [
          "Real-time frequency spectrum & acoustic analysis via smartphone microphone",
          "Objective classification of sound characteristics",
          "Reference sound library of switches",
        ],
        "6": ["Switch types", "Plate materials", "Keycap profiles & materials"],
        "7": {
          "Live visual feedback while recording": 4,
          "Detailed acoustic telemetry reports": 5,
          "Offline capability": 5,
          "Actionable modding advice": 2,
        },
        "8": ["Visual acoustic charts"],
        "9": "Decay time (RT60) graph for case ping and metallic ping detection.",
        "10": "wouter#0001 (Discord)",
      },
      other: {},
    },
    // 18. Beginner - Complete
    {
      id: "demo_18",
      status: "Complete",
      durationSec: 155,
      offsetMinutes: 1950,
      answers: {
        "1": "Newcomer / Beginner",
        "2": ["YouTube sound tests / build streams"],
        "3": 3,
        "4": "Deep & Low-pitched",
        "5": ["Reference sound library of switches", "Concrete modding steps"],
        "6": ["Switch types"],
        "7": {
          "Live visual feedback while recording": 3,
          "Detailed acoustic telemetry reports": 3,
          "Offline capability": 3,
          "Actionable modding advice": 4,
        },
        "8": ["Concrete modding steps", "Hardware component advice"],
        "9": null,
        "10": null,
      },
      other: {},
    },
    // 19. In Progress - Abandoned at Q2
    {
      id: "demo_19",
      status: "In progress",
      durationSec: null,
      offsetMinutes: 2100,
      answers: {
        "1": "Newcomer / Beginner",
        "2": ["YouTube sound tests / build streams"],
      },
      other: {},
    },
    // 20. Enthusiast - Complete
    {
      id: "demo_20",
      status: "Complete",
      durationSec: 230,
      offsetMinutes: 2250,
      answers: {
        "1": "Enthusiast",
        "2": [
          "Pure trial-and-error",
          "Recommendations on Reddit / Discord / Forums",
        ],
        "3": 3,
        "4": "Pop / Marbly",
        "5": [
          "Before-and-after comparison of modifications",
          "Tailored hardware modification suggestions to reach a target sound",
        ],
        "6": [
          "Lubed vs. unlubed switches",
          "Foam & dampening configurations",
          "Plate materials",
        ],
        "7": {
          "Live visual feedback while recording": 4,
          "Detailed acoustic telemetry reports": 4,
          "Offline capability": 4,
          "Actionable modding advice": 4,
        },
        "8": ["Profile matching", "Concrete modding steps"],
        "9": "Side by side audio playback with phase alignment.",
        "10": "dave_k@icloud.com",
      },
      other: {},
    },
    // 21. Enthusiast - Complete
    {
      id: "demo_21",
      status: "Complete",
      durationSec: 180,
      offsetMinutes: 2400,
      answers: {
        "1": "Enthusiast",
        "2": ["YouTube sound tests / build streams", "Pure trial-and-error"],
        "3": 2,
        "4": "Deep & Low-pitched",
        "5": [
          "Objective classification of sound characteristics",
          "Before-and-after comparison of modifications",
        ],
        "6": ["Plate materials", "Foam & dampening configurations"],
        "7": {
          "Live visual feedback while recording": 3,
          "Detailed acoustic telemetry reports": 4,
          "Offline capability": 3,
          "Actionable modding advice": 4,
        },
        "8": ["Visual acoustic charts"],
        "9": null,
        "10": null,
      },
      other: {},
    },
    // 22. Expert - Complete
    {
      id: "demo_22",
      status: "Complete",
      durationSec: 275,
      offsetMinutes: 2600,
      answers: {
        "1": "Expert / Custom Builder",
        "2": ["Sound test recordings of my own board", "Pure trial-and-error"],
        "3": 1,
        "4": "Crisp & High-pitched",
        "5": [
          "Real-time frequency spectrum & acoustic analysis via smartphone microphone",
          "Objective classification of sound characteristics",
        ],
        "6": ["Plate materials", "Keycap profiles & materials", "Lubed vs. unlubed switches"],
        "7": {
          "Live visual feedback while recording": 4,
          "Detailed acoustic telemetry reports": 5,
          "Offline capability": 4,
          "Actionable modding advice": 3,
        },
        "8": ["Visual acoustic charts", "Hardware component advice"],
        "9": "Ability to test alphanumeric cluster vs spacebar acoustically.",
        "10": "martijn_customs on Discord",
      },
      other: {},
    },
    // 23. Beginner - Complete
    {
      id: "demo_23",
      status: "Complete",
      durationSec: 160,
      offsetMinutes: 2800,
      answers: {
        "1": "Newcomer / Beginner",
        "2": ["YouTube sound tests / build streams"],
        "3": 4,
        "4": "Deep & Low-pitched",
        "5": ["Reference sound library of switches", "Tailored hardware modification suggestions to reach a target sound"],
        "6": ["Switch types", "Foam & dampening configurations"],
        "7": {
          "Live visual feedback while recording": 5,
          "Detailed acoustic telemetry reports": 3,
          "Offline capability": 2,
          "Actionable modding advice": 5,
        },
        "8": ["Concrete modding steps"],
        "9": "Glossary of keyboard terms like thock, clack, ping.",
        "10": null,
      },
      other: {},
    },
    // 24. In Progress - Abandoned at Q4
    {
      id: "demo_24",
      status: "In progress",
      durationSec: null,
      offsetMinutes: 3000,
      answers: {
        "1": "Enthusiast",
        "2": ["Pure trial-and-error"],
        "3": 3,
        "4": "Balanced / No specific preference",
      },
      other: {},
    },
    // 25. Enthusiast - Complete
    {
      id: "demo_25",
      status: "Complete",
      durationSec: 205,
      offsetMinutes: 3200,
      answers: {
        "1": "Enthusiast",
        "2": [
          "YouTube sound tests / build streams",
          "Recommendations on Reddit / Discord / Forums",
        ],
        "3": 3,
        "4": "Deep & Low-pitched",
        "5": [
          "Before-and-after comparison of modifications",
          "Objective classification of sound characteristics",
        ],
        "6": ["Switch types", "Lubed vs. unlubed switches", "Plate materials"],
        "7": {
          "Live visual feedback while recording": 4,
          "Detailed acoustic telemetry reports": 4,
          "Offline capability": 3,
          "Actionable modding advice": 4,
        },
        "8": ["Concrete modding steps", "Visual acoustic charts"],
        "9": "Blind A/B audio test mode where I can test my ears.",
        "10": "tim.h@keebs.com",
      },
      other: {},
    },
  ];

  return rawDemoData.map((d, idx) => {
    const started = new Date(baseTime - d.offsetMinutes * 60 * 1000);
    const submitted =
      d.status === "Complete" && d.durationSec
        ? new Date(started.getTime() + d.durationSec * 1000)
        : null;

    // Calculate answeredCount
    let answered = 0;
    for (let qOrder = 1; qOrder <= 10; qOrder++) {
      const k = String(qOrder);
      const val = d.answers[k];
      const oth = d.other?.[k];
      if (oth || (val !== undefined && val !== null && val !== "" && (!Array.isArray(val) || val.length > 0))) {
        answered++;
      }
    }

    return {
      id: `page_demo_${idx + 1}`,
      responseId: `r_demo_${String(idx + 1).padStart(2, "0")}`,
      status: d.status,
      startedAt: started.toISOString(),
      submittedAt: submitted ? submitted.toISOString() : null,
      durationSec: d.durationSec,
      answeredCount: answered,
      answers: d.answers,
      other: d.other || {},
    };
  });
}

// ==========================================
// Notion Fetching & Parser
// ==========================================

type NotionPage = {
  id: string;
  properties: Record<string, { type: string; [key: string]: unknown }>;
};

function extractResponseFromPage(
  page: NotionPage,
  richText: (value: unknown) => string,
): SurveyResponseRecord {
  const props = page.properties;

  const getTitle = (name: string): string => richText((props[name] as { title?: unknown })?.title);
  const getSelect = (name: string): string | null =>
    (props[name] as { select?: { name: string } | null })?.select?.name ?? null;
  const getNumber = (name: string): number | null =>
    (props[name] as { number?: number | null })?.number ?? null;
  const getDate = (name: string): string | null =>
    (props[name] as { date?: { start: string } | null })?.date?.start ?? null;
  const getText = (name: string): string =>
    richText((props[name] as { rich_text?: unknown })?.rich_text);
  const getMulti = (name: string): string[] =>
    ((props[name] as { multi_select?: { name: string }[] })?.multi_select ?? []).map(
      (i) => i.name,
    );

  const responseId = getTitle("Response ID") || `r_${page.id.slice(0, 8)}`;
  const statusRaw = getSelect("Status");
  const status: "Complete" | "In progress" | "Unknown" =
    statusRaw === "Complete" || statusRaw === "In progress" ? statusRaw : "Unknown";

  const startedAt = getDate("Started at");
  const submittedAt = getDate("Submitted at");

  let durationSec = getNumber("Duration (s)");
  if ((durationSec === null || durationSec <= 0) && startedAt && submittedAt) {
    const startMs = new Date(startedAt).getTime();
    const submitMs = new Date(submittedAt).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(submitMs) && submitMs > startMs) {
      durationSec = Math.round((submitMs - startMs) / 1000);
    }
  }

  const q7Rows: Record<string, number> = {};
  const q7a = getNumber("Q7a Live visual feedback while recording");
  if (typeof q7a === "number" && q7a > 0) q7Rows["Live visual feedback while recording"] = q7a;
  const q7b = getNumber("Q7b Detailed acoustic telemetry reports");
  if (typeof q7b === "number" && q7b > 0) q7Rows["Detailed acoustic telemetry reports"] = q7b;
  const q7c = getNumber("Q7c Offline capability");
  if (typeof q7c === "number" && q7c > 0) q7Rows["Offline capability"] = q7c;
  const q7d = getNumber("Q7d Actionable modding advice");
  if (typeof q7d === "number" && q7d > 0) q7Rows["Actionable modding advice"] = q7d;

  const answers: SurveyResponseRecord["answers"] = {
    "1": getSelect("Q1 Experience level"),
    "2": getMulti("Q2 Mod decision sources"),
    "3": getNumber("Q3 YT tests accurate (1-5)"),
    "4": getSelect("Q4 Sound signature"),
    "5": getMulti("Q5 Valuable features"),
    "6": getMulti("Q6 A/B comparisons wanted"),
    "7": Object.keys(q7Rows).length > 0 ? q7Rows : null,
    "8": getMulti("Q8 Recommendation format"),
    "9": getText("Q9 Feature ideas") || null,
    "10": getText("Q10 Follow-up contact") || null,
  };

  const other: SurveyResponseRecord["other"] = {};
  const q2Other = getText("Q2 Other");
  if (q2Other) other["2"] = q2Other;
  const q5Other = getText("Q5 Other");
  if (q5Other) other["5"] = q5Other;
  const q6Other = getText("Q6 Other");
  if (q6Other) other["6"] = q6Other;
  const q8Other = getText("Q8 Other");
  if (q8Other) other["8"] = q8Other;

  let answeredCount = getNumber("Answered") ?? 0;
  if (answeredCount <= 0) {
    for (let qNum = 1; qNum <= 10; qNum++) {
      const k = String(qNum);
      const val = answers[k];
      const oth = other[k];
      if (
        oth ||
        (val !== undefined &&
          val !== null &&
          val !== "" &&
          (!Array.isArray(val) || val.length > 0) &&
          (typeof val !== "object" || Object.keys(val as Record<string, unknown>).length > 0))
      ) {
        answeredCount++;
      }
    }
  }

  return {
    id: page.id,
    responseId,
    status,
    startedAt,
    submittedAt,
    durationSec,
    answeredCount,
    answers,
    other,
  };
}

export async function fetchNotionResponses(): Promise<SurveyResponseRecord[]> {
  const { databaseIds, notion, richText } = await import("./notion");
  const { answers } = databaseIds();
  const allResults: NotionPage[] = [];
  let cursor: string | undefined = undefined;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ property: "Started at", direction: "descending" }],
    };
    if (cursor) body.start_cursor = cursor;

    const res = await notion<{
      results: NotionPage[];
      has_more: boolean;
      next_cursor: string | null;
    }>(`databases/${answers}/query`, {
      method: "POST",
      body,
    });

    allResults.push(...res.results);
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);

  return allResults.map((page) => extractResponseFromPage(page, richText));
}
