import type { DecisionLogEntry } from "../decision-log";
import { getGlobalSummary } from "../decision-global-summary";
import { clearSpeechState } from "../decision-speech-state";
import {
  clearDiscourseState,
  evaluateMemoryAwareSummaryText,
  getDiscourseState
} from "../decision-discourse-memory";

function makeLog(
  city: string,
  decision: DecisionLogEntry["decision"],
  timestampMs: number
): DecisionLogEntry {
  return {
    timestampMs,
    city,
    cityId: city.toLowerCase(),
    deltaC: decision === "ignore" ? null : decision === "flag" ? 8 : decision === "watch" ? 3 : 1,
    anomalyThresholdC: 2,
    persistenceLevel:
      decision === "flag" ? "high" : decision === "watch" ? "medium" : decision === "log" ? "low" : "none",
    persistenceCount: decision === "flag" ? 3 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    weightedRecentScore: decision === "flag" ? 2.5 : decision === "watch" ? 1.4 : decision === "log" ? 0.8 : 0,
    evaluations: [],
    score: decision === "flag" ? 4 : decision === "watch" ? 2 : decision === "log" ? 1 : 0,
    decision,
    reason: `Mock ${decision}`
  };
}

function buildAlertConcentrated(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "flag", startTs + 0),
    makeLog("Paris", "flag", startTs + 1),
    makeLog("Paris", "flag", startTs + 2),
    makeLog("Paris", "flag", startTs + 3),
    makeLog("Tokyo", "log", startTs + 4),
    makeLog("Lagos", "log", startTs + 5)
  ];
}

function buildAlertDistributed(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "flag", startTs + 0),
    makeLog("Tokyo", "flag", startTs + 1),
    makeLog("Lagos", "flag", startTs + 2),
    makeLog("Sydney", "flag", startTs + 3),
    makeLog("Mexico", "log", startTs + 4),
    makeLog("Cairo", "log", startTs + 5)
  ];
}

function buildWatchBalanced(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "ignore", startTs + 0),
    makeLog("Tokyo", "ignore", startTs + 1),
    makeLog("Lagos", "ignore", startTs + 2),
    makeLog("Sydney", "ignore", startTs + 3)
  ];
}

function buildWatchSparse(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "ignore", startTs + 0),
    makeLog("Tokyo", "ignore", startTs + 1)
  ];
}

function buildOkLogs(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "watch", startTs + 0),
    makeLog("Tokyo", "log", startTs + 1),
    makeLog("Lagos", "log", startTs + 2),
    makeLog("Sydney", "log", startTs + 3),
    makeLog("Mexico", "log", startTs + 4),
    makeLog("Cairo", "log", startTs + 5)
  ];
}

function resetAllState(): void {
  clearSpeechState();
  clearDiscourseState();
}

function runStep(label: string, logs: DecisionLogEntry[]) {
  const summary = getGlobalSummary(logs);
  const decision = evaluateMemoryAwareSummaryText(summary, logs);

  console.log(
    `[AtlasMind][DiscourseMemory][${label}] status=${summary.status} count=${decision.discourseState.consecutiveSameStatusCount} message=${decision.message}`
  );

  return {
    label,
    status: summary.status,
    count: decision.discourseState.consecutiveSameStatusCount,
    message: decision.message,
    addedMemorySentence: decision.addedMemorySentence
  };
}

/**
 * Test manuel v30:
 * - repetition
 * - amelioration confirmee
 * - degradation confirmee
 * - reset
 */
export function runAtlasMindV30DiscourseMemoryExample() {
  resetAllState();

  const repetitionA = runStep("repetition_alert_1", buildAlertConcentrated(1000));
  const repetitionB = runStep("repetition_alert_2", buildAlertDistributed(2000));
  const repetitionReset = runStep("repetition_reset_ok", buildOkLogs(3000));

  resetAllState();
  const improveA = runStep("improve_alert", buildAlertConcentrated(4000));
  const improveB = runStep("improve_watch_1", buildWatchBalanced(5000));
  const improveC = runStep("improve_watch_2", buildWatchSparse(6000));

  resetAllState();
  const degradeA = runStep("degrade_ok", buildOkLogs(7000));
  const degradeB = runStep("degrade_watch_1", buildWatchBalanced(8000));
  const degradeC = runStep("degrade_watch_2", buildWatchSparse(9000));

  return {
    repetition: [repetitionA, repetitionB, repetitionReset],
    improvement: [improveA, improveB, improveC],
    degradation: [degradeA, degradeB, degradeC],
    state: getDiscourseState()
  };
}
