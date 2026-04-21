import type { DecisionLogEntry } from "./decision-log";
import { getSystemOverview, type SystemOverview } from "./decision-observer";
import { getSystemAudit, type AuditStatus, type SystemAudit } from "./decision-auditor";
import { getPrioritizedRecommendations } from "./decision-prioritizer";
import type { SystemRecommendationsResult } from "./decision-advisor";

export interface SystemState {
  status: AuditStatus;
  overview: SystemOverview;
  audit: SystemAudit;
  recommendations: SystemRecommendationsResult;
}

function statusRank(status: AuditStatus): number {
  switch (status) {
    case "alert":
      return 3;
    case "watch":
      return 2;
    default:
      return 1;
  }
}

function mostSevereStatus(...statuses: AuditStatus[]): AuditStatus {
  return [...statuses].sort((left, right) => statusRank(right) - statusRank(left))[0] ?? "ok";
}

export function getSystemState(logs?: DecisionLogEntry[]): SystemState {
  const overview = getSystemOverview(logs);
  const audit = getSystemAudit(logs);
  const recommendations = getPrioritizedRecommendations(logs);

  return {
    status: mostSevereStatus(audit.status, recommendations.status),
    overview,
    audit,
    recommendations
  };
}

export function getSystemStateText(state: SystemState): string {
  const activityLabel =
    state.overview.activityLevel === "high"
      ? "elevee"
      : state.overview.activityLevel === "medium"
        ? "moderee"
        : "faible";

  const issueText =
    state.audit.issues.length === 0
      ? "Aucune derive detectee."
      : `Derives: ${state.audit.issues.map((issue) => issue.type).join(", ")}.`;

  const recommendationsText =
    state.recommendations.recommendations.length === 0
      ? "Aucune recommandation."
      : `Recommandations prioritaires: ${state.recommendations.recommendations
          .map((recommendation) => recommendation.type)
          .join(", ")}.`;

  return `Etat global: ${state.status}. Activite ${activityLabel}. ${issueText} ${recommendationsText}`;
}