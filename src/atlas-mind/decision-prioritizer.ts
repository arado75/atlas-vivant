import type { DecisionLogEntry } from "./decision-log";
import {
  getSystemRecommendations,
  type RecommendationPriority,
  type SystemRecommendation,
  type SystemRecommendationsResult
} from "./decision-advisor";

const MAX_RECOMMENDATIONS = 3;

function priorityRank(priority: RecommendationPriority): number {
  switch (priority) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function pickBestPerType(
  recommendations: SystemRecommendation[]
): SystemRecommendation[] {
  const byType = new Map<string, SystemRecommendation>();

  for (const recommendation of recommendations) {
    const current = byType.get(recommendation.type);
    if (!current) {
      byType.set(recommendation.type, recommendation);
      continue;
    }

    if (priorityRank(recommendation.priority) > priorityRank(current.priority)) {
      byType.set(recommendation.type, recommendation);
    }
  }

  return [...byType.values()];
}

function sortRecommendations(
  recommendations: SystemRecommendation[]
): SystemRecommendation[] {
  return [...recommendations].sort((left, right) => {
    const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.type.localeCompare(right.type);
  });
}

export function getPrioritizedRecommendations(
  logs?: DecisionLogEntry[]
): SystemRecommendationsResult {
  const base = getSystemRecommendations(logs);
  const deduped = pickBestPerType(base.recommendations);
  const sorted = sortRecommendations(deduped);

  return {
    status: base.status,
    recommendations: sorted.slice(0, MAX_RECOMMENDATIONS)
  };
}

export function getPrioritizedRecommendationsText(
  result: SystemRecommendationsResult
): string {
  if (result.recommendations.length === 0) {
    return "Aucune recommandation disponible.";
  }

  if (result.recommendations[0]?.type === "no_action_needed") {
    return "Aucune action necessaire.";
  }

  if (result.recommendations.length === 1) {
    return `Action recommandee: ${result.recommendations[0].type}.`;
  }

  return `Priorites: ${result.recommendations
    .map((recommendation) => recommendation.type)
    .join(", ")}.`;
}