import { runTemperatureCheck } from "../orchestrator";
import { appendDecisionLog, clearDecisionLogs } from "../decision-log";
import { getRecentFlags, getRecentWatches } from "../decision-log-reader";
import { getSystemOverview, getSystemOverviewText } from "../decision-observer";

/**
 * Test manuel v8:
 * - alimente le journal
 * - produit une vue d'ensemble structuree + texte
 */
export async function runAtlasMindV8ObserverExample() {
  clearDecisionLogs();

  await runTemperatureCheck("Paris", { forceRefresh: true, thresholdC: 0.5 });
  await runTemperatureCheck("Tokyo", { thresholdC: 0.5 });
  await runTemperatureCheck("Lagos", { thresholdC: 0.5 });
  await runTemperatureCheck("Paris", { thresholdC: 2 });
  await runTemperatureCheck("Mexico", { thresholdC: 0.5 });

  // Fallback de demonstration pour garantir des signaux significatifs lisibles hors reseau.
  if (getRecentWatches(1).length === 0) {
    appendDecisionLog({
      timestampMs: Date.now() - 2,
      city: "Paris",
      cityId: "paris",
      deltaC: 2.6,
      anomalyThresholdC: 2,
      persistenceLevel: "medium",
      persistenceCount: 2,
      weightedRecentScore: 1.4,
      evaluations: [],
      score: 2,
      decision: "watch",
      reason: "Exemple v8: anomalie moderee a surveiller."
    });
  }

  if (getRecentFlags(1).length === 0) {
    appendDecisionLog({
      timestampMs: Date.now() - 1,
      city: "Tokyo",
      cityId: "tokyo",
      deltaC: 8.4,
      anomalyThresholdC: 2,
      persistenceLevel: "high",
      persistenceCount: 3,
      weightedRecentScore: 2.3,
      evaluations: [],
      score: 4,
      decision: "flag",
      reason: "Exemple v8: anomalie significative/persistante."
    });
  }

  const summary = getSystemOverview();
  const summaryText = getSystemOverviewText(summary);

  console.log("[AtlasMind][Observer] Summary:", summary);
  console.log("[AtlasMind][Observer] Text:", summaryText);

  return {
    summary,
    summaryText
  };
}