import type { DecisionLogEntry } from "../decision-log";
import {
  getAggregatedRecommendations,
  getAggregatedRecommendationsText
} from "../decision-aggregator";

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  offsetMs: number
): DecisionLogEntry {
  return {
    timestampMs: Date.now() + offsetMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : decision === "flag" ? 7.8 : 2.7,
    anomalyThresholdC: 2,
    persistenceLevel:
      decision === "flag" ? "high" : decision === "watch" ? "medium" : "none",
    persistenceCount: decision === "ignore" ? 0 : decision === "flag" ? 3 : 2,
    weightedRecentScore: decision === "ignore" ? 0 : decision === "flag" ? 2 : 1.2,
    evaluations: [],
    score: decision === "flag" ? 4 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    decision,
    reason: `Mock ${decision}`
  };
}

/**
 * Test manuel v13:
 * - scenario A: faible activite (latent)
 * - scenario B: combinaison d'issues (visible + latent)
 */
export function runAtlasMindV13AggregatorExample() {
  const lowLogs: DecisionLogEntry[] = [
    makeLog("Paris", "ignore", -30),
    makeLog("Tokyo", "ignore", -20)
  ];

  const mixedLogs: DecisionLogEntry[] = [
    ...Array.from({ length: 12 }, (_, index) => makeLog("Paris", "flag", index)),
    ...Array.from({ length: 12 }, (_, index) => makeLog("Tokyo", "watch", 100 + index)),
    ...Array.from({ length: 8 }, (_, index) => makeLog("Cairo", "watch", 200 + index))
  ];

  const lowResult = getAggregatedRecommendations(lowLogs);
  const lowText = getAggregatedRecommendationsText(lowResult);

  const mixedResult = getAggregatedRecommendations(mixedLogs);
  const mixedText = getAggregatedRecommendationsText(mixedResult);

  console.log("[AtlasMind][Aggregator] Low scenario structured:", lowResult);
  console.log("[AtlasMind][Aggregator] Low scenario text:", lowText);
  console.log("[AtlasMind][Aggregator] Mixed scenario structured:", mixedResult);
  console.log("[AtlasMind][Aggregator] Mixed scenario text:", mixedText);

  return {
    lowResult,
    lowText,
    mixedResult,
    mixedText
  };
}
