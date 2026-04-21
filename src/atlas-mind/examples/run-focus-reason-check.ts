import type { GlobalSummary } from "../decision-global-summary";
import type { AuditIssueType, AuditStatus } from "../decision-auditor";
import type { SystemOverview } from "../decision-observer";
import type { SystemTrends } from "../decision-trends";
import type { SystemRecommendationsResult } from "../decision-advisor";
import type { RelevantPattern } from "../decision-pattern-relevance";
import { clearSpeechState } from "../decision-speech-state";
import { clearDiscourseState } from "../decision-discourse-memory";
import { getFocusSignal, getFocusedSummaryText } from "../decision-focus";
import { getFocusReason, getReasonedFocusedSummaryText } from "../decision-focus-reason";

function resetAllState(): void {
  clearSpeechState();
  clearDiscourseState();
}

function buildOverview(activityLevel: SystemOverview["activityLevel"]): SystemOverview {
  return {
    totalDecisions: activityLevel === "low" ? 2 : 8,
    counts: {
      ignore: activityLevel === "low" ? 2 : 1,
      log: activityLevel === "low" ? 0 : 3,
      watch: activityLevel === "low" ? 0 : 2,
      flag: activityLevel === "low" ? 0 : 2
    },
    activityLevel,
    topCities: [
      {
        city: "Paris",
        total: 4,
        significant: 2
      }
    ],
    recentFlagsCount: activityLevel === "low" ? 0 : 2,
    recentWatchesCount: activityLevel === "low" ? 0 : 2
  };
}

function buildTrends(): SystemTrends {
  return {
    statusTrend: "stable",
    activityTrend: "stable",
    flagTrend: "stable",
    watchTrend: "stable",
    dominantCityTrend: "stable"
  };
}

function buildSummary(params: {
  status: AuditStatus;
  issues?: AuditIssueType[];
  recommendations?: SystemRecommendationsResult["recommendations"];
  topPatterns?: RelevantPattern[];
  activityLevel?: SystemOverview["activityLevel"];
}): GlobalSummary {
  const issues = (params.issues ?? []).map((type) => ({
    type,
    message: `Issue ${type}`
  }));

  const recommendations = params.recommendations ?? [];

  return {
    status: params.status,
    overview: buildOverview(params.activityLevel ?? "medium"),
    trends: buildTrends(),
    audit: {
      status: params.status,
      issues
    },
    recommendations: {
      status: params.status,
      recommendations
    },
    topPatterns: params.topPatterns ?? []
  };
}

function runScenario(name: string, summary: GlobalSummary) {
  const focusRaw = getFocusSignal(summary);
  const focusReasoned = getFocusReason(summary);

  resetAllState();
  const beforeText = getFocusedSummaryText(summary);

  resetAllState();
  const afterText = getReasonedFocusedSummaryText(summary);

  console.log(`[AtlasMind][FocusReason][${name}] focusRaw=`, focusRaw);
  console.log(`[AtlasMind][FocusReason][${name}] focusReasoned=`, focusReasoned);
  console.log(`[AtlasMind][FocusReason][${name}] before=`, beforeText);
  console.log(`[AtlasMind][FocusReason][${name}] after=`, afterText);

  return {
    name,
    focusRaw,
    focusReasoned,
    beforeText,
    afterText
  };
}

/**
 * Test manuel v32:
 * - issue
 * - recommendation
 * - pattern
 * - status fallback
 */
export function runAtlasMindV32FocusReasonExample() {
  const issueSummary = buildSummary({
    status: "alert",
    issues: ["city_dominance"],
    recommendations: [
      {
        type: "watch_city",
        message: "watch city",
        priority: "medium"
      }
    ]
  });

  const recommendationSummary = buildSummary({
    status: "watch",
    issues: ["low_activity"],
    recommendations: [
      {
        type: "review_city_coverage",
        message: "review coverage",
        priority: "high"
      }
    ]
  });

  const patternSummary = buildSummary({
    status: "watch",
    issues: ["low_activity"],
    recommendations: [
      {
        type: "collect_more_data",
        message: "collect data",
        priority: "medium"
      }
    ],
    topPatterns: [
      {
        pattern: ["low_activity", "collect_more_data", "watch"],
        count: 3,
        relevanceScore: 2
      }
    ]
  });

  const fallbackSummary = buildSummary({
    status: "ok",
    issues: [],
    recommendations: [],
    topPatterns: [],
    activityLevel: "low"
  });

  return {
    issueCase: runScenario("issue", issueSummary),
    recommendationCase: runScenario("recommendation", recommendationSummary),
    patternCase: runScenario("pattern", patternSummary),
    fallbackCase: runScenario("status", fallbackSummary)
  };
}
