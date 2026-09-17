"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { loginDashboardAction, logoutDashboardAction, refreshDashboardAction } from "./actions";
import {
  computeAnalytics,
  exportResponsesToCSV,
  round,
  type DashboardAnalytics,
  type GridStat,
  type MultiChoiceStat,
  type OpenTextStat,
  type ScaleStat,
  type SingleChoiceStat,
  type SurveyResponseRecord,
} from "@/lib/dashboard-data";
import type { Question } from "@/lib/questions";

type DataSourceMode = "live" | "demo" | "combined";

interface DashboardClientProps {
  questions: Question[];
  liveResponses: SurveyResponseRecord[];
  demoResponses: SurveyResponseRecord[];
  isProtected: boolean;
  notionConfigured: boolean;
  notionError?: string;
}

export function DashboardClient({
  questions,
  liveResponses,
  demoResponses,
  isProtected,
  notionConfigured,
  notionError,
}: DashboardClientProps) {
  // Data Source selection: default to live if it has responses, else demo
  const [sourceMode, setSourceMode] = useState<DataSourceMode>(() => {
    if (liveResponses.length > 0) return "live";
    return "demo";
  });

  const [activeTab, setActiveTab] = useState<
    "overview" | "funnel" | "questions" | "crosstabs" | "qualitative" | "table" | "export"
  >("overview");

  // Filters
  const [statusFilter, setStatusFilter] = useState<"ALL" | "Complete" | "In progress">("ALL");
  const [experienceFilter, setExperienceFilter] = useState<string>("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [datePreset, setDatePreset] = useState<"all" | "today" | "7d" | "30d">("all");
  const [selectedQuestionOrder, setSelectedQuestionOrder] = useState<number>(1);

  // Table sorting
  const [sortColumn, setSortColumn] = useState<
    "responseId" | "status" | "startedAt" | "durationSec" | "answeredCount"
  >("startedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Selected response for inspection drawer
  const [inspectedResponse, setInspectedResponse] = useState<SurveyResponseRecord | null>(null);

  // Pagination for table
  const [tablePage, setTablePage] = useState(1);
  const pageSize = 10;

  // Pending transitions
  const [isPending, startTransition] = useTransition();
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // When protected and authenticated via URL parameter, automatically persist session cookie
  useEffect(() => {
    if (typeof window !== "undefined" && isProtected) {
      const urlParams = new URLSearchParams(window.location.search);
      const urlKey = urlParams.get("key") || urlParams.get("password");
      if (urlKey) {
        loginDashboardAction(urlKey).catch(() => {});
      }
    }
  }, [isProtected]);

  // Derive active response pool
  const rawPool = useMemo(() => {
    if (sourceMode === "live") return liveResponses;
    if (sourceMode === "demo") return demoResponses;
    return [...liveResponses, ...demoResponses];
  }, [sourceMode, liveResponses, demoResponses]);

  // Unique sources available in the current dataset
  const availableSources = useMemo(() => {
    const s = new Set<string>();
    for (const r of rawPool) {
      s.add(r.source?.trim() || "Direct / None");
    }
    return Array.from(s).sort();
  }, [rawPool]);

  // Apply filters
  const filteredResponses = useMemo(() => {
    return rawPool.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (sourceFilter !== "ALL") {
        const src = r.source?.trim() || "Direct / None";
        if (src !== sourceFilter) return false;
      }
      if (experienceFilter !== "ALL") {
        const exp = r.answers["1"];
        if (exp !== experienceFilter) return false;
      }
      if (startDate) {
        const recordDate = r.startedAt || r.submittedAt;
        if (!recordDate || recordDate.slice(0, 10) < startDate) return false;
      }
      if (endDate) {
        const recordDate = r.startedAt || r.submittedAt;
        if (!recordDate || recordDate.slice(0, 10) > endDate) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = r.responseId.toLowerCase().includes(q);
        const sourceMatch = Boolean(r.source && r.source.toLowerCase().includes(q));
        const q9Match = typeof r.answers["9"] === "string" && r.answers["9"].toLowerCase().includes(q);
        const q10Match = typeof r.answers["10"] === "string" && r.answers["10"].toLowerCase().includes(q);
        const otherMatch = Object.values(r.other || {}).some(
          (v) => typeof v === "string" && v.toLowerCase().includes(q),
        );
        if (!idMatch && !sourceMatch && !q9Match && !q10Match && !otherMatch) return false;
      }
      return true;
    });
  }, [rawPool, statusFilter, sourceFilter, experienceFilter, searchQuery, startDate, endDate]);

  // Compute analytics based on filtered responses
  const analytics: DashboardAnalytics = useMemo(() => {
    return computeAnalytics(questions, filteredResponses);
  }, [questions, filteredResponses]);

  const {
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
  } = analytics;

  // Selected question stats
  const currentQuestion = useMemo(
    () => questions.find((q) => q.order === selectedQuestionOrder) ?? questions[0],
    [questions, selectedQuestionOrder],
  );
  const currentStat = questionStats[selectedQuestionOrder];

  // Sorted responses for table
  const sortedResponses = useMemo(() => {
    const list = [...filteredResponses];
    list.sort((a, b) => {
      let comparison = 0;
      if (sortColumn === "responseId") {
        comparison = a.responseId.localeCompare(b.responseId);
      } else if (sortColumn === "status") {
        comparison = a.status.localeCompare(b.status);
      } else if (sortColumn === "startedAt") {
        const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        comparison = aTime - bTime;
      } else if (sortColumn === "durationSec") {
        const aDur = a.durationSec ?? -1;
        const bDur = b.durationSec ?? -1;
        comparison = aDur - bDur;
      } else if (sortColumn === "answeredCount") {
        comparison = (a.answeredCount || 0) - (b.answeredCount || 0);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return list;
  }, [filteredResponses, sortColumn, sortDirection]);

  // Paginated table data
  const paginatedResponses = useMemo(() => {
    const start = (tablePage - 1) * pageSize;
    return sortedResponses.slice(start, start + pageSize);
  }, [sortedResponses, tablePage]);

  const totalPages = Math.max(1, Math.ceil(filteredResponses.length / pageSize));

  // Date preset handler
  const handleDatePreset = (preset: "all" | "today" | "7d" | "30d") => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (preset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "7d") {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === "30d") {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().slice(0, 10));
      setEndDate(todayStr);
    }
    setTablePage(1);
  };

  // Table header sort handler
  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
    setTablePage(1);
  };

  // CSV download handler
  const handleDownloadCSV = () => {
    const csv = exportResponsesToCSV(questions, filteredResponses);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keyboard_survey_export_${sourceMode}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // JSON download handler
  const handleDownloadJSON = () => {
    const jsonStr = JSON.stringify(filteredResponses, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keyboard_survey_export_${sourceMode}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleRefresh = () => {
    startTransition(async () => {
      await refreshDashboardAction();
    });
  };

  const handleLogout = () => {
    startTransition(async () => {
      await logoutDashboardAction();
    });
  };

  // Duration formatting
  const formatDuration = (seconds: number | null) => {
    if (seconds === null || !Number.isFinite(seconds)) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#07080f] text-ink">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-[#07080f]/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs font-mono tracking-wider uppercase px-2.5 py-1 rounded bg-card border border-line text-muted hover:text-ink transition-colors"
          >
            ← Live Survey
          </Link>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                notionConfigured ? "bg-emerald-400" : "bg-amber-400"
              } animate-pulse`}
              title={notionConfigured ? "Notion database connected" : "Notion credentials pending"}
            />
            <h1 className="text-base sm:text-lg font-semibold tracking-tight">
              Survey Analytics
            </h1>
          </div>
        </div>

        {/* Global Action Buttons & Data Source Switcher */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Data Source Toggle */}
          <div className="flex items-center rounded-lg bg-card border border-line p-1">
            <button
              onClick={() => setSourceMode("live")}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                sourceMode === "live"
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              Live Notion ({liveResponses.length})
            </button>
            <button
              onClick={() => setSourceMode("demo")}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                sourceMode === "demo"
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              Simulated Research Cohort ({demoResponses.length})
            </button>
            <button
              onClick={() => setSourceMode("combined")}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                sourceMode === "combined"
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              Combined ({liveResponses.length + demoResponses.length})
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-line hover:border-accent/40 text-ink disabled:opacity-50 transition-colors"
            title="Revalidate and fetch fresh survey submissions from Notion"
          >
            <svg
              className={`w-3.5 h-3.5 ${isPending ? "animate-spin text-accent" : "text-muted"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{isPending ? "Syncing..." : "Refresh"}</span>
          </button>

          {/* Quick CSV Export */}
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium shadow-sm transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8l-8 8-8-8" />
            </svg>
            <span>Export CSV</span>
          </button>

          {/* Logout if protected */}
          {isProtected && (
            <button
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-lg border border-line text-muted hover:text-rose-400 hover:border-rose-500/30 transition-colors"
              title="Sign out of Dashboard"
            >
              Lock
            </button>
          )}
        </div>
      </header>

      {/* Notion Status Banner if error or live empty */}
      {sourceMode === "live" && liveResponses.length === 0 && (
        <div className="mx-4 sm:mx-8 mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {notionError
                ? `Notion sync warning: ${notionError}`
                : "No live submissions in the Notion database yet."}
            </span>
          </div>
          <button
            onClick={() => setSourceMode("demo")}
            className="px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-medium transition-colors"
          >
            Switch to Simulated Cohort (42 responses) →
          </button>
        </div>
      )}

      {/* Global Filter Bar */}
      <section className="px-4 sm:px-8 py-3 bg-card/60 border-b border-line flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-muted font-medium">Filters:</span>

          {/* Status Filter */}
          <div className="flex rounded-md bg-[#07080f] border border-line p-0.5">
            {(["ALL", "Complete", "In progress"] as const).map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setTablePage(1);
                }}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  statusFilter === st
                    ? "bg-accent/20 text-accent border border-accent/30"
                    : "text-muted hover:text-ink"
                }`}
              >
                {st === "ALL" ? "All Statuses" : st}
              </button>
            ))}
          </div>

          {/* Experience Filter */}
          <select
            value={experienceFilter}
            onChange={(e) => {
              setExperienceFilter(e.target.value);
              setTablePage(1);
            }}
            aria-label="Filter by experience level"
            className="px-2.5 py-1 rounded-md bg-[#07080f] border border-line text-ink focus:outline-none focus:border-accent"
          >
            <option value="ALL">All Experience Levels</option>
            <option value="Newcomer / Beginner">Newcomer / Beginner</option>
            <option value="Enthusiast">Enthusiast</option>
            <option value="Expert / Custom Builder">Expert / Custom Builder</option>
          </select>

          {/* Subreddit / Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setTablePage(1);
            }}
            aria-label="Filter by subreddit or source"
            className="px-2.5 py-1 rounded-md bg-[#07080f] border border-line text-ink focus:outline-none focus:border-accent"
          >
            <option value="ALL">All Sources / Subreddits</option>
            {availableSources.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>

          {/* Date Range Presets & Pickers */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex rounded-md bg-[#07080f] border border-line p-0.5">
              {(
                [
                  { id: "all", label: "All Time" },
                  { id: "today", label: "Today" },
                  { id: "7d", label: "7D" },
                  { id: "30d", label: "30D" },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleDatePreset(preset.id)}
                  className={`px-2 py-0.5 rounded font-mono text-[11px] transition-colors ${
                    datePreset === preset.id
                      ? "bg-accent/20 text-accent border border-accent/30 font-semibold"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-[#07080f] border border-line px-2 py-0.5 rounded-md text-[11px] font-mono">
              <span className="text-muted">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset("all");
                  setTablePage(1);
                }}
                className="bg-transparent text-ink focus:outline-none text-[11px] [color-scheme:dark]"
              />
              <span className="text-muted ml-1">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset("all");
                  setTablePage(1);
                }}
                className="bg-transparent text-ink focus:outline-none text-[11px] [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search ID, source, open text..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setTablePage(1);
              }}
              className="w-44 sm:w-56 pl-7 pr-3 py-1 rounded-md bg-[#07080f] border border-line text-ink placeholder:text-muted/60 focus:outline-none focus:border-accent"
            />
            <svg
              className="w-3.5 h-3.5 text-muted absolute left-2 top-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {(statusFilter !== "ALL" ||
            experienceFilter !== "ALL" ||
            sourceFilter !== "ALL" ||
            searchQuery ||
            startDate ||
            endDate) && (
            <button
              onClick={() => {
                setStatusFilter("ALL");
                setExperienceFilter("ALL");
                setSourceFilter("ALL");
                setSearchQuery("");
                setStartDate("");
                setEndDate("");
                setDatePreset("all");
                setTablePage(1);
              }}
              className="text-xs text-muted hover:text-accent underline"
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="text-muted font-mono">
          Showing <span className="text-ink font-semibold">{filteredResponses.length}</span> of{" "}
          <span className="text-ink font-semibold">{rawPool.length}</span> responses
        </div>
      </section>

      {/* Main Tab Navigation */}
      <nav className="px-4 sm:px-8 border-b border-line bg-[#07080f]/50 flex space-x-1 sm:space-x-4 overflow-x-auto text-xs sm:text-sm font-medium">
        {[
          { id: "overview", label: "Overview & KPIs", badge: null },
          {
            id: "funnel",
            label: "Drop-off & Funnel",
            badge: topDropOffQuestion ? `Max drop: Q${topDropOffQuestion.order}` : null,
          },
          { id: "questions", label: "Question Deep Dive", badge: `${questions.length} Qs` },
          { id: "crosstabs", label: "Cross-Tabs & Insights", badge: "Research" },
          {
            id: "qualitative",
            label: "Qualitative & Contacts",
            badge: `${openTextQ9.length + openTextQ10.length + allOtherWriteIns.length}`,
          },
          { id: "table", label: "Responses Data Table", badge: `${filteredResponses.length}` },
          { id: "export", label: "Export (SPSS / R / Python)", badge: "CSV / JSON" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-muted hover:text-ink hover:border-line"
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id
                    ? "bg-accent/20 text-accent"
                    : "bg-card text-muted border border-line"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-8">
        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW & KPIS                                                    */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* KPI Metric Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Card 1: Total Responses */}
              <div className="p-4 rounded-xl bg-card border border-line space-y-2">
                <span className="text-xs font-medium text-muted">Total Submissions</span>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                  {metrics.totalResponses}
                </div>
                <div className="text-[11px] text-muted font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  {sourceMode === "live"
                    ? "Live Notion DB"
                    : sourceMode === "demo"
                    ? "Simulated Sample"
                    : "Combined Pool"}
                </div>
              </div>

              {/* Card 2: Completed */}
              <div className="p-4 rounded-xl bg-card border border-line space-y-2">
                <span className="text-xs font-medium text-muted">Completed Surveys</span>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-400">
                  {metrics.completedCount}
                </div>
                <div className="text-[11px] text-muted">
                  <span className="text-emerald-400 font-semibold">{metrics.completionRate}%</span> completion
                </div>
              </div>

              {/* Card 3: In Progress / Abandoned */}
              <div className="p-4 rounded-xl bg-card border border-line space-y-2">
                <span className="text-xs font-medium text-muted">In-Progress / Drop-off</span>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-400">
                  {metrics.inProgressCount}
                </div>
                <div className="text-[11px] text-muted">
                  <span className="text-amber-400 font-semibold">
                    {metrics.totalResponses > 0
                      ? (100 - metrics.completionRate).toFixed(1)
                      : 0}
                    %
                  </span>{" "}
                  abandonment
                </div>
              </div>

              {/* Card 4: Median Duration */}
              <div className="p-4 rounded-xl bg-card border border-line space-y-2">
                <span className="text-xs font-medium text-muted">Median Duration</span>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                  {formatDuration(metrics.medianDurationSec)}
                </div>
                <div className="text-[11px] text-muted font-mono">
                  IQR: {metrics.iqrDurationSec ? `${metrics.iqrDurationSec}s` : "—"}
                </div>
              </div>

              {/* Card 5: Average Duration */}
              <div className="p-4 rounded-xl bg-card border border-line space-y-2">
                <span className="text-xs font-medium text-muted">Average Duration</span>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                  {formatDuration(metrics.avgDurationSec)}
                </div>
                <div className="text-[11px] text-muted font-mono">
                  Range: {formatDuration(metrics.minDurationSec)} – {formatDuration(metrics.maxDurationSec)}
                </div>
              </div>

              {/* Card 6: Average Answered */}
              <div className="p-4 rounded-xl bg-card border border-line space-y-2">
                <span className="text-xs font-medium text-muted">Avg Questions Answered</span>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-accent">
                  {metrics.avgAnsweredCount}
                  <span className="text-xs text-muted font-normal ml-1">/ {questions.length}</span>
                </div>
                <div className="text-[11px] text-muted">
                  {Math.round((metrics.avgAnsweredCount / (questions.length || 1)) * 100)}% coverage
                </div>
              </div>
            </div>

            {/* Academic Insights Box */}
            <div className="p-6 rounded-xl bg-card border border-line relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight text-ink">
                      Key Takeaways
                    </h2>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(keyInsights.join("\n• "), "insights")}
                  className="text-xs font-mono px-2.5 py-1 rounded bg-[#07080f] border border-line hover:border-accent/40 text-muted hover:text-ink transition-colors"
                >
                  {copySuccess === "insights" ? "Copied!" : "Copy Summary"}
                </button>
              </div>

              <ul className="grid sm:grid-cols-2 gap-3 text-xs text-muted leading-relaxed">
                {keyInsights.map((insight, idx) => (
                  <li
                    key={idx}
                    className="p-3 rounded-lg bg-[#07080f]/60 border border-line/60 flex items-start gap-2.5"
                  >
                    <span className="text-accent font-bold mt-0.5">•</span>
                    <span className="text-ink/90">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Quick Teaser: Drop-off Churn Alert + Demographics Preview */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Churn Alert Card */}
              <div className="p-5 rounded-xl bg-card border border-line space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                    <span className="p-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                      </svg>
                    </span>
                    Primary Respondent Drop-Off Point
                  </h3>
                  <button
                    onClick={() => setActiveTab("funnel")}
                    className="text-xs text-accent hover:underline"
                  >
                    Full Funnel →
                  </button>
                </div>

                {topDropOffQuestion ? (
                  <div className="p-3.5 rounded-lg bg-rose-500/5 border border-rose-500/20 space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-rose-300">
                        Q{topDropOffQuestion.order}: {topDropOffQuestion.title}
                      </span>
                      <span className="px-2 py-0.5 rounded font-mono bg-rose-500/20 text-rose-200">
                        {topDropOffQuestion.count} drop-offs
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      Highest survey friction point with{" "}
                      <span className="text-rose-300 font-semibold">{topDropOffQuestion.dropOffRate}% drop-off</span>.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    No significant drop-offs detected. All respondents reached the end of the survey.
                  </p>
                )}

                {/* Mini Progression Funnel Bar */}
                <div className="space-y-1.5 pt-2 border-t border-line">
                  <div className="flex justify-between text-[11px] text-muted">
                    <span>Survey Start (100%)</span>
                    <span>Completion ({metrics.completionRate}%)</span>
                  </div>
                  <div className="h-2 w-full bg-[#07080f] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(5, metrics.completionRate)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Sound Signature Demographic Breakdown */}
              <div className="p-5 rounded-xl bg-card border border-line space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                    <span className="p-1 rounded bg-accent/10 text-accent border border-accent/20">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </span>
                    Preferred Sound Signature Distribution (Q4)
                  </h3>
                  <button
                    onClick={() => {
                      setSelectedQuestionOrder(4);
                      setActiveTab("questions");
                    }}
                    className="text-xs text-accent hover:underline"
                  >
                    View Q4 →
                  </button>
                </div>

                {(() => {
                  const q4 = questionStats[4] as SingleChoiceStat | undefined;
                  if (!q4 || q4.answeredCount === 0) {
                    return <p className="text-xs text-muted">No Q4 responses yet.</p>;
                  }
                  return (
                    <div className="space-y-2.5">
                      {Object.entries(q4.percentages).map(([choice, pct]) => {
                        const count = q4.counts[choice] || 0;
                        return (
                          <div key={choice} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-ink/90 font-medium truncate max-w-[70%]">
                                {choice}
                              </span>
                              <span className="font-mono text-muted">
                                {pct}% <span className="text-ink/50">({count})</span>
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-[#07080f] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent rounded-full transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Subreddit & Campaign Traffic Attribution Card */}
            <div className="p-6 rounded-xl bg-card border border-line space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-ink">
                      Subreddit & Campaign Traffic Attribution (?source=...)
                    </h3>
                    <p className="text-xs text-muted">
                      Track which subreddits yield the most respondents and highest completion rates
                    </p>
                  </div>
                </div>
                <div className="text-xs font-mono text-muted">
                  {analytics.sourceStats.length} {analytics.sourceStats.length === 1 ? "source" : "sources"} tracked
                </div>
              </div>

              {analytics.sourceStats.length === 0 ? (
                <p className="text-xs text-muted">No traffic data recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#07080f] text-muted font-mono uppercase tracking-wider border-b border-line">
                      <tr>
                        <th className="p-2.5">Subreddit / Source</th>
                        <th className="p-2.5 text-right">Responses</th>
                        <th className="p-2.5 text-right">Share</th>
                        <th className="p-2.5 text-right">Completed</th>
                        <th className="p-2.5 text-right">Completion Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40 font-mono">
                      {analytics.sourceStats.map((s) => (
                        <tr
                          key={s.source}
                          onClick={() => {
                            setSourceFilter(s.source);
                            setTablePage(1);
                          }}
                          className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                          title={`Click to filter by ${s.source}`}
                        >
                          <td className="p-2.5 font-medium text-ink flex items-center gap-2 font-sans">
                            <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                            <span className="font-semibold text-accent hover:underline">{s.source}</span>
                            {sourceFilter === s.source && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent/20 text-accent font-mono">
                                Filtered
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right text-ink font-semibold">{s.count}</td>
                          <td className="p-2.5 text-right text-muted">{s.percentOfTotal}%</td>
                          <td className="p-2.5 text-right text-emerald-400">{s.completedCount}</td>
                          <td className="p-2.5 text-right">
                            <span className={s.completionRate >= 70 ? "text-emerald-400 font-semibold" : "text-amber-400"}>
                              {s.completionRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Question Response Rankings: Most Answered vs Least Answered Questions */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Most Answered */}
              <div className="p-5 rounded-xl bg-card border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                    <span className="p-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    Most Answered Questions (Meest Geantwoord)
                  </h3>
                  <span className="text-[11px] font-mono text-muted">Response Rate</span>
                </div>
                <div className="space-y-2.5">
                  {mostAnsweredQuestions.slice(0, 5).map((q, idx) => (
                    <div
                      key={q.order}
                      onClick={() => {
                        setSelectedQuestionOrder(q.order);
                        setActiveTab("questions");
                      }}
                      className="p-2.5 rounded-lg bg-[#07080f] border border-line hover:border-accent/40 cursor-pointer transition-colors space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 truncate max-w-[70%]">
                          <span className="font-mono text-accent font-bold">#{idx + 1} Q{q.order}</span>
                          <span className="text-ink/90 truncate">{q.title}</span>
                        </div>
                        <span className="font-mono text-emerald-400 font-semibold">
                          {q.answerRate}% <span className="text-muted text-[10px]">({q.answeredCount})</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-card rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full"
                          style={{ width: `${Math.max(3, q.answerRate)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Least Answered / Highest Churn */}
              <div className="p-5 rounded-xl bg-card border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                    <span className="p-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </span>
                    Least Answered / High Friction Questions
                  </h3>
                  <span className="text-[11px] font-mono text-muted">Response Rate</span>
                </div>
                <div className="space-y-2.5">
                  {leastAnsweredQuestions.slice(0, 5).map((q, idx) => (
                    <div
                      key={q.order}
                      onClick={() => {
                        setSelectedQuestionOrder(q.order);
                        setActiveTab("questions");
                      }}
                      className="p-2.5 rounded-lg bg-[#07080f] border border-line hover:border-accent/40 cursor-pointer transition-colors space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 truncate max-w-[70%]">
                          <span className="font-mono text-amber-400 font-bold">#{idx + 1} Q{q.order}</span>
                          <span className="text-ink/90 truncate">{q.title}</span>
                        </div>
                        <span className="font-mono text-amber-300 font-semibold">
                          {q.answerRate}% <span className="text-muted text-[10px]">({q.answeredCount})</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-card rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${Math.max(3, q.answerRate)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DROP-OFF & FUNNEL ANALYSIS                                         */}
        {/* ========================================================================= */}
        {activeTab === "funnel" && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  Step-by-Step Funnel & Churn Analysis
                </h2>
                <p className="text-xs text-muted">
                  Track respondent progression, completion retention, and exact drop-off points along the questionnaire
                </p>
              </div>

              {topDropOffQuestion && (
                <div className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono">
                  Peak Churn: Q{topDropOffQuestion.order} ({topDropOffQuestion.count} drop-offs, {topDropOffQuestion.dropOffRate}%)
                </div>
              )}
            </div>

            {/* Funnel Visualization Steps */}
            <div className="space-y-3">
              {funnel.map((step, idx) => {
                const isTopDrop = topDropOffQuestion?.order === step.order;
                const hasDrop = step.dropOffCount > 0;

                return (
                  <div
                    key={step.order}
                    className={`p-4 rounded-xl border transition-all ${
                      isTopDrop
                        ? "bg-rose-950/20 border-rose-500/30"
                        : "bg-card border-line hover:border-accent/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-[#07080f] border border-line text-[11px] font-mono flex items-center justify-center font-bold text-accent">
                          {step.order}
                        </span>
                        <span className="text-sm font-semibold text-ink">
                          {step.title}
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#07080f] text-muted border border-line">
                          {step.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono">
                        <span className="text-muted">
                          Reached: <strong className="text-ink">{step.reached}</strong> ({step.retentionRate}%)
                        </span>
                        <span className="text-muted">
                          Answered: <strong className="text-ink">{step.answered}</strong>
                        </span>
                        {hasDrop ? (
                          <span
                            className={`px-2 py-0.5 rounded font-semibold ${
                              isTopDrop
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                            }`}
                          >
                            -{step.dropOffCount} dropped ({step.dropOffRate}%)
                          </span>
                        ) : (
                          <span className="text-emerald-400">100% retained</span>
                        )}
                      </div>
                    </div>

                    {/* Funnel Retention Bar */}
                    <div className="space-y-1">
                      <div className="h-3 w-full bg-[#07080f] rounded-full overflow-hidden flex">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isTopDrop
                              ? "bg-gradient-to-r from-accent to-rose-400"
                              : "bg-gradient-to-r from-accent to-accent-soft"
                          }`}
                          style={{ width: `${Math.max(3, step.retentionRate)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-muted px-0.5">
                        <span>Step {idx + 1} of {questions.length}</span>
                        <span>{step.retentionRate}% overall cohort retention</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: QUESTION-BY-QUESTION DEEP DIVE                                    */}
        {/* ========================================================================= */}
        {activeTab === "questions" && (
          <div className="space-y-6">
            {/* Question Selector Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-line">
              {questions.map((q) => {
                const stat = questionStats[q.order];
                const isSelected = q.order === selectedQuestionOrder;
                return (
                  <button
                    key={q.order}
                    onClick={() => setSelectedQuestionOrder(q.order)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-2 transition-all ${
                      isSelected
                        ? "bg-accent text-white shadow"
                        : "bg-card border border-line text-muted hover:text-ink hover:border-accent/40"
                    }`}
                  >
                    <span className="font-mono font-bold">Q{q.order}</span>
                    <span className="hidden sm:inline truncate max-w-[120px]">
                      {q.title}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        isSelected ? "bg-white/20 text-white" : "bg-[#07080f] text-muted"
                      }`}
                    >
                      {stat?.answeredCount ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Question Header Card */}
            <div className="p-6 rounded-xl bg-card border border-line space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-accent/20 text-accent font-mono text-xs font-bold">
                    Question {currentQuestion.order}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#07080f] text-muted border border-line text-[11px] font-mono uppercase">
                    {currentQuestion.type}
                  </span>
                  {currentQuestion.required && (
                    <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[11px]">
                      Required
                    </span>
                  )}
                  {currentQuestion.allowOther && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px]">
                      Allows &apos;Other&apos; write-in
                    </span>
                  )}
                </div>

                <div className="text-xs font-mono text-muted">
                  Total Answered:{" "}
                  <strong className="text-ink">
                    {currentStat?.answeredCount ?? 0}
                  </strong>{" "}
                  / {filteredResponses.length} (
                  {filteredResponses.length > 0
                    ? round(((currentStat?.answeredCount ?? 0) / filteredResponses.length) * 100, 1)
                    : 0}
                  %)
                </div>
              </div>

              <h2 className="text-lg font-semibold text-ink">{currentQuestion.title}</h2>
              {currentQuestion.description && (
                <p className="text-xs text-muted">{currentQuestion.description}</p>
              )}
            </div>

            {/* Visualization according to Question Type */}
            {currentQuestion.type === "single_choice" && (
              <div className="p-6 rounded-xl bg-card border border-line space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">Choice Distribution</h3>
                  {(currentStat as SingleChoiceStat)?.mode && (
                    <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Mode: {(currentStat as SingleChoiceStat).mode}
                    </span>
                  )}
                </div>

                {(() => {
                  const stat = currentStat as SingleChoiceStat | undefined;
                  if (!stat || stat.answeredCount === 0) {
                    return <p className="text-xs text-muted">No responses for this question yet.</p>;
                  }

                  return (
                    <div className="space-y-4">
                      {currentQuestion.choices.map((choice) => {
                        const count = stat.counts[choice.label] || 0;
                        const pct = stat.percentages[choice.label] || 0;
                        const isMode = stat.mode === choice.label;

                        return (
                          <div key={choice.label} className="space-y-1.5">
                            <div className="flex justify-between text-xs font-medium">
                              <span className={isMode ? "text-accent font-semibold" : "text-ink/90"}>
                                {choice.label}
                                {isMode && (
                                  <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                                    Top choice
                                  </span>
                                )}
                              </span>
                              <span className="font-mono text-muted">
                                <strong className="text-ink">{pct}%</strong> ({count} respondents)
                              </span>
                            </div>
                            <div className="h-3 w-full bg-[#07080f] rounded-full overflow-hidden flex">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isMode ? "bg-accent" : "bg-muted/40"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {currentQuestion.type === "multi_choice" && (
              <div className="p-6 rounded-xl bg-card border border-line space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">
                    Option Frequency (Select all that apply)
                  </h3>
                  <div className="flex items-center gap-3 text-xs font-mono text-muted">
                    <span>
                      Avg options / respondent:{" "}
                      <strong className="text-accent">
                        {(currentStat as MultiChoiceStat)?.avgOptionsPerRespondent ?? 0}
                      </strong>
                    </span>
                    {(currentStat as MultiChoiceStat)?.otherCount > 0 && (
                      <span className="text-amber-300">
                        &apos;Other&apos; write-ins: {(currentStat as MultiChoiceStat).otherCount}
                      </span>
                    )}
                  </div>
                </div>

                {(() => {
                  const stat = currentStat as MultiChoiceStat | undefined;
                  if (!stat || stat.answeredCount === 0) {
                    return <p className="text-xs text-muted">No responses for this question yet.</p>;
                  }

                  return (
                    <div className="space-y-4">
                      {currentQuestion.choices.map((choice) => {
                        const count = stat.counts[choice.label] || 0;
                        const pct = stat.percentages[choice.label] || 0;

                        return (
                          <div key={choice.label} className="space-y-1.5">
                            <div className="flex justify-between text-xs font-medium">
                              <span className="text-ink/90">{choice.label}</span>
                              <span className="font-mono text-muted">
                                <strong className="text-ink">{pct}%</strong> ({count} of {stat.answeredCount})
                              </span>
                            </div>
                            <div className="h-3 w-full bg-[#07080f] rounded-full overflow-hidden flex">
                              <div
                                className="h-full bg-accent rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}

                      {/* 'Other' write-ins expandable */}
                      {stat.otherResponses && stat.otherResponses.length > 0 && (
                        <div className="pt-4 border-t border-line space-y-2">
                          <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Custom Write-in Responses (&apos;Other&apos;):
                          </span>
                          <div className="grid sm:grid-cols-2 gap-2">
                            {stat.otherResponses.map((item, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-lg bg-[#07080f] border border-line text-xs font-mono text-ink/90 flex justify-between gap-2"
                              >
                                <span>&ldquo;{item.text}&rdquo;</span>
                                <span className="text-[10px] text-muted shrink-0">
                                  {item.responseId}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {currentQuestion.type === "scale" && (
              <div className="p-6 rounded-xl bg-card border border-line space-y-6">
                {(() => {
                  const stat = currentStat as ScaleStat | undefined;
                  if (!stat || stat.answeredCount === 0) {
                    return <p className="text-xs text-muted">No scale ratings recorded yet.</p>;
                  }

                  return (
                    <div className="space-y-6">
                      {/* Scale Summary Stats Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <div className="p-3 rounded-lg bg-[#07080f] border border-line">
                          <span className="text-[11px] text-muted">Mean (Average)</span>
                          <div className="text-2xl font-bold text-accent">{stat.mean}</div>
                          <span className="text-[10px] text-muted">out of 5.0</span>
                        </div>
                        <div className="p-3 rounded-lg bg-[#07080f] border border-line">
                          <span className="text-[11px] text-muted">Median</span>
                          <div className="text-2xl font-bold text-ink">{stat.median}</div>
                          <span className="text-[10px] text-muted">50th percentile</span>
                        </div>
                        <div className="p-3 rounded-lg bg-[#07080f] border border-line">
                          <span className="text-[11px] text-muted">Range (Min – Max)</span>
                          <div className="text-2xl font-bold text-ink">{stat.min} – {stat.max}</div>
                          <span className="text-[10px] text-muted">1 to 5 scale</span>
                        </div>
                        <div className="p-3 rounded-lg bg-[#07080f] border border-line">
                          <span className="text-[11px] text-muted">Standard Deviation</span>
                          <div className="text-2xl font-bold text-ink">{stat.stdDev}</div>
                          <span className="text-[10px] text-muted">Variance spread</span>
                        </div>
                        <div className="p-3 rounded-lg bg-[#07080f] border border-line">
                          <span className="text-[11px] text-muted">Agreement (4-5)</span>
                          <div className="text-2xl font-bold text-emerald-400">{stat.positiveRate}%</div>
                          <span className="text-[10px] text-muted">Disagree: {stat.negativeRate}%</span>
                        </div>
                      </div>

                      {/* Scale Distribution Histogram */}
                      <div className="space-y-3">
                        <div className="flex justify-between text-xs text-muted">
                          <span>1 = {currentQuestion.scaleMinLabel || "Min"}</span>
                          <span>5 = {currentQuestion.scaleMaxLabel || "Max"}</span>
                        </div>
                        <div className="grid grid-cols-5 gap-2 h-40 items-end pt-4 bg-[#07080f] p-4 rounded-xl border border-line">
                          {[1, 2, 3, 4, 5].map((s) => {
                            const count = stat.counts[s] || 0;
                            const pct = stat.percentages[s] || 0;
                            const maxPct = Math.max(...Object.values(stat.percentages), 1);
                            const heightPct = Math.max(10, Math.round((pct / maxPct) * 100));

                            return (
                              <div key={s} className="flex flex-col items-center h-full justify-end gap-1.5">
                                <span className="text-[11px] font-mono text-muted">{pct}%</span>
                                <div
                                  className={`w-full rounded-t transition-all duration-500 ${
                                    s >= 4
                                      ? "bg-emerald-400/80 hover:bg-emerald-400"
                                      : s === 3
                                      ? "bg-accent/80 hover:bg-accent"
                                      : "bg-rose-400/80 hover:bg-rose-400"
                                  }`}
                                  style={{ height: `${heightPct}%` }}
                                />
                                <div className="text-xs font-mono font-bold text-ink mt-1">
                                  {s} <span className="text-[10px] text-muted font-normal">({count})</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {currentQuestion.type === "grid" && (
              <div className="p-6 rounded-xl bg-card border border-line space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">
                    Matrix Breakdown (1 = Low, 5 = High)
                  </h3>
                  {(currentStat as GridStat)?.topRankedRow && (
                    <span className="text-xs font-mono px-2.5 py-1 rounded bg-accent/20 text-accent border border-accent/30">
                      Top Ranked: {(currentStat as GridStat).topRankedRow}
                    </span>
                  )}
                </div>

                {(() => {
                  const stat = currentStat as GridStat | undefined;
                  if (!stat || stat.answeredCount === 0) {
                    return <p className="text-xs text-muted">No grid submissions recorded yet.</p>;
                  }

                  return (
                    <div className="space-y-4">
                      {stat.rows.map((row) => (
                        <div
                          key={row.label}
                          className="p-4 rounded-lg bg-[#07080f] border border-line space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-ink">{row.label}</span>
                            <div className="flex items-center gap-3 text-xs font-mono">
                              <span className="text-muted">
                                Mean: <strong className="text-accent">{row.mean}</strong> / 5.0
                              </span>
                              <span className="text-muted">
                                Min: <strong>{row.min}</strong> | Max: <strong>{row.max}</strong>
                              </span>
                              <span className="text-muted">
                                SD: <strong>{row.stdDev}</strong>
                              </span>
                              <span className="text-emerald-400">
                                {row.highPriorityRate}% rated 4-5
                              </span>
                            </div>
                          </div>

                          {/* Mini 1-5 bar */}
                          <div className="h-2 w-full bg-card rounded-full overflow-hidden flex">
                            {[1, 2, 3, 4, 5].map((score) => {
                              const pct = row.percentages[score] || 0;
                              return (
                                <div
                                  key={score}
                                  className={`h-full ${
                                    score >= 4
                                      ? "bg-emerald-400"
                                      : score === 3
                                      ? "bg-accent"
                                      : "bg-rose-400/60"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                  title={`Score ${score}: ${pct}% (${row.counts[score]} votes)`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {(currentQuestion.type === "paragraph" || currentQuestion.type === "short_text") && (
              <div className="p-6 rounded-xl bg-card border border-line space-y-6">
                {(() => {
                  const stat = currentStat as OpenTextStat | undefined;
                  if (!stat || stat.answeredCount === 0) {
                    return <p className="text-xs text-muted">No text submissions for this question yet.</p>;
                  }

                  return (
                    <div className="space-y-6">
                      {/* Keyword tags */}
                      {stat.commonKeywords && stat.commonKeywords.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-xs font-semibold text-muted">Frequent Keywords:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {stat.commonKeywords.map((kw) => (
                              <span
                                key={kw.word}
                                className="px-2 py-0.5 rounded-full bg-[#07080f] border border-line text-xs font-mono text-ink"
                              >
                                {kw.word} <span className="text-accent font-bold">({kw.count})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Entries list */}
                      <div className="space-y-3">
                        <div className="text-xs font-semibold text-ink">
                          All Submissions ({stat.entries.length}):
                        </div>
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                          {stat.entries.map((entry, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-lg bg-[#07080f] border border-line space-y-1 text-xs"
                            >
                              <div className="flex justify-between items-center text-[10px] font-mono text-muted">
                                <span className="text-accent font-semibold">{entry.responseId}</span>
                                <span>{entry.date ? new Date(entry.date).toLocaleDateString() : ""}</span>
                              </div>
                              <p className="text-ink/90 leading-relaxed font-sans">{entry.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: CROSS-TABULATION & ACADEMIC INSIGHTS                              */}
        {/* ========================================================================= */}
        {activeTab === "crosstabs" && (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                Demographic Cross-Tabulations & Segmentation
              </h2>
              <p className="text-xs text-muted">
                How sound signature preferences, YouTube test skepticism, and desired features correlate with builder experience
              </p>
            </div>

            {/* Cross-Tab Table */}
            <div className="overflow-x-auto rounded-xl border border-line bg-card">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#07080f] text-muted font-mono uppercase tracking-wider border-b border-line">
                  <tr>
                    <th className="p-3.5">Experience Segment (Q1)</th>
                    <th className="p-3.5">Respondents</th>
                    <th className="p-3.5">Avg YouTube Trust (Q3, 1-5)</th>
                    <th className="p-3.5">Top Preferred Sound (Q4)</th>
                    <th className="p-3.5">Most Desired Feature (Q5)</th>
                    <th className="p-3.5">A/B Testing Interest (Q6)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-medium">
                  {crossTabs.map((row) => (
                    <tr key={row.experience} className="hover:bg-[#07080f]/50 transition-colors">
                      <td className="p-3.5 text-ink font-semibold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-accent" />
                        {row.experience}
                      </td>
                      <td className="p-3.5 font-mono text-muted">
                        <strong className="text-ink">{row.count}</strong> ({row.percentOfTotal}%)
                      </td>
                      <td className="p-3.5 font-mono">
                        {row.avgYtAccuracy !== null ? (
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              row.avgYtAccuracy <= 2.5
                                ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                                : row.avgYtAccuracy >= 3.5
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                : "bg-card text-ink"
                            }`}
                          >
                            {row.avgYtAccuracy} / 5.0
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3.5 text-ink font-mono">{row.topSoundSignature ?? "—"}</td>
                      <td className="p-3.5 text-muted max-w-xs truncate" title={row.topValuableFeature || ""}>
                        {row.topValuableFeature ?? "—"}
                      </td>
                      <td className="p-3.5 font-mono text-accent">{row.abCompareWantedPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: QUALITATIVE & CONTACTS                                             */}
        {/* ========================================================================= */}
        {activeTab === "qualitative" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  Qualitative Feedback & Contacts
                </h2>
                <p className="text-xs text-muted">
                  Open suggestions (Q9), interview contacts (Q10), and write-in responses
                </p>
              </div>

              {openTextQ10.length > 0 && (
                <button
                  onClick={() => {
                    const contacts = openTextQ10.map((e) => `${e.responseId}: ${e.text}`).join("\n");
                    handleCopy(contacts, "contacts");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 shadow transition-colors"
                >
                  {copySuccess === "contacts" ? "Copied All Contacts!" : "Copy All Interview Handles"}
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Q9 Feature Ideas */}
              <div className="p-5 rounded-xl bg-card border border-line space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent" />
                    Q9: Feature Ideas & App Proposals ({openTextQ9.length})
                  </h3>
                  <span className="text-[11px] font-mono text-muted">Paragraph text</span>
                </div>

                {openTextQ9.length === 0 ? (
                  <p className="text-xs text-muted">No Q9 entries found in current filter.</p>
                ) : (
                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                    {openTextQ9.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-[#07080f] border border-line space-y-1.5 text-xs"
                      >
                        <div className="flex justify-between items-center text-[10px] font-mono text-muted">
                          <span className="text-accent font-semibold">{item.responseId}</span>
                          <span className="px-1.5 py-0.5 rounded bg-card">{item.status}</span>
                        </div>
                        <p className="text-ink/90 leading-relaxed">&ldquo;{item.text}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Q10 Interview Contacts */}
              <div className="p-5 rounded-xl bg-card border border-line space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Q10: Follow-up Interview Leads ({openTextQ10.length})
                  </h3>
                  <span className="text-[11px] font-mono text-muted">Discord / Email</span>
                </div>

                {openTextQ10.length === 0 ? (
                  <p className="text-xs text-muted">No contact handles provided in current filter.</p>
                ) : (
                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                    {openTextQ10.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-[#07080f] border border-line flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <span className="font-mono text-ink font-semibold block">{item.text}</span>
                          <span className="text-[10px] text-muted font-mono">{item.responseId}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(item.text, `contact-${idx}`)}
                          className="px-2.5 py-1 rounded bg-card border border-line text-[11px] font-mono text-muted hover:text-ink transition-colors shrink-0"
                        >
                          {copySuccess === `contact-${idx}` ? "Copied" : "Copy"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* All 'Other' Custom Write-ins Section */}
            <div className="p-5 rounded-xl bg-card border border-line space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <h3 className="text-sm font-semibold text-ink">
                    Custom &apos;Other&apos; Write-Ins Across All Questions ({allOtherWriteIns.length})
                  </h3>
                </div>
                {allOtherWriteIns.length > 0 && (
                  <button
                    onClick={() => {
                      const allText = allOtherWriteIns
                        .map((e) => `[Q${e.questionOrder} - ${e.responseId}] ${e.text}`)
                        .join("\n");
                      handleCopy(allText, "all-other");
                    }}
                    className="px-2.5 py-1 rounded bg-[#07080f] border border-line text-xs font-mono text-muted hover:text-ink transition-colors"
                  >
                    {copySuccess === "all-other" ? "Copied All!" : "Copy All 'Other' Entries"}
                  </button>
                )}
              </div>

              {allOtherWriteIns.length === 0 ? (
                <p className="text-xs text-muted">No &apos;Other&apos; write-in responses found in current filter.</p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {allOtherWriteIns.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[#07080f] border border-line space-y-1.5 text-xs flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-mono text-muted">
                          <span className="text-amber-300 font-semibold">Q{item.questionOrder}</span>
                          <span>{item.responseId}</span>
                        </div>
                        <div className="text-[11px] text-muted truncate" title={item.questionTitle}>
                          {item.questionTitle}
                        </div>
                        <p className="text-ink/90 font-mono mt-1">&ldquo;{item.text}&rdquo;</p>
                      </div>
                      <div className="pt-2 border-t border-line/40 flex justify-end">
                        <button
                          onClick={() => handleCopy(item.text, `other-${idx}`)}
                          className="text-[10px] font-mono text-muted hover:text-accent"
                        >
                          {copySuccess === `other-${idx}` ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: RESPONSES DATA TABLE                                               */}
        {/* ========================================================================= */}
        {activeTab === "table" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  Individual Response Records
                </h2>
                <p className="text-xs text-muted">
                  Inspect raw respondent entries, status, timestamps, and answer details
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <button
                  disabled={tablePage === 1}
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded bg-card border border-line text-ink disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-muted">
                  Page {tablePage} of {totalPages}
                </span>
                <button
                  disabled={tablePage >= totalPages}
                  onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded bg-card border border-line text-ink disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-line bg-card">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#07080f] text-muted font-mono uppercase tracking-wider border-b border-line">
                  <tr>
                    <th
                      className="p-3 cursor-pointer hover:text-ink select-none"
                      onClick={() => handleSort("responseId")}
                      title="Click to sort by Response ID"
                    >
                      Response ID {sortColumn === "responseId" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:text-ink select-none"
                      onClick={() => handleSort("status")}
                      title="Click to sort by Status"
                    >
                      Status {sortColumn === "status" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="p-3">Source</th>
                    <th
                      className="p-3 cursor-pointer hover:text-ink select-none"
                      onClick={() => handleSort("startedAt")}
                      title="Click to sort by Date"
                    >
                      Started {sortColumn === "startedAt" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:text-ink select-none"
                      onClick={() => handleSort("durationSec")}
                      title="Click to sort by Duration"
                    >
                      Duration {sortColumn === "durationSec" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:text-ink select-none"
                      onClick={() => handleSort("answeredCount")}
                      title="Click to sort by Answered Questions"
                    >
                      Answered {sortColumn === "answeredCount" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="p-3">Q1 Experience</th>
                    <th className="p-3">Q4 Sound</th>
                    <th className="p-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {paginatedResponses.map((r) => (
                    <tr
                      key={r.responseId}
                      className="hover:bg-[#07080f]/50 transition-colors cursor-pointer"
                      onClick={() => setInspectedResponse(r)}
                    >
                      <td className="p-3 font-mono font-semibold text-accent">
                        {r.responseId}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                            r.status === "Complete"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {r.source ? (
                          <span className="px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 text-[10px]">
                            {r.source}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted/60">Direct</span>
                        )}
                      </td>
                      <td className="p-3 text-muted font-mono">
                        {r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}
                      </td>
                      <td className="p-3 font-mono text-ink">
                        {formatDuration(r.durationSec)}
                      </td>
                      <td className="p-3 font-mono text-muted">
                        <strong className="text-ink">{r.answeredCount}</strong> / {questions.length}
                      </td>
                      <td className="p-3 text-ink/90 max-w-[140px] truncate">
                        {(r.answers["1"] as string) || "—"}
                      </td>
                      <td className="p-3 text-ink/90 max-w-[140px] truncate">
                        {(r.answers["4"] as string) || "—"}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedResponse(r);
                          }}
                          className="px-2.5 py-1 rounded bg-[#07080f] border border-line text-muted hover:text-ink transition-colors font-mono text-[11px]"
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 7: EXPORT & ACADEMIC CODE GENERATOR                                   */}
        {/* ========================================================================= */}
        {activeTab === "export" && (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                Export & Statistical Tool Integrations
              </h2>
              <p className="text-xs text-muted">
                Download cleaned survey telemetry for SPSS, R, Python, and Excel, or copy automated analysis starter code
              </p>
            </div>

            {/* Quick Action Cards */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-6 rounded-xl bg-card border border-line space-y-3">
                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8l-8 8-8-8" />
                  </svg>
                  Academic CSV Format
                </h3>
                <p className="text-xs text-muted">
                  Standard CSV formatted for SPSS, R, Python, and Excel.
                </p>
                <button
                  onClick={handleDownloadCSV}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors shadow"
                >
                  Download .CSV ({filteredResponses.length} rows)
                </button>
              </div>

              <div className="p-6 rounded-xl bg-card border border-line space-y-3">
                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  JSON Format
                </h3>
                <p className="text-xs text-muted">
                  Full nested JSON objects with raw timestamps and answers.
                </p>
                <button
                  onClick={handleDownloadJSON}
                  className="px-4 py-2 rounded-lg bg-card border border-line hover:border-accent/40 text-ink text-xs font-semibold transition-colors"
                >
                  Download .JSON ({filteredResponses.length} rows)
                </button>
              </div>
            </div>

            {/* Direct HTTP API Endpoints */}
            <div className="p-5 rounded-xl bg-card border border-line space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Direct HTTP Export API Endpoints
                </h3>
                <span className="text-[11px] font-mono text-muted">Automated fetch & pipeline ingestion</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Use these endpoints to fetch real-time survey datasets directly in Python notebooks, R Studio, or CI/CD pipelines.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-[#07080f] border border-line flex items-center justify-between gap-2">
                  <div className="truncate">
                    <span className="text-emerald-400 font-bold">GET</span>{" "}
                    <span className="text-ink/90">/api/dashboard/export?format=csv</span>
                  </div>
                  <a
                    href={`/api/dashboard/export?format=csv&source=${sourceMode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded bg-card border border-line text-[10px] text-accent hover:underline shrink-0"
                  >
                    Open ↗
                  </a>
                </div>
                <div className="p-3 rounded-lg bg-[#07080f] border border-line flex items-center justify-between gap-2">
                  <div className="truncate">
                    <span className="text-accent font-bold">GET</span>{" "}
                    <span className="text-ink/90">/api/dashboard/export?format=json</span>
                  </div>
                  <a
                    href={`/api/dashboard/export?format=json&source=${sourceMode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded bg-card border border-line text-[10px] text-accent hover:underline shrink-0"
                  >
                    Open ↗
                  </a>
                </div>
              </div>
            </div>

            {/* Starter Code Snippets for Thesis Analysis */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-ink">
                Quick Statistical Scripts (Copy & Paste into your analysis environment)
              </h3>

              <div className="grid md:grid-cols-2 gap-4">
                {/* R Script */}
                <div className="p-4 rounded-xl bg-card border border-line space-y-2">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-accent font-semibold">R (Tidyverse / Base)</span>
                    <button
                      onClick={() =>
                        handleCopy(
                          `# Load and analyze mechanical keyboard survey data\ndf <- read.csv("keyboard_survey_export.csv")\n\n# Summary statistics for YouTube test accuracy (Q3)\nsummary(df$Q3.YouTube.Accuracy.Rating..1.5.)\nsd(df$Q3.YouTube.Accuracy.Rating..1.5., na.rm = TRUE)\n\n# Cross-tabulation: Experience level vs Preferred Sound\ntable(df$Q1.Experience.Level, df$Q4.Sound.Signature)\n\n# Linear model: Does modding experience predict YouTube trust?\nlm_fit <- lm(Q3.YouTube.Accuracy.Rating..1.5. ~ Q1.Experience.Level, data = df)\nsummary(lm_fit)`,
                          "r-code",
                        )
                      }
                      className="px-2 py-0.5 rounded bg-[#07080f] border border-line text-[10px] text-muted hover:text-ink"
                    >
                      {copySuccess === "r-code" ? "Copied!" : "Copy R"}
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-[#07080f] text-[11px] font-mono text-muted overflow-x-auto leading-relaxed">
{`# Load and analyze survey data in R
df <- read.csv("keyboard_survey_export.csv")

# Summary stats for YouTube accuracy (Q3)
summary(df$Q3.YouTube.Accuracy.Rating..1.5.)
sd(df$Q3.YouTube.Accuracy.Rating..1.5., na.rm=TRUE)

# Cross-tab: Experience vs Sound Signature
table(df$Q1.Experience.Level, df$Q4.Sound.Signature)`}
                  </pre>
                </div>

                {/* Python Script */}
                <div className="p-4 rounded-xl bg-card border border-line space-y-2">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-accent font-semibold">Python (pandas / scipy)</span>
                    <button
                      onClick={() =>
                        handleCopy(
                          `import pandas as pd\n\n# Load survey data\ndf = pd.read_csv("keyboard_survey_export.csv")\n\n# Grouped stats for Q3 YouTube accuracy\nprint(df.groupby("Q1 Experience Level")["Q3 YouTube Accuracy Rating (1-5)"].agg(["mean", "std", "count"]))\n\n# Value counts for Sound Signature\nprint(df["Q4 Sound Signature"].value_counts(normalize=True) * 100)\n\n# Duration in minutes\nprint("Median Duration (min):", df["Duration (seconds)"].median() / 60)`,
                          "py-code",
                        )
                      }
                      className="px-2 py-0.5 rounded bg-[#07080f] border border-line text-[10px] text-muted hover:text-ink"
                    >
                      {copySuccess === "py-code" ? "Copied!" : "Copy Python"}
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-[#07080f] text-[11px] font-mono text-muted overflow-x-auto leading-relaxed">
{`import pandas as pd

df = pd.read_csv("keyboard_survey_export.csv")

# Grouped metrics by Experience
stats = df.groupby("Q1 Experience Level")[
    "Q3 YouTube Accuracy Rating (1-5)"
].agg(["mean", "std", "count"])
print(stats)`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Slide-out Drawer / Modal for Inspected Response */}
      {inspectedResponse && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-xl bg-card border-l border-line h-full overflow-y-auto p-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-accent">
                      {inspectedResponse.responseId}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                        inspectedResponse.status === "Complete"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {inspectedResponse.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted font-mono mt-0.5">
                    Started: {inspectedResponse.startedAt ? new Date(inspectedResponse.startedAt).toLocaleString() : "—"}
                  </p>
                </div>
                <button
                  onClick={() => setInspectedResponse(null)}
                  className="p-1.5 rounded-lg bg-[#07080f] border border-line text-muted hover:text-ink"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Metadata summary */}
              <div className="grid grid-cols-3 gap-2 text-xs font-mono p-3 rounded-lg bg-[#07080f] border border-line">
                <div>
                  <span className="text-muted block">Duration:</span>
                  <span className="text-ink font-semibold">{formatDuration(inspectedResponse.durationSec)}</span>
                </div>
                <div>
                  <span className="text-muted block">Answered:</span>
                  <span className="text-ink font-semibold">
                    {inspectedResponse.answeredCount} / {questions.length} questions
                  </span>
                </div>
                <div>
                  <span className="text-muted block">Source:</span>
                  <span className="text-accent font-semibold truncate block">
                    {inspectedResponse.source || "Direct / None"}
                  </span>
                </div>
              </div>

              {/* All Question Answers List */}
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Submitted Question Responses:
                </h4>
                {questions.map((q) => {
                  const key = String(q.order);
                  const ans = inspectedResponse.answers[key];
                  const oth = inspectedResponse.other[key];

                  return (
                    <div key={q.order} className="p-3 rounded-lg bg-[#07080f]/80 border border-line space-y-1.5 text-xs">
                      <div className="flex justify-between text-[11px] text-muted font-mono">
                        <span>Q{q.order} ({q.type})</span>
                      </div>
                      <div className="font-medium text-ink/90">{q.title}</div>
                      <div className="pt-1 text-accent font-mono">
                        {ans !== undefined && ans !== null && ans !== "" ? (
                          typeof ans === "object" && !Array.isArray(ans) ? (
                            <pre className="text-[11px] text-ink/90 whitespace-pre-wrap">
                              {JSON.stringify(ans, null, 2)}
                            </pre>
                          ) : Array.isArray(ans) ? (
                            ans.length > 0 ? (
                              <ul className="list-disc list-inside space-y-0.5 text-ink/90">
                                {ans.map((item, i) => (
                                  <li key={i}>{String(item)}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-muted italic">None selected</span>
                            )
                          ) : (
                            <span className="text-ink/90">{String(ans)}</span>
                          )
                        ) : (
                          <span className="text-muted/60 italic">Unanswered</span>
                        )}
                        {oth && (
                          <div className="mt-1 text-amber-300 text-[11px]">
                            Other: &ldquo;{oth}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-line flex justify-between">
              <button
                onClick={() =>
                  handleCopy(JSON.stringify(inspectedResponse, null, 2), "single-json")
                }
                className="px-3 py-1.5 rounded bg-[#07080f] border border-line text-xs font-mono text-muted hover:text-ink"
              >
                {copySuccess === "single-json" ? "Copied JSON!" : "Copy Raw JSON"}
              </button>
              <button
                onClick={() => setInspectedResponse(null)}
                className="px-4 py-1.5 rounded bg-accent text-white text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
