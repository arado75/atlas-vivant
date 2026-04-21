import { runTemperatureCheck } from "../orchestrator";
import { appendDecisionLog, clearDecisionLogs } from "../decision-log";
import {
  getDecisionCounts,
  getDecisionCountsByCity,
  getLatestDecisionForCity,
  getLatestSignificantAnomalyForCity,
  getRecentFlags,
  getRecentWatches
} from "../decision-log-reader";

/**
 * Test manuel v7:
 * - alimente le decision log
 * - lit le journal avec les fonctions de synthese
 */
export async function runAtlasMindV7DecisionLogReaderExample() {
  clearDecisionLogs();

  await runTemperatureCheck("Paris", { forceRefresh: true, thresholdC: 0.5 });
  await runTemperatureCheck("Tokyo", { thresholdC: 0.5 });
  await runTemperatureCheck("Paris", { thresholdC: 2 });
  await runTemperatureCheck("Mexico", { thresholdC: 0.5 });

  // Fallback de demonstration pour garantir un cas watch/flag lisible meme hors reseau.
  if (getRecentWatches(1).length === 0) {
    appendDecisionLog({
      timestampMs: Date.now() - 2,
      city: "Paris",
      cityId: "paris",
      deltaC: 2.4,
      anomalyThresholdC: 2,
      persistenceLevel: "medium",
      persistenceCount: 2,
      weightedRecentScore: 1.5,
      evaluations: [],
      score: 2,
      decision: "watch",
      reason: "Exemple v7: anomalie moderee a surveiller."
    });
  }

  if (getRecentFlags(1).length === 0) {
    appendDecisionLog({
      timestampMs: Date.now() - 1,
      city: "Tokyo",
      cityId: "tokyo",
      deltaC: 8.1,
      anomalyThresholdC: 2,
      persistenceLevel: "high",
      persistenceCount: 3,
      weightedRecentScore: 2.2,
      evaluations: [],
      score: 4,
      decision: "flag",
      reason: "Exemple v7: anomalie significative/persistante."
    });
  }

  const globalCounts = getDecisionCounts();
  const byCity = getDecisionCountsByCity();
  const recentFlags = getRecentFlags(5);
  const recentWatches = getRecentWatches(5);
  const parisLatest = getLatestDecisionForCity("Paris");
  const parisLatestSignificant = getLatestSignificantAnomalyForCity("Paris");

  console.log("[AtlasMind][Reader] Global counts:", globalCounts);
  console.log("[AtlasMind][Reader] By city:", byCity);
  console.log("[AtlasMind][Reader] Recent flags:", recentFlags);
  console.log("[AtlasMind][Reader] Recent watches:", recentWatches);
  console.log("[AtlasMind][Reader] Latest Paris decision:", parisLatest);
  console.log("[AtlasMind][Reader] Latest significant Paris anomaly:", parisLatestSignificant);

  return {
    globalCounts,
    byCity,
    recentFlags,
    recentWatches,
    parisLatest,
    parisLatestSignificant
  };
}