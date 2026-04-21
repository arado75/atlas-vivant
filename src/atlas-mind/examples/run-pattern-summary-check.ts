import type { DecisionLogEntry } from "../decision-log";
import type { PatternRelevanceResult } from "../decision-pattern-relevance";
import {
  getPatternSummary,
  getPatternSummaryFromRelevanceResult,
  getPatternSummaryText
} from "../decision-pattern-summary";

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  timestampMs: number
): DecisionLogEntry {
  return {
    timestampMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : decision === "flag" ? 8 : 2.5,
    anomalyThresholdC: 2,
    persistenceLevel:
      decision === "flag" ? "high" : decision === "watch" ? "medium" : "none",
    persistenceCount: decision === "ignore" ? 0 : decision === "flag" ? 3 : 1,
    weightedRecentScore: decision === "ignore" ? 0 : decision === "flag" ? 2 : 1,
    evaluations: [],
    score: decision === "flag" ? 4 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    decision,
    reason: `Mock ${decision}`
  };
}

/**
 * Test manuel v22:
 * - Cas A: plusieurs motifs -> top 3 max
 * - Cas B: aucun motif pertinent -> message clair
 */
export function runAtlasMindV22PatternSummaryExample() {
  const syntheticRelevance: PatternRelevanceResult = {
    patterns: [
      {
        pattern: ["city_dominance", "review_city_coverage", "alert"],
        count: 5,
        relevanceScore: 5
      },
      {
        pattern: ["too_many_flags", "review_flag_threshold", "alert"],
        count: 4,
        relevanceScore: 4
      },
      {
        pattern: ["high_activity", "continue_normal_monitoring", "watch"],
        count: 3,
        relevanceScore: 3
      },
      {
        pattern: ["low_activity", "collect_more_data", "watch"],
        count: 2,
        relevanceScore: 2
      },
      {
        pattern: ["no_significant_activity", "collect_more_data", "watch"],
        count: 2,
        relevanceScore: 1
      }
    ]
  };

  const syntheticSummary = getPatternSummaryFromRelevanceResult(syntheticRelevance);
  const syntheticText = getPatternSummaryText(syntheticSummary);

  const uniqueLogs: DecisionLogEntry[] = [
    makeLog("Paris", "flag", 100),
    makeLog("Tokyo", "watch", 101),
    makeLog("Lagos", "log", 102),
    makeLog("Sydney", "ignore", 103)
  ];

  const emptySummary = getPatternSummary(uniqueLogs);
  const emptyText = getPatternSummaryText(emptySummary);

  console.log("[AtlasMind][PatternSummary] Synthetic structured:", syntheticSummary);
  console.log("[AtlasMind][PatternSummary] Synthetic text:", syntheticText);

  console.log("[AtlasMind][PatternSummary] Empty structured:", emptySummary);
  console.log("[AtlasMind][PatternSummary] Empty text:", emptyText);

  return {
    syntheticSummary,
    syntheticText,
    emptySummary,
    emptyText
  };
}
