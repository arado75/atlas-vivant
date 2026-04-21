import type { DecisionLogEntry } from "./decision-log";
import {
  getSystemAudit,
  type AuditIssueType,
  type AuditStatus
} from "./decision-auditor";
import { getSystemOverview } from "./decision-observer";

export type RecommendationType =
  | "no_action_needed"
  | "continue_normal_monitoring"
  | "collect_more_data"
  | "review_flag_threshold"
  | "review_city_coverage"
  | "watch_city";

export type RecommendationPriority = "low" | "medium" | "high";

export interface SystemRecommendation {
  type: RecommendationType;
  message: string;
  priority: RecommendationPriority;
}

export interface SystemRecommendationsResult {
  status: AuditStatus;
  recommendations: SystemRecommendation[];
}

function dedupeRecommendations(
  recommendations: SystemRecommendation[]
): SystemRecommendation[] {
  const seen = new Set<string>();
  const output: SystemRecommendation[] = [];

  for (const recommendation of recommendations) {
    const key = `${recommendation.type}|${recommendation.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(recommendation);
  }

  return output;
}

function fromIssue(
  issue: AuditIssueType,
  topCity: string | null
): SystemRecommendation[] {
  switch (issue) {
    case "no_significant_activity":
      return [
        {
          type: "collect_more_data",
          message: "Collecter davantage de donnees avant interpretation forte.",
          priority: "medium"
        }
      ];
    case "too_many_flags":
      return [
        {
          type: "review_flag_threshold",
          message: "Verifier le seuil/critere de flag pour limiter les escalades excessives.",
          priority: "high"
        }
      ];
    case "city_dominance":
      return [
        {
          type: "review_city_coverage",
          message: "Elargir la couverture des villes pour reduire la concentration des decisions.",
          priority: "high"
        },
        {
          type: "watch_city",
          message: `Surveiller prioritairement ${topCity ?? "la ville dominante"} sur les prochains checks.`,
          priority: "medium"
        }
      ];
    case "low_activity":
      return [
        {
          type: "collect_more_data",
          message: "Activite faible: collecter un peu plus de decisions avant conclusion.",
          priority: "low"
        }
      ];
    case "high_activity":
      return [
        {
          type: "continue_normal_monitoring",
          message: "Activite elevee: poursuivre le monitoring normal avec vigilance.",
          priority: "medium"
        }
      ];
    case "no_escalation":
      return [
        {
          type: "review_flag_threshold",
          message: "Verifier la logique d'escalade (beaucoup de watch sans flag).",
          priority: "medium"
        }
      ];
    default:
      return [];
  }
}

export function getSystemRecommendations(
  logs?: DecisionLogEntry[]
): SystemRecommendationsResult {
  const audit = getSystemAudit(logs);
  const overview = getSystemOverview(logs);
  const topCity = overview.topCities[0]?.city ?? null;

  if (audit.status === "ok") {
    return {
      status: "ok",
      recommendations: [
        {
          type: "no_action_needed",
          message: "Aucune action necessaire pour le moment.",
          priority: "low"
        }
      ]
    };
  }

  const recommendations = dedupeRecommendations(
    audit.issues.flatMap((issue) => fromIssue(issue.type, topCity))
  );

  if (recommendations.length === 0) {
    recommendations.push({
      type: "continue_normal_monitoring",
      message: "Poursuivre le monitoring normal.",
      priority: "low"
    });
  }

  return {
    status: audit.status,
    recommendations
  };
}

export function getSystemRecommendationsText(
  result: SystemRecommendationsResult
): string {
  if (result.recommendations.length === 0) {
    return "Aucune recommandation disponible.";
  }

  if (
    result.status === "ok" &&
    result.recommendations[0]?.type === "no_action_needed"
  ) {
    return "Aucune action necessaire.";
  }

  return `Recommandations (${result.status}): ${result.recommendations
    .map((recommendation) => recommendation.type)
    .join(", ")}.`;
}