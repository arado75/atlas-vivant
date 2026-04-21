import type { DecisionLogEntry } from "./decision-log";
import { getSignalPatterns, type PatternResult, type SignalPattern } from "./decision-patterns";

export type RelevantPattern = {
  pattern: [string, string, string];
  count: number;
  relevanceScore: number;
};

export type PatternRelevanceResult = {
  patterns: RelevantPattern[];
};

const FREQUENT_TOKEN_RATIO = 0.6;

function weightedTokenCounts(patterns: SignalPattern[]): {
  counts: Map<string, number>;
  totalWeight: number;
} {
  const counts = new Map<string, number>();
  let totalWeight = 0;

  for (const item of patterns) {
    totalWeight += item.count;
    for (const token of item.pattern) {
      counts.set(token, (counts.get(token) ?? 0) + item.count);
    }
  }

  return { counts, totalWeight };
}

function penaltyForPattern(
  pattern: [string, string, string],
  tokenCounts: Map<string, number>,
  totalWeight: number
): number {
  if (totalWeight <= 0) {
    return 0;
  }

  let penalty = 0;
  for (const token of pattern) {
    const frequencyRatio = (tokenCounts.get(token) ?? 0) / totalWeight;
    if (frequencyRatio >= FREQUENT_TOKEN_RATIO) {
      penalty += 1;
    }
  }

  return penalty;
}

export function getRelevantPatternsFromPatternResult(
  result: PatternResult
): PatternRelevanceResult {
  const { counts, totalWeight } = weightedTokenCounts(result.patterns);

  const patterns = result.patterns
    .map((item) => {
      const penalty = penaltyForPattern(item.pattern, counts, totalWeight);
      const relevanceScore = item.count - penalty;

      return {
        pattern: item.pattern,
        count: item.count,
        relevanceScore
      };
    })
    .filter((item) => item.relevanceScore > 0)
    .sort((left, right) => {
      const relevanceDelta = right.relevanceScore - left.relevanceScore;
      if (relevanceDelta !== 0) {
        return relevanceDelta;
      }

      const countDelta = right.count - left.count;
      if (countDelta !== 0) {
        return countDelta;
      }

      return left.pattern.join("|").localeCompare(right.pattern.join("|"));
    });

  return { patterns };
}

export function getRelevantPatterns(logs?: DecisionLogEntry[]): PatternRelevanceResult {
  const patterns = getSignalPatterns(logs);
  return getRelevantPatternsFromPatternResult(patterns);
}

export function getRelevantPatternsText(result: PatternRelevanceResult): string {
  if (result.patterns.length === 0) {
    return "Aucun motif pertinent detecte.";
  }

  const text = result.patterns
    .map(
      (item) =>
        `${item.pattern[0]} -> ${item.pattern[1]} -> ${item.pattern[2]} (score ${item.relevanceScore})`
    )
    .join(", ");

  return `Motifs pertinents: ${text}.`;
}
