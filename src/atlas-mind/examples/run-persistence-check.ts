import type { DecisionLogEntry } from "../decision-log";
import {
  ATLAS_MEMORY_FILE_PATH,
  clearMemory,
  loadMemory
} from "../decision-persistence";
import {
  getDecayedAggregatedRecommendations,
  getDecayedAggregatedRecommendationsText,
  getRecommendationDecayMemorySnapshot,
  reloadRecommendationDecayMemoryFromDisk
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
    deltaC: decision === "ignore" ? null : decision === "flag" ? 8 : 2.6,
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

/**
 * Test manuel v16:
 * - run 1: creation + sauvegarde
 * - run 2: reload + continuite du poids
 */
export function runAtlasMindV16PersistenceExample() {
  clearMemory();
  reloadRecommendationDecayMemoryFromDisk();

  const run1 = getDecayedAggregatedRecommendations(lowActivityLogs());
  const run1Text = getDecayedAggregatedRecommendationsText(run1);
  const savedAfterRun1 = loadMemory();

  reloadRecommendationDecayMemoryFromDisk();
  const loadedAfterReload = getRecommendationDecayMemorySnapshot();

  const run2 = getDecayedAggregatedRecommendations(lowActivityLogs());
  const run2Text = getDecayedAggregatedRecommendationsText(run2);
  const savedAfterRun2 = loadMemory();

  console.log("[AtlasMind][Persistence] File:", ATLAS_MEMORY_FILE_PATH);
  console.log("[AtlasMind][Persistence] Run 1:", run1);
  console.log("[AtlasMind][Persistence] Run 1 text:", run1Text);
  console.log("[AtlasMind][Persistence] Saved after run 1:", savedAfterRun1);

  console.log("[AtlasMind][Persistence] Loaded after reload:", loadedAfterReload);

  console.log("[AtlasMind][Persistence] Run 2:", run2);
  console.log("[AtlasMind][Persistence] Run 2 text:", run2Text);
  console.log("[AtlasMind][Persistence] Saved after run 2:", savedAfterRun2);

  return {
    filePath: ATLAS_MEMORY_FILE_PATH,
    run1,
    run1Text,
    savedAfterRun1,
    loadedAfterReload,
    run2,
    run2Text,
    savedAfterRun2
  };
}
