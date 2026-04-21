import type { DecisionLogEntry } from "./decision-log";
import {
  getSystemRecommendations,
  type RecommendationPriority,
  type RecommendationType,
  type SystemRecommendation,
  type SystemRecommendationsResult
} from "./decision-advisor";
import { getPrioritizedRecommendations } from "./decision-prioritizer";

export type RecommendationVisibility = "visible" | "latent";

export interface AggregatedRecommendation {
  type: RecommendationType;
  message: string;
  priority: RecommendationPriority;
  occurrences: number;
  weight: number;
  visibility: RecommendationVisibility;
}

export interface AggregatedRecommendationsResult {
  status: SystemRecommendationsResult["status"];
  visible: AggregatedRecommendation[];
  latent: AggregatedRecommendation[];
}

interface AggregationAccumulator {
  type: RecommendationType;
  message: string;
  priority: RecommendationPriority;
  occurrences: number;
}

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

function mergeHighestPriorityMessage(
  current: AggregationAccumulator,
  incoming: SystemRecommendation
): AggregationAccumulator {
  if (priorityRank(incoming.priority) > priorityRank(current.priority)) {
    return {
      ...current,
      priority: incoming.priority,
      message: incoming.message
    };
  }

  return current;
}

function toVisibility(
  priority: RecommendationPriority,
  occurrences: number
): RecommendationVisibility {
  if (priority === "high" || occurrences >= 2) {
    return "visible";
  }

  return "latent";
}

function sortAggregated(
  recommendations: AggregatedRecommendation[]
): AggregatedRecommendation[] {
  return [...recommendations].sort((left, right) => {
    const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const weightDelta = right.weight - left.weight;
    if (weightDelta !== 0) {
      return weightDelta;
    }

    return left.type.localeCompare(right.type);
  });
}

export function getAggregatedRecommendations(
  logs?: DecisionLogEntry[]
): AggregatedRecommendationsResult {
  const prioritized = getPrioritizedRecommendations(logs);
  const base = getSystemRecommendations(logs);
  const byType = new Map<RecommendationType, AggregationAccumulator>();

  for (const recommendation of base.recommendations) {
    const current = byType.get(recommendation.type);
    if (!current) {
      byType.set(recommendation.type, {
        type: recommendation.type,
        message: recommendation.message,
        priority: recommendation.priority,
        occurrences: 1
      });
      continue;
    }

    const merged = mergeHighestPriorityMessage(current, recommendation);
    byType.set(recommendation.type, {
      ...merged,
      occurrences: merged.occurrences + 1
    });
  }

  for (const recommendation of prioritized.recommendations) {
    const current = byType.get(recommendation.type);
    if (current) {
      continue;
    }

    byType.set(recommendation.type, {
      type: recommendation.type,
      message: recommendation.message,
      priority: recommendation.priority,
      occurrences: 1
    });
  }

  const aggregated = sortAggregated(
    [...byType.values()].map((entry) => {
      const visibility = toVisibility(entry.priority, entry.occurrences);

      return {
        type: entry.type,
        message: entry.message,
        priority: entry.priority,
        occurrences: entry.occurrences,
        weight: entry.occurrences,
        visibility
      };
    })
  );

  return {
    status: prioritized.status,
    visible: aggregated.filter((recommendation) => recommendation.visibility === "visible"),
    latent: aggregated.filter((recommendation) => recommendation.visibility === "latent")
  };
}

export function getAggregatedRecommendationsText(
  result: AggregatedRecommendationsResult
): string {
  const visibleText =
    result.visible.length === 0
      ? "aucune"
      : result.visible
          .map((recommendation) => `${recommendation.type} (x${recommendation.occurrences})`)
          .join(", ");

  const latentText =
    result.latent.length === 0
      ? "aucun"
      : result.latent
          .map((recommendation) => `${recommendation.type} (x${recommendation.occurrences})`)
          .join(", ");

  if (result.visible.length === 0 && result.latent.length === 0) {
    return "Aucune recommandation a agreger.";
  }

  return `Recommandations visibles: ${visibleText}. Signaux latents: ${latentText}.`;
}
