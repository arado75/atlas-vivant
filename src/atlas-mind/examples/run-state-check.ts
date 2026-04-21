import { runTemperatureCheck } from "../orchestrator";
import { appendDecisionLog, clearDecisionLogs } from "../decision-log";
import { getRecentFlags, getRecentWatches } from "../decision-log-reader";
import { getSystemState, getSystemStateText } from "../decision-state";

/**
 * Test manuel v12:
 * - alimente quelques decisions
 * - compose un etat global consolide
 */
export async function runAtlasMindV12StateExample() {
  clearDecisionLogs();

  await runTemperatureCheck("Paris", { forceRefresh: true, thresholdC: 0.5 });
  await runTemperatureCheck("Tokyo", { thresholdC: 0.5 });

  // Fallback de demonstration pour garantir un etat consolide lisible hors reseau.
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
      reason: "Exemple v12: watch de demonstration."
    });
  }

  if (getRecentFlags(1).length === 0) {
    appendDecisionLog({
      timestampMs: Date.now() - 1,
      city: "Paris",
      cityId: "paris",
      deltaC: 8,
      anomalyThresholdC: 2,
      persistenceLevel: "high",
      persistenceCount: 3,
      weightedRecentScore: 2.1,
      evaluations: [],
      score: 4,
      decision: "flag",
      reason: "Exemple v12: flag de demonstration."
    });
  }

  const state = getSystemState();
  const stateText = getSystemStateText(state);

  console.log("[AtlasMind][State] Structured:", state);
  console.log("[AtlasMind][State] Text:", stateText);

  return {
    state,
    stateText
  };
}