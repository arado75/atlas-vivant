import type { DecisionLogEntry } from "../decision-log";
import type { PatternResult } from "../decision-patterns";
import {
  getRelevantPatterns,
  getRelevantPatternsFromPatternResult,
  getRelevantPatternsText
} from "../decision-pattern-relevance";

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
 * Test manuel v21:
 * - Cas A: motif frequent mais banal -> score plus bas
 * - Cas B: motif moins frequent mais specifique -> score plus eleve
 * - Cas C: motif unique (via logs) -> ignore
 */
export function runAtlasMindV21PatternRelevanceExample() {
  const syntheticPatterns: PatternResult = {
    patterns: [
      {
        pattern: ["high_activity", "continue_normal_monitoring", "watch"],
        count: 4
      },
      {
        pattern: ["high_activity", "continue_normal_monitoring", "log"],
        count: 4
      },
      {
        pattern: ["city_dominance", "review_city_coverage", "alert"],
        count: 3
      }
    ]
  };

  const scoredSynthetic = getRelevantPatternsFromPatternResult(syntheticPatterns);
  const scoredSyntheticText = getRelevantPatternsText(scoredSynthetic);

  const uniqueLogs: DecisionLogEntry[] = [
    makeLog("Paris", "flag", 100),
    makeLog("Tokyo", "watch", 101),
    makeLog("Lagos", "log", 102),
    makeLog("Sydney", "ignore", 103)
  ];

  const unique = getRelevantPatterns(uniqueLogs);
  const uniqueText = getRelevantPatternsText(unique);

  console.log("[AtlasMind][PatternRelevance] Synthetic scored:", scoredSynthetic);
  console.log("[AtlasMind][PatternRelevance] Synthetic text:", scoredSyntheticText);

  console.log("[AtlasMind][PatternRelevance] Unique structured:", unique);
  console.log("[AtlasMind][PatternRelevance] Unique text:", uniqueText);

  return {
    scoredSynthetic,
    scoredSyntheticText,
    unique,
    uniqueText
  };
}
