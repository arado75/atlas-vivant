import type { DecisionLogEntry } from "./decision-log";
import type { RecommendationPriority, RecommendationType } from "./decision-advisor";
import {
  clearMemory,
  loadMemory,
  saveMemory,
  type DecisionMemorySnapshot,
  type PersistedRecommendationState
} from "./decision-persistence";
import {
  getAggregatedRecommendations,
  type AggregatedRecommendation,
  type AggregatedRecommendationsResult
} from "./decision-aggregator";

interface DecayMemoryEntry {
  type: RecommendationType;
  message: string;
  priority: RecommendationPriority;
  occurrences: number;
  weight: number;
  lastSeenRun: number;
}

const decayMemory = new Map<RecommendationType, DecayMemoryEntry>();
let currentRun = 0;

function isValidPriority(value: unknown): value is RecommendationPriority {
  return value === "low" || value === "medium" || value === "high";
}

function visibilityFromWeight(
  priority: RecommendationPriority,
  weight: number
): AggregatedRecommendation["visibility"] | null {
  if (weight <= 0) {
    return null;
  }

  if (priority === "high" || weight >= 2) {
    return "visible";
  }

  return "latent";
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

function sortRecommendations(
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

function hydrateDecayMemoryFromDisk(): void {
  const persisted = loadMemory();
  decayMemory.clear();
  currentRun = Math.max(0, persisted.run);

  for (const [type, rawEntry] of Object.entries(persisted.data)) {
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }

    const entry = rawEntry as PersistedRecommendationState;
    if (!isValidPriority(entry.priority) || entry.weight <= 0 || entry.message.length === 0) {
      continue;
    }

    decayMemory.set(type as RecommendationType, {
      type: type as RecommendationType,
      message: entry.message,
      priority: entry.priority,
      occurrences: Math.max(0, entry.occurrences),
      weight: Math.max(0, entry.weight),
      lastSeenRun: Math.max(0, entry.lastSeenRun)
    });
  }
}

function persistDecayMemoryToDisk(): void {
  const data: Record<string, PersistedRecommendationState> = {};

  for (const [type, entry] of decayMemory.entries()) {
    data[type] = {
      weight: entry.weight,
      priority: entry.priority,
      message: entry.message,
      lastSeenRun: entry.lastSeenRun,
      occurrences: entry.occurrences
    };
  }

  const snapshot: DecisionMemorySnapshot = {
    version: 1,
    run: currentRun,
    data
  };

  saveMemory(snapshot);
}

function upsertSeenRecommendation(
  recommendation: AggregatedRecommendation,
  runId: number
): void {
  const previous = decayMemory.get(recommendation.type);
  const nextWeight = Math.max(0, (previous?.weight ?? 0) + 1);

  decayMemory.set(recommendation.type, {
    type: recommendation.type,
    message: recommendation.message,
    priority: recommendation.priority,
    occurrences: recommendation.occurrences,
    weight: nextWeight,
    lastSeenRun: runId
  });
}

function decayUnseenRecommendations(seenTypes: Set<RecommendationType>, runId: number): void {
  for (const [type, entry] of decayMemory.entries()) {
    if (seenTypes.has(type)) {
      continue;
    }

    const decayedWeight = Math.max(0, entry.weight - 1);
    if (decayedWeight <= 0) {
      decayMemory.delete(type);
      continue;
    }

    decayMemory.set(type, {
      ...entry,
      occurrences: 0,
      weight: decayedWeight,
      lastSeenRun: runId
    });
  }
}

function buildResult(status: AggregatedRecommendationsResult["status"]): AggregatedRecommendationsResult {
  const visible: AggregatedRecommendation[] = [];
  const latent: AggregatedRecommendation[] = [];

  for (const entry of decayMemory.values()) {
    const visibility = visibilityFromWeight(entry.priority, entry.weight);
    if (!visibility) {
      continue;
    }

    const recommendation: AggregatedRecommendation = {
      type: entry.type,
      message: entry.message,
      priority: entry.priority,
      occurrences: entry.occurrences,
      weight: entry.weight,
      visibility
    };

    if (visibility === "visible") {
      visible.push(recommendation);
    } else {
      latent.push(recommendation);
    }
  }

  return {
    status,
    visible: sortRecommendations(visible),
    latent: sortRecommendations(latent)
  };
}

export function clearRecommendationDecayMemory(): void {
  decayMemory.clear();
  currentRun = 0;
  clearMemory();
}

export function reloadRecommendationDecayMemoryFromDisk(): void {
  hydrateDecayMemoryFromDisk();
}

export function getRecommendationDecayMemorySnapshot(): Record<string, DecayMemoryEntry> {
  const snapshot: Record<string, DecayMemoryEntry> = {};

  for (const [type, entry] of decayMemory.entries()) {
    snapshot[type] = { ...entry };
  }

  return snapshot;
}

export function getDecayedAggregatedRecommendations(
  logs?: DecisionLogEntry[]
): AggregatedRecommendationsResult {
  const aggregated = getAggregatedRecommendations(logs);
  const runId = ++currentRun;
  const seen = [...aggregated.visible, ...aggregated.latent];
  const seenTypes = new Set<RecommendationType>();

  for (const recommendation of seen) {
    seenTypes.add(recommendation.type);
    upsertSeenRecommendation(recommendation, runId);
  }

  decayUnseenRecommendations(seenTypes, runId);
  persistDecayMemoryToDisk();
  return buildResult(aggregated.status);
}

export function getDecayedAggregatedRecommendationsText(
  result: AggregatedRecommendationsResult
): string {
  const visibleText =
    result.visible.length === 0
      ? "aucune"
      : result.visible
          .map((recommendation) => `${recommendation.type} (weight ${recommendation.weight})`)
          .join(", ");

  const latentText =
    result.latent.length === 0
      ? "aucun"
      : result.latent
          .map((recommendation) => `${recommendation.type} (weight ${recommendation.weight})`)
          .join(", ");

  return `Recommandations visibles: ${visibleText}. Signaux latents: ${latentText}.`;
}

hydrateDecayMemoryFromDisk();
