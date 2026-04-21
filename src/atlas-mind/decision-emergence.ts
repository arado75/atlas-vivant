import type { DecisionLogEntry } from "./decision-log";
import { getDecayedAggregatedRecommendations } from "./decision-decay";
import type {
  AggregatedRecommendation,
  AggregatedRecommendationsResult
} from "./decision-aggregator";

export type EmergedRecommendation = AggregatedRecommendation & {
  emerged: boolean;
  emergenceReason?: string;
};

export interface EmergenceResult {
  status: AggregatedRecommendationsResult["status"];
  visible: EmergedRecommendation[];
  latent: EmergedRecommendation[];
}

const EMERGENCE_REASON = "weight threshold reached (>=2)";
const previousVisibility = new Map<AggregatedRecommendation["type"], AggregatedRecommendation["visibility"]>();

function priorityRank(priority: AggregatedRecommendation["priority"]): number {
  switch (priority) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function sortRecommendations(
  recommendations: EmergedRecommendation[]
): EmergedRecommendation[] {
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

export function clearEmergenceMemory(): void {
  previousVisibility.clear();
}

function enrichRecommendation(recommendation: AggregatedRecommendation): EmergedRecommendation {
  const previous = previousVisibility.get(recommendation.type);
  const isEmergingCandidate = recommendation.priority !== "high" && recommendation.weight >= 2;
  const emerged = recommendation.visibility === "visible" && isEmergingCandidate && previous !== "visible";

  return {
    ...recommendation,
    emerged,
    emergenceReason: emerged ? EMERGENCE_REASON : undefined
  };
}

export function getEmergedRecommendations(logs?: DecisionLogEntry[]): EmergenceResult {
  const decayed = getDecayedAggregatedRecommendations(logs);
  const visible = decayed.visible.map((recommendation) => enrichRecommendation(recommendation));
  const latent = decayed.latent.map((recommendation) => enrichRecommendation(recommendation));
  const allRecommendations = [...visible, ...latent];
  const seen = new Set(allRecommendations.map((recommendation) => recommendation.type));

  for (const recommendation of allRecommendations) {
    previousVisibility.set(recommendation.type, recommendation.visibility);
  }

  for (const type of [...previousVisibility.keys()]) {
    if (!seen.has(type)) {
      previousVisibility.delete(type);
    }
  }

  return {
    status: decayed.status,
    visible: sortRecommendations(visible),
    latent: sortRecommendations(latent)
  };
}

export function getEmergenceText(result: EmergenceResult): string {
  const emergedVisible = result.visible.filter((recommendation) => recommendation.emerged);
  const emergedText =
    emergedVisible.length === 0
      ? "Aucune emergence detectee."
      : `Emergence detectee: ${emergedVisible
          .map((recommendation) => `${recommendation.type} (weight ${recommendation.weight})`)
          .join(", ")}.`;

  const latentText =
    result.latent.length === 0
      ? "Autres signaux latents: aucun."
      : `Autres signaux latents: ${result.latent
          .map((recommendation) => `${recommendation.type} (weight ${recommendation.weight})`)
          .join(", ")}.`;

  return `${emergedText} ${latentText}`;
}

