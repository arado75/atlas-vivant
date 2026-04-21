import { runTemperatureCheck } from "../orchestrator";
import { appendDecisionLog, clearDecisionLogs } from "../decision-log";
import {
  getSystemRecommendations,
  getSystemRecommendationsText
} from "../decision-advisor";

/**
 * Test manuel v10:
 * - alimente le journal
 * - produit des recommandations minimales
 */
export async function runAtlasMindV10AdvisorExample() {
  clearDecisionLogs();

  await runTemperatureCheck("Paris", { forceRefresh: true, thresholdC: 0.5 });
  await runTemperatureCheck("Tokyo", { thresholdC: 0.5 });

  // Fallback de demonstration pour garantir des recommandations utiles hors reseau.
  appendDecisionLog({
    timestampMs: Date.now() - 3,
    city: "Paris",
    cityId: "paris",
    deltaC: 8.2,
    anomalyThresholdC: 2,
    persistenceLevel: "high",
    persistenceCount: 3,
    weightedRecentScore: 2.1,
    evaluations: [],
    score: 4,
    decision: "flag",
    reason: "Exemple v10: flag de demonstration."
  });

  appendDecisionLog({
    timestampMs: Date.now() - 2,
    city: "Paris",
    cityId: "paris",
    deltaC: 7.8,
    anomalyThresholdC: 2,
    persistenceLevel: "high",
    persistenceCount: 3,
    weightedRecentScore: 2,
    evaluations: [],
    score: 4,
    decision: "flag",
    reason: "Exemple v10: flag de demonstration (dominance)."
  });

  appendDecisionLog({
    timestampMs: Date.now() - 1,
    city: "Tokyo",
    cityId: "tokyo",
    deltaC: 2.4,
    anomalyThresholdC: 2,
    persistenceLevel: "medium",
    persistenceCount: 2,
    weightedRecentScore: 1.3,
    evaluations: [],
    score: 2,
    decision: "watch",
    reason: "Exemple v10: watch de demonstration."
  });

  const recommendationResult = getSystemRecommendations();
  const recommendationText = getSystemRecommendationsText(recommendationResult);

  console.log("[AtlasMind][Advisor] Structured:", recommendationResult);
  console.log("[AtlasMind][Advisor] Text:", recommendationText);

  return {
    recommendationResult,
    recommendationText
  };
}