import type { DecisionLogEntry } from "../decision-log";
import { getGlobalSummary } from "../decision-global-summary";
import { getTemporalGlobalSummaryText } from "../decision-temporal-consistency";
import { getStructuredGlobalSummaryText } from "../decision-message-structure";

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

function buildAlertSegment(startTs: number, city = "Paris"): DecisionLogEntry[] {
  return [
    makeLog(city, "flag", startTs + 0),
    makeLog(city, "flag", startTs + 1),
    makeLog(city, "flag", startTs + 2),
    makeLog(city, "flag", startTs + 3)
  ];
}

function buildWatchSegment(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "ignore", startTs + 0),
    makeLog("Tokyo", "ignore", startTs + 1),
    makeLog("Lagos", "ignore", startTs + 2),
    makeLog("Sydney", "ignore", startTs + 3)
  ];
}

function buildOkSegment(startTs: number): DecisionLogEntry[] {
  return [
    makeLog("Paris", "watch", startTs + 0),
    makeLog("Tokyo", "log", startTs + 1),
    makeLog("Lagos", "log", startTs + 2),
    makeLog("Sydney", "log", startTs + 3)
  ];
}

function runScenario(name: string, logs: DecisionLogEntry[]) {
  const summary = getGlobalSummary(logs);
  const v25Text = getTemporalGlobalSummaryText(summary, logs);
  const v26Text = getStructuredGlobalSummaryText(summary, logs);

  console.log(`[AtlasMind][MessageStructure][${name}] v25:`, v25Text);
  console.log(`[AtlasMind][MessageStructure][${name}] v26:`, v26Text);

  return {
    name,
    v25Text,
    v26Text
  };
}

/**
 * Test manuel v26:
 * - compare v25 vs v26
 * - verifie l'ordre hierarchique du message final
 */
export function runAtlasMindV26MessageStructureExample() {
  const alertOscillationLogs = [
    ...buildAlertSegment(1000),
    ...buildWatchSegment(2000),
    ...buildAlertSegment(3000)
  ];

  const improvementLogs = [
    ...buildAlertSegment(4000),
    ...buildWatchSegment(5000),
    ...buildOkSegment(6000)
  ];

  const stableLogs = [
    ...buildOkSegment(7000),
    ...buildOkSegment(8000),
    ...buildOkSegment(9000)
  ];

  const results = [
    runScenario("alert_oscillation", alertOscillationLogs),
    runScenario("improvement", improvementLogs),
    runScenario("stable", stableLogs)
  ];

  return { results };
}
