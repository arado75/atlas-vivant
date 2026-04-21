import type { DecisionLogEntry } from "../decision-log";
import {
  getPrioritizedRecommendations,
  getPrioritizedRecommendationsText
} from "../decision-prioritizer";

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  offsetMs: number
): DecisionLogEntry {
  return {
    timestampMs: Date.now() + offsetMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : 2.5,
    anomalyThresholdC: 2,
    persistenceLevel: decision === "flag" ? "high" : decision === "watch" ? "medium" : "none",
    persistenceCount: decision === "ignore" ? 0 : 2,
    weightedRecentScore: decision === "ignore" ? 0 : 1.2,
    evaluations: [],
    score: decision === "flag" ? 4 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    decision,
    reason: `Mock ${decision}`
  };
}

/**
 * Test manuel v11:
 * - scenario A: faible activite sans signaux significatifs (dedup collect_more_data)
 * - scenario B: activite chargee avec plusieurs issues (tri + limite)
 */
export function runAtlasMindV11PrioritizerExample() {
  const lowNoSignificantLogs: DecisionLogEntry[] = [
    makeLog("Paris", "ignore", -20),
    makeLog("Tokyo", "ignore", -10)
  ];

  const highIssueLogs: DecisionLogEntry[] = [
    ...Array.from({ length: 24 }, (_, index) => makeLog("Paris", "flag", index)),
    ...Array.from({ length: 8 }, (_, index) => makeLog("Tokyo", "watch", 100 + index))
  ];

  const lowResult = getPrioritizedRecommendations(lowNoSignificantLogs);
  const lowText = getPrioritizedRecommendationsText(lowResult);

  const highResult = getPrioritizedRecommendations(highIssueLogs);
  const highText = getPrioritizedRecommendationsText(highResult);

  console.log("[AtlasMind][Prioritizer] Low scenario structured:", lowResult);
  console.log("[AtlasMind][Prioritizer] Low scenario text:", lowText);
  console.log("[AtlasMind][Prioritizer] High scenario structured:", highResult);
  console.log("[AtlasMind][Prioritizer] High scenario text:", highText);

  return {
    lowResult,
    lowText,
    highResult,
    highText
  };
}