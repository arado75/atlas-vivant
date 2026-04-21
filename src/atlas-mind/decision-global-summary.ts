import type { DecisionLogEntry } from "./decision-log";
import { getSystemState } from "./decision-state";
import { type AuditStatus, type SystemAudit } from "./decision-auditor";
import { type SystemOverview } from "./decision-observer";
import { type SystemTrends, getSystemTrends } from "./decision-trends";
import { type SystemRecommendationsResult } from "./decision-advisor";
import { getPatternSummary } from "./decision-pattern-summary";
import type { RelevantPattern } from "./decision-pattern-relevance";

export type GlobalSummary = {
  status: AuditStatus;
  overview: SystemOverview;
  trends: SystemTrends;
  audit: SystemAudit;
  recommendations: SystemRecommendationsResult;
  topPatterns: RelevantPattern[];
};

export function getGlobalSummary(logs?: DecisionLogEntry[]): GlobalSummary {
  const state = getSystemState(logs);
  const trends = getSystemTrends(logs);
  const patternSummary = getPatternSummary(logs);

  return {
    status: state.status,
    overview: state.overview,
    trends,
    audit: state.audit,
    recommendations: state.recommendations,
    topPatterns: patternSummary.topPatterns
  };
}

function toActivityLabel(level: SystemOverview["activityLevel"]): string {
  if (level === "high") {
    return "elevee";
  }

  if (level === "medium") {
    return "moderee";
  }

  return "faible";
}

export function getGlobalSummaryText(summary: GlobalSummary): string {
  const issuesText =
    summary.audit.issues.length === 0
      ? "Aucune derive detectee."
      : `Derives: ${summary.audit.issues.map((issue) => issue.type).join(", ")}.`;

  const recommendationsText =
    summary.recommendations.recommendations.length === 0
      ? "Aucune recommandation."
      : `Recommandations: ${summary.recommendations.recommendations
          .map((recommendation) => recommendation.type)
          .join(", ")}.`;

  const patternsText =
    summary.topPatterns.length === 0
      ? "Motifs dominants: aucun."
      : `Motifs dominants: ${summary.topPatterns
          .map((pattern) => pattern.pattern.join(" -> "))
          .join("; ")}.`;

  return `Etat global: ${summary.status}. Activite ${toActivityLabel(summary.overview.activityLevel)} (${summary.trends.activityTrend}). ${issuesText} ${recommendationsText} ${patternsText}`;
}
