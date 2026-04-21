import type { DecisionLogEntry } from "./decision-log";
import {
  getRelevantPatterns,
  type PatternRelevanceResult,
  type RelevantPattern
} from "./decision-pattern-relevance";

export type PatternSummary = {
  topPatterns: RelevantPattern[];
};

const MAX_TOP_PATTERNS = 3;
const MIN_RELEVANCE_SCORE = 1;

function sortPatterns(patterns: RelevantPattern[]): RelevantPattern[] {
  return [...patterns].sort((left, right) => {
    const scoreDelta = right.relevanceScore - left.relevanceScore;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const countDelta = right.count - left.count;
    if (countDelta !== 0) {
      return countDelta;
    }

    return left.pattern.join("|").localeCompare(right.pattern.join("|"));
  });
}

export function getPatternSummaryFromRelevanceResult(
  relevance: PatternRelevanceResult
): PatternSummary {
  const topPatterns = sortPatterns(relevance.patterns)
    .filter((pattern) => pattern.relevanceScore > MIN_RELEVANCE_SCORE)
    .slice(0, MAX_TOP_PATTERNS);

  return { topPatterns };
}

export function getPatternSummary(logs?: DecisionLogEntry[]): PatternSummary {
  const relevance = getRelevantPatterns(logs);
  return getPatternSummaryFromRelevanceResult(relevance);
}

export function getPatternSummaryText(summary: PatternSummary): string {
  if (summary.topPatterns.length === 0) {
    return "Aucun motif dominant a synthetiser.";
  }

  const text = summary.topPatterns
    .map((pattern) => `${pattern.pattern[0]} -> ${pattern.pattern[1]} -> ${pattern.pattern[2]}`)
    .join(". ");

  return `Motifs dominants: ${text}.`;
}
