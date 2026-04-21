import type { DecisionLogEntry } from "../decision-log";
import {
  clearRecommendationDecayMemory,
  getDecayedAggregatedRecommendations,
  getDecayedAggregatedRecommendationsText
} from "../decision-decay";

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  offsetMs: number
): DecisionLogEntry {
  return {
    timestampMs: Date.now() + offsetMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : decision === "flag" ? 8.1 : 2.6,
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

function lowActivityLogs(): DecisionLogEntry[] {
  return [makeLog("Paris", "ignore", -20), makeLog("Tokyo", "ignore", -10)];
}

function highActivityOnlyLogs(): DecisionLogEntry[] {
  return [
    ...Array.from({ length: 10 }, (_, index) => makeLog("Paris", "flag", index)),
    ...Array.from({ length: 10 }, (_, index) => makeLog("Tokyo", "watch", 100 + index)),
    ...Array.from({ length: 10 }, (_, index) => makeLog("Cairo", "log", 200 + index))
  ];
}

function neutralLogs(): DecisionLogEntry[] {
  return [
    makeLog("Paris", "log", -20),
    makeLog("Paris", "watch", -10),
    makeLog("Tokyo", "log", -5),
    makeLog("Tokyo", "ignore", 0)
  ];
}

/**
 * Test manuel v14:
 * - A: repetition -> poids monte
 * - B: absence -> poids baisse
 * - C: faible recommandation -> latent/disparition
 */
export function runAtlasMindV14DecayExample() {
  clearRecommendationDecayMemory();

  const runA1 = getDecayedAggregatedRecommendations(lowActivityLogs());
  const textA1 = getDecayedAggregatedRecommendationsText(runA1);

  const runA2 = getDecayedAggregatedRecommendations(lowActivityLogs());
  const textA2 = getDecayedAggregatedRecommendationsText(runA2);

  const runB = getDecayedAggregatedRecommendations(highActivityOnlyLogs());
  const textB = getDecayedAggregatedRecommendationsText(runB);

  const runC = getDecayedAggregatedRecommendations(neutralLogs());
  const textC = getDecayedAggregatedRecommendationsText(runC);

  console.log("[AtlasMind][Decay] Run A1 (initial):", runA1);
  console.log("[AtlasMind][Decay] Run A1 text:", textA1);

  console.log("[AtlasMind][Decay] Run A2 (repetition):", runA2);
  console.log("[AtlasMind][Decay] Run A2 text:", textA2);

  console.log("[AtlasMind][Decay] Run B (absence => baisse):", runB);
  console.log("[AtlasMind][Decay] Run B text:", textB);

  console.log("[AtlasMind][Decay] Run C (latent/disparition):", runC);
  console.log("[AtlasMind][Decay] Run C text:", textC);

  return {
    runA1,
    textA1,
    runA2,
    textA2,
    runB,
    textB,
    runC,
    textC
  };
}
