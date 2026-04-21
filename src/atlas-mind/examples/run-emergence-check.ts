import type { DecisionLogEntry } from "../decision-log";
import { clearRecommendationDecayMemory } from "../decision-decay";
import {
  clearEmergenceMemory,
  getEmergedRecommendations,
  getEmergenceText
} from "../decision-emergence";

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

/**
 * Test manuel v15:
 * - A: latent -> repetition -> visible emergent
 * - B: visible stable -> pas emergent
 * - C: latent faible reste latent
 */
export function runAtlasMindV15EmergenceExample() {
  clearRecommendationDecayMemory();
  clearEmergenceMemory();

  const runA1 = getEmergedRecommendations(lowActivityLogs());
  const textA1 = getEmergenceText(runA1);

  const runA2 = getEmergedRecommendations(lowActivityLogs());
  const textA2 = getEmergenceText(runA2);

  const runB = getEmergedRecommendations(lowActivityLogs());
  const textB = getEmergenceText(runB);

  const runC = getEmergedRecommendations(highActivityOnlyLogs());
  const textC = getEmergenceText(runC);

  console.log("[AtlasMind][Emergence] Run A1 (latent initial):", runA1);
  console.log("[AtlasMind][Emergence] Run A1 text:", textA1);

  console.log("[AtlasMind][Emergence] Run A2 (emergence):", runA2);
  console.log("[AtlasMind][Emergence] Run A2 text:", textA2);

  console.log("[AtlasMind][Emergence] Run B (visible stable):", runB);
  console.log("[AtlasMind][Emergence] Run B text:", textB);

  console.log("[AtlasMind][Emergence] Run C (latent faible):", runC);
  console.log("[AtlasMind][Emergence] Run C text:", textC);

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
